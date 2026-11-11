package athletes

// Alta pública de atleta (Figma 74-78): el formulario de /alta-atleta crea una «solicitud» que
// el equipo revisa a mano en el backoffice (Atletas › Solicitudes). Hasta que alguien la aprueba
// no se escribe nada en «atletas»: la foto se guarda privada en disco y solo se publica (Bunny)
// cuando la solicitud está aprobada.

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	altcha "github.com/altcha-org/altcha-lib-go"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/imagen"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

const (
	// maxFotoAlta is the size of the photo part (the whole request is limited to 9 MiB).
	maxFotoAlta = 8 << 20
	// ttlFotoFirma: the signed URL of a private photo lasts 7 days (the email to the team).
	ttlFotoFirma = 7 * 24 * time.Hour
	// The time token proves the form was open a while (a bot fills it in a second).
	tiempoMinimo = 3 * time.Second
	tiempoMaximo = 24 * time.Hour
	// An altcha challenge expires 10 min after it is issued (the expiry goes signed in the salt); the
	// «used» mark lives a bit longer so a solution can never be replayed while it is still valid.
	caducidadAltcha = 10 * time.Minute
	ttlAltchaUsado  = caducidadAltcha + time.Minute
	// Limits of the public form (SPEC §4.2). Per IP only the accepted (202) sends count, so a club on
	// one WiFi is not blocked by its own typos; a cap on POST without a valid altcha stops floods of bad
	// ones in a fixed 10 min window (a block lasts 10 min at most; a solved altcha never counts).
	limiteIPAlta     = 20
	limiteIPAltaPost = 30
	ventanaAltaPost  = 10 * time.Minute
	limiteMailAlta   = 3
	limiteTelAlta    = 3
	// avisoDiaAlta is not a limit: reaching it only warns the team in the backoffice (a cheap attacker
	// must never be able to close the form for everybody).
	avisoDiaAlta = 300
)

// casillasAlta are the consent boxes of the form (in order).
var casillasAlta = []string{"terminos", "privacidad", "imagen", "novedades", "whatsapp"}

// legalDeCasilla is the legal text of each box (the «imagen» box is the text of «consentimiento»).
var legalDeCasilla = map[string]string{
	"terminos": "terminos", "privacidad": "privacidad", "imagen": "consentimiento", "whatsapp": "whatsapp",
}

// versionNovedades is the version of the text of the «novedades» box of this form (there is no legal
// text of «novedades» in the cms). The form shows textoNovedades verbatim (it comes in the config), so
// the hash proves the exact words the athlete ticked. Changing the text means a new version.
const versionNovedades = "alta-novedades-2026-11"

const textoNovedades = "Quiero recibir novedades de la GR Cup por email. Puedo darme de baja en 1 clic desde cualquier email."

var hashNovedades = func() string {
	h := sha256.Sum256([]byte(textoNovedades))
	return hex.EncodeToString(h[:])
}()

// Consentimiento is the proof of one box: the legal version in force, its hash and when it was ticked.
type Consentimiento struct {
	Aceptado bool      `json:"aceptado"`
	Version  string    `json:"version"`
	Hash     string    `json:"hash"`
	At       time.Time `json:"at"`
	IP       string    `json:"ip"`
}

// solicitud is a row of «solicitudes_atleta».
type solicitud struct {
	ID                uuid.UUID  `db:"id"`
	CompetitionID     uuid.UUID  `db:"competition_id"`
	MatchAtletaID     *uuid.UUID `db:"match_atleta_id"`
	MatchTipo         string     `db:"match_tipo"`
	Licencia          string     `db:"licencia"`
	Nombre            string     `db:"nombre"`
	Apellidos         string     `db:"apellidos"`
	Email             string     `db:"email"`
	Telefono          string     `db:"telefono"`
	Sexo              string     `db:"sexo"`
	FechaNacimiento   *time.Time `db:"fecha_nacimiento"`
	Club              string     `db:"club"`
	Ciudad            string     `db:"ciudad"`
	Frase             string     `db:"frase"`
	Bio               string     `db:"bio"`
	Instagram         string     `db:"instagram"`
	Entrenador        string     `db:"entrenador"`
	Prueba            string     `db:"prueba"`
	Historial         string     `db:"historial"`
	MarcaSQ           *float64   `db:"marca_sq"`
	MarcaBP           *float64   `db:"marca_bp"`
	MarcaDL           *float64   `db:"marca_dl"`
	FocalX            int16      `db:"focal_x"`
	FocalY            int16      `db:"focal_y"`
	EsMenor           bool       `db:"es_menor"`
	FotoClave         string     `db:"foto_clave"`
	FotoSHA256        string     `db:"foto_sha256"`
	AutorizacionClave string     `db:"autorizacion_clave"`
	Estado            string     `db:"estado"`
	Notas             string     `db:"notas"`
	MotivoRechazo     string     `db:"motivo_rechazo"`
	RevisadoAt        *time.Time `db:"revisado_at"`
	RevisadoPor       string     `db:"revisado_por"`
	Consentimientos   string     `db:"consentimientos"`
	ConsentimientoAt  *time.Time `db:"consentimiento_at"`
	IP                string     `db:"ip"`
	UserAgent         string     `db:"user_agent"`
	Version           int        `db:"version"`
	CreatedAt         time.Time  `db:"created_at"`
	UpdatedAt         time.Time  `db:"updated_at"`
}

// nombreCompleto of the athlete who sent the request.
func (s solicitud) nombreCompleto() string { return strings.TrimSpace(s.Nombre + " " + s.Apellidos) }

// consent returns the proof of a box.
func (s solicitud) consent(casilla string) Consentimiento {
	var m map[string]Consentimiento
	if json.Unmarshal([]byte(s.Consentimientos), &m) != nil {
		return Consentimiento{}
	}
	return m[casilla]
}

// consentMap returns the proof of every box.
func (s solicitud) consentMap() map[string]Consentimiento {
	m := map[string]Consentimiento{}
	_ = json.Unmarshal([]byte(s.Consentimientos), &m)
	return m
}

// edad of the athlete today (nil without a birth date).
func (s solicitud) edad() *int {
	if s.FechaNacimiento == nil {
		return nil
	}
	e := Edad(*s.FechaNacimiento, time.Now())
	return &e
}

const selSolicitud = `SELECT id, competition_id, match_atleta_id, match_tipo, licencia, nombre, apellidos, email::text AS email, telefono, sexo,
	fecha_nacimiento, club, ciudad, frase, bio, instagram, entrenador, historial,
	marca_sq::float8 AS marca_sq, marca_bp::float8 AS marca_bp, marca_dl::float8 AS marca_dl,
	focal_x, focal_y, es_menor, foto_clave, foto_sha256, autorizacion_clave, estado, notas, motivo_rechazo,
	revisado_at, revisado_por, consentimientos::text AS consentimientos, consentimiento_at, ip, user_agent,
	version, created_at, updated_at, prueba FROM solicitudes_atleta`

// getSolicitud reads a request of the competition.
func getSolicitud(ctx context.Context, q querier, cid, id uuid.UUID) (solicitud, error) {
	rows, err := q.Query(ctx, selSolicitud+` WHERE competition_id = $1 AND id = $2`, cid, id)
	if err != nil {
		return solicitud{}, err
	}
	s, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[solicitud])
	if err != nil {
		return s, problem.NotFound("Esa solicitud no existe.")
	}
	return s, nil
}

// ---- public API ----

// DatosAlta is the «datos» part of the public form.
type DatosAlta struct {
	Nombre          string          `json:"nombre"`
	Apellidos       string          `json:"apellidos"`
	Email           string          `json:"email"`
	Telefono        string          `json:"telefono"`
	telInvalido     bool            // set by normalizaDatos: a non-empty phone that is not valid
	Sexo            string          `json:"sexo"`
	FechaNacimiento string          `json:"fechaNacimiento"`
	Licencia        string          `json:"licencia"`
	Club            string          `json:"club"`
	Ciudad          string          `json:"ciudad"`
	Entrenador      string          `json:"entrenador"`
	Prueba          string          `json:"prueba"`
	Frase           string          `json:"frase"`
	Bio             string          `json:"bio"`
	Instagram       string          `json:"instagram"`
	Historial       string          `json:"historial"`
	MarcaSQ         *float64        `json:"marcaSQ"`
	MarcaBP         *float64        `json:"marcaBP"`
	MarcaDL         *float64        `json:"marcaDL"`
	FocalX          int             `json:"focalX"`
	FocalY          int             `json:"focalY"`
	Consentimientos map[string]bool `json:"consentimientos"`
	Altcha          string          `json:"altcha"`
	Tiempo          string          `json:"tiempo"`
	Web             string          `json:"web"`
}

