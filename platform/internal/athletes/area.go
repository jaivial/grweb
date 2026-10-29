package athletes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// Athlete area (Figma page 42): password-less access with a one-time link sent to the registration email,
// then a session cookie scoped to /api/area-atleta.
const (
	areaLinkTTL    = 30 * time.Minute
	areaSessionTTL = 30 * 24 * time.Hour
	areaCookie     = "gr_area"
)

var tagArea = []string{"Área de atleta"}

// newAreaLink creates a one-time link to the athlete area.
func (s *Svc) newAreaLink(ctx context.Context, tx pgx.Tx, atleta uuid.UUID) (string, error) {
	t := randomToken()
	if _, err := tx.Exec(ctx, `INSERT INTO area_tokens (hash, atleta_id, expires_at) VALUES ($1,$2,$3)`, hashToken(t), atleta, time.Now().Add(areaLinkTTL)); err != nil {
		return "", err
	}
	return s.webURL + "/area-atleta?acceso=" + t, nil
}

func (s *Svc) cookie(value string, maxAge int) http.Cookie {
	return http.Cookie{Name: areaCookie, Value: value, Path: "/api/area-atleta", HttpOnly: true, Secure: s.cookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: maxAge}
}

// session resolves the athlete of the area cookie.
func (s *Svc) session(ctx context.Context, cookie string) (row, error) {
	if cookie == "" {
		return row{}, problem.Unauthorized("SIN_SESION", "Entra con el enlace que te enviamos por email.")
	}
	var aid, cid uuid.UUID
	err := s.a.DB.QueryRow(ctx, `UPDATE area_sesiones SET last_seen_at = now() WHERE token_hash = $1 AND expires_at > now()
		RETURNING atleta_id, (SELECT competition_id FROM atletas WHERE id = atleta_id)`, hashToken(cookie)).Scan(&aid, &cid)
	if err != nil {
		return row{}, problem.Unauthorized("SIN_SESION", "Tu sesión ha caducado. Pide un enlace nuevo.")
	}
	r, err := getRow(ctx, s.a.DB, cid, aid)
	if err != nil || r.Estado == "baja" {
		return row{}, problem.Unauthorized("SIN_SESION", "Tu inscripción ya no está activa.")
	}
	return r, nil
}

// Panel is everything the athlete area shows (Figma «Panel», «Editar perfil», «Previa del pesaje»).
type Panel struct {
	Competicion struct {
		Slug   string `json:"slug"`
		Nombre string `json:"nombre"`
	} `json:"competicion"`
	Atleta        Atleta   `json:"atleta"`
	Acreditacion  string   `json:"acreditacion" doc:"Contenido del QR de la inscripción (se enseña en el pesaje)"`
	Checklist     []Check  `json:"checklist"`
	PesajeAbierto bool     `json:"pesajeAbierto" doc:"Las alturas y primeros intentos se pueden cambiar hasta el pesaje"`
	Avisos        []string `json:"avisos"`
}

// Check is an item of «Prepara tu día».
type Check struct {
	Clave  string `json:"clave"`
	Texto  string `json:"texto"`
	Hecho  bool   `json:"hecho"`
	Accion string `json:"accion,omitempty" enum:"pesaje,perfil,"`
}

