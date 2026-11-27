package athletes

import (
	"context"
	"net/http"
	"strconv"
	"strings"
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
	completadas, err := s.cuentas(ctx, `SELECT to_char(enviado_at AT TIME ZONE $2, 'YYYY-MM-DD'), count(*) FROM formulario_respuestas
		WHERE formulario_id = $1 AND estado = 'completa' AND enviado_at >= $3 GROUP BY 1`, fid, loc.String(), desde)
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

// porCampo cuenta, en una sola consulta, los valores de cada campo: jsonb_each sobre datos agrupado por clave y valor
// (y los elementos de las listas). Con ese recuento se arman las opciones, el sí/no, la media y las respuestas no vacías
// de cada campo, sin una consulta por campo.
func (s *Svc) porCampo(ctx context.Context, fid uuid.UUID, e formularios.Esquema) ([]CampoEstadistica, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT campo, clase, texto, sum(n)::bigint FROM (
			SELECT kv.key AS campo, jsonb_typeof(kv.value) AS clase, COALESCE(kv.value #>> '{}', '') AS texto, count(*) AS n
			FROM formulario_respuestas r CROSS JOIN LATERAL jsonb_each(r.datos) AS kv
			WHERE r.formulario_id = $1 AND jsonb_typeof(kv.value) <> 'array'
			GROUP BY 1, 2, 3
			UNION ALL
			SELECT kv.key, 'elemento', el.valor, count(*)
			FROM formulario_respuestas r CROSS JOIN LATERAL jsonb_each(r.datos) AS kv
			CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(kv.value) = 'array' THEN kv.value ELSE '[]'::jsonb END) AS el(valor)
			WHERE r.formulario_id = $1 AND jsonb_typeof(kv.value) = 'array'
			GROUP BY 1, 2, 3
			UNION ALL
			SELECT kv.key, 'lista', '', count(*)
			FROM formulario_respuestas r CROSS JOIN LATERAL jsonb_each(r.datos) AS kv
			WHERE r.formulario_id = $1 AND jsonb_typeof(kv.value) = 'array'
				AND (CASE WHEN jsonb_typeof(kv.value) = 'array' THEN jsonb_array_length(kv.value) ELSE 0 END) > 0
			GROUP BY 1, 2, 3
			UNION ALL
			SELECT f ->> 'campoId', 'archivo', '', count(DISTINCT r.id)
			FROM formulario_respuestas r CROSS JOIN LATERAL jsonb_array_elements(r.archivos) AS f
			WHERE r.formulario_id = $1
			GROUP BY 1, 2, 3
		) s GROUP BY 1, 2, 3`, fid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	porClave := map[string][]valorCampo{}
	for rows.Next() {
		var v valorCampo
		if err := rows.Scan(&v.campo, &v.clase, &v.texto, &v.n); err != nil {
			return nil, err
		}
		porClave[v.campo] = append(porClave[v.campo], v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := []CampoEstadistica{}
	for _, c := range e.Campos {
		if !formularios.AdmiteRespuesta(c.Tipo) {
			continue
		}
		cs := CampoEstadistica{CampoID: c.ID, Etiqueta: c.Etiqueta, Tipo: c.Tipo}
		llenaCampo(&cs, c, porClave[c.ID])
		out = append(out, cs)
	}
	return out, nil
}

// valorCampo es un recuento de la consulta de porCampo: cuántas respuestas tienen ese valor (texto) en ese campo.
// clase es el tipo JSON del valor («string», «number», «boolean»), «elemento» (un elemento de una lista), «lista» (listas
// no vacías) o «archivo» (respuestas con archivos en el campo).
type valorCampo struct {
	campo, clase, texto string
	n                   int
}

// llenaCampo rellena un campo según su tipo a partir de sus recuentos. Cuenta lo mismo que el porcentaje: texto no vacío,
// número, lista no vacía, archivo subido, y el «sí» de una casilla (el «sí» y el «no» en sí/no).
func llenaCampo(cs *CampoEstadistica, c formularios.Campo, vals []valorCampo) {
	cuentas := map[string]int{}
	var si, no, lista, archivos, texto, numeros int
	var suma float64
	eleccion := c.Tipo == formularios.TipoOpcionUnica || c.Tipo == formularios.TipoDesplegable || c.Tipo == formularios.TipoDeslizador
	for _, v := range vals {
		switch {
		case v.clase == "boolean" && v.texto == "true":
			si += v.n
		case v.clase == "boolean" && v.texto == "false":
			no += v.n
		case v.clase == "string" && eleccion && v.texto != "":
			cuentas[v.texto] += v.n
		case v.clase == "elemento":
			cuentas[v.texto] += v.n
		case v.clase == "lista":
			lista += v.n
		case v.clase == "archivo":
			archivos += v.n
		case v.clase == "number":
			numeros += v.n
			x, _ := strconv.ParseFloat(v.texto, 64)
			suma += x * float64(v.n)
		case v.clase == "string" && strings.TrimSpace(v.texto) != "":
			texto += v.n
		}
	}
	switch c.Tipo {
	case formularios.TipoCasilla:
		cs.Respondidas = si
		cs.Opciones = []OpcionEstadistica{{ID: "on", Texto: "Marcada", N: si}}
	case formularios.TipoSiNo:
		cs.Respondidas = si + no
		cs.Opciones = []OpcionEstadistica{{ID: "si", Texto: "Sí", N: si}, {ID: "no", Texto: "No", N: no}}
	case formularios.TipoOpcionUnica, formularios.TipoDesplegable, formularios.TipoDeslizador:
		cs.Opciones = opcionesCon(c.Opciones, cuentas)
		for _, n := range cuentas {
			cs.Respondidas += n
		}
	case formularios.TipoCasillas, formularios.TipoSeleccionMultiple:
		cs.Opciones = opcionesCon(c.Opciones, cuentas)
		cs.Respondidas = lista
	case formularios.TipoNumero, formularios.TipoEscala, formularios.TipoValoracion:
		cs.Respondidas = numeros
		if numeros > 0 {
			m := suma / float64(numeros)
			cs.Media = &m
		}
	case formularios.TipoArchivo:
		cs.Respondidas = archivos
	default:
		cs.Respondidas = texto
	}
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
