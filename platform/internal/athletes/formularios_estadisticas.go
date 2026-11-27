package athletes

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/formularios"
)

// Estadísticas de un formulario (FORMULARIOS.md §4): respuestas, entregas por canal, serie diaria de los últimos 30 días
// y resultados por campo. Los conteos se hacen en SQL sobre el jsonb de las respuestas.

// Estadisticas es el resumen de un formulario.
type Estadisticas struct {
	Destinatarios       int                `json:"destinatarios"`
	Abiertos            int                `json:"abiertos"`
	Respuestas          int                `json:"respuestas"`
	Completas           int                `json:"completas"`
	Parciales           int                `json:"parciales"`
	PorcentajeCompletas int                `json:"porcentajeCompletas"`
	PorcentajeRespuesta int                `json:"porcentajeRespuesta"`
	PorCanal            CanalesEstadistica `json:"porCanal"`
	PorOrigen           OrigenEstadistica  `json:"porOrigen"`
	Diario              []DiaEstadistica   `json:"diario"`
	PorCampo            []CampoEstadistica `json:"porCampo"`
}

// CanalesEstadistica son las entregas de todos los envíos, por canal.
type CanalesEstadistica struct {
	Email    CanalEstado `json:"email"`
	WhatsApp CanalEstado `json:"whatsapp"`
}

// OrigenEstadistica cuenta las respuestas según llegaron por la web o por el email.
type OrigenEstadistica struct {
	Web   int `json:"web"`
	Email int `json:"email"`
}

// DiaEstadistica son las respuestas y las completas de un día (en la zona de la competición).
type DiaEstadistica struct {
	Fecha      string `json:"fecha"`
	Respuestas int    `json:"respuestas"`
	Completas  int    `json:"completas"`
}

// OpcionEstadistica es una opción de un campo y cuántas veces se eligió.
type OpcionEstadistica struct {
	ID    string `json:"id"`
	Texto string `json:"texto"`
	N     int    `json:"n"`
}

// CampoEstadistica es el resultado de un campo que admite respuesta: las opciones (si las tiene) o la media.
type CampoEstadistica struct {
	CampoID     string              `json:"campoId"`
	Etiqueta    string              `json:"etiqueta"`
	Tipo        string              `json:"tipo"`
	Respondidas int                 `json:"respondidas"`
	Opciones    []OpcionEstadistica `json:"opciones,omitempty"`
	Media       *float64            `json:"media,omitempty"`
}

// registerFormulariosEstadisticas registra el resumen del formulario.
func (s *Svc) registerFormulariosEstadisticas() {
	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type estadisticasOut struct {
		Body Estadisticas
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "formularios-estadisticas", Method: http.MethodGet,
		Path: "/api/admin/competiciones/{cid}/formularios/{id}/estadisticas", Summary: "Respuestas, entregas, serie diaria y resultados por campo",
		Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*estadisticasOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			e, err := s.estadisticas(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &estadisticasOut{Body: e}, nil
		})
}

// estadisticas reúne el resumen de un formulario de la competición.
func (s *Svc) estadisticas(ctx context.Context, cid, fid uuid.UUID) (Estadisticas, error) {
	f, err := s.formularioDe(ctx, cid, fid)
	if err != nil {
		return Estadisticas{}, err
	}
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return Estadisticas{}, err
	}
	e := Estadisticas{}
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE abierto_at IS NOT NULL)
		FROM formulario_destinatarios WHERE formulario_id = $1`, fid).Scan(&e.Destinatarios, &e.Abiertos); err != nil {
		return e, err
	}
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE estado = 'completa'), count(*) FILTER (WHERE estado = 'parcial'),
		count(*) FILTER (WHERE origen = 'web'), count(*) FILTER (WHERE origen = 'email')
		FROM formulario_respuestas WHERE formulario_id = $1`, fid).Scan(&e.Respuestas, &e.Completas, &e.Parciales, &e.PorOrigen.Web, &e.PorOrigen.Email); err != nil {
		return e, err
	}
	e.PorcentajeCompletas = porcentajeDe(e.Completas, e.Destinatarios)
	e.PorcentajeRespuesta = porcentajeDe(e.Respuestas, e.Destinatarios)
	envs, err := s.estadoEnvios(ctx, cid, fid)
	if err != nil {
		return e, err
	}
	for _, en := range envs {
		sumaCanal(&e.PorCanal.Email, en.Email)
		sumaCanal(&e.PorCanal.WhatsApp, en.WhatsApp)
	}
	if e.Diario, err = s.diario(ctx, fid, zonaDe(c.ZonaHoraria)); err != nil {
		return e, err
	}
	if e.PorCampo, err = s.porCampo(ctx, fid, f.Esquema); err != nil {
		return e, err
	}
	return e, nil
}

