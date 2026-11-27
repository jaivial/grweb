package athletes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/bodylimit"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/formularios"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// Web pública de los formularios (§5): el enlace personal del destinatario (sin login). El token identifica al
// destinatario; la competición y el formulario salen de él. Las rutas que no son JSON (PUT, email, archivos) van como
// handlers planos para poder responder 303, 409 o 422 con su propio cuerpo.

// FormularioCompeticion es la competición que se muestra en la cabecera del formulario.
type FormularioCompeticion struct {
	Nombre string `json:"nombre"`
	Slug   string `json:"slug"`
}

// FormularioInfo es el formulario tal como lo ve el destinatario.
type FormularioInfo struct {
	Titulo  string              `json:"titulo"`
	Esquema formularios.Esquema `json:"esquema"`
	SoloWeb bool                `json:"soloWeb"`
}

// FormularioAtleta es el atleta del enlace (solo su nombre).
type FormularioAtleta struct {
	Nombre string `json:"nombre"`
}

// FormularioRespuesta es la respuesta que ve el destinatario. actualizadoAt es la versión que el PUT devuelve de vuelta
// para detectar un guardado sobre una respuesta cambiada en otro sitio (M-6).
type FormularioRespuesta struct {
	Estado        string             `json:"estado"`
	Datos         map[string]any     `json:"datos"`
	Archivos      []ArchivoRespuesta `json:"archivos"`
	EnviadoAt     *time.Time         `json:"enviadoAt"`
	ActualizadoAt time.Time          `json:"actualizadoAt"`
}

// FormularioPublico es lo que devuelve GET /api/formularios/{token}.
type FormularioPublico struct {
	Competicion FormularioCompeticion `json:"competicion"`
	Formulario  FormularioInfo        `json:"formulario"`
	Atleta      FormularioAtleta      `json:"atleta"`
	Respuesta   *FormularioRespuesta  `json:"respuesta"`
	Cerrado     bool                  `json:"cerrado"`
	PuedeEditar bool                  `json:"puedeEditar"`
}

// acceso es lo que deja ver y cambiar el enlace: el destinatario, su atleta, su formulario y su respuesta, si la hay.
// Baja marca a un atleta dado de baja en la competición: su enlace responde como un formulario cerrado (M-7).
type acceso struct {
	Destinatario uuid.UUID
	Atleta       uuid.UUID
	Nombre       string
	CID          uuid.UUID
	Baja         bool
	Formulario   Formulario
	Respuesta    *FormularioRespuesta
}

// guardado es el resultado de guardar: estado, porcentaje, errores por campo y la versión guardada (actualizadoAt).
type guardado struct {
	Estado        string            `json:"estado"`
	Porcentaje    int               `json:"porcentaje"`
	Errores       map[string]string `json:"errores"`
	ActualizadoAt time.Time         `json:"actualizadoAt"`
}

// archivoSubido es el archivo que devuelve la subida. El cliente lo incluye luego en datos[campoId] con su id (o su url,
// por compatibilidad): url, nombre, tamaño y tipo los toma el servidor de la fila que creó la subida.
type archivoSubido struct {
	ID     uuid.UUID `json:"id"`
	URL    string    `json:"url"`
	Nombre string    `json:"nombre"`
	Tamano int64     `json:"tamano"`
	Tipo   string    `json:"tipo"`
}

// extensiones son los tipos de archivo que admite una subida (el tipo lo detecta el contenido, no el nombre).
var extensiones = map[string]string{
	"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf",
}

// ventanaSubida: una fila «subiendo» más vieja que esto se da por abandonada (la subida murió) y deja de contar.
const ventanaSubida = 10 * time.Minute

// subidasSimultaneas limita, en este proceso, las subidas de archivos en curso (cada una ocupa red hacia el CDN). Lo que
// no cabe responde 503 SUBIDAS_OCUPADAS al momento. FORMULARIOS_SUBIDAS_CONCURRENTES (por defecto 4, mínimo 1).
var subidasSimultaneas = make(chan struct{}, max(1, config.Int("FORMULARIOS_SUBIDAS_CONCURRENTES", 4)))

