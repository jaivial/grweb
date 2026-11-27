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

	"github.com/jaivial/grweb/platform/pkg/bodylimit"
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

// FormularioRespuesta es la respuesta que ve el destinatario.
type FormularioRespuesta struct {
	Estado    string             `json:"estado"`
	Datos     map[string]any     `json:"datos"`
	Archivos  []ArchivoRespuesta `json:"archivos"`
	EnviadoAt *time.Time         `json:"enviadoAt"`
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
type acceso struct {
	Destinatario uuid.UUID
	Atleta       uuid.UUID
	Nombre       string
	CID          uuid.UUID
	Formulario   Formulario
	Respuesta    *FormularioRespuesta
}

// guardado es el resultado de guardar: estado, porcentaje y errores por campo.
type guardado struct {
	Estado     string            `json:"estado"`
	Porcentaje int               `json:"porcentaje"`
	Errores    map[string]string `json:"errores"`
}

// archivoSubido es el archivo que devuelve la subida; el cliente lo incluye luego en datos[campoId].
type archivoSubido struct {
	URL    string `json:"url"`
	Nombre string `json:"nombre"`
	Tamano int64  `json:"tamano"`
	Tipo   string `json:"tipo"`
}

// extensiones son los tipos de archivo que admite una subida (el tipo lo detecta el contenido, no el nombre).
var extensiones = map[string]string{
	"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf",
}

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
				Cerrado:     cerrado(a.Formulario, ahora),
				PuedeEditar: puedeEditar(a, ahora),
			}}, nil
		})

	// Autoguardado (enviar=false) y envío (enviar=true). Con enviar y errores: 422 con los errores por campo (lo válido
	// queda guardado como parcial).
	s.a.Mux.HandleFunc("PUT /api/formularios/{token}", func(w http.ResponseWriter, req *http.Request) {
		ctx := req.Context()
		tok := req.PathValue("token")
		if perr := s.limitaFormulario(ctx, "guardar", tok, 120, 10*time.Minute); perr != nil {
			problem.Write(w, perr)
			return
		}
		var in struct {
			Datos  map[string]any `json:"datos"`
			Enviar bool           `json:"enviar"`
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
		g, perr := s.guardaRespuesta(ctx, a, in.Datos, in.Enviar, "web")
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
		g, perr := s.guardaRespuesta(ctx, a, formularios.LeerFormEmail(a.Formulario.Esquema, req.PostForm), true, "email")
		if perr != nil {
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
	var rEnviado *time.Time
	err := s.a.DB.QueryRow(ctx, `SELECT d.competition_id, d.formulario_id, d.atleta_id, a.nombre, COALESCE(r.estado, ''), r.datos, r.archivos, r.enviado_at
		FROM formulario_destinatarios d
		JOIN atletas a ON a.id = d.atleta_id
		LEFT JOIN formulario_respuestas r ON r.destinatario_id = d.id
		WHERE d.id = $1`, did).Scan(&a.CID, &fid, &a.Atleta, &a.Nombre, &rEstado, &rDatos, &rArchivos, &rEnviado)
	if db.IsNoRows(err) {
		return acceso{}, tokenInvalido()
	}
	if err != nil {
		return acceso{}, s.aProblema(err)
	}
	f, err := leeFormulario(ctx, s.a.DB, a.CID, fid, false)
	if err != nil {
		return acceso{}, s.aProblema(err)
	}
	a.Formulario = f
	if rEstado != "" {
		r := &FormularioRespuesta{Estado: rEstado, Datos: map[string]any{}, Archivos: []ArchivoRespuesta{}, EnviadoAt: rEnviado}
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
// Los archivos solo valen si su url es de este destinatario.
func (s *Svc) guardaRespuesta(ctx context.Context, a acceso, datos map[string]any, enviar bool, origen string) (guardado, *problem.Error) {
	if perr := estadoCerrado(a, time.Now()); perr != nil {
		return guardado{}, perr
	}
	esq := a.Formulario.Esquema
	limpios, errores := formularios.ValidarRespuesta(esq, datos, enviar)
	fid, did := a.Formulario.ID.String(), a.Destinatario.String()
	for _, c := range esq.Campos {
		lista, ok := limpios[c.ID].([]any)
		if c.Tipo != formularios.TipoArchivo || !ok {
			continue
		}
		if !archivosPropios(lista, fid, did) {
			delete(limpios, c.ID)
			errores[c.ID] = "Uno de los archivos no es válido. Vuelve a subirlo."
		}
	}
	_, faltan := formularios.ValidarRespuesta(esq, limpios, true)
	estado := "parcial"
	if (enviar && len(errores) == 0) || (!enviar && a.Respuesta != nil && a.Respuesta.Estado == "completa" && len(faltan) == 0) {
		estado = "completa"
	}
	var enviadoAt *time.Time
	if estado == "completa" && enviar {
		ahora := time.Now()
		enviadoAt = &ahora
	}
	porcentaje := formularios.Porcentaje(esq, limpios)
	datosJSON, err := json.Marshal(limpios)
	if err != nil {
		return guardado{}, s.aProblema(err)
	}
	archivosJSON, err := json.Marshal(archivosDe(esq, limpios))
	if err != nil {
		return guardado{}, s.aProblema(err)
	}
	_, err = s.a.DB.Exec(ctx, `INSERT INTO formulario_respuestas (id, formulario_id, destinatario_id, atleta_id, competition_id, version, datos, archivos, estado, porcentaje, origen, enviado_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (destinatario_id) DO UPDATE SET version = EXCLUDED.version, datos = EXCLUDED.datos, archivos = EXCLUDED.archivos,
			estado = EXCLUDED.estado, porcentaje = EXCLUDED.porcentaje, origen = EXCLUDED.origen,
			enviado_at = COALESCE(EXCLUDED.enviado_at, formulario_respuestas.enviado_at), updated_at = now()`,
		newID(), a.Formulario.ID, a.Destinatario, a.Atleta, a.CID, a.Formulario.Version, datosJSON, archivosJSON, estado, porcentaje, origen, enviadoAt)
	if err != nil {
		return guardado{}, s.aProblema(err)
	}
	s.marcaAbierto(ctx, a.Destinatario)
	return guardado{Estado: estado, Porcentaje: porcentaje, Errores: errores}, nil
}

// subeArchivoFormulario valida el archivo (tipo por contenido, tamaño y número por campo) y lo sube al CDN en
// formularios/{formularioId}/{destinatarioId}/<uuid>.<ext>. Devuelve la url; la respuesta se guarda con el PUT.
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
	usados, err := s.archivosUsados(ctx, a.Destinatario, campo.ID)
	if err != nil {
		return archivoSubido{}, s.aProblema(err)
	}
	if usados >= cfg.MaxArchivos {
		return archivoSubido{}, problem.Unprocessable("LIMITE_ARCHIVOS", fmt.Sprintf("Puedes subir como máximo %d archivo(s) en este campo.", cfg.MaxArchivos))
	}
	st, err := s.storage(ctx, a.CID)
	if err != nil {
		return archivoSubido{}, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido guardar el archivo. Inténtalo en unos minutos.")
	}
	clave := "formularios/" + a.Formulario.ID.String() + "/" + a.Destinatario.String() + "/" + newID().String() + ext
	u, err := st.Put(ctx, clave, mime, data)
	if err != nil {
		s.a.Log.Warn("formularios: subir archivo", "err", err)
		return archivoSubido{}, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido guardar el archivo. Inténtalo en unos minutos.")
	}
	return archivoSubido{URL: u, Nombre: nombreArchivo(fh.Filename), Tamano: int64(len(data)), Tipo: mime}, nil
}

// archivosUsados cuenta los archivos que ya tiene el destinatario en ese campo.
func (s *Svc) archivosUsados(ctx context.Context, did uuid.UUID, campoID string) (int, error) {
	var raw []byte
	err := s.a.DB.QueryRow(ctx, `SELECT archivos FROM formulario_respuestas WHERE destinatario_id = $1`, did).Scan(&raw)
	if db.IsNoRows(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	var lista []ArchivoRespuesta
	if err := json.Unmarshal(raw, &lista); err != nil {
		return 0, err
	}
	n := 0
	for _, x := range lista {
		if x.CampoID == campoID {
			n++
		}
	}
	return n, nil
}

// limitaFormulario cuenta un intento por IP y enlace (el token va en hash, no en claro, dentro de la clave).
func (s *Svc) limitaFormulario(ctx context.Context, accion, tok string, limite int64, ventana time.Duration) *problem.Error {
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

// puedeEditar: se puede guardar, y si ya se envió, el formulario permite editar.
func puedeEditar(a acceso, ahora time.Time) bool {
	if cerrado(a.Formulario, ahora) {
		return false
	}
	return a.Respuesta == nil || a.Respuesta.Estado != "completa" || a.Formulario.Esquema.Ajustes.PermiteEditar
}

// estadoCerrado es el error que corresponde a un enlace que no admite cambios (nil si sí los admite).
func estadoCerrado(a acceso, ahora time.Time) *problem.Error {
	if cerrado(a.Formulario, ahora) {
		return problem.Conflict("FORMULARIO_CERRADO", "Este formulario ya está cerrado.")
	}
	if !puedeEditar(a, ahora) {
		return problem.Conflict("YA_ENVIADO", "Ya has enviado este formulario.")
	}
	return nil
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

// archivosPropios dice si todas las urls cuelgan de la carpeta de este destinatario: la ruta del CDN
// («formularios/<f>/<d>/») o, en el volumen local, el nombre plano («formularios-<f>-<d>-»).
func archivosPropios(lista []any, fid, did string) bool {
	ruta, plano := "formularios/"+fid+"/"+did+"/", "formularios-"+fid+"-"+did+"-"
	for _, it := range lista {
		m, ok := it.(map[string]any)
		if !ok {
			return false
		}
		u, _ := m["url"].(string)
		if !strings.Contains(u, ruta) && !strings.Contains(u, plano) {
			return false
		}
	}
	return true
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