func (s *Svc) panel(ctx context.Context, r row) (Panel, error) {
	c, err := s.comps.ByID(ctx, r.CompetitionID)
	if err != nil {
		return Panel{}, err
	}
	d := s.compDate(ctx, r.CompetitionID)
	p := Panel{Atleta: r.admin(d), Acreditacion: s.qr(r.CompetitionID, r.ID), PesajeAbierto: r.PesadoAt == nil, Avisos: []string{}}
	p.Competicion.Slug, p.Competicion.Nombre = c.Slug, c.Nombre
	p.Atleta.Email = "" // the area never needs to show it back
	p.Checklist = []Check{
		{Clave: "licencia", Texto: "Licencia AEP en vigor", Hecho: r.Licencia != ""},
		{Clave: "dni", Texto: "DNI o pasaporte", Hecho: true},
		{Clave: "equipamiento", Texto: "Equipamiento homologado (cinturón, rodilleras…)", Hecho: true},
		{Clave: "pesaje", Texto: "Alturas de rack y primeros intentos", Hecho: r.RackSQ != nil && r.IntentoSQ != nil && r.IntentoBP != nil && r.IntentoDL != nil, Accion: "pesaje"},
		{Clave: "perfil", Texto: "Perfil público (foto y marcas)", Hecho: r.completo() >= 70, Accion: "perfil"},
	}
	if r.menor(d) && r.AutorizacionURL == "" {
		p.Avisos = append(p.Avisos, "Eres menor de edad: tu perfil público y tu foto no se mostrarán hasta que la organización reciba la autorización firmada de tu madre, padre o tutor.")
	}
	if r.Estado == "reserva" {
		p.Avisos = append(p.Avisos, fmt.Sprintf("Estás en la lista de reserva (puesto %d). Te avisaremos por email si queda una plaza libre.", deref(r.OrdenReserva)))
	}
	return p, nil
}