// AltchaCfg is the challenge the widget has to solve.
type AltchaCfg struct {
	Algorithm string `json:"algorithm"`
	Challenge string `json:"challenge"`
	Salt      string `json:"salt"`
	Signature string `json:"signature"`
	MaxNumber int64  `json:"maxnumber"`
}

// ConfigAlta is what the public form needs to be rendered.
type ConfigAlta struct {
	Abierta      bool              `json:"abierta"`
	MotivoCierre string            `json:"motivoCierre"`
	Legal        map[string]string `json:"legal"`
	// TextoNovedades is the exact text of the «novedades» box (the one hashed in the consent proof).
	TextoNovedades string    `json:"textoNovedades"`
	Altcha         AltchaCfg `json:"altcha"`
	Tiempo         string    `json:"tiempo"`
	// Pruebas are the options of «¿En qué competición compites?».
	Pruebas []PruebaAlta `json:"pruebas"`
	// LimiteEleccion is the last day to choose the competition from the athlete area (AAAA-MM-DD).
	LimiteEleccion string `json:"limiteEleccion,omitempty"`
}

// PruebaAlta is one competition of the event the athlete can say they compete in.
type PruebaAlta struct {
	Codigo   string `json:"codigo"`
	Nombre   string `json:"nombre"`
	Fecha    string `json:"fecha,omitempty"`
	Nivel    string `json:"nivel"`
	Plazas   int    `json:"plazas"`
	Ocupadas int    `json:"ocupadas"`
}

// pruebasAlta: AEP-2 the first day of the event, AEP-3 the second one.
var pruebasAlta = []struct{ codigo, nombre string }{{"aep2", "AEP-2"}, {"aep3", "AEP-3"}}

// cupos returns the own places of each competition: the ones set in the backoffice or, without a row,
// the total places of the inscription split between the competitions.
func (s *Svc) cupos(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, cid uuid.UUID, total int) map[string]int {
	out := map[string]int{}
	for _, p := range pruebasAlta {
		out[p.codigo] = total / len(pruebasAlta)
	}
	rows, err := q.Query(ctx, `SELECT prueba, plazas FROM alta_cupos WHERE competition_id = $1`, cid)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var n int
		if rows.Scan(&k, &n) == nil {
			out[k] = n
		}
	}
	return out
}

// ocupadas counts the requests (not rejected) that chose each competition.
func ocupadas(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, cid uuid.UUID) map[string]int {
	ocup := map[string]int{}
	rows, err := q.Query(ctx, `SELECT prueba, count(*) FROM solicitudes_atleta WHERE competition_id = $1 AND prueba <> '' AND estado <> 'rechazada' GROUP BY prueba`, cid)
	if err != nil {
		return ocup
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var n int
		if rows.Scan(&k, &n) == nil {
			ocup[k] = n
		}
	}
	return ocup
}

// pruebas returns the options with their own places and the requests that chose each one, and the
// last day to choose from the athlete area.
func (s *Svc) pruebas(ctx context.Context, c compref.Comp) ([]PruebaAlta, string) {
	ocup := ocupadas(ctx, s.a.DB, c.ID)
	cupo := s.cupos(ctx, s.a.DB, c.ID, c.Inscripcion.Plazas)
	ini, _ := time.Parse(time.DateOnly, c.FechaInicio)
	out := make([]PruebaAlta, 0, len(pruebasAlta))
	for i, p := range pruebasAlta {
		f := ""
		if !ini.IsZero() {
			f = ini.AddDate(0, 0, i).Format(time.DateOnly)
		}
		out = append(out, PruebaAlta{Codigo: p.codigo, Nombre: p.nombre, Fecha: f, Nivel: "nivel regional", Plazas: cupo[p.codigo], Ocupadas: ocup[p.codigo]})
	}
	limite := ""
	if !ini.IsZero() {
		limite = ini.AddDate(0, 0, -10).Format(time.DateOnly)
	}
	return out, limite
}

// reservaPrueba checks, inside the transaction of the request and under a lock per competition and
// option, that the chosen competition still has places (two concurrent requests cannot take the last one).
func (s *Svc) reservaPrueba(ctx context.Context, tx pgx.Tx, cid uuid.UUID, total int, prueba string) error {
	if prueba == "" {
		return nil
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('alta-prueba:' || $1::text || ':' || $2))`, cid.String(), prueba); err != nil {
		return err
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM solicitudes_atleta WHERE competition_id = $1 AND prueba = $2 AND estado <> 'rechazada'`, cid, prueba).Scan(&n); err != nil {
		return err
	}
	// 0 places = no limit (the same rule the form uses).
	if lim := s.cupos(ctx, tx, cid, total)[prueba]; lim > 0 && n >= lim {
		return validacion("Revisa los campos marcados.", &huma.ErrorDetail{Location: "body.prueba", Message: "Esa competición ya está completa: elige otra o «Aún no lo sé»."})
	}
	return nil
}

