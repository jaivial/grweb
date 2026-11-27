package athletes

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/formularios"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Respuestas de un formulario (§4): la pestaña Atletas del editor, el detalle de cada respuesta con el esquema de su
// versión y la exportación CSV. Un destinatario sin respuesta aparece como «sin_respuesta» (id null).

// FilaAtleta es el atleta de una fila de respuestas.
type FilaAtleta struct {
	ID        uuid.UUID `json:"id"`
	Nombre    string    `json:"nombre"`
	Apellidos string    `json:"apellidos"`
	Club      string    `json:"club"`
	Categoria string    `json:"categoria"`
}

// RespuestaFila es una línea de la pestaña Atletas: con respuesta o sin ella.
type RespuestaFila struct {
	ID            *uuid.UUID `json:"id" doc:"Id de la respuesta (null si el atleta aún no ha respondido)"`
	Atleta        FilaAtleta `json:"atleta"`
	Estado        string     `json:"estado" enum:"parcial,completa,sin_respuesta"`
	Porcentaje    int        `json:"porcentaje"`
	Origen        string     `json:"origen"`
	AbiertoAt     *time.Time `json:"abiertoAt"`
	EnviadoAt     *time.Time `json:"enviadoAt"`
	ActualizadoAt *time.Time `json:"actualizadoAt"`
}

// ArchivoRespuesta es un archivo subido en un campo de la respuesta.
type ArchivoRespuesta struct {
	CampoID string  `json:"campoId"`
	URL     string  `json:"url"`
	Nombre  string  `json:"nombre"`
	Tamano  float64 `json:"tamano"`
	Tipo    string  `json:"tipo"`
}

// RespuestaDetalle es una respuesta completa, con el esquema de la versión con la que se contestó.
type RespuestaDetalle struct {
	RespuestaFila
	Version  int                 `json:"version"`
	Esquema  formularios.Esquema `json:"esquema" doc:"Esquema de la versión con la que se contestó"`
	Datos    map[string]any      `json:"datos"`
	Archivos []ArchivoRespuesta  `json:"archivos"`
}

// RespuestasPagina es una página de la pestaña Atletas.
type RespuestasPagina struct {
	Items []RespuestaFila `json:"items"`
	Total int             `json:"total"`
}

// filaFrom y filaCols: las filas de la pestaña (un destinatario, su atleta y su respuesta si la tiene). Son la
// única forma de leer una fila: scanFila las interpreta.
const (
	filaCols = `SELECT a.id, a.nombre, a.apellidos, a.club, a.categoria, r.id, COALESCE(r.estado, ''), COALESCE(r.porcentaje, 0),
		COALESCE(r.origen, ''), d.abierto_at, r.enviado_at, r.updated_at`
	filaFrom = ` FROM formulario_destinatarios d
		JOIN atletas a ON a.id = d.atleta_id
		LEFT JOIN formulario_respuestas r ON r.destinatario_id = d.id`
)