func deref(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// anonIP keeps the /24 (IPv4) or /48 (IPv6) of the consent IP.
func anonIP(ip string) string {
	p := net.ParseIP(ip)
	if p == nil {
		return ""
	}
	if v4 := p.To4(); v4 != nil {
		return fmt.Sprintf("%d.%d.%d.x", v4[0], v4[1], v4[2])
	}
	return p.Mask(net.CIDRMask(48, 128)).String() + "…"
}

func (s *Svc) registerArea() {
	api := s.a.API
	base := "/api/area-atleta"

	type enlaceIn struct {
		Body struct {
			Competicion string `json:"competicion" pattern:"^[a-z0-9-]{2,41}$" doc:"Slug de la competición"`
			Email       string `json:"email" format:"email" maxLength:"254"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-enlace", Method: http.MethodPost, Path: base + "/enlace", Summary: "Pedir un enlace de acceso (siempre 202: no se revela si el email está inscrito)", Tags: tagArea, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *enlaceIn) (*struct{}, error) {
			cid, err := s.comps.ID(ctx, in.Body.Competicion)
			if err != nil {
				return nil, err
			}
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "area", httpx.ClientIPFrom(ctx)), 10, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has pedido varios enlaces seguidos. Espera unos minutos.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "area-email", hashToken(e)[:16]), 3, 15*time.Minute); !r.Allowed {
				return nil, nil // silently: the same 202 as always
			}
			// Answer first: the lookup and the email happen in the background, so the response time does not reveal
			// whether the email is registered.
			bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
			go func() {
				defer cancel()
				var aid uuid.UUID
				var nombre string
				if err := s.a.DB.QueryRow(bg, `SELECT id, nombre FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' ORDER BY created_at LIMIT 1`, cid, e).Scan(&aid, &nombre); err != nil {
					return
				}
				if err := db.Tx(bg, s.a.DB, func(tx pgx.Tx) error {
					link, err := s.newAreaLink(bg, tx, aid)
					if err != nil {
						return err
					}
					return email(bg, tx, cid, e, "atleta-enlace-area", map[string]string{"nombre": nombre, "enlace": link})
				}); err != nil {
					s.a.Log.Warn("enlace del área no enviado", "err", err)
				}
			}()
			return nil, nil
		})

	type sesionIn struct {
		Body struct {
			Acceso string `json:"acceso" minLength:"20" maxLength:"100" doc:"Token del enlace del email"`
		}
	}
	type sesionOut struct {
		SetCookie []http.Cookie `header:"Set-Cookie"`
		Body      Panel
	}
	huma.Register(api, huma.Operation{OperationID: "area-sesion", Method: http.MethodPost, Path: base + "/sesion", Summary: "Entrar con el enlace del email (crea la sesión)", Tags: tagArea},
		func(ctx context.Context, in *sesionIn) (*sesionOut, error) {
			var aid uuid.UUID
			err := s.a.DB.QueryRow(ctx, `UPDATE area_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING atleta_id`, hashToken(in.Body.Acceso)).Scan(&aid)
			if err != nil {
				return nil, problem.Unauthorized("ENLACE_INVALIDO", "El enlace ha caducado o ya se usó. Pide uno nuevo.")
			}
			t := randomToken()
			var cid uuid.UUID
			if err := s.a.DB.QueryRow(ctx, `INSERT INTO area_sesiones (id, atleta_id, token_hash, expires_at) VALUES ($1,$2,$3,$4) RETURNING (SELECT competition_id FROM atletas WHERE id = $2)`,
				newID(), aid, hashToken(t), time.Now().Add(areaSessionTTL)).Scan(&cid); err != nil {
				return nil, err
			}
			r, err := getRow(ctx, s.a.DB, cid, aid)
			if err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			return &sesionOut{SetCookie: []http.Cookie{s.cookie(t, int(areaSessionTTL.Seconds()))}, Body: p}, err
		})

	type cookieIn struct {
		Session string `cookie:"gr_area"`
	}
	type panelOut struct{ Body Panel }
	huma.Register(api, huma.Operation{OperationID: "area-yo", Method: http.MethodGet, Path: base + "/yo", Summary: "Mi panel", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})

	type perfilIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			Club                  string `json:"club,omitempty" maxLength:"120"`
			Ciudad                string `json:"ciudad,omitempty" maxLength:"80"`
			Instagram             string `json:"instagram,omitempty" maxLength:"60"`
			Bio                   string `json:"bio,omitempty" maxLength:"280"`
			Frase                 string `json:"frase,omitempty" maxLength:"80"`
			Marcas                Marcas `json:"marcas"`
			Visible               bool   `json:"visible,omitempty" doc:"Mostrar mi perfil público (foto, bio, Instagram y marcas)"`
			AceptaUsoDeImagen     bool   `json:"aceptaUsoDeImagen,omitempty" doc:"Casilla sin premarcar: consentimiento de uso de imagen en la web"`
			RetirarConsentimiento bool   `json:"retirarConsentimiento,omitempty" doc:"Retira el consentimiento de imagen (la foto deja de mostrarse)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-perfil", Method: http.MethodPut, Path: base + "/perfil", Summary: "Editar mi perfil público", Tags: tagArea},
		func(ctx context.Context, in *perfilIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			b := in.Body
			for _, v := range []*float64{b.Marcas.SQ, b.Marcas.BP, b.Marcas.DL} {
				if v != nil && (*v < 0 || *v > 600) {
					return nil, problem.Unprocessable("MARCA_INVALIDA", "Las marcas deben estar entre 0 y 600 kg.")
				}
			}
			menor := r.menor(s.compDate(ctx, r.CompetitionID))
			ig := normInstagram(b.Instagram)
			if menor {
				ig = "" // minors: no social links are stored
			}
			err = s.change(ctx, r.CompetitionID, "athletes.perfil_actualizado", map[string]any{"id": r.ID, "origen": "area"}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE atletas SET club = $2, ciudad = $3, version = version + 1, updated_at = now() WHERE id = $1`, r.ID, strings.TrimSpace(b.Club), strings.TrimSpace(b.Ciudad)); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE perfiles SET instagram = $2, bio = $3, frase = $4, marca_sq = $5, marca_bp = $6, marca_dl = $7, visible = $8, updated_at = now() WHERE atleta_id = $1`,
					r.ID, ig, strings.TrimSpace(b.Bio), strings.TrimSpace(b.Frase), b.Marcas.SQ, b.Marcas.BP, b.Marcas.DL, b.Visible); err != nil {
					return err
				}
				switch {
				case b.RetirarConsentimiento && r.ImagenAt != nil:
					if _, err := tx.Exec(ctx, `UPDATE perfiles SET imagen_at = NULL, imagen_version = '', imagen_hash = '', imagen_origen = '', imagen_ip = '' WHERE atleta_id = $1`, r.ID); err != nil {
						return err
					}
					if err := hist(ctx, tx, r.ID, "Consentimiento de imagen retirado", "desde el área del atleta"); err != nil {
						return err
					}
				case b.AceptaUsoDeImagen && r.ImagenAt == nil:
					v, h := s.legalVigente(ctx, r.CompetitionID, "consentimiento")
					if v == "" {
						return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "Ahora no podemos registrar tu consentimiento. Inténtalo en unos minutos (el resto del perfil no se ha guardado).")
					}
					if _, err := tx.Exec(ctx, `UPDATE perfiles SET imagen_at = now(), imagen_version = $2, imagen_hash = $3, imagen_origen = 'área del atleta', imagen_ip = $4 WHERE atleta_id = $1`,
						r.ID, v, h, anonIP(httpx.ClientIPFrom(ctx))); err != nil {
						return err
					}
					if err := hist(ctx, tx, r.ID, "Consentimiento de imagen aceptado", "desde el área del atleta · "+v); err != nil {
						return err
					}
				}
				return hist(ctx, tx, r.ID, "Perfil editado por el atleta", "")
			})
			if err != nil {
				return nil, err
			}
			r, err = s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})

	type previaIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			RackSQ    *int   `json:"rackSq,omitempty" minimum:"1" maximum:"30"`
			RackBP    *int   `json:"rackBp,omitempty" minimum:"1" maximum:"30"`
			SegurosBP *int   `json:"segurosBp,omitempty" minimum:"0" maximum:"20"`
			Intentos  Marcas `json:"intentos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-pesaje", Method: http.MethodPut, Path: base + "/pesaje", Summary: "Previa del pesaje: alturas de rack y primeros intentos", Tags: tagArea},
		func(ctx context.Context, in *previaIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if r.PesadoAt != nil {
				return nil, problem.Conflict("PESAJE_HECHO", "Ya te han pesado: cualquier cambio se hace en la mesa.")
			}
			b := in.Body
			rackBP := ""
			if b.RackBP != nil {
				rackBP = fmt.Sprint(*b.RackBP)
				if b.SegurosBP != nil {
					rackBP += "/" + fmt.Sprint(*b.SegurosBP)
				}
			}
			err = s.change(ctx, r.CompetitionID, "athletes.previa_pesaje", map[string]any{"id": r.ID}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE atletas SET rack_sq = $2, rack_bp = $3, seguros_bp = $4, intento_sq = $5, intento_bp = $6, intento_dl = $7, version = version + 1, updated_at = now() WHERE id = $1`,
					r.ID, b.RackSQ, rackBP, b.SegurosBP, b.Intentos.SQ, b.Intentos.BP, b.Intentos.DL); err != nil {
					return err
				}
				return hist(ctx, tx, r.ID, "Previa del pesaje guardada por el atleta", "")
			})
			if err != nil {
				return nil, err
			}
			r, _ = s.session(ctx, in.Session)
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})

	type encIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			FocalX int16 `json:"focalX" minimum:"0" maximum:"100"`
			FocalY int16 `json:"focalY" minimum:"0" maximum:"100"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-encuadre", Method: http.MethodPut, Path: base + "/foto/encuadre", Summary: "Encuadre de mi foto (punto focal)", Tags: tagArea},
		func(ctx context.Context, in *encIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if err := s.change(ctx, r.CompetitionID, "", nil, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `UPDATE perfiles SET focal_x = $2, focal_y = $3, updated_at = now() WHERE atleta_id = $1`, r.ID, in.Body.FocalX, in.Body.FocalY)
				return err
			}); err != nil {
				return nil, err
			}
			r, _ = s.session(ctx, in.Session)
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})

	type salirOut struct {
		SetCookie []http.Cookie `header:"Set-Cookie"`
	}
	huma.Register(api, huma.Operation{OperationID: "area-salir", Method: http.MethodPost, Path: base + "/salir", Summary: "Cerrar sesión", Tags: tagArea, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *cookieIn) (*salirOut, error) {
			if in.Session != "" {
				_, _ = s.a.DB.Exec(ctx, `DELETE FROM area_sesiones WHERE token_hash = $1`, hashToken(in.Session))
			}
			return &salirOut{SetCookie: []http.Cookie{s.cookie("", -1)}}, nil
		})

	// Photo upload from the area: stored by cms (media library), linked to the profile.
	s.a.Mux.HandleFunc("POST "+base+"/foto", func(w http.ResponseWriter, req *http.Request) {
		ck, _ := req.Cookie(areaCookie)
		v := ""
		if ck != nil {
			v = ck.Value
		}
		r, err := s.session(req.Context(), v)
		if err != nil {
			problem.Write(w, err.(*problem.Error))
			return
		}
		url, perr := s.subirFoto(req, r)
		if perr != nil {
			problem.Write(w, perr)
			return
		}
		if err := s.change(req.Context(), r.CompetitionID, "athletes.foto_subida", map[string]any{"id": r.ID, "origen": "area"}, func(tx pgx.Tx) error {
			if _, err := tx.Exec(req.Context(), `UPDATE perfiles SET foto_url = $2, focal_x = 50, focal_y = 35, updated_at = now() WHERE atleta_id = $1`, r.ID, url); err != nil {
				return err
			}
			return hist(req.Context(), tx, r.ID, "Foto subida por el atleta", "")
		}); err != nil {
			problem.Write(w, problem.Internal())
			return
		}
		r, _ = s.session(req.Context(), v)
		p, err := s.panel(req.Context(), r)
		if err != nil {
			problem.Write(w, problem.Internal())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(p)
	})
}