// muevePlaza moves the place of the athlete's alta request to another competition, in the same
// transaction as the edit and under the lock of the destination: 409 CUPO_COMPLETO when it is full,
// unless the admin forces it.
func (s *Svc) muevePlaza(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID, prueba string, forzar bool) error {
	if prueba != "" && !forzar {
		c, err := s.comps.ByID(ctx, cid)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('alta-prueba:' || $1::text || ':' || $2))`, cid.String(), prueba); err != nil {
			return err
		}
		var n int
		// the athlete already holds a place there (its approved request): nothing moves, no free place needed
		var ya bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM solicitudes_atleta WHERE competition_id = $1 AND match_atleta_id = $2 AND estado = 'aprobada' AND prueba = $3)`,
			cid, atleta, prueba).Scan(&ya); err != nil {
			return err
		}
		// the athlete's own place (the approved request that created it) is the one being moved
		if !ya {
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM solicitudes_atleta WHERE competition_id = $1 AND prueba = $2 AND estado <> 'rechazada'
			AND (match_atleta_id IS DISTINCT FROM $3 OR estado <> 'aprobada')`, cid, prueba, atleta).Scan(&n); err != nil {
				return err
			}
			if lim := s.cupos(ctx, tx, cid, c.Inscripcion.Plazas)[prueba]; lim > 0 && n >= lim {
				return problem.Conflict("CUPO_COMPLETO", "Esa competición tiene el cupo completo. Confirma para asignarla igualmente.")
			}
		}
	}
	// Only the approved request of this athlete: pending requests of other people that merely matched it
	// as a possible duplicate keep their own choice.
	var ids []uuid.UUID
	rows, err := tx.Query(ctx, `UPDATE solicitudes_atleta SET prueba = $3, version = version + 1, updated_at = now()
		WHERE competition_id = $1 AND match_atleta_id = $2 AND estado = 'aprobada' RETURNING id`, cid, atleta, prueba)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	// The panel of requests refreshes its places live (SSE).
	for _, id := range ids {
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_plaza", map[string]any{"id": id, "prueba": prueba},
			events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
	}
	return nil
}

// pruebaValida: empty («Aún no lo sé») or one of the options.
func pruebaValida(k string) bool {
	if k == "" {
		return true
	}
	for _, p := range pruebasAlta {
		if p.codigo == k {
			return true
		}
	}
	return false
}

// pruebaTexto is the name of the chosen competition for the messages.
func pruebaTexto(k string) string {
	for _, p := range pruebasAlta {
		if p.codigo == k {
			return p.nombre
		}
	}
	return "Aún no lo sabe"
}

// AltaOut is the answer of the public form: the id of the request.
type AltaOut struct {
	Body struct {
		ID string `json:"id"`
	}
}

func (s *Svc) registerAltaAtleta() {
	api := s.a.API
	pub := "/api/competiciones/{slug}/alta-atleta"

	type configIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type configOut struct{ Body ConfigAlta }
	huma.Register(api, huma.Operation{OperationID: "alta-atleta-config", Method: http.MethodGet, Path: pub + "/config",
		Summary: "Configuración del alta de atleta (módulo, textos legales, reto antibots y token de tiempo)", Tags: tagPub},
		func(ctx context.Context, in *configIn) (*configOut, error) {
			// The loader runs detached from the request: a cancelled client must not fail the shared call.
			out, err := s.altaCfg.get(in.Slug, func() (ConfigAlta, error) {
				lctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
				defer cancel()
				c, err := s.comps.Public(lctx, in.Slug)
				if err != nil {
					return ConfigAlta{}, err
				}
				abierta, motivo, err := s.estadoAlta(lctx, c.ID, in.Slug)
				if err != nil {
					return ConfigAlta{}, err
				}
				out := ConfigAlta{Abierta: abierta, MotivoCierre: motivo, Legal: s.legalVersiones(lctx, c.ID), TextoNovedades: textoNovedades}
				out.Pruebas, out.LimiteEleccion = s.pruebas(lctx, c)
				return out, nil
			})
			if err != nil {
				return nil, err
			}
			// The challenge and the time token are personal: never cached.
			out.Altcha, out.Tiempo = s.retoAltcha(), s.tokenTiempo()
			return &configOut{Body: out}, nil
		})

	type altaIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		RawBody multipart.Form
	}
	huma.Register(api, huma.Operation{OperationID: "alta-atleta", Method: http.MethodPost, Path: pub,
		Summary: "Enviar el alta de atleta (queda pendiente de revisión)", Tags: tagPub, DefaultStatus: http.StatusAccepted,
		MaxBodyBytes: maxFotoAlta + (1 << 20)},
		func(ctx context.Context, in *altaIn) (*AltaOut, error) {
			return s.crearSolicitud(ctx, in.Slug, in.RawBody)
		})
	type fotoIn struct {
		Slug  string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		ID    uuid.UUID `path:"id"`
		Exp   int64     `query:"e" doc:"Caducidad (unix)"`
		Firma string    `query:"s" doc:"Firma HMAC de la foto"`
	}
	type fotoOut struct {
		ContentType  string `header:"Content-Type"`
		CacheControl string `header:"Cache-Control"`
		Nosniff      string `header:"X-Content-Type-Options"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "alta-atleta-foto", Method: http.MethodGet, Path: pub + "/foto/{id}",
		Summary: "Foto privada de una solicitud (URL firmada, caduca en 7 días)", Tags: tagPub},
		func(ctx context.Context, in *fotoIn) (*fotoOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if !s.validaFirmaFoto(c.ID, in.ID, in.Exp, in.Firma) {
				return nil, problem.NotFound("Este enlace ha caducado o no es válido.")
			}
			sol, err := getSolicitud(ctx, s.a.DB, c.ID, in.ID)
			if err != nil {
				return nil, err
			}
			b, err := s.leerFotoPrivada(sol.FotoClave)
			if err != nil {
				return nil, problem.NotFound("Esta solicitud ya no tiene foto.")
			}
			return &fotoOut{ContentType: "image/jpeg", CacheControl: "private, max-age=600", Nosniff: "nosniff", Body: b}, nil
		})

	// The published photos when the competition has no CDN configured (QA): they live in the volume
	// of the service and this is their public URL.
	type publicaIn struct {
		Slug   string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Nombre string `path:"nombre" pattern:"^[a-zA-Z0-9._-]{1,120}$"`
	}
	type publicaOut struct {
		ContentType  string `header:"Content-Type"`
		CacheControl string `header:"Cache-Control"`
		Nosniff      string `header:"X-Content-Type-Options"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "alta-atleta-foto-publica", Method: http.MethodGet, Path: "/api/competiciones/{slug}/atletas/foto/{nombre}",
		Summary: "Foto publicada del atleta (solo si la competición no tiene CDN)", Tags: tagPub},
		func(ctx context.Context, in *publicaIn) (*publicaOut, error) {
			b, err := os.ReadFile(filepath.Join(s.fotoDir, "publico", filepath.Base(in.Nombre)))
			if err != nil {
				return nil, problem.NotFound("Esta foto no existe.")
			}
			return &publicaOut{ContentType: "image/jpeg", CacheControl: "public, max-age=3600", Nosniff: "nosniff", Body: b}, nil
		})
}

// crearSolicitud handles the public form: validation, antibots, limits and the creation of the request.
func (s *Svc) crearSolicitud(ctx context.Context, slug string, form multipart.Form) (*AltaOut, error) {
	c, err := s.comps.Public(ctx, slug)
	if err != nil {
		return nil, err
	}
	abierta, motivo, err := s.estadoAlta(ctx, c.ID, slug)
	if err != nil {
		return nil, err
	}
	if !abierta {
		if motivo == "legal" {
			return nil, problem.New(http.StatusServiceUnavailable, "LEGAL_NO_DISPONIBLE",
				"Aún no podemos abrir el alta: faltan los textos legales obligatorios. Escríbenos y te ayudamos.")
		}
		return nil, problem.New(http.StatusServiceUnavailable, "ALTA_CERRADA",
			"El alta de atleta está cerrada en esta competición. Mira la lista de atletas.")
	}
	ip := httpx.ClientIPFrom(ctx) // the rate limit per IP runs in «limitaIPAlta», before the body is read
	altchaOK := false
	defer func() {
		if altchaOK {
			s.devuelvePostSinAltcha(ctx, ip)
		}
	}()
	// The data of the form.
	partes := form.Value["datos"]
	if len(partes) == 0 || strings.TrimSpace(partes[0]) == "" {
		return nil, problem.Unprocessable("VALIDACION", "Faltan los datos del formulario.")
	}
	var d DatosAlta
	if httpx.HasNUL([]byte(partes[0])) {
		return nil, httpx.NULProblem([]byte(partes[0]), "body")
	}
	if err := json.Unmarshal([]byte(partes[0]), &d); err != nil {
		return nil, problem.Unprocessable("VALIDACION", "Los datos del formulario no son válidos.")
	}
	// Honeypot and time token: a bot gets the same answer as a person, but nothing is created.
	if strings.TrimSpace(d.Web) != "" {
		s.a.Log.Info("alta de atleta · trampa", "ip", anonIP(ip), "request_id", httpx.RequestIDFrom(ctx))
		return s.respuestaFalsa(), nil
	}
	if !s.validaTiempo(d.Tiempo) {
		s.a.Log.Info("alta de atleta · token de tiempo inválido", "ip", anonIP(ip), "request_id", httpx.RequestIDFrom(ctx))
		return s.respuestaFalsa(), nil
	}
	d = s.normalizaDatos(d)
	// Antibots (before the limits per email or phone: a failed challenge must not burn them).
	if err := s.validaAltcha(ctx, d.Altcha); err != nil {
		return nil, err
	}
	altchaOK = true
	// Strict validation of the fields.
	if errs := s.validaDatos(d); len(errs) > 0 {
		return nil, validacion("Revisa los campos marcados.", errs...)
	}
	// The proof of the consents (version and hash of the text in force). A box whose legal text is
	// not published is not accepted.
	cons := s.consentimientos(ctx, c.ID, d.Consentimientos, anonIP(ip))
	if _, ok := cons["terminos"]; !ok {
		return nil, problem.Unprocessable("CONSENTIMIENTO_OBLIGATORIO", "Acepta los términos de uso y el reglamento.")
	}
	if _, ok := cons["privacidad"]; !ok {
		return nil, problem.Unprocessable("CONSENTIMIENTO_OBLIGATORIO", "Acepta la política de privacidad para gestionar tu alta.")
	}
	if _, ok := cons["whatsapp"]; ok && d.Telefono == "" {
		return nil, problem.Unprocessable("TELEFONO_OBLIGATORIO", "Si quieres avisos por WhatsApp, escribe tu teléfono.")
	}
	consJSON, _ := json.Marshal(cons)
	// One live request per email (before the photo: a duplicate must not leave a file on disk).
	var existentes int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM solicitudes_atleta WHERE competition_id = $1 AND email = $2 AND estado IN ('pendiente','revision')`,
		c.ID, d.Email).Scan(&existentes); err != nil {
		return nil, err
	}
	if existentes > 0 {
		return nil, problem.Conflict("SOLICITUD_EN_CURSO", "Ya tienes una solicitud en revisión. Te avisaremos por email.")
	}
	// The limits per IP, email and phone count only created requests: an atomic INCR reserves the slot
	// now and it is given back (DECR) if the request is not created.
	reservas, perr := s.reservaLimites(ctx, ip, d)
	if perr != nil {
		return nil, perr
	}
	creada := false
	defer func() {
		if !creada {
			s.liberaLimites(reservas)
		}
	}()
	// The photo: processed to the standard piece and kept private until it is approved.
	id := newID()
	fotoClave, fotoSHA, err := s.procesaFoto(ctx, c.ID, id, form, d.FocalX, d.FocalY)
	if err != nil {
		return nil, err
	}
	// The daily volume never closes the form: at avisoDiaAlta the team gets one notice in the bell.
	aviso := false
	if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "alta-global", c.ID.String()), avisoDiaAlta, 24*time.Hour); r.Count == avisoDiaAlta {
		aviso = true
	}
	menor := fecha(d.FechaNacimiento) != nil && menorDeEdad(*fecha(d.FechaNacimiento))
	// The team that gets the notice (identity knows who can edit the athletes).
	equipo := s.equipoAdmins(ctx, c.ID)
	matchID, matchTipo := s.matchAtleta(ctx, c.ID, d)
	ua := userAgentDe(ctx)

	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err := s.reservaPrueba(ctx, tx, c.ID, c.Inscripcion.Plazas, d.Prueba); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO solicitudes_atleta (id, competition_id, match_atleta_id, match_tipo, licencia, nombre, apellidos, email, telefono, sexo,
			fecha_nacimiento, club, ciudad, frase, bio, instagram, entrenador, historial, marca_sq, marca_bp, marca_dl, focal_x, focal_y, es_menor,
			foto_clave, foto_sha256, estado, consentimientos, consentimiento_at, ip, user_agent, prueba)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'pendiente',$27,now(),$28,$29,$30)`,
			id, c.ID, matchID, matchTipo, d.Licencia, d.Nombre, d.Apellidos, d.Email, d.Telefono, d.Sexo, fecha(d.FechaNacimiento),
			d.Club, d.Ciudad, d.Frase, d.Bio, d.Instagram, d.Entrenador, d.Historial, d.MarcaSQ, d.MarcaBP, d.MarcaDL, d.FocalX, d.FocalY, menor,
			fotoClave, fotoSHA, string(consJSON), anonIP(ip), ua, d.Prueba)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return problem.Conflict("SOLICITUD_EN_CURSO", "Ya tienes una solicitud en revisión. Te avisaremos por email.")
			}
			return err
		}
		// The panel of the team (SSE) and the notification of the bell.
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_creada",
			map[string]any{"id": id, "nombre": d.Nombre, "esMenor": menor, "match": matchTipo},
			events.Competition(c.ID.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		if aviso {
			if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.alta_volumen_alto", map[string]any{"total": avisoDiaAlta},
				events.Competition(c.ID.String()), events.ForPermission("atletas.editar"))); err != nil {
				return err
			}
		}
		// The contact and its consents (crm).
		if err := contacto(ctx, tx, c.ID, s.eventoContacto(d, cons, anonIP(ip), ua)); err != nil {
			return err
		}
		// The email to the athlete.
		if err := email(ctx, tx, c.ID, d.Email, "atleta-solicitud-recibida", s.varsRecibida(d, fotoClave != "", menor, publicaPerfil(cons, menor))); err != nil {
			return err
		}
		// The email to the team, with the photo (signed URL: it is not public until it is approved).
		fotoURL := ""
		if fotoClave != "" {
			fotoURL = s.urlFotoFirmada(c.ID, id, c.Slug)
		}
		for _, m := range equipo {
			if err := email(ctx, tx, c.ID, m.Email, "atleta-solicitud-nueva", s.varsNueva(d, matchTipo, menor, fotoURL, c.Slug)); err != nil {
				return err
			}
		}
		// WhatsApp: only to the athlete if they ticked the box (and the text was published), and to
		// the organisers of the event.
		if _, ok := cons["whatsapp"]; ok && d.Telefono != "" {
			if err := whatsapp(ctx, tx, c.ID, d.Telefono, false, "atleta-solicitud-recibida", s.varsWARecibida(d), ""); err != nil {
				return err
			}
		}
		if err := whatsapp(ctx, tx, c.ID, "", true, "atleta-solicitud-nueva", s.varsWANueva(d, matchTipo, menor, c.Slug), fotoURL); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		if fotoClave != "" {
			_ = os.Remove(s.fotoPrivada(fotoClave))
		}
		return nil, err
	}
	creada = true
	s.a.Log.Info("alta de atleta recibida", "id", id.String(), "competicion", c.ID.String(), "menor", menor, "match", matchTipo,
		"foto", fotoClave != "", "request_id", httpx.RequestIDFrom(ctx))
	out := &AltaOut{}
	out.Body.ID = id.String()
	return out, nil
}

// reservaLimites counts the request on the per-IP, per-email and per-phone limits (atomic INCR). If one is
// over its limit every reserved slot is given back and a truthful 429 is returned.
func (s *Svc) reservaLimites(ctx context.Context, ip string, d DatosAlta) ([]string, error) {
	if s.a.Redis == nil {
		return nil, nil
	}
	type lim struct {
		key     string
		limite  int64
		ventana time.Duration
		codigo  string
		msg     string
	}
	ls := []lim{{s.a.Keys.Of("rl", "alta", ip), limiteIPAlta, time.Hour, "DEMASIADAS_PETICIONES", "Se han enviado muchas altas desde esta conexión. Espera un rato antes de intentarlo otra vez."}}
	if d.Email != "" {
		ls = append(ls, lim{s.a.Keys.Of("rl", "alta-mail", hashToken(d.Email)[:16]), limiteMailAlta, 24 * time.Hour, "LIMITE_EMAIL", "Ya se han enviado varias altas con este email hoy. Escríbenos si necesitas ayuda."})
	}
	if d.Telefono != "" {
		ls = append(ls, lim{s.a.Keys.Of("rl", "alta-tel", hashToken(d.Telefono)[:16]), limiteTelAlta, 24 * time.Hour, "LIMITE_TELEFONO", "Ya se han enviado varias altas con este teléfono hoy. Escríbenos si necesitas ayuda."})
	}
	var hechas []string
	for _, l := range ls {
		r, err := ratelimit.Allow(ctx, s.a.Redis, l.key, l.limite, l.ventana)
		if err != nil {
			continue // fail-open: nothing was counted
		}
		hechas = append(hechas, l.key)
		if !r.Allowed {
			s.liberaLimites(hechas)
			s.a.Log.Info("alta de atleta · límite", "clave", l.key, "ip", anonIP(ip))
			seg := int(r.RetryAfter.Seconds()) + 1
			if seg < 1 {
				seg = 60
			}
			return nil, huma.ErrorWithHeaders(problem.New(http.StatusTooManyRequests, l.codigo, l.msg), http.Header{"Retry-After": []string{strconv.Itoa(seg)}})
		}
	}
	return hechas, nil
}

// liberaLimites gives back the slots reserved by reservaLimites. Only an existing key is decremented: an
// expired one must not come back as -1 without a TTL.
func (s *Svc) liberaLimites(keys []string) {
	for _, k := range keys {
		_ = s.a.Redis.Eval(context.Background(), decrSiExiste, []string{k}).Err()
	}
}

const decrSiExiste = "if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end return 0"

// respuestaFalsa is the answer a bot gets: the same 202, but nothing was created.
func (s *Svc) respuestaFalsa() *AltaOut {
	out := &AltaOut{}
	out.Body.ID = newID().String()
	return out
}

// limitaIPAlta applies the per-IP limits of the public alta before the body is read: a rejected POST never
// parses (nor writes to /tmp) its multipart. The created counter is only read here (it grows atomically in
// reservaLimites, only for requests that are created). Every POST reserves a slot of the 30 POST / 10 min
// cap here with an atomic INCR (parallel bursts cannot pass the check together); the slot is given back
// (devuelvePostSinAltcha) when the altcha turns out valid.
func (s *Svc) limitaIPAlta(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/alta-atleta") && s.a != nil && s.a.Redis != nil {
			ip := httpx.ClientIPFrom(r.Context())
			key := s.a.Keys.Of("rl", "alta", ip)
			var espera time.Duration
			if n, err := s.a.Redis.Get(r.Context(), key).Int64(); err == nil && n >= limiteIPAlta {
				espera, _ = s.a.Redis.PTTL(r.Context(), key).Result()
			} else if s.reservaPostSinAltcha(r.Context(), ip) > limiteIPAltaPost {
				espera, _ = s.a.Redis.PTTL(r.Context(), s.a.Keys.Of("rl", "alta-post", ip)).Result()
			} else {
				next.ServeHTTP(w, r)
				return
			}
			seg := int(espera.Seconds()) + 1
			if seg < 1 {
				seg = 60
			}
			w.Header().Set("Retry-After", strconv.Itoa(seg))
			problem.Write(w, problem.TooMany("Se han enviado muchas altas desde esta conexión. Espera un rato antes de intentarlo otra vez."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// reservaPostSinAltcha counts a POST in a fixed window and returns the new count (0 on a Redis error, so
// the request passes): the expiry is set only by the first one, so a block never lasts more than ventanaAltaPost.
func (s *Svc) reservaPostSinAltcha(ctx context.Context, ip string) int64 {
	key := s.a.Keys.Of("rl", "alta-post", ip)
	// INCR + EXPIRE on the first hit (EXPIRE NX needs Redis 7; this works on Redis 6).
	n, err := s.a.Redis.Incr(ctx, key).Result()
	if err == nil && n == 1 {
		err = s.a.Redis.Expire(ctx, key, ventanaAltaPost).Err()
	}
	if err != nil {
		s.a.Log.Warn("alta de atleta · contador de POST no actualizado", "err", err)
		return 0
	}
	return n
}

// devuelvePostSinAltcha gives back the slot reserved by limitaIPAlta: the POST passed the altcha.
func (s *Svc) devuelvePostSinAltcha(ctx context.Context, ip string) {
	if s.a == nil || s.a.Redis == nil {
		return
	}
	if err := s.a.Redis.Decr(ctx, s.a.Keys.Of("rl", "alta-post", ip)).Err(); err != nil {
		s.a.Log.Warn("alta de atleta · contador de POST no devuelto", "err", err)
	}
}

// validacion builds a 422 with the errors per field.
func validacion(detalle string, errs ...*huma.ErrorDetail) *problem.Error {
	p := problem.Unprocessable("VALIDACION", detalle)
	p.Errors = errs
	return p
}

// ---- the user agent of the request (the proof of the consents) ----

type ctxUserAgent struct{}

// conUserAgent keeps the user agent in the context of the request.
func conUserAgent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), ctxUserAgent{}, r.UserAgent())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// userAgentDe returns the user agent of the request.
func userAgentDe(ctx context.Context) string {
	s, _ := ctx.Value(ctxUserAgent{}).(string)
	return s
}

// ---- the size of the public form ----

// limitaFotoAlta reads the body of the public form to answer with the documented error when the
// photo does not fit: without it, huma answers 413 with its English text («request body is too
// large limit=…»). The body is read here (bounded by the same limit) and handed over to the handler.
func limitaFotoAlta(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Body == nil {
			next.ServeHTTP(w, r)
			return
		}
		lim, codigo, detalle := int64(0), "", ""
		switch {
		case strings.HasSuffix(r.URL.Path, "/alta-atleta"):
			lim, codigo, detalle = maxFoto, "FOTO_DEMASIADO_GRANDE", "La foto supera los 8 MB. Usa una foto más pequeña."
		case strings.HasSuffix(r.URL.Path, "/autorizacion"):
			lim, codigo, detalle = maxFotoAlta, "ARCHIVO_GRANDE", "El archivo supera los 8 MB."
		default:
			next.ServeHTTP(w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, lim+1))
		if err != nil {
			var mb *http.MaxBytesError
			if errors.As(err, &mb) {
				problem.Write(w, problem.BadRequest(codigo, detalle))
				return
			}
			problem.Write(w, problem.BadRequest("PETICION_INVALIDA", "No hemos podido leer el formulario. Inténtalo de nuevo."))
			return
		}
		if int64(len(body)) > lim {
			problem.Write(w, problem.BadRequest(codigo, detalle))
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		next.ServeHTTP(w, r)
	})
}

// ---- routes that Go's router cannot tell apart ----

// reescribeHistorial keeps the public URL of the history of an athlete (/atletas/{id}/historial).
// The route is registered as /atletas/historial/{id} because Go's router considers
// /atletas/{id}/historial and /atletas/solicitudes/{id} (the requests of the public form) ambiguous.
func reescribeHistorial(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if nuevo, ok := historialRuta(r.URL.Path); ok {
			r2 := r.Clone(r.Context())
			u := *r.URL
			u.Path = nuevo
			u.RawPath = ""
			r2.URL = &u
			r = r2
		}
		next.ServeHTTP(w, r)
	})
}

// historialRuta moves /api/admin/competiciones/{cid}/atletas/{id}/historial to
// /api/admin/competiciones/{cid}/atletas/historial/{id}.
func historialRuta(p string) (string, bool) {
	const pre = "/api/admin/competiciones/"
	if !strings.HasPrefix(p, pre) {
		return "", false
	}
	partes := strings.Split(strings.TrimPrefix(p, pre), "/")
	if len(partes) != 4 || partes[1] != "atletas" || partes[3] != "historial" || partes[2] == "solicitudes" {
		return "", false
	}
	return pre + partes[0] + "/atletas/historial/" + partes[2], true
}

// ---- validation ----

// normalizaDatos trims and normalises what the athlete wrote.
func (s *Svc) normalizaDatos(d DatosAlta) DatosAlta {
	d.Nombre = strings.TrimSpace(sinControl(d.Nombre))
	d.Apellidos = strings.TrimSpace(sinControl(d.Apellidos))
	d.Email = strings.ToLower(strings.TrimSpace(d.Email))
	if tel := strings.NewReplacer(" ", "", "-", "", "(", "", ")", "", ".", "").Replace(strings.TrimSpace(d.Telefono)); tel != "" && !telValido.MatchString(tel) {
		d.telInvalido = true
		d.Telefono = ""
	} else {
		d.Telefono = normTel(tel)
	}
	d.Licencia = NormLicencia(d.Licencia)
	d.Club = strings.TrimSpace(sinControl(d.Club))
	d.Ciudad = strings.TrimSpace(sinControl(d.Ciudad))
	d.Entrenador = strings.TrimSpace(sinControl(d.Entrenador))
	d.Prueba = strings.ToLower(strings.TrimSpace(d.Prueba))
	d.Frase = strings.TrimSpace(sinControl(d.Frase))
	d.Bio = strings.TrimSpace(sinControl(d.Bio))
	d.Instagram = normInstagram(d.Instagram)
	if f := fecha(d.FechaNacimiento); f != nil && menorDeEdad(*f) {
		d.Instagram = "" // data minimisation: minors never get a public handle
	}
	d.Historial = strings.TrimSpace(sinControl(d.Historial))
	d.Sexo = strings.ToUpper(strings.TrimSpace(d.Sexo))
	if d.FocalX <= 0 {
		d.FocalX = 50
	}
	if d.FocalY <= 0 {
		d.FocalY = 35
	}
	if d.Consentimientos == nil {
		d.Consentimientos = map[string]bool{}
	}
	return d
}

// sinControl drops the control and bidi characters (U+202A–U+202E, U+2066–U+2069, marks): they can flip
// how the rest of the text reads in the backoffice and the emails. Line breaks and tabs stay.
func sinControl(v string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r == 0x0a || r == 0x09: // line break and tab stay
			return r
		case r < 0x20 || (r >= 0x7f && r <= 0x9f), r >= 0x202a && r <= 0x202e, r >= 0x2066 && r <= 0x2069,
			r >= 0x200b && r <= 0x200f, r == 0x061c, r == 0x2060, r == 0xfeff:
			return -1
		}
		return r
	}, v)
}

// validaDatos checks the lengths, the enums and the formats of the form.
func (s *Svc) validaDatos(d DatosAlta) []*huma.ErrorDetail {
	var errs []*huma.ErrorDetail
	add := func(campo, msg string) {
		errs = append(errs, &huma.ErrorDetail{Location: "body." + campo, Message: msg})
	}
	if n := len([]rune(d.Nombre)); n < 1 || n > 60 {
		add("nombre", "Escribe tu nombre (60 caracteres como máximo).")
	} else if !tieneLetra(d.Nombre) {
		add("nombre", "El nombre debe contener letras.")
	}
	if n := len([]rune(d.Apellidos)); n < 1 || n > 60 {
		add("apellidos", "Escribe tus apellidos (60 caracteres como máximo).")
	} else if !tieneLetra(d.Apellidos) {
		add("apellidos", "Los apellidos deben contener letras.")
	}
	if d.telInvalido {
		add("telefono", "Escribe un móvil válido.")
	}
	if d.Email == "" || len(d.Email) > 254 || !emailValido(d.Email) {
		add("email", "Escribe un email válido (el mismo con el que te inscribiste en la AEP).")
	}
	if d.Sexo != "F" && d.Sexo != "M" {
		add("sexo", "Elige si eres mujer u hombre.")
	}
	if d.FechaNacimiento == "" {
		add("fechaNacimiento", "Escribe tu fecha de nacimiento.")
	} else {
		nac, ok := ParseFecha(d.FechaNacimiento)
		if !ok {
			add("fechaNacimiento", "La fecha de nacimiento debe ser AAAA-MM-DD.")
		} else {
			edad := Edad(nac, time.Now())
			if edad < 14 || edad > 90 {
				add("fechaNacimiento", "Esa fecha de nacimiento no parece correcta (debe estar entre los 14 y los 90 años).")
			}
		}
	}
	if len(d.Licencia) > 20 {
		add("licencia", "La licencia AEP es demasiado larga.")
	}
	if len([]rune(d.Club)) > 80 {
		add("club", "El club es demasiado largo.")
	}
	if len([]rune(d.Ciudad)) > 80 {
		add("ciudad", "La ciudad es demasiado larga.")
	}
	if len([]rune(d.Entrenador)) > 80 {
		add("entrenador", "El nombre del entrenador es demasiado largo.")
	}
	if !pruebaValida(d.Prueba) {
		add("prueba", "Elige AEP-2, AEP-3 o «Aún no lo sé».")
	}
	if len([]rune(d.Frase)) > 80 {
		add("frase", "La frase es demasiado larga (80 caracteres como máximo).")
	}
	if len([]rune(d.Bio)) > 280 {
		add("bio", "La presentación es demasiado larga (280 caracteres como máximo).")
	}
	if d.Instagram != "" && !reInstagram.MatchString(d.Instagram) {
		add("instagram", "El Instagram solo admite letras, números, puntos y guiones bajos (30 como máximo).")
	}
	if len([]rune(d.Historial)) > 300 {
		add("historial", "El historial es demasiado largo (300 caracteres como máximo).")
	}
	for campo, v := range map[string]*float64{"marcaSQ": d.MarcaSQ, "marcaBP": d.MarcaBP, "marcaDL": d.MarcaDL} {
		if v != nil && (*v < 0 || *v > 600) {
			add(campo, "Las marcas deben estar entre 0 y 600 kg.")
		} else if v != nil && *v*2 != float64(int64(*v*2)) {
			add(campo, "Las marcas van en pasos de 0,5 kg.")
		}
	}
	if d.FocalX < 0 || d.FocalX > 100 || d.FocalY < 0 || d.FocalY > 100 {
		add("focalX", "El encuadre de la foto no es válido.")
	}
	return errs
}

// reInstagram is a valid handle (with or without «@»).
var reInstagram = regexp.MustCompile(`^@?[A-Za-z0-9._]{1,30}$`)

// emailValido is a light check of the email format (the strict one is the database).
func emailValido(e string) bool {
	if strings.Count(e, "@") != 1 {
		return false
	}
	partes := strings.SplitN(e, "@", 2)
	if partes[0] == "" || len(partes[1]) < 3 || !strings.Contains(partes[1], ".") {
		return false
	}
	return !strings.ContainsAny(e, " \t\n\"<>()[],")
}

// menorDeEdad is under 18 today.
func menorDeEdad(nac time.Time) bool { return Edad(nac, time.Now()) < 18 }

// fecha returns the parsed date or nil.
func fecha(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, ok := ParseFecha(s)
	if !ok {
		return nil
	}
	return &t
}

// ---- antibots ----

// retoAltcha builds the challenge of the widget (signed with an internal key).
func (s *Svc) retoAltcha() AltchaCfg {
	expira := time.Now().Add(caducidadAltcha)
	ch, err := altcha.CreateChallenge(altcha.ChallengeOptions{
		Algorithm: altcha.SHA256,
		HMACKey:   s.altchaKey,
		MaxNumber: 100000,
		Expires:   &expira,
	})
	if err != nil {
		s.a.Log.Warn("reto altcha no generado", "err", err)
		return AltchaCfg{}
	}
	return AltchaCfg{Algorithm: ch.Algorithm, Challenge: ch.Challenge, Salt: ch.Salt, Signature: ch.Signature, MaxNumber: ch.MaxNumber}
}

// validaAltcha checks the solution of the widget and that it has not been used before.
func (s *Svc) validaAltcha(ctx context.Context, payload string) error {
	if strings.TrimSpace(payload) == "" {
		return problem.BadRequest("ANTIBOT", "No hemos podido verificar que eres una persona. Recarga la página e inténtalo de nuevo.")
	}
	ok, err := altcha.VerifySolutionSafe(payload, s.altchaKey, true)
	if err != nil || !ok || !s.altchaConCaducidad(payload) {
		s.a.Log.Info("alta de atleta · altcha inválido", "request_id", httpx.RequestIDFrom(ctx))
		return problem.BadRequest("ANTIBOT", "No hemos podido verificar que eres una persona. Recarga la página e inténtalo de nuevo.")
	}
	// A solution can only be used once (the widget asks for a new challenge after sending).
	desafio := s.desafioDe(payload)
	if desafio == "" {
		return problem.BadRequest("ANTIBOT", "No hemos podido verificar que eres una persona. Recarga la página e inténtalo de nuevo.")
	}
	if ok, _ := s.a.Redis.SetNX(ctx, s.a.Keys.Of("rl", "altcha", desafio), "1", ttlAltchaUsado).Result(); !ok {
		s.a.Log.Info("alta de atleta · altcha reutilizado", "request_id", httpx.RequestIDFrom(ctx))
		return problem.BadRequest("ANTIBOT", "Esta verificación ya se ha usado. Recarga la página e inténtalo de nuevo.")
	}
	return nil
}

// desafioDe returns the challenge of a payload (the signature covers it).
func (s *Svc) desafioDe(payload string) string {
	b, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return ""
	}
	var p altcha.Payload
	if json.Unmarshal(b, &p) != nil {
		return ""
	}
	return p.Challenge
}

// altchaConCaducidad: the salt must carry an expiry (the library accepts salts without one, so a
// challenge issued without «expires» would never expire).
func (s *Svc) altchaConCaducidad(payload string) bool {
	b, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return false
	}
	var p altcha.Payload
	if json.Unmarshal(b, &p) != nil {
		return false
	}
	_, q, ok := strings.Cut(p.Salt, "?")
	if !ok {
		return false
	}
	v, err := url.ParseQuery(q)
	return err == nil && v.Get("expires") != ""
}

// tokenTiempo proves the form was open a while (it travels with the config and comes back in the form).
func (s *Svc) tokenTiempo() string {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	m := hmac.New(sha256.New, s.tiempoKey)
	m.Write([]byte(ts))
	return ts + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

// validaTiempo checks the time token: at least 3 s old and less than 24 h.
func (s *Svc) validaTiempo(tok string) bool {
	partes := strings.SplitN(strings.TrimSpace(tok), ".", 2)
	if len(partes) != 2 {
		return false
	}
	m := hmac.New(sha256.New, s.tiempoKey)
	m.Write([]byte(partes[0]))
	want := base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
	if !hmac.Equal([]byte(want), []byte(partes[1])) {
		return false
	}
	ts, err := strconv.ParseInt(partes[0], 10, 64)
	if err != nil {
		return false
	}
	d := time.Since(time.Unix(ts, 0))
	return d >= tiempoMinimo && d <= tiempoMaximo
}

// ---- state of the form ----

// estadoAlta says whether the form is open: the «alta-atleta» module of the competition and the
// legal texts in force.
func (s *Svc) estadoAlta(ctx context.Context, cid uuid.UUID, slug string) (bool, string, error) {
	var comp struct {
		Modulos map[string]bool `json:"modulos"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/api/competiciones/"+slug, nil, &comp); err != nil {
		return false, "", problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE",
			"No podemos comprobar si el alta está abierta. Inténtalo en unos segundos.")
	}
	if activo, ok := comp.Modulos["alta-atleta"]; ok {
		if !activo {
			return false, "cerrada", nil
		}
	} else {
		// The module is not in the catalogue yet: the form stays open (the switch works once it is).
		s.a.Log.Warn("módulo «alta-atleta» ausente en la competición", "competicion", cid.String())
	}
	vers := s.legalVersiones(ctx, cid)
	if vers["terminos"] == "" || vers["privacidad"] == "" {
		return false, "legal", nil
	}
	return true, "", nil
}

