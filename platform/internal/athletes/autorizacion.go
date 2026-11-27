package athletes

// Autorización de madre, padre o tutor (atletas menores, GRS Cup 2): desde la ficha la organización pide la
// autorización (un enlace personal y el formulario PNG con los datos del atleta, por email —adjunto— y por WhatsApp);
// el tutor la firma y la sube desde /autorizacion/<token>, y el equipo la revisa como una solicitud de tipo
// «autorizacion». Aprobarla rellena perfiles.autorizacion_url y el atleta pasa a ser público en todas partes.

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

const (
	ttlAutorizacion = 120 * 24 * time.Hour
	maxAutorizacion = 10 << 20
)

// AutorizacionEstado is the state of the guardian's authorisation in the athlete's record.
type AutorizacionEstado struct {
	Estado      string     `json:"estado" enum:"sin_pedir,enviada,revision,rechazada,aprobada"`
	EnviadaAt   *time.Time `json:"enviadaAt,omitempty"`
	SolicitudID *uuid.UUID `json:"solicitudId,omitempty"`
	Motivo      string     `json:"motivo,omitempty"`
	AprobadaAt  *time.Time `json:"aprobadaAt,omitempty"`
}

// AutorizacionPub is what the public page /autorizacion/<token> shows.
type AutorizacionPub struct {
	Estado        string `json:"estado" enum:"subir,revision,rechazada,aprobada"`
	Nombre        string `json:"nombre"`
	Atleta        string `json:"atleta"`
	Competicion   string `json:"competicion"`
	Fecha         string `json:"fecha"`
	FormularioURL string `json:"formularioUrl"`
	Motivo        string `json:"motivo,omitempty"`
}

func tokenInvalido() *problem.Error {
	return problem.New(http.StatusNotFound, "TOKEN_INVALIDO", "Este enlace no es válido o ha caducado. Pide uno nuevo a la organización.")
}

func noDisponible() *problem.Error {
	return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido preparar el archivo. Inténtalo en unos minutos.")
}

// tokenAutorizacion is the link token of a token row: derived from its id with the key of the service, so it is
// never stored (only its sha256) and the notice of a rejection can repeat the same link.
func (s *Svc) tokenAutorizacion(id uuid.UUID) string {
	m := hmac.New(sha256.New, s.autKey)
	m.Write([]byte("token:" + id.String()))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (s *Svc) enlaceAutorizacion(token string) string { return s.webURL + "/autorizacion/" + token }

// solAutorizacion is the latest «autorizacion» request of an athlete.
type solAutorizacion struct {
	ID         uuid.UUID
	Estado     string
	Motivo     string
	RevisadoAt *time.Time
}

func (s *Svc) ultimaAutorizacion(ctx context.Context, cid, atleta uuid.UUID) *solAutorizacion {
	var a solAutorizacion
	if err := s.a.DB.QueryRow(ctx, `SELECT id, estado, motivo_rechazo, revisado_at FROM solicitudes_atleta
		WHERE competition_id = $1 AND tipo = 'autorizacion' AND match_atleta_id = $2 ORDER BY created_at DESC LIMIT 1`, cid, atleta).
		Scan(&a.ID, &a.Estado, &a.Motivo, &a.RevisadoAt); err != nil {
		return nil
	}
	return &a
}

// estadoAutorizacion: aprobada (the profile has it) · revision / rechazada (the latest request) · enviada (a link was
// sent and nothing is pending) · sin_pedir.
func (s *Svc) estadoAutorizacion(ctx context.Context, r row) AutorizacionEstado {
	e := AutorizacionEstado{Estado: "sin_pedir"}
	var enviada time.Time
	if err := s.a.DB.QueryRow(ctx, `SELECT created_at FROM autorizacion_tokens WHERE atleta_id = $1 ORDER BY created_at DESC LIMIT 1`, r.ID).Scan(&enviada); err == nil {
		e.EnviadaAt, e.Estado = &enviada, "enviada"
	}
	sol := s.ultimaAutorizacion(ctx, r.CompetitionID, r.ID)
	if sol != nil {
		e.SolicitudID = &sol.ID
	}
	switch {
	case r.AutorizacionURL != "":
		e.Estado = "aprobada"
		if sol != nil && sol.Estado == "aprobada" {
			e.AprobadaAt = sol.RevisadoAt
		}
	case sol == nil:
	case sol.Estado == "pendiente" || sol.Estado == "revision":
		e.Estado = "revision"
	case sol.Estado == "rechazada" && (e.EnviadaAt == nil || sol.RevisadoAt == nil || !e.EnviadaAt.After(*sol.RevisadoAt)):
		// A link sent after the rejection (a new request from the record) is «enviada» again.
		e.Estado, e.Motivo = "rechazada", sol.Motivo
	}
	return e
}

// tokenVivo returns the athlete of a valid link (404 TOKEN_INVALIDO otherwise) and the URL of its form.
func (s *Svc) tokenVivo(ctx context.Context, cid uuid.UUID, token string) (uuid.UUID, string, *problem.Error) {
	var atleta uuid.UUID
	var form string
	if err := s.a.DB.QueryRow(ctx, `SELECT atleta_id, formulario_url FROM autorizacion_tokens WHERE hash = $1 AND competition_id = $2
		AND revoked_at IS NULL AND expires_at > now()`, hashToken(token), cid).Scan(&atleta, &form); err != nil {
		return uuid.Nil, "", tokenInvalido()
	}
	return atleta, form, nil
}

// autorizacionPub is the state of the public page.
func (s *Svc) autorizacionPub(ctx context.Context, cid, atleta uuid.UUID, form string) (AutorizacionPub, row, *problem.Error) {
	r, err := getRow(ctx, s.a.DB, cid, atleta)
	if err != nil {
		return AutorizacionPub{}, r, tokenInvalido()
	}
	o := AutorizacionPub{Estado: "subir", Nombre: r.Nombre, Atleta: r.nombreCompleto(), Competicion: eventoAutorizacion, FormularioURL: form}
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		o.Fecha = c.FechaInicio
	}
	switch e := s.estadoAutorizacion(ctx, r); e.Estado {
	case "aprobada", "revision":
		o.Estado = e.Estado
	case "rechazada":
		o.Estado, o.Motivo = "rechazada", e.Motivo
	}
	return o, r, nil
}