// subirFoto forwards the multipart photo to the cms media library (internal endpoint) and returns its URL.
func (s *Svc) subirFoto(req *http.Request, r row) (string, *problem.Error) {
	f, fh, err := req.FormFile("file")
	if err != nil {
		return "", problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta una foto en el campo «file».")
	}
	defer f.Close()
	if fh.Size > 8<<20 {
		return "", problem.Unprocessable("ARCHIVO_GRANDE", "La foto supera los 8 MB.")
	}
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	if t := http.DetectContentType(head[:n]); t != "image/jpeg" && t != "image/png" && t != "image/webp" {
		return "", problem.Unprocessable("TIPO_NO_PERMITIDO", "Sube una foto JPG, PNG o WebP.")
	}
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("competicion", r.CompetitionID.String())
	_ = mw.WriteField("alt", r.nombreCompleto())
	part, _ := mw.CreateFormFile("file", fh.Filename)
	_, _ = part.Write(head[:n])
	if _, err := io.Copy(part, f); err != nil {
		return "", problem.Internal()
	}
	_ = mw.Close()
	var m struct {
		URL string `json:"url"`
	}
	if err := s.cms.Raw(req.Context(), http.MethodPost, "/internal/medios", mw.FormDataContentType(), &body, &m); err != nil {
		var p *problem.Error
		if ok := asProblem(err, &p); ok && p.Status < 500 {
			return "", p
		}
		s.a.Log.Warn("cms medios no disponible", "err", err)
		return "", problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido guardar la foto. Inténtalo en unos minutos.")
	}
	return m.URL, nil
}

// cmdEnlaceArea prints a one-time link to the area of an athlete (QA/support): athletes enlace-area <slug> <email>.
func (s *Svc) cmdEnlaceArea(ctx context.Context, a *app.App, args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("uso: enlace-area <slug-competición> <email>")
	}
	s.init(a)
	cid, err := compref.New(s.comp, a.Log).ID(ctx, args[0])
	if err != nil {
		return err
	}
	var aid uuid.UUID
	if err := a.DB.QueryRow(ctx, `SELECT id FROM atletas WHERE competition_id = $1 AND email = $2`, cid, strings.ToLower(args[1])).Scan(&aid); err != nil {
		return fmt.Errorf("no hay ningún atleta con ese email en %s", args[0])
	}
	return db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		link, err := s.newAreaLink(auth.WithPrincipal(ctx, &auth.Principal{Service: "cli"}), tx, aid)
		if err == nil {
			fmt.Println(link)
		}
		return err
	})
}