// legalVersiones returns the version in force of every legal text of the form (empty when there is
// no published version).
func (s *Svc) legalVersiones(ctx context.Context, cid uuid.UUID) map[string]string {
	out := map[string]string{}
	for _, t := range []string{"terminos", "privacidad", "consentimiento", "whatsapp"} {
		v, _ := s.legalVigente(ctx, cid, t)
		out[t] = v
	}
	out["novedades"] = versionNovedades
	return out
}

// versionCasilla is the version and the hash of the legal text of a box (empty when it is not published).
func (s *Svc) versionCasilla(ctx context.Context, cid uuid.UUID, casilla string) (string, string) {
	if casilla == "novedades" {
		return versionNovedades, hashNovedades
	}
	tipo, ok := legalDeCasilla[casilla]
	if !ok {
		return "", ""
	}
	return s.legalVigente(ctx, cid, tipo)
}

// consentimientos builds the proof of the boxes that were ticked. A box whose legal text is not
// published is not accepted (it is ignored and said in the log).
func (s *Svc) consentimientos(ctx context.Context, cid uuid.UUID, marcadas map[string]bool, ip string) map[string]Consentimiento {
	out := map[string]Consentimiento{}
	ahora := time.Now()
	for _, c := range casillasAlta {
		if !marcadas[c] {
			continue
		}
		v, h := s.versionCasilla(ctx, cid, c)
		if v == "" {
			s.a.Log.Info("alta de atleta · casilla sin texto legal publicado", "casilla", c, "competicion", cid.String())
			continue
		}
		out[c] = Consentimiento{Aceptado: true, Version: v, Hash: h, At: ahora, IP: ip}
	}
	return out
}