// emiteToken revokes the live link of the athlete and creates a new one (valid 120 days).
func (s *Svc) emiteToken(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID, form string) (string, error) {
	if _, err := tx.Exec(ctx, `UPDATE autorizacion_tokens SET revoked_at = now() WHERE atleta_id = $1 AND revoked_at IS NULL`, atleta); err != nil {
		return "", err
	}
	id := newID()
	token := s.tokenAutorizacion(id)
	_, err := tx.Exec(ctx, `INSERT INTO autorizacion_tokens (hash, id, competition_id, atleta_id, formulario_url, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		hashToken(token), id, cid, atleta, form, time.Now().Add(ttlAutorizacion))
	return token, err
}

// enlaceVigente is the current link of the athlete: the live one or, when it was revoked or is about to expire, a new
// one with the same form.
func (s *Svc) enlaceVigente(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID) (string, error) {
	var id uuid.UUID
	var form string
	var vivo bool
	err := tx.QueryRow(ctx, `SELECT id, formulario_url, revoked_at IS NULL AND expires_at > now() + interval '7 days' FROM autorizacion_tokens
		WHERE atleta_id = $1 ORDER BY created_at DESC LIMIT 1`, atleta).Scan(&id, &form, &vivo)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if vivo {
		return s.enlaceAutorizacion(s.tokenAutorizacion(id)), nil
	}
	token, err := s.emiteToken(ctx, tx, cid, atleta, form)
	if err != nil {
		return "", err
	}
	return s.enlaceAutorizacion(token), nil
}

// datosFormulario is what the form prints of the athlete.
func datosFormulario(r row) DatosFormulario {
	d := DatosFormulario{Nombre: r.nombreCompleto()}
	if r.FechaNacimiento != nil {
		d.FechaNacimiento = r.FechaNacimiento.Format("02/01/2006")
	}
	cat := []string{}
	if n := DivisionNombre(r.Division); n != "" {
		cat = append(cat, n)
	}
	if r.Categoria != "" {
		sexo := map[string]string{"F": "Femenino", "M": "Masculino"}[r.Sexo]
		cat = append(cat, strings.TrimSpace(sexo+" "+r.Categoria+" kg"))
	}
	d.Categoria = strings.Join(cat, " · ")
	return d
}

// waAceptado: the athlete accepted WhatsApp notices, recorded on their record (a consent given to the organiser) or in
// their approved alta (the box of the form); a withdrawal recorded by the team overrides both. Every athlete notice by
// WhatsApp uses it.
func waAceptado(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, cid, atleta uuid.UUID) bool {
	return consentimientoWA(ctx, q, cid, atleta) != nil
}

// publicaFormulario draws the form of the athlete and publishes it (the key is derived from its content: it cannot
// be guessed and the same data reuses the same file).
func (s *Svc) publicaFormulario(ctx context.Context, r row) (string, error) {
	png, err := formularioPNG(datosFormulario(r))
	if err != nil {
		return "", err
	}
	m := hmac.New(sha256.New, s.autKey)
	m.Write([]byte("formulario:" + r.CompetitionID.String() + ":" + r.ID.String() + ":"))
	m.Write(png)
	key := "autorizaciones/" + r.CompetitionID.String() + "/formulario-" + hex.EncodeToString(m.Sum(nil)[:16]) + ".png"
	st, err := s.storage(ctx, r.CompetitionID)
	if err != nil {
		return "", err
	}
	return st.Put(ctx, key, "image/png", png)
}

// publicaFirmada publishes a signed authorisation under a random key (it cannot be guessed) and answers its URL.
func (s *Svc) publicaFirmada(ctx context.Context, cid uuid.UUID, datos []byte) (string, error) {
	tipo := http.DetectContentType(datos)
	ext, ok := tiposAutorizacion[tipo]
	if !ok {
		return "", errors.New("tipo de archivo no permitido")
	}
	st, err := s.storage(ctx, cid)
	if err != nil {
		return "", err
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return st.Put(ctx, "autorizaciones/"+cid.String()+"/firmada-"+hex.EncodeToString(b)+ext, tipo, datos)
}

// solicitarOut is the answer of asking the guardian for the authorisation.
type solicitarOut struct {
	Body struct {
		EnviadaAt     time.Time `json:"enviadaAt"`
		Enlace        string    `json:"enlace"`
		FormularioURL string    `json:"formularioUrl"`
		Email         bool      `json:"email"`
		WhatsApp      bool      `json:"whatsapp"`
	}
}

// pideAutorizacion asks the guardian of a minor for the signed authorisation: the form and a personal link by email
// (the form attached) and by WhatsApp when the athlete accepted it. The admin endpoint and the approval of an alta use it.
func (s *Svc) pideAutorizacion(ctx context.Context, cid, atleta uuid.UUID, por string) (*solicitarOut, error) {
	r, err := getRow(ctx, s.a.DB, cid, atleta)
	if err != nil {
		return nil, err
	}
	if !r.menor(s.compDate(ctx, cid)) {
		return nil, problem.Conflict("NO_MENOR", "Este atleta no es menor de edad el día de la competición.")
	}
	if r.AutorizacionURL != "" {
		return nil, problem.Conflict("YA_AUTORIZADO", "Este atleta ya tiene la autorización de su tutor.")
	}
	if e := s.estadoAutorizacion(ctx, r); e.Estado == "revision" {
		return nil, problem.Conflict("EN_REVISION", "Ya ha subido una autorización: revísala en Solicitudes.")
	}
	correo := ""
	if r.Email != nil {
		correo = strings.TrimSpace(*r.Email)
	}
	// WhatsApp only with the consent of the alta, as every athlete notice; without it, email only.
	wa := r.Telefono != "" && waAceptado(ctx, s.a.DB, cid, r.ID)
	if correo == "" && !wa {
		return nil, problem.Unprocessable("SIN_CONTACTO", "Este atleta no tiene email ni un teléfono con WhatsApp aceptado: añade su email en «Competición».")
	}
	form, err := s.publicaFormulario(ctx, r)
	if err != nil {
		s.a.Log.Error("no se ha podido publicar el formulario de autorización", "err", err, "atleta", r.ID.String())
		return nil, noDisponible()
	}
	o := &solicitarOut{}
	err = s.change(ctx, cid, "athletes.autorizacion_pedida", map[string]any{"id": r.ID, "nombre": r.nombreCompleto(), "por": por}, func(tx pgx.Tx) error {
		token, err := s.emiteToken(ctx, tx, cid, r.ID, form)
		if err != nil {
			return err
		}
		o.Body.Enlace, o.Body.FormularioURL = s.enlaceAutorizacion(token), form
		v := map[string]string{"nombre": r.Nombre, "competicion": eventoAutorizacion, "enlace": o.Body.Enlace, "formulario": form}
		if correo != "" {
			// The form travels as a real attachment (messaging fetches it at send time).
			ve := map[string]string{"__adjunto": form, "__adjuntoNombre": "autorizacion-" + r.Slug + ".png"}
			for k, x := range v {
				ve[k] = x
			}
			if err := email(ctx, tx, cid, correo, "atleta-autorizacion-pedida", ve); err != nil {
				return err
			}
			o.Body.Email = true
		}
		if wa {
			if err := whatsapp(ctx, tx, cid, r.Telefono, false, "atleta-autorizacion-pedida", v, form); err != nil {
				return err
			}
			o.Body.WhatsApp = true
		}
		return hist(ctx, tx, r.ID, "Autorización del tutor pedida", strings.Join(canales(o.Body.Email, o.Body.WhatsApp), " y "))
	})
	if err != nil {
		return nil, err
	}
	o.Body.EnviadaAt = time.Now().UTC()
	return o, nil
}

func (s *Svc) registerAutorizacion() {
	api := s.a.API

	huma.Register(api, huma.Operation{OperationID: "atletas-autorizacion-solicitar", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/atletas/{id}/autorizacion/solicitar",
		Summary: "Pedir al tutor la autorización de un atleta menor (email con el formulario adjunto + WhatsApp)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*solicitarOut, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "atletas.editar")
			if err != nil {
				return nil, err
			}
			return s.pideAutorizacion(ctx, in.CID, in.ID, pr.Name)
		})

	pub := "/api/competiciones/{slug}/autorizacion/{token}"
	type pubIn struct {
		Slug  string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Token string `path:"token" maxLength:"100"`
	}
	type pubOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         AutorizacionPub
	}
	huma.Register(api, huma.Operation{OperationID: "autorizacion-publica", Method: http.MethodGet, Path: pub,
		Summary: "Estado de la autorización del tutor (enlace personal)", Tags: tagPub},
		func(ctx context.Context, in *pubIn) (*pubOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			atleta, form, perr := s.tokenVivo(ctx, c.ID, in.Token)
			if perr != nil {
				return nil, perr
			}
			o, _, perr := s.autorizacionPub(ctx, c.ID, atleta, form)
			if perr != nil {
				return nil, perr
			}
			return &pubOut{CacheControl: "private, no-store", Body: o}, nil
		})

	// The upload: a plain handler so the size (413) and the type (415) answer with their own status.
	s.a.Mux.HandleFunc("POST "+pub, func(w http.ResponseWriter, req *http.Request) {
		o, perr := s.subeAutorizacionTutor(w, req)
		if perr != nil {
			problem.Write(w, perr)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "private, no-store")
		_ = json.NewEncoder(w).Encode(o)
	})
}

func canales(e, wa bool) []string {
	var out []string
	if e {
		out = append(out, "email")
	}
	if wa {
		out = append(out, "WhatsApp")
	}
	return out
}

// subeAutorizacionTutor stores the signed authorisation and opens its request for the team.
func (s *Svc) subeAutorizacionTutor(w http.ResponseWriter, req *http.Request) (*AutorizacionPub, *problem.Error) {
	ctx := req.Context()
	ip := httpx.ClientIPFrom(ctx)
	if lim, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "autorizacion", ip), 10, time.Hour); !lim.Allowed {
		return nil, problem.TooMany("Has enviado varios archivos seguidos. Espera un rato antes de intentarlo otra vez.")
	}
	c, err := s.comps.Public(ctx, req.PathValue("slug"))
	if err != nil {
		var pe *problem.Error
		if errors.As(err, &pe) {
			return nil, pe
		}
		return nil, problem.NotFound("Esta competición no existe.")
	}
	atleta, form, perr := s.tokenVivo(ctx, c.ID, req.PathValue("token"))
	if perr != nil {
		return nil, perr
	}
	o, r, perr := s.autorizacionPub(ctx, c.ID, atleta, form)
	if perr != nil {
		return nil, perr
	}
	switch o.Estado {
	case "revision":
		return nil, problem.Conflict("EN_REVISION", "Ya hemos recibido la autorización: la estamos revisando.")
	case "aprobada":
		return nil, problem.Conflict("YA_APROBADA", "La autorización ya está aprobada: no hace falta hacer nada más.")
	}
	grande := problem.New(http.StatusRequestEntityTooLarge, "ARCHIVO_GRANDE", "El archivo supera los 10 MB. Sube una foto o un PDF más pequeño.")
	req.Body = http.MaxBytesReader(w, req.Body, maxAutorizacion+1<<20)
	f, fh, err := req.FormFile("file")
	if err != nil {
		var mb *http.MaxBytesError
		if errors.As(err, &mb) {
			return nil, grande
		}
		return nil, problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta la autorización firmada en el campo «file».")
	}
	defer f.Close()
	if fh.Size > maxAutorizacion {
		return nil, grande
	}
	datos, err := io.ReadAll(io.LimitReader(f, maxAutorizacion+1))
	if err != nil {
		return nil, problem.BadRequest("PETICION_INVALIDA", "No hemos podido leer el archivo. Inténtalo de nuevo.")
	}
	if len(datos) > maxAutorizacion {
		return nil, grande
	}
	if _, ok := tiposAutorizacion[http.DetectContentType(datos)]; !ok {
		return nil, problem.New(http.StatusUnsupportedMediaType, "TIPO_NO_PERMITIDO", "Sube una foto (JPG, PNG o WebP) o un PDF.")
	}
	url, err := s.publicaFirmada(ctx, c.ID, datos)
	if err != nil {
		s.a.Log.Error("no se ha podido subir la autorización firmada", "err", err, "atleta", r.ID.String())
		return nil, noDisponible()
	}
	equipo := s.equipoAdmins(ctx, c.ID)
	edad := ""
	if e := r.edad(s.compDate(ctx, c.ID)); e != nil {
		edad = strconv.Itoa(*e) + " años"
	}
	id := newID()
	correo := ""
	if r.Email != nil {
		correo = *r.Email
	}
	cambios, _ := json.Marshal(map[string]string{"autorizacionUrl": url})
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO solicitudes_atleta (id, competition_id, tipo, cambios, match_atleta_id, match_tipo, licencia, nombre, apellidos,
			email, telefono, sexo, fecha_nacimiento, club, ciudad, es_menor, estado, consentimientos, ip, user_agent, prueba)
			VALUES ($1,$2,'autorizacion',$3,$4,'manual',$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'pendiente','{}',$14,$15,'')`,
			id, c.ID, string(cambios), r.ID, r.Licencia, r.Nombre, r.Apellidos, correo, r.Telefono, r.Sexo, r.FechaNacimiento, r.Club, r.Ciudad,
			anonIP(ip), req.UserAgent())
		if err != nil {
			if db.IsUniqueViolation(err, "") {
				return problem.Conflict("EN_REVISION", "Ya hemos recibido la autorización: la estamos revisando.")
			}
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_creada",
			map[string]any{"id": id, "nombre": r.nombreCompleto(), "esMenor": true, "match": "manual", "tipo": "autorizacion"},
			events.Competition(c.ID.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		if err := histPor(ctx, tx, r.ID, "Tutor", "Autorización del tutor subida", "Pendiente de revisión"); err != nil {
			return err
		}
		v := map[string]string{"nombre": r.nombreCompleto(), "edad": edad, "urlRevisar": s.urlRevisar(c.Slug, id)}
		for _, m := range equipo {
			if err := email(ctx, tx, c.ID, m.Email, "atleta-autorizacion-nueva", v); err != nil {
				return err
			}
		}
		return whatsapp(ctx, tx, c.ID, "", true, "atleta-autorizacion-nueva", v, "")
	})
	if err != nil {
		s.borraDelCDN(context.WithoutCancel(ctx), c.ID, url, "autorizaciones/", "autorizaciones-")
		var pe *problem.Error
		if errors.As(err, &pe) {
			return nil, pe
		}
		s.a.Log.Error("no se ha podido guardar la autorización", "err", err, "atleta", r.ID.String())
		return nil, problem.Internal()
	}
	s.a.Log.Info("autorización del tutor subida", "solicitud", id.String(), "atleta", r.ID.String())
	o.Estado, o.Motivo = "revision", ""
	return &o, nil
}

