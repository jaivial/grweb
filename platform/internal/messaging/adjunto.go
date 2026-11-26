package messaging

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Email attachments: the producer sends the reserved variable «__adjunto» (a URL) and, optionally, «__adjuntoNombre».
// The file is fetched here, at send time, only from the Bunny pull zone of the competition or from the public web
// (same origin), with a 5 MB cap. When it cannot be fetched the email goes out without it (the link is in the text).

const maxAdjunto = 5 << 20

// Adjunto is a file attached to an email.
type Adjunto struct {
	Nombre string
	Tipo   string
	Datos  []byte
}

var httpAdjunto = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

// adjuntoDe fetches the attachment of a message (nil when there is none or it is not allowed / reachable).
func (s *Svc) adjuntoDe(ctx context.Context, cid uuid.UUID, vars map[string]string) *Adjunto {
	raw := strings.TrimSpace(vars["__adjunto"])
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || !s.origenAdjunto(ctx, cid, u) {
		s.a.Log.Warn("adjunto no permitido: el email sale sin él", "plantilla", vars["__adjuntoNombre"])
		return nil
	}
	a, err := descargaAdjunto(ctx, u.String())
	if err != nil {
		s.a.Log.Warn("no se ha podido descargar el adjunto: el email sale sin él", "host", u.Host, "err", err)
		return nil
	}
	a.Nombre = strings.TrimSpace(vars["__adjuntoNombre"])
	if a.Nombre == "" {
		a.Nombre = path.Base(u.Path)
	}
	return a
}

// origenAdjunto: https from the CDN of the competition (Bunny) or the public web itself.
func (s *Svc) origenAdjunto(ctx context.Context, cid uuid.UUID, u *url.URL) bool {
	if w, err := url.Parse(s.webURL); err == nil && w.Host != "" && strings.EqualFold(u.Host, w.Host) && u.Scheme == w.Scheme {
		return true
	}
	if u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if strings.HasSuffix(host, ".b-cdn.net") {
		return true
	}
	var out struct {
		Config map[string]string `json:"config"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/bunny", nil, &out); err == nil {
		if c, err := url.Parse(out.Config["cdnUrl"]); err == nil && c.Host != "" && strings.EqualFold(c.Host, u.Host) {
			return true
		}
	}
	return false
}

func descargaAdjunto(ctx context.Context, u string) (*Adjunto, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	res, err := httpAdjunto.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	datos, err := io.ReadAll(io.LimitReader(res.Body, maxAdjunto+1))
	if err != nil {
		return nil, err
	}
	if len(datos) > maxAdjunto {
		return nil, fmt.Errorf("supera los 5 MB")
	}
	tipo := http.DetectContentType(datos)
	if t, _, err := mime.ParseMediaType(tipo); err == nil {
		tipo = t
	}
	return &Adjunto{Tipo: tipo, Datos: datos}, nil
}