// ---- the photo ----

// procesaFoto standardises the photo of the form and keeps it private (0600) until it is approved.
func (s *Svc) procesaFoto(ctx context.Context, cid, id uuid.UUID, form multipart.Form, focalX, focalY int) (clave, sha string, err error) {
	files := form.File["foto"]
	if len(files) == 0 {
		return "", "", nil
	}
	if len(files) > 1 {
		return "", "", problem.Unprocessable("FOTO_INVALIDA", "Solo se admite una foto.")
	}
	fh := files[0]
	if fh.Size > maxFotoAlta {
		return "", "", problem.BadRequest("FOTO_DEMASIADO_GRANDE", "La foto supera los 8 MB.")
	}
	f, err := fh.Open()
	if err != nil {
		return "", "", problem.Unprocessable("FOTO_INVALIDA", "No hemos podido leer la foto.")
	}
	defer f.Close()
	datos, err := io.ReadAll(io.LimitReader(f, maxFotoAlta+1))
	if err != nil {
		return "", "", problem.Unprocessable("FOTO_INVALIDA", "No hemos podido leer la foto.")
	}
	if len(datos) > maxFotoAlta {
		return "", "", problem.BadRequest("FOTO_DEMASIADO_GRANDE", "La foto supera los 8 MB.")
	}
	// The standard piece (black and white, 960×1200).
	bn, err := imagen.EstandarizarBN(bytes.NewReader(datos), focalX, focalY)
	if err != nil {
		switch {
		case errors.Is(err, imagen.ErrMegapixeles):
			return "", "", problem.Unprocessable("FOTO_DEMASIADOS_MEGAPIXELES", "La foto tiene demasiados píxeles. Usa una foto más pequeña.")
		case errors.Is(err, imagen.ErrDemasiado):
			return "", "", problem.BadRequest("FOTO_DEMASIADO_GRANDE", "La foto supera los 8 MB.")
		default:
			return "", "", problem.Unprocessable("FOTO_INVALIDA", "La foto no es válida (JPG, PNG o WebP).")
		}
	}
	sum := sha256.Sum256(datos)
	clave = s.claveFotoPrivada(cid, id)
	if err := s.escribeFotoPrivada(clave, bn); err != nil {
		s.a.Log.Error("no se ha podido guardar la foto privada", "err", err, "request_id", httpx.RequestIDFrom(ctx))
		return "", "", problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE",
			"No hemos podido guardar tu foto. Inténtalo en unos minutos.")
	}
	return clave, hex.EncodeToString(sum[:]), nil
}

