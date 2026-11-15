package athletes

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// «Comparte tu cuenta atrás» (Figma 83): the browser composes the 1080×1920 PNG; the API resolves the state of
// the page, serves the athlete's photo same-origin (so the canvas is not tainted by the CDN) and counts the shares.
func (s *Svc) registerAreaStory() {
	base := "/api/area-atleta/story"
	// no redirects: a 3xx could leave the allowed hosts (SSRF)
	// Own media is read from cms over the cluster network: the public domain answers 403 from inside (WAF/hairpin).
	fotos := &fotoCache{base: s.cms.Base, m: map[string]*fotoEntry{}, cli: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}

	// The page guard (Figma 83 «Notas · middleware»): always 200 so a visitor without session gets no console error.
	type cfgIn struct {
		Session string `cookie:"gr_area"`
	}
	type cfgOut struct {
		Body struct {
			Estado string `json:"estado" enum:"acceso,pendiente,editor,finalizada"`
			Motivo string `json:"motivo,omitempty" doc:"ATLETA_NO_APROBADO o SIN_INSCRIPCION (estado pendiente)"`
			Panel  *Panel `json:"panel,omitempty"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "area-story-config", Method: http.MethodGet, Path: base + "/config", Summary: "Estado de «Comparte tu cuenta atrás» (acceso, pendiente, editor o finalizada)", Tags: tagArea},
		func(ctx context.Context, in *cfgIn) (*cfgOut, error) {
			out := &cfgOut{}
			r, err := s.session(ctx, in.Session)
			if err != nil {
				out.Body.Estado = "acceso"
				return out, nil
			}
			if perr := s.storyGate(ctx, r); perr != nil {
				out.Body.Estado, out.Body.Motivo = "pendiente", perr.Code
				if perr.Status == http.StatusGone {
					out.Body.Estado, out.Body.Motivo = "finalizada", ""
				}
				return out, nil
			}
			p, err := s.panel(ctx, r)
			if err != nil {
				return nil, err
			}
			out.Body.Estado, out.Body.Panel = "editor", &p
			return out, nil
		})

	s.a.Mux.HandleFunc("GET "+base+"/foto", func(w http.ResponseWriter, req *http.Request) {
		v := ""
		if ck, _ := req.Cookie(areaCookie); ck != nil {
			v = ck.Value
		}
		r, err := s.storyRow(req.Context(), v)
		if err != nil {
			problem.Write(w, err)
			return
		}
		var foto string
		_ = s.a.DB.QueryRow(req.Context(), `SELECT coalesce(foto_url, '') FROM perfiles WHERE atleta_id = $1`, r.ID).Scan(&foto)
		if foto == "" {
			problem.Write(w, problem.NotFound("Aún no tienes foto en tu ficha."))
			return
		}
		if strings.HasPrefix(foto, "/api/medios/") {
			foto = fotos.base + foto // own media library: internal cms URL
		}
		e := fotos.get(foto, func(u *url.URL) bool { return s.fotoHostPermitido(req.Context(), r.CompetitionID, u) })
		if e.err != nil {
			slog.WarnContext(req.Context(), "story: foto no disponible", "atleta", r.ID, "err", e.err)
			problem.Write(w, problem.NotFound("No hemos podido cargar tu foto."))
			return
		}
		w.Header().Set("Content-Type", e.ctype)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "private, max-age=300")
		_, _ = w.Write(e.body)
	})

	type compartirIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			Modo    string `json:"modo" enum:"cuenta_atras,fecha"`
			Formato string `json:"formato" enum:"story,sticker"`
			Canal   string `json:"canal" enum:"compartir,descarga"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "area-story-compartida", Method: http.MethodPost, Path: base + "/comparticiones", Summary: "Registrar que compartí o descargué mi story", Tags: tagArea, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *compartirIn) (*struct{}, error) {
			r, err := s.storyRow(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			id, _ := uuid.NewV7()
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO story_comparticiones (id, competition_id, atleta_id, modo, formato, canal) VALUES ($1, $2, $3, $4, $5, $6)`,
				id, r.CompetitionID, r.ID, in.Body.Modo, in.Body.Formato, in.Body.Canal); err != nil {
				return nil, problem.Internal()
			}
			slog.InfoContext(ctx, "story compartida", "atleta", r.ID, "modo", in.Body.Modo, "formato", in.Body.Formato, "canal", in.Body.Canal)
			return nil, nil
		})
}

// storyRow is the session of the area plus the story gate.
func (s *Svc) storyRow(ctx context.Context, cookie string) (row, *problem.Error) {
	r, err := s.session(ctx, cookie)
	if err != nil {
		var p *problem.Error
		if errors.As(err, &p) {
			return row{}, p
		}
		return row{}, problem.Internal()
	}
	if p := s.storyGate(ctx, r); p != nil {
		return row{}, p
	}
	return r, nil
}

// storyGate: only confirmed athletes with a competition and a weight class (403), and only until the competition day (410).
func (s *Svc) storyGate(ctx context.Context, r row) *problem.Error {
	if r.Estado != "confirmado" {
		return problem.New(http.StatusForbidden, "ATLETA_NO_APROBADO", "Tu inscripción aún no está confirmada.")
	}
	if r.Prueba == "" || r.Categoria == "" {
		return problem.New(http.StatusForbidden, "SIN_INSCRIPCION", "No tienes inscripción en esta edición.")
	}
	fecha := s.compDate(ctx, r.CompetitionID).Format(time.DateOnly)
	if p := s.pruebaArea(ctx, r.CompetitionID, r.ID, r.Prueba); p != nil {
		for _, o := range p.Opciones {
			if o.Codigo == r.Prueba && len(o.Fecha) >= 10 {
				fecha = o.Fecha[:10]
			}
		}
	}
	if time.Now().In(madrid).Format(time.DateOnly) > fecha {
		return problem.New(http.StatusGone, "COMPETICION_FINALIZADA", "La competición ya terminó.")
	}
	return nil
}

// fotoHostPermitido: only our own origin, BunnyCDN and the CDN configured for the competition (no SSRF to any host).
func (s *Svc) fotoHostPermitido(ctx context.Context, cid uuid.UUID, u *url.URL) bool {
	h := strings.ToLower(u.Hostname())
	if strings.HasSuffix(h, ".b-cdn.net") {
		return true
	}
	if w, err := url.Parse(s.webURL); err == nil && strings.EqualFold(w.Hostname(), h) {
		return true
	}
	var out struct {
		Config map[string]string `json:"config"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/bunny", nil, &out); err == nil {
		if c, err := url.Parse(out.Config["cdnUrl"]); err == nil && c.Hostname() != "" && strings.EqualFold(c.Hostname(), h) {
			return true
		}
	}
	return false
}

// fotoCache keeps the downloaded photos for a few minutes and collapses concurrent downloads of the same URL.
type fotoCache struct {
	base string // own web URL: may be http in dev
	mu   sync.Mutex
	m    map[string]*fotoEntry
	cli  *http.Client
}

type fotoEntry struct {
	done  chan struct{}
	at    time.Time
	body  []byte
	ctype string
	err   error
}

const (
	fotoTTL     = 10 * time.Minute
	fotoMax     = 16 << 20
	fotoEntries = 64
)

func (c *fotoCache) get(raw string, permitido func(*url.URL) bool) *fotoEntry {
	c.mu.Lock()
	if e, ok := c.m[raw]; ok {
		select {
		case <-e.done:
			if e.err == nil && time.Since(e.at) < fotoTTL {
				c.mu.Unlock()
				return e
			}
		default:
			c.mu.Unlock()
			<-e.done
			return e
		}
	}
	if len(c.m) >= fotoEntries {
	evict:
		for k, old := range c.m {
			select {
			case <-old.done:
				delete(c.m, k)
			default:
			}
			if len(c.m) < fotoEntries {
				break evict
			}
		}
	}
	e := &fotoEntry{done: make(chan struct{})}
	c.m[raw] = e
	c.mu.Unlock()

	e.body, e.ctype, e.err = c.fetch(raw, permitido)
	e.at = time.Now()
	close(e.done)
	if e.err != nil {
		c.mu.Lock()
		if c.m[raw] == e {
			delete(c.m, raw)
		}
		c.mu.Unlock()
	}
	return e
}

func (c *fotoCache) fetch(raw string, permitido func(*url.URL) bool) ([]byte, string, error) {
	u, err := url.Parse(raw)
	interno := c.base != "" && strings.HasPrefix(raw, c.base+"/api/medios/") && !strings.Contains(raw[len(c.base):], "..")
	if err != nil || (!interno && (u.Scheme != "https" || !permitido(u))) {
		return nil, "", errors.New("host de la foto no permitido")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", err
	}
	res, err := c.cli.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, "", errors.New("foto: " + res.Status)
	}
	if !strings.HasPrefix(res.Header.Get("Content-Type"), "image/") {
		return nil, "", errors.New("foto: no es una imagen")
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, fotoMax+1))
	if err != nil {
		return nil, "", err
	}
	if len(b) > fotoMax {
		return nil, "", errors.New("foto demasiado grande")
	}
	switch t := http.DetectContentType(b); t {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		return b, t, nil
	}
	return nil, "", errors.New("foto: formato no admitido")
}
