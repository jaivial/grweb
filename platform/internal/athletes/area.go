package athletes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
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
	"github.com/jaivial/grweb/platform/pkg/imagen"
	"github.com/jaivial/grweb/platform/pkg/pagos"
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
	return s.newAreaLinkTTL(ctx, tx, atleta, areaLinkTTL)
}

// aprobadaLinkTTL: the link of the «aprobada» email is read hours later (Figma 171:92769: «caduca en 7 días»).
const aprobadaLinkTTL = 7 * 24 * time.Hour

func (s *Svc) newAreaLinkTTL(ctx context.Context, tx pgx.Tx, atleta uuid.UUID, ttl time.Duration) (string, error) {
	t := randomToken()
	if _, err := tx.Exec(ctx, `INSERT INTO area_tokens (hash, atleta_id, expires_at) VALUES ($1,$2,$3)`, hashToken(t), atleta, time.Now().Add(ttl)); err != nil {
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
	Atleta       Atleta `json:"atleta"`
	Acreditacion string `json:"acreditacion" doc:"Contenido del QR de la inscripción (se enseña en el pesaje)"`
	// AcreditacionURL: the PNG of that QR on the Bunny CDN (empty while it has not been generated: the web draws it).
	AcreditacionURL string        `json:"acreditacionUrl,omitempty" doc:"URL del PNG del QR en el CDN"`
	Checklist       []Check       `json:"checklist"`
	PesajeAbierto   bool          `json:"pesajeAbierto" doc:"Las alturas y primeros intentos se pueden cambiar hasta el pesaje"`
	Avisos          []string      `json:"avisos"`
	Referido        *ReferidoArea `json:"referido,omitempty" doc:"Invita y ahorra (inscripción propia con referidos)"`
	Prueba          *PruebaArea   `json:"prueba,omitempty" doc:"Tu competición: AEP-2 o AEP-3"`
	TienePassword   bool          `json:"tienePassword" doc:"Ya puede entrar con email y contraseña"`
	// PasswordTemporal: the password is the initial one the organisers sent; the area asks for a new one.
	PasswordTemporal bool `json:"passwordTemporal,omitempty" doc:"Entró con la contraseña inicial: debe cambiarla"`
	// FotoPendiente: atleta.perfil.fotoUrl is the photo the athlete uploaded, waiting for the team's review (the
	// public pages keep the approved one until then).
	FotoPendiente bool `json:"fotoPendiente,omitempty" doc:"La foto nueva espera la revisión del equipo"`
}

// ReferidoArea is the «Invita y ahorra» card of the athlete area.
type ReferidoArea struct {
	Codigo     string `json:"codigo"`
	Invitados  int    `json:"invitados"`
	MaxUsos    int    `json:"maxUsos"`
	Devuelto   int    `json:"devuelto"`
	Pendiente  int    `json:"pendiente"`
	Pagado     int    `json:"pagado"`
	Descuento  string `json:"descuento" doc:"Lo que obtienen sus invitados («10 %»)"`
	Recompensa string `json:"recompensa" doc:"Lo que recupera por invitado («5,00 €»)"`
	Tope       bool   `json:"tope" doc:"Ya ha recuperado todo lo que pagó"`
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
	// The area (and the story builder) works with the new photo while the team reviews it.
	if f := s.fotoPendiente(ctx, r.CompetitionID, r.ID); f != "" {
		p.Atleta.Perfil.FotoURL, p.Atleta.Perfil.FocalX, p.Atleta.Perfil.FocalY, p.FotoPendiente = f, 50, 35, true
	}
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
	if ra, err := s.referidoArea(ctx, r); err == nil && ra != nil {
		p.Referido = ra
	}
	p.Prueba = s.pruebaArea(ctx, r.CompetitionID, r.ID, r.Prueba)
	p.TienePassword = s.tienePassword(ctx, r.ID)
	_ = s.a.DB.QueryRow(ctx, `SELECT password_temporal, acreditacion_url FROM atletas WHERE id = $1`, r.ID).Scan(&p.PasswordTemporal, &p.AcreditacionURL)
	if r.Estado == "reserva" {
		p.Avisos = append(p.Avisos, fmt.Sprintf("Estás en la lista de reserva (puesto %d). Te avisaremos por email si queda una plaza libre.", deref(r.OrdenReserva)))
	}
	// «Editar mi perfil» leaves a change request: the panel says it is waiting for the team.
	if cp, err := cambioPendiente(ctx, s.a.DB, r.CompetitionID, r.ID); err == nil && cp != nil {
		p.Avisos = append(p.Avisos, fmt.Sprintf("Tienes %d %s de perfil pendientes de revisión. Puedes verlos o cancelarlos en «Editar mi perfil».",
			len(cp.Cambios), plural(len(cp.Cambios), "cambio", "cambios")))
	}
	return p, nil
}

// plural picks the singular or the plural of a word.
func plural(n int, uno, varios string) string {
	if n == 1 {
		return uno
	}
	return varios
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
			Next        string `json:"next,omitempty" pattern:"^(/area-atleta/compartir|/area-atleta\\?vista=(perfil|horarios|acreditacion|pesaje|post))?$" doc:"Página a la que vuelve el enlace"`
			Motivo      string `json:"motivo,omitempty" enum:"acceso,contrasena" doc:"contrasena = «¿Has olvidado tu contraseña?» (mismo enlace, email para cambiarla)"`
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
					if in.Body.Next != "" {
						link += "&next=" + url.QueryEscape(in.Body.Next)
					}
					plantilla := "atleta-enlace-area"
					if in.Body.Motivo == "contrasena" {
						plantilla = "atleta-contrasena"
					}
					return email(bg, tx, cid, e, plantilla, map[string]string{"nombre": nombre, "enlace": link})
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
			// the link is only spent when the session and the panel are created (same transaction)
			tx, err := s.a.DB.Begin(ctx)
			if err != nil {
				return nil, err
			}
			defer tx.Rollback(ctx) //nolint:errcheck
			var aid uuid.UUID
			if err := tx.QueryRow(ctx, `UPDATE area_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING atleta_id`, hashToken(in.Body.Acceso)).Scan(&aid); err != nil {
				return nil, problem.Unauthorized("ENLACE_INVALIDO", "El enlace ha caducado o ya se usó. Pide uno nuevo.")
			}
			t := randomToken()
			var cid uuid.UUID
			if err := tx.QueryRow(ctx, `INSERT INTO area_sesiones (id, atleta_id, token_hash, expires_at) VALUES ($1,$2,$3,$4) RETURNING (SELECT competition_id FROM atletas WHERE id = $2)`,
				newID(), aid, hashToken(t), time.Now().Add(areaSessionTTL)).Scan(&cid); err != nil {
				return nil, err
			}
			r, err := getRow(ctx, tx, cid, aid)
			if err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			if err != nil {
				return nil, err
			}
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
			return &sesionOut{SetCookie: []http.Cookie{s.cookie(t, int(areaSessionTTL.Seconds()))}, Body: p}, nil
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

	// Cheap check for the navbar of every page: 204 without a session (no 401 in the console of anonymous visitors).
	type sesionActivaOut struct {
		Status int
		Body   struct {
			Nombre string `json:"nombre"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-sesion-activa", Method: http.MethodGet, Path: base + "/sesion", Summary: "¿Hay sesión de área? (204 sin sesión)", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*sesionActivaOut, error) {
			o := &sesionActivaOut{Status: http.StatusNoContent}
			if in.Session == "" {
				return o, nil
			}
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return o, nil
			}
			o.Status = http.StatusOK
			o.Body.Nombre = r.Nombre
			return o, nil
		})

	// The athlete can change here what is a setting (visibility, image consent). The details of the record (name,
	// contact, club, bio, marks…) are a change request that the team reviews first: nothing is written until approving.
	type perfilIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			Visible               *bool `json:"visible,omitempty" doc:"Mostrar mi perfil público (foto, bio, Instagram y marcas)"`
			AceptaUsoDeImagen     bool  `json:"aceptaUsoDeImagen,omitempty" doc:"Casilla sin premarcar: consentimiento de uso de imagen en la web"`
			RetirarConsentimiento bool  `json:"retirarConsentimiento,omitempty" doc:"Retira el consentimiento de imagen (la foto deja de mostrarse)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-perfil", Method: http.MethodPut, Path: base + "/perfil", Summary: "Mi visibilidad y el consentimiento de imagen", Tags: tagArea},
		func(ctx context.Context, in *perfilIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			b := in.Body
			err = s.change(ctx, r.CompetitionID, "athletes.perfil_actualizado", map[string]any{"id": r.ID, "origen": "area"}, func(tx pgx.Tx) error {
				if b.Visible != nil && *b.Visible != r.Visible {
					if _, err := tx.Exec(ctx, `UPDATE perfiles SET visible = $2, updated_at = now() WHERE atleta_id = $1`, r.ID, *b.Visible); err != nil {
						return err
					}
					accion := "Perfil público activado por el atleta"
					if !*b.Visible {
						accion = "Perfil público desactivado por el atleta"
					}
					if err := hist(ctx, tx, r.ID, accion, ""); err != nil {
						return err
					}
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
						return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "Ahora no podemos registrar tu consentimiento. Inténtalo en unos minutos.")
					}
					if _, err := tx.Exec(ctx, `UPDATE perfiles SET imagen_at = now(), imagen_version = $2, imagen_hash = $3, imagen_origen = 'área del atleta', imagen_ip = $4 WHERE atleta_id = $1`,
						r.ID, v, h, anonIP(httpx.ClientIPFrom(ctx))); err != nil {
						return err
					}
					if err := hist(ctx, tx, r.ID, "Consentimiento de imagen aceptado", "desde el área del atleta · "+v); err != nil {
						return err
					}
				}
				return nil
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
			for _, v := range []*float64{b.Intentos.SQ, b.Intentos.BP, b.Intentos.DL} {
				if v != nil && (*v < 0 || *v > 600 || math.Mod(*v, 2.5) != 0) {
					return nil, problem.Unprocessable("INTENTO_INVALIDO", "Los intentos van entre 0 y 600 kg, en múltiplos de 2,5.")
				}
			}
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

	// Photo upload from the area: uploaded to the CDN (Bunny) and left for the team's review in the athlete's
	// «cambio_perfil» request (merged with the open one): the public photo changes only when it is approved.
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
		ctx := req.Context()
		equipo := s.equipoAdmins(ctx, r.CompetitionID)
		slug := ""
		if comp, err := s.comps.ByID(ctx, r.CompetitionID); err == nil {
			slug = comp.Slug
		}
		var borrar string
		if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			prev, err := s.lock(ctx, tx, r.CompetitionID, r.ID, "")
			if err != nil {
				return err
			}
			// The same photo as the approved one asks for nothing (and drops a pending one).
			nuevos := cambiosPerfil{Claves: []string{}, Antes: map[string]any{}, Despues: map[string]any{}}
			if url != prev.FotoURL {
				nuevos = cambiosPerfil{Claves: []string{"foto"}, Antes: map[string]any{"foto": prev.FotoURL}, Despues: map[string]any{"foto": url}}
			}
			if _, borrar, err = s.guardaCambioPerfil(ctx, tx, prev, nil, nuevos, func(k string) bool { return k == "foto" }, equipo, slug); err != nil {
				return err
			}
			return hist(ctx, tx, r.ID, "Foto subida por el atleta", "Pendiente de revisión")
		}); err != nil {
			var pe *problem.Error
			if errors.As(err, &pe) {
				problem.Write(w, pe)
				return
			}
			problem.Write(w, problem.Internal())
			return
		}
		if borrar != "" && borrar != url {
			s.borraFotoPublicada(ctx, r.CompetitionID, borrar)
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

// subirFoto publishes the photo of the athlete area in the CDN of the competition (Bunny; the volume of
// the service without credentials) and returns its URL, which the profile stores.
func (s *Svc) subirFoto(req *http.Request, r row) (string, *problem.Error) {
	f, fh, err := req.FormFile("file")
	if err != nil {
		return "", problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta una foto en el campo «file».")
	}
	defer f.Close()
	if fh.Size > 8<<20 {
		return "", problem.Unprocessable("ARCHIVO_GRANDE", "La foto supera los 8 MB.")
	}
	data, err := io.ReadAll(io.LimitReader(f, 8<<20+1))
	if err != nil {
		return "", problem.Internal()
	}
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[http.DetectContentType(data)]
	if ext == "" {
		return "", problem.Unprocessable("TIPO_NO_PERMITIDO", "Sube una foto JPG, PNG o WebP.")
	}
	// The CDN gets an optimised JPEG (≤1600 px, q82), not the original: phone PNGs of 2.3 MB slowed the athlete pages.
	if data, err = imagen.Optimizar(data, imagen.MaxLadoFoto); err != nil {
		return "", problem.Unprocessable("FOTO_ILEGIBLE", "No hemos podido leer la foto. Sube una JPG, PNG o WebP de menos de 48 megapíxeles.")
	}
	ext = ".jpg"
	st, err := s.storage(req.Context(), r.CompetitionID)
	if err == nil {
		sum := sha256.Sum256(data)
		key := "atletas/" + r.ID.String() + "-" + hex.EncodeToString(sum[:])[:8] + ext
		var url string
		if url, err = st.Put(req.Context(), key, "image/jpeg", data); err == nil {
			return url, nil
		}
	}
	s.a.Log.Warn("no se ha podido publicar la foto del área", "err", err)
	return "", problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido guardar la foto. Inténtalo en unos minutos.")
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

func (s *Svc) referidoArea(ctx context.Context, r row) (*ReferidoArea, error) {
	cfg, err := s.config(ctx, s.a.DB, r.CompetitionID)
	if err != nil || !cfg.Referidos.Activo {
		return nil, err
	}
	var id uuid.UUID
	var aj *ReferidosCfg
	out := &ReferidoArea{}
	err = s.a.DB.QueryRow(ctx, `SELECT c.id, c.codigo, c.ajustes, COALESCE(i.total, 0), COALESCE(i.devuelto, 0),
		(SELECT count(*) FROM referido_usos u WHERE u.codigo_id = c.id AND u.estado <> 'anulada'),
		COALESCE((SELECT sum(recompensa) FROM referido_usos u WHERE u.codigo_id = c.id AND u.estado = 'pendiente'), 0)
		FROM referido_codigos c LEFT JOIN inscripciones i ON i.id = c.inscripcion_id AND i.estado = 'pagada' WHERE c.atleta_id = $1`, r.ID).
		Scan(&id, &out.Codigo, &aj, &out.Pagado, &out.Devuelto, &out.Invitados, &out.Pendiente)
	if err != nil {
		return nil, nil // no code (AEP registration or not paid yet)
	}
	rc := refRow{Ajustes: aj}.cfg(cfg.Referidos)
	out.MaxUsos = rc.MaxUsos
	out.Descuento = strings.TrimPrefix(descTexto(rc.DescTipo, rc.DescValor), "−")
	out.Recompensa = pagos.Euros(rc.Recompensa)
	out.Tope = out.Pagado > 0 && out.Devuelto >= out.Pagado
	return out, nil
}