// claveFotoPrivada is the private path of the photo of a request (inside the service volume).
func (s *Svc) claveFotoPrivada(cid, id uuid.UUID) string {
	return "privado/solicitudes/" + cid.String() + "/" + id.String() + ".jpg"
}

// fotoPrivada is the absolute path of a private photo.
func (s *Svc) fotoPrivada(clave string) string {
	return filepath.Join(s.fotoDir, filepath.FromSlash(clave))
}

// escribeFotoPrivada saves a private file (0600, in a 0700 directory).
func (s *Svc) escribeFotoPrivada(clave string, datos []byte) error {
	full := s.fotoPrivada(clave)
	if err := os.MkdirAll(filepath.Dir(full), 0o700); err != nil {
		return err
	}
	return os.WriteFile(full, datos, 0o600)
}

// leerFotoPrivada reads a private photo.
func (s *Svc) leerFotoPrivada(clave string) ([]byte, error) {
	if clave == "" {
		return nil, os.ErrNotExist
	}
	return os.ReadFile(s.fotoPrivada(clave))
}

// borraFotoPrivada removes a private photo (a missing file is not an error).
func (s *Svc) borraFotoPrivada(clave string) {
	if clave == "" {
		return
	}
	_ = os.Remove(s.fotoPrivada(clave))
}