// scanFila lee una fila de filaCols. Sin fila de respuesta, el estado es sin_respuesta.
func scanFila(r pgx.Row) (RespuestaFila, error) {
	var f RespuestaFila
	var estado string
	if err := r.Scan(&f.Atleta.ID, &f.Atleta.Nombre, &f.Atleta.Apellidos, &f.Atleta.Club, &f.Atleta.Categoria,
		&f.ID, &estado, &f.Porcentaje, &f.Origen, &f.AbiertoAt, &f.EnviadoAt, &f.ActualizadoAt); err != nil {
		return f, err
	}
	f.Estado = "sin_respuesta"
	if f.ID != nil {
		f.Estado = estado
	}
	return f, nil
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (s *Svc) registerFormulariosRespuestas() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/formularios/{id}"

	type respuestasIn struct {
		CID    uuid.UUID `path:"cid"`
		ID     uuid.UUID `path:"id"`
		Estado string    `query:"estado" doc:"parcial · completa · sin_respuesta (vacío: todos)"`
		Q      string    `query:"q" maxLength:"100" doc:"Busca en nombre, apellidos y club"`
		Pagina int       `query:"page" minimum:"1" default:"1"`
		Tamano int       `query:"size" minimum:"1" maximum:"200" default:"25"`
	}
	type respuestasOut struct {
		Body RespuestasPagina
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-respuestas", Method: http.MethodGet, Path: base + "/respuestas", Summary: "Atletas del formulario con su respuesta (paginado)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *respuestasIn) (*respuestasOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if _, err := s.formularioDe(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			pag, err := s.listaRespuestas(ctx, in.CID, in.ID, in.Estado, in.Q, in.Pagina, in.Tamano)
			if err != nil {
				return nil, err
			}
			return &respuestasOut{Body: pag}, nil
		})

	type detalleIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
		RID uuid.UUID `path:"rid"`
	}
	type detalleOut struct {
		Body RespuestaDetalle
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-respuesta", Method: http.MethodGet, Path: base + "/respuestas/{rid}", Summary: "Respuesta completa, campo a campo, con el esquema de su versión", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *detalleIn) (*detalleOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			d, err := s.respuestaDetalle(ctx, in.CID, in.ID, in.RID)
			if err != nil {
				return nil, err
			}
			return &detalleOut{Body: d}, nil
		})

	// La exportación es un fichero: va como handler plano para servir el CSV con sus cabeceras.
	s.a.Mux.HandleFunc("GET /api/admin/competiciones/{cid}/formularios/{id}/respuestas.csv", func(w http.ResponseWriter, req *http.Request) {
		cid, err := uuid.Parse(req.PathValue("cid"))
		if err != nil {
			http.NotFound(w, req)
			return
		}
		fid, err := uuid.Parse(req.PathValue("id"))
		if err != nil {
			http.NotFound(w, req)
			return
		}
		if _, err := auth.Require(req.Context(), cid.String(), "atletas.editar"); err != nil {
			escribeProblema(w, s, err)
			return
		}
		f, err := s.formularioDe(req.Context(), cid, fid)
		if err != nil {
			escribeProblema(w, s, err)
			return
		}
		data, err := s.csvRespuestas(req.Context(), cid, f)
		if err != nil {
			escribeProblema(w, s, err)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="formulario-respuestas.csv"`)
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(data)
	})
}

// listaRespuestas es la página de la pestaña Atletas: estado (vacío = todos), búsqueda y paginación.
func (s *Svc) listaRespuestas(ctx context.Context, cid, fid uuid.UUID, estado, q string, pagina, tamano int) (RespuestasPagina, error) {
	where := ` WHERE d.formulario_id = $1 AND d.competition_id = $2`
	args := []any{fid, cid}
	switch estado {
	case "":
	case "sin_respuesta":
		where += ` AND r.id IS NULL`
	case "parcial", "completa":
		args = append(args, estado)
		where += fmt.Sprintf(` AND r.estado = $%d`, len(args))
	default:
		return RespuestasPagina{}, problem.BadRequest("ESTADO_NO_VALIDO", "El estado debe ser parcial, completa o sin_respuesta.")
	}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+likeEscaper.Replace(q)+"%")
		where += fmt.Sprintf(` AND concat_ws(' ', a.nombre, a.apellidos, a.club) ILIKE $%d`, len(args))
	}
	var total int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*)::int`+filaFrom+where, args...).Scan(&total); err != nil {
		return RespuestasPagina{}, err
	}
	args = append(args, tamano, (pagina-1)*tamano)
	rows, err := s.a.DB.Query(ctx, filaCols+filaFrom+where+fmt.Sprintf(` ORDER BY a.apellidos, a.nombre, a.id LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return RespuestasPagina{}, err
	}
	defer rows.Close()
	items := []RespuestaFila{}
	for rows.Next() {
		f, err := scanFila(rows)
		if err != nil {
			return RespuestasPagina{}, err
		}
		items = append(items, f)
	}
	return RespuestasPagina{Items: items, Total: total}, rows.Err()
}

// respuestaDetalle lee una respuesta con su fila de atleta y el esquema de la versión con la que se contestó.
func (s *Svc) respuestaDetalle(ctx context.Context, cid, fid, rid uuid.UUID) (RespuestaDetalle, error) {
	var d RespuestaDetalle
	fila, err := scanFila(s.a.DB.QueryRow(ctx, filaCols+filaFrom+` WHERE r.id = $1 AND r.formulario_id = $2 AND r.competition_id = $3`, rid, fid, cid))
	if db.IsNoRows(err) {
		return d, problem.NotFound("Respuesta no encontrada.")
	}
	if err != nil {
		return d, err
	}
	d.RespuestaFila = fila
	var datos, archivos []byte
	if err := s.a.DB.QueryRow(ctx, `SELECT version, datos, archivos FROM formulario_respuestas WHERE id = $1`, rid).Scan(&d.Version, &datos, &archivos); err != nil {
		return d, err
	}
	if err := json.Unmarshal(datos, &d.Datos); err != nil {
		return d, err
	}
	if err := json.Unmarshal(archivos, &d.Archivos); err != nil {
		return d, err
	}
	if d.Datos == nil {
		d.Datos = map[string]any{}
	}
	if d.Archivos == nil {
		d.Archivos = []ArchivoRespuesta{}
	}
	var esquema []byte
	if err := s.a.DB.QueryRow(ctx, `SELECT esquema FROM formulario_versiones WHERE formulario_id = $1 AND version = $2`, fid, d.Version).Scan(&esquema); err != nil {
		return d, err
	}
	if err := json.Unmarshal(esquema, &d.Esquema); err != nil {
		return d, err
	}
	return d, nil
}

// csvRespuestas exporta las respuestas: una columna por cada campo que admite respuesta del formulario actual.
func (s *Svc) csvRespuestas(ctx context.Context, cid uuid.UUID, f Formulario) ([]byte, error) {
	var campos []formularios.Campo
	cabecera := []string{"Nombre", "Apellidos", "Club", "Categoría", "Estado", "Porcentaje", "Origen", "Enviado", "Versión"}
	for _, c := range f.Esquema.Campos {
		if formularios.AdmiteRespuesta(c.Tipo) {
			campos = append(campos, c)
			cabecera = append(cabecera, c.Etiqueta)
		}
	}
	rows, err := s.a.DB.Query(ctx, `SELECT a.nombre, a.apellidos, a.club, a.categoria, r.estado, r.porcentaje, r.origen, r.enviado_at, r.version, r.datos
		FROM formulario_respuestas r JOIN atletas a ON a.id = r.atleta_id
		WHERE r.formulario_id = $1 AND r.competition_id = $2 ORDER BY a.apellidos, a.nombre, a.id`, f.ID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // BOM UTF-8: Excel lee bien las tildes
	w := csv.NewWriter(&buf)
	if err := w.Write(cabecera); err != nil {
		return nil, err
	}
	for rows.Next() {
		var nombre, apellidos, club, categoria, estado, origen string
		var porcentaje, version int
		var enviado *time.Time
		var datosRaw []byte
		if err := rows.Scan(&nombre, &apellidos, &club, &categoria, &estado, &porcentaje, &origen, &enviado, &version, &datosRaw); err != nil {
			return nil, err
		}
		var datos map[string]any
		if err := json.Unmarshal(datosRaw, &datos); err != nil {
			return nil, err
		}
		fila := []string{nombre, apellidos, club, categoria, estado, strconv.Itoa(porcentaje), origen, "", strconv.Itoa(version)}
		if enviado != nil {
			fila[7] = enviado.Format(time.RFC3339)
		}
		for _, c := range campos {
			fila = append(fila, valorCSV(c, datos[c.ID]))
		}
		if err := w.Write(celdasSeguras(fila)); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), errors.Join(rows.Err(), w.Error())
}

// valorCSV escribe una respuesta como texto: textos de las opciones, sí/no, números y nombres de archivo.
func valorCSV(c formularios.Campo, v any) string {
	texto := func(id string) string {
		for _, o := range c.Opciones {
			if o.ID == id {
				return o.Texto
			}
		}
		return id
	}
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		if c.Tipo == formularios.TipoOpcionUnica || c.Tipo == formularios.TipoDesplegable || c.Tipo == formularios.TipoDeslizador {
			return texto(x)
		}
		return x
	case bool:
		if x {
			return "Sí"
		}
		return "No"
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case []any:
		partes := make([]string, 0, len(x))
		for _, it := range x {
			switch y := it.(type) {
			case string:
				if c.Tipo == formularios.TipoArchivo {
					partes = append(partes, y)
				} else {
					partes = append(partes, texto(y))
				}
			case map[string]any:
				if u, ok := y["url"].(string); ok {
					partes = append(partes, u)
				}
			}
		}
		return strings.Join(partes, "; ")
	}
	return fmt.Sprint(v)
}

// celdasSeguras evita la inyección de fórmulas en Excel: una celda que empieza por = + - @ o tabulador se prefija con
// un apóstrofo.
func celdasSeguras(fila []string) []string {
	for i, c := range fila {
		if c != "" && strings.ContainsRune("=+-@\t\r", rune(c[0])) {
			fila[i] = "'" + c
		}
	}
	return fila
}

// escribeProblema responde un error de la API en un handler plano (los errores inesperados no salen al cliente).
func escribeProblema(w http.ResponseWriter, s *Svc, err error) {
	problem.Write(w, s.aProblema(err))
}