// diario cuenta las respuestas y las completas de cada uno de los últimos 30 días, en la zona de la competición.
func (s *Svc) diario(ctx context.Context, fid uuid.UUID, loc *time.Location) ([]DiaEstadistica, error) {
	hoy := time.Now().In(loc)
	desde := time.Date(hoy.Year(), hoy.Month(), hoy.Day()-29, 0, 0, 0, 0, loc)
	recibidas, err := s.cuentas(ctx, `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD'), count(*) FROM formulario_respuestas
		WHERE formulario_id = $1 AND created_at >= $3 GROUP BY 1`, fid, loc.String(), desde)
	if err != nil {
		return nil, err
	}
	completadas, err := s.cuentas(ctx, `SELECT to_char(COALESCE(enviado_at, updated_at) AT TIME ZONE $2, 'YYYY-MM-DD'), count(*) FROM formulario_respuestas
		WHERE formulario_id = $1 AND estado = 'completa' AND COALESCE(enviado_at, updated_at) >= $3 GROUP BY 1`, fid, loc.String(), desde)
	if err != nil {
		return nil, err
	}
	out := make([]DiaEstadistica, 0, 30)
	for i := 0; i < 30; i++ {
		dia := desde.AddDate(0, 0, i).Format("2006-01-02")
		out = append(out, DiaEstadistica{Fecha: dia, Respuestas: recibidas[dia], Completas: completadas[dia]})
	}
	return out, nil
}

// porCampo cuenta las respuestas de cada campo que admite respuesta, con sus opciones o su media según el tipo.
func (s *Svc) porCampo(ctx context.Context, fid uuid.UUID, e formularios.Esquema) ([]CampoEstadistica, error) {
	out := []CampoEstadistica{}
	for _, c := range e.Campos {
		if !formularios.AdmiteRespuesta(c.Tipo) {
			continue
		}
		cs := CampoEstadistica{CampoID: c.ID, Etiqueta: c.Etiqueta, Tipo: c.Tipo}
		if err := s.estadisticaCampo(ctx, fid, c, &cs); err != nil {
			return nil, err
		}
		out = append(out, cs)
	}
	return out, nil
}