// ---- signed photo URL ----

// firmaFoto is the HMAC of a photo URL (the id and the expiry).
func (s *Svc) firmaFoto(cid, id uuid.UUID, exp int64) string {
	m := hmac.New(sha256.New, s.firmaKey)
	m.Write([]byte(cid.String() + ":" + id.String() + ":" + strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(m.Sum(nil)[:16])
}

// validaFirmaFoto checks the signature and the expiry of a photo URL.
func (s *Svc) validaFirmaFoto(cid, id uuid.UUID, exp int64, firma string) bool {
	if exp <= 0 || firma == "" {
		return false
	}
	if time.Now().Unix() > exp {
		return false
	}
	return hmac.Equal([]byte(s.firmaFoto(cid, id, exp)), []byte(firma))
}

// urlFotoFirmada is the public URL of the private photo of a request (7 days).
func (s *Svc) urlFotoFirmada(cid, id uuid.UUID, slug string) string {
	exp := time.Now().Add(ttlFotoFirma).Unix()
	return fmt.Sprintf("%s/api/competiciones/%s/alta-atleta/foto/%s?e=%d&s=%s",
		s.webURL, slug, id.String(), exp, s.firmaFoto(cid, id, exp))
}

// ---- the team that reviews the requests ----

// Miembro is a member of the team with the permission to edit the athletes.
type Miembro struct {
	Email  string `json:"email"`
	Nombre string `json:"nombre"`
}

// equipoAdmins asks identity for the active members of the competition with «atletas.editar».
func (s *Svc) equipoAdmins(ctx context.Context, cid uuid.UUID) []Miembro {
	var out []Miembro
	if err := s.identity.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/equipo?permiso=atletas.editar", nil, &out); err != nil {
		s.a.Log.Warn("no se ha podido obtener el equipo de la competición", "err", err, "competicion", cid.String())
		return nil
	}
	equipo := make([]Miembro, 0, len(out))
	for _, m := range out {
		if e := strings.ToLower(strings.TrimSpace(m.Email)); e != "" {
			m.Email = e
			equipo = append(equipo, m)
		}
	}
	return equipo
}

// ---- match ----

// matchAtleta looks for an athlete of the competition that matches the request: licence first (it is
// unique), then the email (only when there is one), and finally a name suggestion for the reviewer.
func (s *Svc) matchAtleta(ctx context.Context, cid uuid.UUID, d DatosAlta) (*uuid.UUID, string) {
	if d.Licencia != "" {
		rows, err := s.a.DB.Query(ctx, `SELECT id FROM atletas WHERE competition_id = $1 AND licencia = $2 AND estado <> 'baja' LIMIT 2`, cid, d.Licencia)
		if err == nil {
			ids, _ := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			if len(ids) == 1 {
				return &ids[0], "licencia"
			}
		}
	}
	if d.Email != "" {
		rows, err := s.a.DB.Query(ctx, `SELECT id FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' LIMIT 2`, cid, d.Email)
		if err == nil {
			ids, _ := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			if len(ids) == 1 {
				return &ids[0], "email"
			}
			if len(ids) > 1 {
				return nil, "" // several: the reviewer decides
			}
		}
	}
	// Name suggestion (never linked automatically).
	if d.Nombre != "" && d.Apellidos != "" {
		var id uuid.UUID
		err := s.a.DB.QueryRow(ctx, `SELECT id FROM atletas WHERE competition_id = $1 AND lower(nombre) = lower($2) AND lower(apellidos) = lower($3)
			AND ($4::date IS NULL OR fecha_nacimiento = $4::date) AND estado <> 'baja' LIMIT 1`,
			cid, d.Nombre, d.Apellidos, fecha(d.FechaNacimiento)).Scan(&id)
		if err == nil {
			return &id, "nombre"
		}
	}
	return nil, ""
}

// ---- events of the request ----

// eventoContacto is the payload of «athletes.contacto» (the contact and the proof of the consents).
func (s *Svc) eventoContacto(d DatosAlta, cons map[string]Consentimiento, ip, ua string) map[string]any {
	var consents []map[string]any
	if c, ok := cons["privacidad"]; ok {
		consents = append(consents, map[string]any{"finalidad": "privacidad", "canal": "email", "estado": "confirmado",
			"version": c.Version, "hash": c.Hash, "origen": "/alta-atleta · formulario", "ip": ip})
	}
	if c, ok := cons["imagen"]; ok {
		consents = append(consents, map[string]any{"finalidad": "imagen", "canal": "email", "estado": "confirmado",
			"version": c.Version, "hash": c.Hash, "origen": "/alta-atleta · formulario", "ip": ip})
	}
	if c, ok := cons["whatsapp"]; ok {
		consents = append(consents, map[string]any{"finalidad": "avisos_whatsapp", "canal": "whatsapp", "estado": "confirmado",
			"version": c.Version, "hash": c.Hash, "origen": "/alta-atleta · formulario", "ip": ip})
	}
	if c, ok := cons["novedades"]; ok {
		// Double opt-in: the crm sends the confirmation email of the subscription.
		consents = append(consents, map[string]any{"finalidad": "novedades_email", "canal": "email", "estado": "pendiente",
			"version": c.Version, "hash": c.Hash, "origen": "/alta-atleta · formulario", "ip": ip})
	}
	return map[string]any{
		"email": d.Email, "telefono": d.Telefono, "nombre": strings.TrimSpace(d.Nombre + " " + d.Apellidos),
		"origen": "/alta-atleta · formulario", "consentimientos": consents,
		"ip": ip, "userAgent": ua,
		"relacion": map[string]any{"solicitudAlta": true},
	}
}

// varsRecibida are the variables of the email to the athlete.
func (s *Svc) varsRecibida(d DatosAlta, foto, menor, publica bool) map[string]string {
	return map[string]string{
		"nombre": d.Nombre, "email": d.Email, "telefono": d.Telefono, "club": d.Club, "ciudad": d.Ciudad,
		"marcas": marcas(d.MarcaSQ, d.MarcaBP, d.MarcaDL), "foto": fotoTexto(foto), "pasos": pasosRecibida(foto, menor, publica),
		"urlAtletas": s.webURL + "/atletas",
	}
}

// publicaPerfil says if the profile is public on approval: image consent and not a minor (as the success screen).
func publicaPerfil(cons map[string]Consentimiento, menor bool) bool {
	_, ok := cons["imagen"]
	return ok && !menor
}

// pasosRecibida are the numbered next steps of the email to the athlete: the same process as the success screen.
func pasosRecibida(foto, menor, publica bool) string {
	revision := "Comprobamos tus datos con la lista de inscritos de la AEP."
	if foto {
		revision = "Comprobamos tus datos y tu foto con la lista de inscritos de la AEP."
	}
	p := []string{revision}
	if menor {
		p = append(p, "Eres menor de edad: necesitamos la autorización firmada de tu madre, padre o tutor. Te la pediremos por email; sin ella no podemos aprobar tu alta.")
	}
	p = append(p, "Te avisamos por email con el resultado y el acceso a tu área de atleta.")
	if publica {
		p = append(p, "Publicamos tu ficha en /atletas.")
	} else {
		p = append(p, "Tu ficha queda privada: no aparece en /atletas hasta que actives su publicación desde el área de atleta.")
	}
	for i := range p {
		p[i] = strconv.Itoa(i+1) + ". " + p[i]
	}
	return strings.Join(p, "\n\n")
}

// varsNueva are the variables of the email to the team (with the photo: a signed URL, not public).
func (s *Svc) varsNueva(d DatosAlta, match string, menor bool, fotoURL, slug string) map[string]string {
	return map[string]string{
		"nombre": d.Nombre, "apellidos": d.Apellidos, "email": d.Email, "telefono": d.Telefono, "licencia": d.Licencia,
		"club": d.Club, "ciudad": d.Ciudad, "sexo": d.Sexo, "edad": edadTexto(d.FechaNacimiento),
		"fechaNacimiento": fechaCorta(d.FechaNacimiento), "marcas": marcas(d.MarcaSQ, d.MarcaBP, d.MarcaDL),
		"frase": d.Frase, "match": matchTexto(match), "menor": textoMenor(menor),
		"prueba": pruebaTexto(d.Prueba), "foto": fotoURL, "urlRevisar": s.boURL + "/" + slug + "/atletas/solicitudes",
	}
}

// varsWARecibida are the variables of the WhatsApp message to the athlete.
func (s *Svc) varsWARecibida(d DatosAlta) map[string]string {
	return map[string]string{
		"nombre": d.Nombre, "email": d.Email, "telefono": d.Telefono, "club": d.Club, "ciudad": d.Ciudad,
		"marcas": marcas(d.MarcaSQ, d.MarcaBP, d.MarcaDL), "foto": "No", "urlAtletas": s.webURL + "/atletas",
	}
}

// varsWANueva are the variables of the WhatsApp message to the organisers.
func (s *Svc) varsWANueva(d DatosAlta, match string, menor bool, slug string) map[string]string {
	return map[string]string{
		"nombre": d.Nombre, "apellidos": d.Apellidos, "email": d.Email, "telefono": d.Telefono, "licencia": d.Licencia,
		"club": d.Club, "ciudad": d.Ciudad, "sexo": d.Sexo, "edad": edadTexto(d.FechaNacimiento),
		"fechaNacimiento": fechaCorta(d.FechaNacimiento), "marcas": marcas(d.MarcaSQ, d.MarcaBP, d.MarcaDL),
		"frase": d.Frase, "match": matchTexto(match), "menor": textoMenor(menor),
		"foto": "", "urlRevisar": s.boURL + "/" + slug + "/atletas/solicitudes",
	}
}

// marcas writes the three lifts (kg) and the total when there are three.
// kgES writes a mark the Spanish way (210,5).
func kgES(v float64) string { return strings.Replace(strconv.FormatFloat(v, 'f', -1, 64), ".", ",", 1) }

func marcas(sq, bp, dl *float64) string {
	partes := []string{}
	total := 0.0
	tres := true
	for _, v := range []*float64{sq, bp, dl} {
		if v == nil {
			partes = append(partes, "–")
			tres = false
			continue
		}
		partes = append(partes, kgES(*v))
		total += *v
	}
	out := strings.Join(partes, " / ") + " kg"
	if tres {
		out += " · total " + kgES(total) + " kg"
	}
	return out
}

// edadTexto is the age of the athlete today.
func edadTexto(nac string) string {
	t, ok := ParseFecha(nac)
	if !ok {
		return ""
	}
	return strconv.Itoa(Edad(t, time.Now()))
}

// fechaCorta is the birth date as dd/mm/yyyy.
func fechaCorta(nac string) string {
	t, ok := ParseFecha(nac)
	if !ok {
		return ""
	}
	return t.Format("02/01/2006")
}

// textoMenor warns the team about a minor (empty when the athlete is not).
func textoMenor(menor bool) string {
	if !menor {
		return ""
	}
	return "⚠ Menor de edad: falta la autorización firmada de madre, padre o tutor. Súbela desde el panel de solicitudes; aprobar queda bloqueado hasta tenerla."
}

// fotoTexto says if the request has a photo.
func fotoTexto(foto bool) string {
	if foto {
		return "Sí, en blanco y negro"
	}
	return "No"
}

// matchTexto explains the match to the team (a short phrase, as messaging expects).
func matchTexto(m string) string {
	switch m {
	case "licencia":
		return "licencia"
	case "email":
		return "email"
	case "nombre":
		return "sugerida (nombre y fecha de nacimiento)"
	}
	return "sin coincidencia"
}

// normTel normalises a phone number to E.164 (+34 by default for Spanish numbers).
// telValido: optional '+' and 9 to 15 digits, once spaces, hyphens, parentheses and dots are removed.
var telValido = regexp.MustCompile(`^\+?[0-9]{9,15}$`)

// tieneLetra reports whether v has at least one visible letter: the Hangul fillers (U+3164, U+FFA0,
// U+115F, U+1160) are category Lo but render blank, like U+2800 and the Cf format characters.
func tieneLetra(v string) bool {
	return strings.IndexFunc(v, func(r rune) bool {
		switch r {
		case 0x3164, 0xFFA0, 0x115F, 0x1160, 0x2800:
			return false
		}
		return unicode.IsLetter(r) && !unicode.Is(unicode.Cf, r)
	}) >= 0
}

func normTel(t string) string {
	var b strings.Builder
	for i, r := range strings.TrimSpace(t) {
		if (r >= '0' && r <= '9') || (r == '+' && i == 0) {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if out != "" && !strings.HasPrefix(out, "+") {
		if len(out) == 9 {
			out = "+34" + out // Spanish numbers without prefix
		} else {
			out = "+" + out
		}
	}
	if len(out) < 8 || len(out) > 16 {
		return ""
	}
	return out
}

// whatsapp asks messaging to send a WhatsApp message (the athlete or the organisers).
func whatsapp(ctx context.Context, tx pgx.Tx, cid uuid.UUID, para string, organizadores bool, plantilla string, vars map[string]string, imagenURL string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "athletes.whatsapp_solicitado",
		map[string]any{"para": para, "organizadores": organizadores, "plantilla": plantilla, "vars": vars, "imagen": imagenURL},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}