// urlAutorizacion is the uploaded file of an «autorizacion» request.
func urlAutorizacion(sol solicitud) string {
	var c struct {
		URL string `json:"autorizacionUrl"`
	}
	_ = json.Unmarshal([]byte(sol.Cambios), &c)
	return c.URL
}

// apruebaAutorizacion writes the authorisation in the profile through the same change as the record's profile edit
// (the athlete becomes public in the list, the schedule, the live and the games) and tells the athlete.
func (s *Svc) apruebaAutorizacion(ctx context.Context, cid, id uuid.UUID, ifm string, avisarEmail, avisarWhatsApp bool, por string) (*AprobarOut, error) {
	pre, err := getSolicitud(ctx, s.a.DB, cid, id)
	if err != nil {
		return nil, err
	}
	if pre.MatchAtletaID == nil {
		return nil, problem.Conflict("TIPO_INVALIDO", "Esta autorización no está enlazada a un atleta.")
	}
	d := s.compDate(ctx, cid)
	out := &AprobarOut{}
	err = s.change(ctx, cid, "athletes.perfil_actualizado", map[string]any{"id": *pre.MatchAtletaID, "origen": "autorizacion"}, func(tx pgx.Tx) error {
		// The athlete first, then the request: the same lock order as the area paths.
		r, err := s.lock(ctx, tx, cid, *pre.MatchAtletaID, "")
		if err != nil {
			return err
		}
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		if sol.Tipo != "autorizacion" || sol.MatchAtletaID == nil || *sol.MatchAtletaID != *pre.MatchAtletaID {
			return problem.Conflict("TIPO_INVALIDO", "Esta solicitud no es una autorización enlazada a un atleta.")
		}
		url := urlAutorizacion(sol)
		if url == "" {
			return problem.Unprocessable("AUTORIZACION_OBLIGATORIA", "Esta solicitud no tiene archivo de autorización.")
		}
		if _, err := tx.Exec(ctx, `UPDATE perfiles SET autorizacion_url = $2, updated_at = now() WHERE atleta_id = $1`, r.ID, url); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE atletas SET version = version + 1, updated_at = now() WHERE id = $1`, r.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET estado = 'aprobada', revisado_at = now(), revisado_por = $3,
			version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`, cid, id, por); err != nil {
			return err
		}
		if err := hist(ctx, tx, r.ID, "Autorización del tutor aprobada", "Revisada por "+por); err != nil {
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_aprobada",
			map[string]any{"id": id, "atletaId": r.ID, "nombre": r.nombreCompleto(), "tipo": "autorizacion"},
			events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		r.AutorizacionURL = url
		publica := r.publico(d)
		urlPerfil := s.webURL + "/area-atleta"
		if publica {
			urlPerfil = s.webURL + "/atletas/" + r.Slug
		}
		v := map[string]string{"nombre": r.Nombre, "competicion": eventoAutorizacion, "urlPerfil": urlPerfil}
		para, tel := contactoActual(ctx, tx, sol)
		if avisarEmail && para != "" {
			if err := email(ctx, tx, cid, para, "atleta-autorizacion-aprobada", v); err != nil {
				return err
			}
		}
		if avisarWhatsApp && tel != "" && waAceptado(ctx, tx, cid, r.ID) {
			if err := whatsapp(ctx, tx, cid, tel, false, "atleta-autorizacion-aprobada", v, ""); err != nil {
				return err
			}
		}
		out.Body.AtletaID, out.Body.Slug, out.Body.Publica = r.ID, r.Slug, publica
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.a.Log.Info("autorización del tutor aprobada", "id", id.String(), "atleta", out.Body.AtletaID.String(), "revisor", por)
	return out, nil
}