// estadisticaCampo rellena un campo según su tipo. Cuenta lo mismo que el porcentaje: texto no vacío, número, lista no
// vacía, archivo subido, y el «sí» de una casilla (el «sí» y el «no» en sí/no).
func (s *Svc) estadisticaCampo(ctx context.Context, fid uuid.UUID, c formularios.Campo, cs *CampoEstadistica) error {
	switch c.Tipo {
	case formularios.TipoCasilla:
		var n int
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE (datos -> $2::text) = 'true'::jsonb)
			FROM formulario_respuestas WHERE formulario_id = $1`, fid, c.ID).Scan(&n); err != nil {
			return err
		}
		cs.Respondidas = n
		cs.Opciones = []OpcionEstadistica{{ID: "on", Texto: "Marcada", N: n}}
	case formularios.TipoSiNo:
		var si, no int
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE (datos -> $2::text) = 'true'::jsonb),
			count(*) FILTER (WHERE (datos -> $2::text) = 'false'::jsonb)
			FROM formulario_respuestas WHERE formulario_id = $1`, fid, c.ID).Scan(&si, &no); err != nil {
			return err
		}
		cs.Respondidas = si + no
		cs.Opciones = []OpcionEstadistica{{ID: "si", Texto: "Sí", N: si}, {ID: "no", Texto: "No", N: no}}
	case formularios.TipoOpcionUnica, formularios.TipoDesplegable, formularios.TipoDeslizador:
		cuentas, err := s.cuentas(ctx, `SELECT datos ->> $2::text, count(*) FROM formulario_respuestas
			WHERE formulario_id = $1 AND jsonb_typeof(datos -> $2::text) = 'string' AND (datos ->> $2::text) <> '' GROUP BY 1`, fid, c.ID)
		if err != nil {
			return err
		}
		cs.Opciones = opcionesCon(c.Opciones, cuentas)
		for _, n := range cuentas {
			cs.Respondidas += n
		}
	case formularios.TipoCasillas, formularios.TipoSeleccionMultiple:
		cuentas, err := s.cuentas(ctx, `SELECT o.valor, count(*) FROM formulario_respuestas r
			CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.datos -> $2::text) = 'array' THEN r.datos -> $2::text ELSE '[]'::jsonb END) AS o(valor)
			WHERE r.formulario_id = $1 GROUP BY 1`, fid, c.ID)
		if err != nil {
			return err
		}
		cs.Opciones = opcionesCon(c.Opciones, cuentas)
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE CASE WHEN jsonb_typeof(datos -> $2::text) = 'array'
			THEN jsonb_array_length(datos -> $2::text) > 0 ELSE false END) FROM formulario_respuestas WHERE formulario_id = $1`, fid, c.ID).Scan(&cs.Respondidas); err != nil {
			return err
		}
	case formularios.TipoNumero, formularios.TipoEscala, formularios.TipoValoracion:
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE jsonb_typeof(datos -> $2::text) = 'number'),
			avg(CASE WHEN jsonb_typeof(datos -> $2::text) = 'number' THEN (datos ->> $2::text)::numeric END)::float8
			FROM formulario_respuestas WHERE formulario_id = $1`, fid, c.ID).Scan(&cs.Respondidas, &cs.Media); err != nil {
			return err
		}
	case formularios.TipoArchivo:
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(r.archivos) a
			WHERE (a ->> 'campoId') = $2::text)) FROM formulario_respuestas r WHERE r.formulario_id = $1`, fid, c.ID).Scan(&cs.Respondidas); err != nil {
			return err
		}
	default:
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE jsonb_typeof(datos -> $2::text) = 'string' AND btrim(datos ->> $2::text) <> '')
			FROM formulario_respuestas WHERE formulario_id = $1`, fid, c.ID).Scan(&cs.Respondidas); err != nil {
			return err
		}
	}
	return nil
}

// cuentas ejecuta una consulta de (clave, n) y devuelve n por clave.
func (s *Svc) cuentas(ctx context.Context, sql string, args ...any) (map[string]int, error) {
	rows, err := s.a.DB.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

// opcionesCon da el recuento de cada opción del campo, en su orden (cero si nadie la eligió).
func opcionesCon(ops []formularios.Opcion, cuentas map[string]int) []OpcionEstadistica {
	out := make([]OpcionEstadistica, 0, len(ops))
	for _, o := range ops {
		out = append(out, OpcionEstadistica{ID: o.ID, Texto: o.Texto, N: cuentas[o.ID]})
	}
	return out
}

// sumaCanal suma el estado de un canal de un envío al total del formulario.
func sumaCanal(dst *CanalEstado, src CanalEstado) {
	dst.Total += src.Total
	dst.EnCola += src.EnCola
	dst.Enviados += src.Enviados
	dst.Fallidos += src.Fallidos
	dst.Omitidos += src.Omitidos
}

// porcentajeDe es n sobre total en enteros (0 si no hay total).
func porcentajeDe(n, total int) int {
	if total == 0 {
		return 0
	}
	return n * 100 / total
}

// zonaDe es la zona horaria de la competición (UTC si no la tiene o no existe).
func zonaDe(nombre string) *time.Location {
	if loc, err := time.LoadLocation(nombre); err == nil {
		return loc
	}
	return time.UTC
}