func (s *Svc) registerFormulariosPublico() {
	api := s.a.API

	type tokenIn struct {
		Token string `path:"token" maxLength:"200"`
	}
	type publicoOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         FormularioPublico
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-publico", Method: http.MethodGet, Path: "/api/formularios/{token}",
		Summary: "Formulario del enlace personal (marca la apertura la primera vez)", Tags: tagPub},
		func(ctx context.Context, in *tokenIn) (*publicoOut, error) {
			if perr := s.limitaFormulario(ctx, "ver", in.Token, 120, 10*time.Minute); perr != nil {
				return nil, perr
			}
			a, perr := s.accesoFormulario(ctx, in.Token)
			if perr != nil {
				return nil, perr
			}
			s.marcaAbierto(ctx, a.Destinatario)
			c, err := s.comps.ByID(ctx, a.CID)
			if err != nil {
				return nil, err
			}
			ahora := time.Now()
			return &publicoOut{CacheControl: "private, no-store", Body: FormularioPublico{
				Competicion: FormularioCompeticion{Nombre: c.Nombre, Slug: c.Slug},
				Formulario:  FormularioInfo{Titulo: a.Formulario.Esquema.Ajustes.Titulo, Esquema: a.Formulario.Esquema, SoloWeb: a.Formulario.SoloWeb},
				Atleta:      FormularioAtleta{Nombre: a.Nombre},
				Respuesta:   a.Respuesta,
				Cerrado:     a.Baja || cerrado(a.Formulario, ahora),
				PuedeEditar: puedeEditar(a, ahora),
			}}, nil
		})

	// Autoguardado (enviar=false) y envío (enviar=true). Con enviar y errores: 422 con los errores por campo (lo válido
	// queda guardado como parcial). actualizadoAt (opcional) es la versión que el cliente tiene: si ya no coincide, 409.
	s.a.Mux.HandleFunc("PUT /api/formularios/{token}", func(w http.ResponseWriter, req *http.Request) {
		ctx := req.Context()
		tok := req.PathValue("token")
		if perr := s.limitaFormulario(ctx, "guardar", tok, 120, 10*time.Minute); perr != nil {
			problem.Write(w, perr)
			return
		}
		var in struct {
			Datos         map[string]any `json:"datos"`
			Enviar        bool           `json:"enviar"`
			ActualizadoAt *time.Time     `json:"actualizadoAt"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
			problem.Write(w, problem.BadRequest("JSON_NO_VALIDO", "Los datos del formulario no son válidos."))
			return
		}
		a, perr := s.accesoFormulario(ctx, tok)
		if perr != nil {
			problem.Write(w, perr)
			return
		}
		g, perr := s.guardaRespuesta(ctx, a, in.Datos, in.Enviar, "web", in.ActualizadoAt)
		if perr != nil {
			problem.Write(w, perr)
			return
		}
		if in.Enviar && len(g.Errores) > 0 {
			escribeJSON(w, http.StatusUnprocessableEntity, struct {
				Code   string `json:"code"`
				Detail string `json:"detail"`
				guardado
			}{"FALTAN_CAMPOS", "Revisa los campos marcados antes de enviar.", g})
			return
		}
		escribeJSON(w, http.StatusOK, g)
	})

	// Envío desde el cliente de correo: el formulario incrustado (urlencoded, nombres f_<campoId>). Siempre acaba en 303
	// hacia la web: ?enviado=1, ?revisar=1 si faltan obligatorios, o sin parámetro si el enlace ya no admite cambios.
	s.a.Mux.HandleFunc("POST /api/formularios/{token}/email", func(w http.ResponseWriter, req *http.Request) {
		ctx := req.Context()
		tok := req.PathValue("token")
		web := s.webURL + "/formularios/" + url.PathEscape(tok)
		if perr := s.limitaFormulario(ctx, "email", tok, 20, time.Hour); perr != nil {
			problem.Write(w, perr)
			return
		}
		if err := req.ParseForm(); err != nil {
			problem.Write(w, problem.BadRequest("FORMULARIO_NO_VALIDO", "No hemos podido leer el formulario."))
			return
		}
		a, perr := s.accesoFormulario(ctx, tok)
		if perr != nil {
			http.Redirect(w, req, web, http.StatusSeeOther)
			return
		}
		datos := mezclaEmail(a.Respuesta, formularios.LeerFormEmail(a.Formulario.Esquema, req.PostForm))
		// Versión que se leyó al empezar: si la respuesta cambió mientras tanto (web u otra pestaña), no se pisa (M-2).
		var esperado *time.Time
		if a.Respuesta != nil {
			v := a.Respuesta.ActualizadoAt
			esperado = &v
		}
		g, perr := s.guardaRespuesta(ctx, a, datos, true, "email", esperado)
		if perr != nil {
			if perr.Code == codigoRespuestaCambiada {
				http.Redirect(w, req, web+"?revisar=1", http.StatusSeeOther)
				return
			}
			http.Redirect(w, req, web, http.StatusSeeOther)
			return
		}
		if g.Estado == "completa" {
			http.Redirect(w, req, web+"?enviado=1", http.StatusSeeOther)
			return
		}
		http.Redirect(w, req, web+"?revisar=1", http.StatusSeeOther)
	})

	s.a.Mux.HandleFunc("POST /api/formularios/{token}/archivos", func(w http.ResponseWriter, req *http.Request) {
		o, perr := s.subeArchivoFormulario(w, req)
		if perr != nil {
			problem.Write(w, perr)
			return
		}
		escribeJSON(w, http.StatusOK, o)
	})
}

// mezclaEmail parte de lo guardado y pone encima lo que llega por el email: un email solo cambia lo que trae (I-1).
func mezclaEmail(previa *FormularioRespuesta, nuevos map[string]any) map[string]any {
	out := map[string]any{}
	if previa != nil {
		for k, v := range previa.Datos {
			out[k] = v
		}
	}
	for k, v := range nuevos {
		out[k] = v
	}
	return out
}

// accesoFormulario resuelve el enlace: 404 TOKEN_INVALIDO si no es un token válido o su destinatario ya no existe.
func (s *Svc) accesoFormulario(ctx context.Context, tok string) (acceso, *problem.Error) {
	did, ok := formularios.LeerToken(s.autKey, tok)
	if !ok {
		return acceso{}, tokenInvalido()
	}
	a := acceso{Destinatario: did}
	var fid uuid.UUID
	var rEstado string
	var rDatos, rArchivos []byte
	var rEnviado, rActualizado *time.Time
	err := s.a.DB.QueryRow(ctx, `SELECT d.competition_id, d.formulario_id, d.atleta_id, a.nombre, COALESCE(a.estado, '') = 'baja',
		COALESCE(r.estado, ''), r.datos, r.archivos, r.enviado_at, r.updated_at
		FROM formulario_destinatarios d
		JOIN atletas a ON a.id = d.atleta_id
		LEFT JOIN formulario_respuestas r ON r.destinatario_id = d.id
		WHERE d.id = $1`, did).Scan(&a.CID, &fid, &a.Atleta, &a.Nombre, &a.Baja, &rEstado, &rDatos, &rArchivos, &rEnviado, &rActualizado)
	if db.IsNoRows(err) {
		return acceso{}, tokenInvalido()
	}
	if err != nil {
		return acceso{}, s.aProblema(err)
	}
	f, err := leeFormulario(ctx, s.a.DB, a.CID, fid, sinBloqueo)
	if err != nil {
		return acceso{}, s.aProblema(err)
	}
	a.Formulario = f
	if rEstado != "" {
		r := &FormularioRespuesta{Estado: rEstado, Datos: map[string]any{}, Archivos: []ArchivoRespuesta{}, EnviadoAt: rEnviado}
		if rActualizado != nil {
			r.ActualizadoAt = *rActualizado
		}
		if err := json.Unmarshal(rDatos, &r.Datos); err != nil {
			return acceso{}, s.aProblema(err)
		}
		if err := json.Unmarshal(rArchivos, &r.Archivos); err != nil {
			return acceso{}, s.aProblema(err)
		}
		if r.Archivos == nil {
			r.Archivos = []ArchivoRespuesta{}
		}
		a.Respuesta = r
	}
	return a, nil
}

// guardaRespuesta valida y guarda lo que escribe el destinatario (autoguardado si !enviar). La respuesta queda
// «completa» al enviar sin errores, o al autoguardar una respuesta ya completa que sigue cumpliendo los obligatorios.
// Los archivos se resuelven contra la tabla formulario_archivos (resuelveArchivos). esperado, si no es nil, es la
// versión que el cliente tiene: si la respuesta ya cambió, 409 RESPUESTA_CAMBIADA (la comprobación se repite dentro del
// propio upsert, así que dos guardados a la vez no se pisan).
func (s *Svc) guardaRespuesta(ctx context.Context, a acceso, datos map[string]any, enviar bool, origen string, esperado *time.Time) (guardado, *problem.Error) {
	ahora := time.Now()
	var out guardado
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		// El formulario se bloquea (FOR SHARE: los guardados comparten, un cambio del formulario espera) en la misma
		// transacción que el guardado: guardaEdicion (FOR UPDATE) no puede cambiar el esquema entre la validación y el
		// INSERT. La respuesta se valida contra el esquema bloqueado (N-6). Orden de bloqueo: ver modoBloqueo.
		fm, err := leeFormulario(ctx, tx, a.CID, a.Formulario.ID, bloqueoCompartido)
		if err != nil {
			return err
		}
		a.Formulario = fm
		if perr := estadoCerrado(a, ahora); perr != nil {
			return perr
		}
		if esperado != nil && (a.Respuesta == nil || !a.Respuesta.ActualizadoAt.Equal(*esperado)) {
			return respuestaCambiada()
		}
		esq := a.Formulario.Esquema
		resueltos, errArchivos, err := s.resuelveArchivos(ctx, tx, a, datos)
		if err != nil {
			return err
		}
		limpios, errores := formularios.ValidarRespuesta(esq, resueltos, enviar)
		for campo, msg := range errArchivos {
			errores[campo] = msg
			delete(limpios, campo)
		}
		_, faltan := formularios.ValidarRespuesta(esq, limpios, true)
		estado := "parcial"
		if (enviar && len(errores) == 0) || (!enviar && a.Respuesta != nil && a.Respuesta.Estado == "completa" && len(faltan) == 0) {
			estado = "completa"
		}
		var enviadoAt *time.Time
		if estado == "completa" && enviar {
			enviadoAt = &ahora
		}
		porcentaje := formularios.Porcentaje(esq, limpios)
		datosJSON, err := json.Marshal(limpios)
		if err != nil {
			return err
		}
		archivosJSON, err := json.Marshal(archivosDe(esq, limpios))
		if err != nil {
			return err
		}
		// Sin esperado (primer guardado) el conflicto no se actualiza: si ya hay respuesta, no devuelve fila. Con esperado,
		// la actualización exige la misma versión. Las dos ramas dan RESPUESTA_CAMBIADA (M-3, M-6).
		var actualizado time.Time
		err = tx.QueryRow(ctx, `INSERT INTO formulario_respuestas (id, formulario_id, destinatario_id, atleta_id, competition_id, version, datos, archivos, estado, porcentaje, origen, enviado_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			ON CONFLICT (destinatario_id) DO UPDATE SET version = EXCLUDED.version, datos = EXCLUDED.datos, archivos = EXCLUDED.archivos,
				estado = EXCLUDED.estado, porcentaje = EXCLUDED.porcentaje, origen = EXCLUDED.origen,
				enviado_at = COALESCE(EXCLUDED.enviado_at, formulario_respuestas.enviado_at), updated_at = now()
			WHERE $13::timestamptz IS NOT NULL AND formulario_respuestas.updated_at = $13::timestamptz
			RETURNING updated_at`,
			newID(), a.Formulario.ID, a.Destinatario, a.Atleta, a.CID, a.Formulario.Version, datosJSON, archivosJSON, estado, porcentaje, origen, enviadoAt, esperado).Scan(&actualizado)
		if db.IsNoRows(err) {
			return respuestaCambiada()
		}
		if err != nil {
			return err
		}
		out = guardado{Estado: estado, Porcentaje: porcentaje, Errores: errores, ActualizadoAt: actualizado}
		return nil
	})
	if err != nil {
		return guardado{}, s.aProblema(err)
	}
	s.marcaAbierto(ctx, a.Destinatario)
	return out, nil
}

// resuelveArchivos sustituye, en cada campo de archivo, lo que manda el cliente por los archivos que este destinatario
// subió de verdad a ese campo. url, nombre, tamaño y tipo salen de la fila; el cliente solo aporta el id (o la url,
// por compatibilidad). Un campo con algún elemento ajeno o desconocido se quita y recibe un error; el resto no cambia.
func (s *Svc) resuelveArchivos(ctx context.Context, q consulta, a acceso, datos map[string]any) (map[string]any, map[string]string, error) {
	out := make(map[string]any, len(datos))
	for k, v := range datos {
		out[k] = v
	}
	errores := map[string]string{}
	for _, c := range a.Formulario.Esquema.Campos {
		if c.Tipo != formularios.TipoArchivo {
			continue
		}
		lista, ok := datos[c.ID].([]any)
		if !ok {
			continue
		}
		resueltos, valido, err := s.archivosDelCampo(ctx, q, a.Destinatario, c.ID, lista)
		if err != nil {
			return nil, nil, err
		}
		if !valido {
			delete(out, c.ID)
			errores[c.ID] = "Uno de los archivos no es válido. Vuelve a subirlo."
			continue
		}
		out[c.ID] = resueltos
	}
	return out, errores, nil
}

// archivosDelCampo devuelve la forma guardada de los archivos de un campo. valido=false si algún elemento no es un
// archivo ya subido («ok») por este destinatario a este campo, o si aparece dos veces.
func (s *Svc) archivosDelCampo(ctx context.Context, q consulta, did uuid.UUID, campo string, lista []any) ([]any, bool, error) {
	if len(lista) == 0 {
		return []any{}, true, nil
	}
	type referencia struct {
		id  uuid.UUID
		url string
		por string // "id" o "url"
	}
	refs := make([]referencia, 0, len(lista))
	ids := []uuid.UUID{}
	urls := []string{}
	for _, it := range lista {
		m, ok := it.(map[string]any)
		if !ok {
			return nil, false, nil
		}
		if sid, ok := m["id"].(string); ok && sid != "" {
			id, err := uuid.Parse(sid)
			if err != nil {
				return nil, false, nil
			}
			refs = append(refs, referencia{id: id, por: "id"})
			ids = append(ids, id)
			continue
		}
		if u, ok := m["url"].(string); ok && u != "" {
			refs = append(refs, referencia{url: u, por: "url"})
			urls = append(urls, u)
			continue
		}
		return nil, false, nil
	}
	rows, err := q.Query(ctx, `SELECT id, url, nombre, tamano, tipo FROM formulario_archivos
		WHERE destinatario_id = $1 AND campo_id = $2 AND estado = 'ok' AND (id = ANY($3::uuid[]) OR url = ANY($4::text[]))`, did, campo, ids, urls)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	porID := map[uuid.UUID]map[string]any{}
	porURL := map[string]map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var u, nombre, tipo string
		var tamano int64
		if err := rows.Scan(&id, &u, &nombre, &tamano, &tipo); err != nil {
			return nil, false, err
		}
		item := map[string]any{"id": id.String(), "url": u, "nombre": nombre, "tamano": float64(tamano), "tipo": tipo}
		porID[id] = item
		porURL[u] = item
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	out := make([]any, 0, len(refs))
	vistos := map[uuid.UUID]bool{}
	for _, r := range refs {
		var item map[string]any
		if r.por == "id" {
			item = porID[r.id]
		} else {
			item = porURL[r.url]
		}
		if item == nil {
			return nil, false, nil
		}
		id, _ := uuid.Parse(item["id"].(string))
		if vistos[id] {
			return nil, false, nil
		}
		vistos[id] = true
		out = append(out, item)
	}
	return out, true, nil
}

// subeArchivoFormulario valida el archivo (tipo por contenido, tamaño y número por campo) y lo sube al CDN en
// formularios/{formularioId}/{destinatarioId}/<uuid>.<ext>. Tres pasos, sin tener una transacción abierta durante la subida:
//  1. transacción corta: candado por (destinatario, campo), cuotas y una fila «subiendo» (url vacía);
//  2. subida al CDN fuera de cualquier transacción (si falla, la fila se borra);
//  3. la fila pasa a «ok» con su url. Solo lo «ok» cuenta en la respuesta, que se guarda con el PUT.
//
// Un semáforo de proceso (subidasSimultaneas) acota las subidas en curso: si no hay plaza, 503 SUBIDAS_OCUPADAS.
func (s *Svc) subeArchivoFormulario(w http.ResponseWriter, req *http.Request) (archivoSubido, *problem.Error) {
	ctx := req.Context()
	tok := req.PathValue("token")
	if perr := s.limitaFormulario(ctx, "archivo", tok, 30, time.Hour); perr != nil {
		return archivoSubido{}, perr
	}
	a, perr := s.accesoFormulario(ctx, tok)
	if perr != nil {
		return archivoSubido{}, perr
	}
	if perr := estadoCerrado(a, time.Now()); perr != nil {
		return archivoSubido{}, perr
	}
	// Plaza en el semáforo de subidas antes de leer el cuerpo: el archivo no llega a memoria sin plaza. Si no hay ninguna
	// libre, 503 al momento. La plaza se libera al salir de la función, en cualquier camino.
	select {
	case subidasSimultaneas <- struct{}{}:
		defer func() { <-subidasSimultaneas }()
	default:
		return archivoSubido{}, subidasOcupadas()
	}
	req.Body = http.MaxBytesReader(w, req.Body, bodylimit.Archivo)
	if err := req.ParseMultipartForm(bodylimit.Archivo); err != nil {
		var mb *http.MaxBytesError
		if errors.As(err, &mb) {
			return archivoSubido{}, problem.New(http.StatusRequestEntityTooLarge, "ARCHIVO_GRANDE", "El archivo supera el máximo permitido.")
		}
		return archivoSubido{}, problem.BadRequest("ARCHIVO_NO_VALIDO", "No hemos podido leer el archivo.")
	}
	if req.MultipartForm != nil {
		defer req.MultipartForm.RemoveAll()
	}
	campo, ok := buscaCampo(a.Formulario.Esquema, req.FormValue("campoId"))
	if !ok || campo.Tipo != formularios.TipoArchivo || campo.Archivo == nil {
		return archivoSubido{}, problem.Unprocessable("CAMPO_NO_VALIDO", "El campo de archivo no existe en este formulario.")
	}
	f, fh, err := req.FormFile("archivo")
	if err != nil {
		return archivoSubido{}, problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta un archivo en el campo «archivo».")
	}
	defer f.Close()
	cfg := campo.Archivo
	maximo := int64(cfg.MaxMb) << 20
	grande := problem.Unprocessable("ARCHIVO_GRANDE", fmt.Sprintf("El archivo supera el máximo de %d MB.", cfg.MaxMb))
	if fh.Size > maximo {
		return archivoSubido{}, grande
	}
	data, err := io.ReadAll(io.LimitReader(f, maximo+1))
	if err != nil {
		return archivoSubido{}, s.aProblema(err)
	}
	if int64(len(data)) > maximo {
		return archivoSubido{}, grande
	}
	mime := http.DetectContentType(data)
	ext, ok := extensiones[mime]
	if !ok || !mimePermitido(mime, cfg.Tipos) {
		return archivoSubido{}, problem.Unprocessable("TIPO_NO_PERMITIDO", "Este tipo de archivo no está permitido en este campo.")
	}
	st, err := s.storage(ctx, a.CID)
	if err != nil {
		return archivoSubido{}, archivoNoGuardado()
	}
	// Paso 1 (transacción corta): candado, cuotas y la fila reservada. Se confirma antes de subir.
	id := newID()
	nombre := nombreArchivo(fh.Filename)
	clave := "formularios/" + a.Formulario.ID.String() + "/" + a.Destinatario.String() + "/" + newID().String() + ext
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, a.Destinatario.String()+"|"+campo.ID); err != nil {
			return err
		}
		referenciados, enCurso, sueltas, err := contaArchivos(ctx, tx, a.Destinatario, campo.ID)
		if err != nil {
			return err
		}
		if referenciados+enCurso >= cfg.MaxArchivos {
			return problem.Unprocessable("LIMITE_ARCHIVOS", fmt.Sprintf("Puedes subir como máximo %d archivo(s) en este campo.", cfg.MaxArchivos))
		}
		if sueltas+enCurso >= cfg.MaxArchivos*5 {
			return problem.Unprocessable("DEMASIADAS_SUBIDAS", "Has subido demasiados archivos en este campo sin guardarlos. Revisa el formulario o inténtalo de nuevo en 24 horas.")
		}
		_, err = tx.Exec(ctx, `INSERT INTO formulario_archivos (id, destinatario_id, campo_id, url, nombre, tamano, tipo, estado)
			VALUES ($1, $2, $3, '', $4, $5, $6, 'subiendo')`, id, a.Destinatario, campo.ID, nombre, int64(len(data)), mime)
		return err
	})
	if err != nil {
		return archivoSubido{}, s.aProblema(err)
	}
	// Paso 2 (sin transacción): la subida al CDN puede tardar. Si falla, la fila reservada se borra para liberar la plaza.
	u, err := st.Put(ctx, clave, mime, data)
	if err != nil {
		s.a.Log.Warn("formularios: subir archivo", "err", err)
		s.descartaSubida(ctx, id)
		return archivoSubido{}, archivoNoGuardado()
	}
	// Paso 3: la fila pasa a «ok» con su url; solo entonces la respuesta puede referenciarla.
	tag, err := s.a.DB.Exec(context.WithoutCancel(ctx), `UPDATE formulario_archivos SET url = $2, estado = 'ok' WHERE id = $1 AND estado = 'subiendo'`, id, u)
	if err != nil {
		return archivoSubido{}, s.aProblema(err)
	}
	if tag.RowsAffected() == 0 {
		// La fila desapareció mientras se subía (p. ej. el destinatario se borró): el objeto del CDN queda huérfano.
		return archivoSubido{}, archivoNoGuardado()
	}
	return archivoSubido{ID: id, URL: u, Nombre: nombre, Tamano: int64(len(data)), Tipo: mime}, nil
}

// descartaSubida borra la fila reservada de una subida que no llegó al CDN. Usa un contexto sin cancelación: si el
// cliente cortó la petición, la limpieza debe ejecutarse igual.
func (s *Svc) descartaSubida(ctx context.Context, id uuid.UUID) {
	if _, err := s.a.DB.Exec(context.WithoutCancel(ctx), `DELETE FROM formulario_archivos WHERE id = $1 AND estado = 'subiendo'`, id); err != nil {
		s.a.Log.Warn("formularios: descartar subida", "err", err)
	}
}

// subidasOcupadas: el semáforo de subidas está lleno.
func subidasOcupadas() *problem.Error {
	return problem.New(http.StatusServiceUnavailable, "SUBIDAS_OCUPADAS", "Hay muchas subidas a la vez. Inténtalo en unos segundos.")
}

// contaArchivos devuelve, para un destinatario y un campo, tres cuentas de la subida de archivos:
//   - referenciados: archivos «ok» que la respuesta guardada tiene ahora mismo en ese campo (su url está en la columna
//     archivos). Quitar un archivo y guardar libera su plaza.
//   - enCurso: subidas reservadas («subiendo») de los últimos ventanaSubida. Ocupan plaza mientras se suben: sin esto,
//     dos subidas a la vez superarían maxArchivos.
//   - sueltas: subidas «ok» de las últimas 24 horas que la respuesta guardada no referencia (subidas sin guardar). No
//     cuentan para maxArchivos; solo acotan el abuso (maxArchivos*5 por 24 horas).
func contaArchivos(ctx context.Context, tx pgx.Tx, did uuid.UUID, campo string) (referenciados, enCurso, sueltas int, err error) {
	err = tx.QueryRow(ctx, `WITH ref AS (
			SELECT x ->> 'url' AS url FROM formulario_respuestas r CROSS JOIN LATERAL jsonb_array_elements(r.archivos) AS x
			WHERE r.destinatario_id = $1 AND x ->> 'campoId' = $2)
		SELECT
			(SELECT count(*)::int FROM formulario_archivos f WHERE f.destinatario_id = $1 AND f.campo_id = $2 AND f.estado = 'ok'
				AND EXISTS (SELECT 1 FROM ref WHERE ref.url = f.url)),
			(SELECT count(*)::int FROM formulario_archivos f WHERE f.destinatario_id = $1 AND f.campo_id = $2 AND f.estado = 'subiendo'
				AND f.created_at > now() - make_interval(secs => $3)),
			(SELECT count(*)::int FROM formulario_archivos f WHERE f.destinatario_id = $1 AND f.campo_id = $2 AND f.estado = 'ok'
				AND f.created_at > now() - interval '24 hours'
				AND NOT EXISTS (SELECT 1 FROM ref WHERE ref.url = f.url))`, did, campo, ventanaSubida.Seconds()).Scan(&referenciados, &enCurso, &sueltas)
	return referenciados, enCurso, sueltas, err
}

// limitaFormulario cuenta un intento por IP y enlace (el token va en hash, no en claro, dentro de la clave). Un token con
// otra forma se rechaza antes de contar: así los tokens inventados no crean claves en Redis.
func (s *Svc) limitaFormulario(ctx context.Context, accion, tok string, limite int64, ventana time.Duration) *problem.Error {
	if !formularios.FormaValida(tok) {
		return tokenInvalido()
	}
	clave := s.a.Keys.Of("rl", "formulario", accion, httpx.ClientIPFrom(ctx), hashToken(tok)[:16])
	if lim, _ := ratelimit.Allow(ctx, s.a.Redis, clave, limite, ventana); !lim.Allowed {
		return problem.TooMany("Has hecho demasiadas peticiones seguidas. Espera un rato antes de intentarlo otra vez.")
	}
	return nil
}

// marcaAbierto registra la primera apertura del enlace (no falla la petición si no se puede).
func (s *Svc) marcaAbierto(ctx context.Context, did uuid.UUID) {
	if _, err := s.a.DB.Exec(ctx, `UPDATE formulario_destinatarios SET abierto_at = now() WHERE id = $1 AND abierto_at IS NULL`, did); err != nil {
		s.a.Log.Warn("formularios: marcar apertura", "err", err)
	}
}

// aProblema convierte un error interno en el error de la API (sin filtrar detalles al cliente).
func (s *Svc) aProblema(err error) *problem.Error {
	var pe *problem.Error
	if errors.As(err, &pe) {
		return pe
	}
	s.a.Log.Error("formularios", "err", err)
	return problem.Internal()
}

// cerrado: el formulario no admite respuestas (no está activo o ha pasado su fecha de cierre).
func cerrado(f Formulario, ahora time.Time) bool {
	return f.Estado != "activo" || (f.Esquema.Ajustes.CierreAt != nil && !ahora.Before(*f.Esquema.Ajustes.CierreAt))
}

// puedeEditar: se puede guardar, y si ya se envió, el formulario permite editar. Un atleta dado de baja no puede.
func puedeEditar(a acceso, ahora time.Time) bool {
	if a.Baja || cerrado(a.Formulario, ahora) {
		return false
	}
	return a.Respuesta == nil || a.Respuesta.Estado != "completa" || a.Formulario.Esquema.Ajustes.PermiteEditar
}

// estadoCerrado es el error que corresponde a un enlace que no admite cambios (nil si sí los admite).
func estadoCerrado(a acceso, ahora time.Time) *problem.Error {
	if a.Baja || cerrado(a.Formulario, ahora) {
		return problem.Conflict("FORMULARIO_CERRADO", "Este formulario ya está cerrado.")
	}
	if !puedeEditar(a, ahora) {
		return problem.Conflict("YA_ENVIADO", "Ya has enviado este formulario.")
	}
	return nil
}

// codigoRespuestaCambiada es el código de 409 cuando la respuesta guardada ya no es la que el cliente tiene.
const codigoRespuestaCambiada = "RESPUESTA_CAMBIADA"

func respuestaCambiada() *problem.Error {
	return problem.Conflict(codigoRespuestaCambiada, "Tus respuestas se han cambiado en otra pestaña o dispositivo. Recarga el formulario para ver la última versión.")
}

func archivoNoGuardado() *problem.Error {
	return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido guardar el archivo. Inténtalo en unos minutos.")
}

// archivosDe aplana los archivos de los campos en la forma de la columna «archivos» (nunca nil).
func archivosDe(e formularios.Esquema, limpios map[string]any) []ArchivoRespuesta {
	out := []ArchivoRespuesta{}
	for _, c := range e.Campos {
		lista, ok := limpios[c.ID].([]any)
		if c.Tipo != formularios.TipoArchivo || !ok {
			continue
		}
		for _, it := range lista {
			m, ok := it.(map[string]any)
			if !ok {
				continue
			}
			u, _ := m["url"].(string)
			n, _ := m["nombre"].(string)
			t, _ := m["tipo"].(string)
			tam, _ := m["tamano"].(float64)
			out = append(out, ArchivoRespuesta{CampoID: c.ID, URL: u, Nombre: n, Tamano: tam, Tipo: t})
		}
	}
	return out
}

func buscaCampo(e formularios.Esquema, id string) (formularios.Campo, bool) {
	for _, c := range e.Campos {
		if c.ID == id {
			return c, true
		}
	}
	return formularios.Campo{}, false
}

// mimePermitido: el tipo detectado está en la lista del campo (exacto o con comodín «image/*»).
func mimePermitido(mime string, tipos []string) bool {
	for _, t := range tipos {
		if t == mime || (strings.HasSuffix(t, "/*") && strings.HasPrefix(mime, strings.TrimSuffix(t, "*"))) {
			return true
		}
	}
	return false
}

// nombreArchivo deja solo el nombre base, sin controles, de hasta 120 caracteres.
func nombreArchivo(n string) string {
	n = path.Base(strings.ReplaceAll(n, `\`, "/"))
	n = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, n)
	n = truncaRunas(strings.TrimSpace(n), 120)
	if n == "" || n == "." || n == "/" {
		return "archivo"
	}
	return n
}

// escribeJSON responde JSON sin caché (datos personales de un enlace).
func escribeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
