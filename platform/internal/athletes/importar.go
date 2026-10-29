package athletes

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/unicode/norm"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Campo is a target field of the import mapping.
type Campo struct {
	Clave       string `json:"clave"`
	Etiqueta    string `json:"etiqueta"`
	Obligatorio bool   `json:"obligatorio"`
}

// Campos of an athlete the AEP list can fill («nombreCompleto» splits into first name and surnames).
var Campos = []Campo{
	{"licencia", "Licencia", true}, {"nombre", "Nombre", false}, {"apellidos", "Apellidos", false}, {"nombreCompleto", "Nombre completo", false},
	{"sexo", "Sexo", true}, {"fechaNacimiento", "Fecha de nacimiento", false}, {"categoria", "Categoría de peso", true}, {"division", "División", false},
	{"club", "Club", false}, {"ciudad", "Ciudad", false}, {"email", "Email", false}, {"telefono", "Teléfono", false},
	{"estado", "Estado (confirmado, reserva, baja)", false}, {"ordenReserva", "Orden en la reserva", false},
}

// sinonimos of normalised headers for the automatic mapping.
var sinonimos = map[string][]string{
	"licencia":        {"licencia", "lic", "nlicencia", "numlicencia", "licenciaaep", "license"},
	"nombre":          {"nombre", "name", "firstname"},
	"apellidos":       {"apellidos", "apellido", "apellido1", "surname", "lastname"},
	"nombreCompleto":  {"atleta", "nombrecompleto", "nombreyapellidos", "deportista", "fullname"},
	"sexo":            {"sexo", "genero", "sex", "gender"},
	"fechaNacimiento": {"fechanacimiento", "fechadenacimiento", "nacimiento", "fnac", "fechanac", "birthdate", "dob"},
	"categoria":       {"categoria", "categoriapeso", "categoriadepeso", "peso", "clase", "weightclass"},
	"division":        {"division", "categoriaedad", "categoriadeedad", "edad", "agedivision"},
	"club":            {"club", "equipo", "team"},
	"ciudad":          {"ciudad", "localidad", "poblacion", "city"},
	"email":           {"email", "correo", "mail", "correoelectronico", "e-mail"},
	"telefono":        {"telefono", "movil", "tel", "phone", "telefonomovil"},
	"estado":          {"estado", "situacion", "status", "estadoinscripcion"},
	"ordenReserva":    {"ordenreserva", "reserva", "posicion", "posicionreserva", "orden"},
}

func normHeader(h string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(strings.ToLower(h)) {
		if unicode.IsLetter(r) && !unicode.Is(unicode.Mn, r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func sugerirMapeo(cols []string) map[string]string {
	m := map[string]string{}
	for _, c := range cols {
		n := normHeader(c)
		for campo, alias := range sinonimos {
			if _, done := m[campo]; done {
				continue
			}
			for _, a := range alias {
				if n == a {
					m[campo] = c
				}
			}
		}
	}
	if _, ok := m["nombre"]; ok {
		delete(m, "nombreCompleto")
	}
	return m
}

// leerTabla reads the first sheet of an .xlsx or a .csv (; or , separated, UTF-8 or Windows-1252).
func leerTabla(name string, data []byte) ([]string, [][]string, error) {
	var rows [][]string
	if strings.HasSuffix(strings.ToLower(name), ".xlsx") || bytes.HasPrefix(data, []byte("PK\x03\x04")) {
		f, err := excelize.OpenReader(bytes.NewReader(data))
		if err != nil {
			return nil, nil, fmt.Errorf("no se pudo abrir el Excel")
		}
		defer f.Close()
		sheets := f.GetSheetList()
		if len(sheets) == 0 {
			return nil, nil, fmt.Errorf("el Excel no tiene hojas")
		}
		if rows, err = f.GetRows(sheets[0]); err != nil {
			return nil, nil, fmt.Errorf("no se pudo leer la hoja")
		}
	} else {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		if !utf8.Valid(data) {
			if d, err := charmap.Windows1252.NewDecoder().Bytes(data); err == nil {
				data = d
			}
		}
		first, _, _ := bytes.Cut(data, []byte("\n"))
		r := csv.NewReader(bytes.NewReader(data))
		r.FieldsPerRecord = -1
		r.LazyQuotes = true
		if bytes.Count(first, []byte(";")) > bytes.Count(first, []byte(",")) {
			r.Comma = ';'
		}
		var err error
		if rows, err = r.ReadAll(); err != nil {
			return nil, nil, fmt.Errorf("el CSV no es válido")
		}
	}
	// Header: first row with at least two non-empty cells.
	start := -1
	for i, r := range rows {
		n := 0
		for _, c := range r {
			if strings.TrimSpace(c) != "" {
				n++
			}
		}
		if n >= 2 {
			start = i
			break
		}
	}
	if start < 0 {
		return nil, nil, fmt.Errorf("no hemos encontrado la fila de cabecera")
	}
	head := make([]string, 0, len(rows[start]))
	for _, c := range rows[start] {
		head = append(head, strings.TrimSpace(c))
	}
	for len(head) > 0 && head[len(head)-1] == "" {
		head = head[:len(head)-1]
	}
	for i, h := range head {
		if h == "" {
			head[i] = "Columna " + strconv.Itoa(i+1)
		}
	}
	body := [][]string{}
	for _, r := range rows[start+1:] {
		empty := true
		for _, c := range r {
			if strings.TrimSpace(c) != "" {
				empty = false
			}
		}
		if !empty {
			body = append(body, r)
		}
	}
	if len(body) > 5000 {
		return nil, nil, fmt.Errorf("el archivo tiene más de 5000 filas")
	}
	return head, body, nil
}

// Importacion is the state of an import (Figma «Atletas · importar acta AEP»).
type Importacion struct {
	ID       uuid.UUID         `json:"id" db:"id"`
	Archivo  string            `json:"archivo" db:"archivo"`
	Estado   string            `json:"estado" db:"estado" enum:"subida,revisada,importando,confirmada,fallida"`
	Columnas []string          `json:"columnas" db:"columnas"`
	Mapeo    map[string]string `json:"mapeo" db:"mapeo" doc:"campo → columna del archivo"`
	Resumen  Resumen           `json:"resumen" db:"resumen"`
	Total    int               `json:"total" db:"total"`
	Hechas   int               `json:"hechas" db:"hechas"`
	Muestra  [][]string        `json:"muestra" db:"-" doc:"Primeras filas (vista previa del mapeo)"`
	Campos   []Campo           `json:"campos" db:"-"`
	Filas    []FilaDiff        `json:"filas" db:"-" doc:"Filas con cambios o errores (las iguales se omiten)"`
}

// Resumen counts the diff.
type Resumen struct {
	Nuevos     int        `json:"nuevos"`
	Cambios    int        `json:"cambios"`
	Bajas      int        `json:"bajas"`
	Errores    int        `json:"errores"`
	Iguales    int        `json:"iguales"`
	ListaBajas []BajaDiff `json:"listaBajas"`
}

// BajaDiff is an athlete that is no longer in the list.
type BajaDiff struct {
	AtletaID uuid.UUID `json:"atletaId"`
	Nombre   string    `json:"nombre"`
	Licencia string    `json:"licencia"`
}

// FilaDiff is the review of a row.
type FilaDiff struct {
	Fila     int      `json:"fila" db:"fila"`
	Nombre   string   `json:"nombre" db:"-"`
	Licencia string   `json:"licencia" db:"-"`
	Accion   string   `json:"accion" db:"accion" enum:"crear,actualizar,igual,error"`
	Cambios  []string `json:"cambios" db:"cambios"`
	Error    string   `json:"error" db:"error"`
}

// parsed is a row read with the mapping.
type parsed struct {
	DatosIn
	OrdenReserva *int
}

func valor(datos map[string]string, mapeo map[string]string, campo string) string {
	if col, ok := mapeo[campo]; ok {
		return strings.TrimSpace(datos[col])
	}
	return ""
}

func excelFecha(s string) (time.Time, bool) {
	if t, ok := ParseFecha(s); ok {
		return t, true
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil && f > 3000 && f < 80000 {
		if t, err := excelize.ExcelDateToTime(f, false); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// leerFila maps a row and validates it against the competition year (division from the birth date).
func leerFila(datos, mapeo map[string]string, year int) (parsed, string) {
	var p parsed
	p.Licencia = NormLicencia(valor(datos, mapeo, "licencia"))
	p.Nombre, p.Apellidos = valor(datos, mapeo, "nombre"), valor(datos, mapeo, "apellidos")
	if full := valor(datos, mapeo, "nombreCompleto"); p.Nombre == "" && full != "" {
		p.Nombre, p.Apellidos, _ = strings.Cut(full, " ")
	}
	p.Sexo = NormSexo(valor(datos, mapeo, "sexo"))
	p.Categoria = NormCategoria(valor(datos, mapeo, "categoria"))
	p.Division = NormDivision(valor(datos, mapeo, "division"))
	p.Club, p.Ciudad = valor(datos, mapeo, "club"), valor(datos, mapeo, "ciudad")
	p.Email = strings.ToLower(valor(datos, mapeo, "email"))
	p.Telefono = valor(datos, mapeo, "telefono")
	if f := valor(datos, mapeo, "fechaNacimiento"); f != "" {
		t, ok := excelFecha(f)
		if !ok {
			return p, "Fecha de nacimiento «" + f + "» no válida"
		}
		p.FechaNacimiento = t.Format("2006-01-02")
		if p.Division == "" {
			p.Division = DivisionPorEdad(t, year)
		}
	}
	switch e := strings.ToLower(valor(datos, mapeo, "estado")); {
	case e == "" || strings.HasPrefix(e, "conf") || strings.HasPrefix(e, "admit") || e == "si" || e == "sí" || strings.HasPrefix(e, "inscri"):
		p.Estado = "confirmado"
	case strings.HasPrefix(e, "res") || strings.Contains(e, "espera"):
		p.Estado = "reserva"
	case strings.HasPrefix(e, "baja") || strings.HasPrefix(e, "anul") || strings.HasPrefix(e, "cancel"):
		p.Estado = "baja"
	default:
		return p, "Estado «" + e + "» desconocido"
	}
	if o := valor(datos, mapeo, "ordenReserva"); o != "" && p.Estado == "reserva" {
		if n, err := strconv.Atoi(o); err == nil {
			p.OrdenReserva = &n
		}
	}
	switch {
	case p.Licencia == "":
		return p, "Falta la licencia"
	case p.Nombre == "":
		return p, "Falta el nombre"
	case p.Sexo == "":
		return p, "Sexo no reconocido"
	case p.FechaNacimiento == "" && p.Division == "":
		return p, "Falta fecha de nacimiento"
	}
	if p.Division == "" {
		p.Division = "open"
	}
	if p.Email != "" && !strings.Contains(p.Email, "@") {
		return p, "Email «" + p.Email + "» no válido"
	}
	if err := ValidarCategoria(p.Sexo, p.Categoria, p.Division); err != nil {
		return p, "Categoría: " + err.Error()
	}
	return p, ""
}

func diffCambios(prev row, p parsed) []string {
	var c []string
	add := func(campo, a, z string) {
		if a != z && z != "" {
			c = append(c, campo+": "+orDash(a)+" → "+z)
		}
	}
	add("Nombre", prev.nombreCompleto(), strings.TrimSpace(p.Nombre+" "+p.Apellidos))
	add("Sexo", prev.Sexo, p.Sexo)
	add("Categoría", prev.Categoria, p.Categoria)
	add("División", DivisionNombre(prev.Division), DivisionNombre(p.Division))
	add("Club", prev.Club, p.Club)
	add("Estado", prev.Estado, p.Estado)
	if p.FechaNacimiento != "" && (prev.FechaNacimiento == nil || prev.FechaNacimiento.Format("2006-01-02") != p.FechaNacimiento) {
		c = append(c, "Fecha de nacimiento")
	}
	if prev.Email == nil && p.Email != "" || prev.Email != nil && p.Email != "" && *prev.Email != p.Email {
		c = append(c, "Email")
	}
	return c
}

const selImp = `SELECT id, archivo, estado, columnas, mapeo, resumen, total, hechas FROM importaciones`

func (s *Svc) getImport(ctx context.Context, q querier, cid, id uuid.UUID) (Importacion, error) {
	rows, err := q.Query(ctx, selImp+` WHERE competition_id = $1 AND id = $2`, cid, id)
	if err != nil {
		return Importacion{}, err
	}
	imp, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Importacion])
	if err != nil {
		return imp, problem.NotFound("Importación no encontrada.")
	}
	imp.Campos = Campos
	if imp.Resumen.ListaBajas == nil {
		imp.Resumen.ListaBajas = []BajaDiff{}
	}
	return imp, nil
}

func (s *Svc) registerImport() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/atletas/importaciones"

	type upIn struct {
		CID     uuid.UUID `path:"cid"`
		RawBody multipart.Form
	}
	type impOut struct{ Body Importacion }
	huma.Register(api, huma.Operation{OperationID: "atletas-import-upload", Method: http.MethodPost, Path: base, Summary: "Subir el acta de la AEP (.xlsx o .csv, máx. 5 MB)", Tags: tagAdmin, Security: bearer,
		DefaultStatus: http.StatusCreated, MaxBodyBytes: maxImport, BodyReadTimeout: time.Minute},
		func(ctx context.Context, in *upIn) (*impOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			files := in.RawBody.File["file"]
			if len(files) != 1 {
				return nil, problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta el acta en el campo «file».")
			}
			if files[0].Size > 5<<20 {
				return nil, problem.Unprocessable("ARCHIVO_GRANDE", "El acta supera los 5 MB.")
			}
			f, err := files[0].Open()
			if err != nil {
				return nil, err
			}
			data, err := io.ReadAll(f)
			f.Close()
			if err != nil {
				return nil, err
			}
			head, body, err := leerTabla(files[0].Filename, data)
			if err != nil {
				return nil, problem.Unprocessable("ARCHIVO_INVALIDO", "No hemos podido leer el acta: "+err.Error()+".")
			}
			if len(body) == 0 {
				return nil, problem.Unprocessable("ARCHIVO_VACIO", "El acta no tiene filas de atletas.")
			}
			id := newID()
			mapeo := sugerirMapeo(head)
			cols, _ := json.Marshal(head)
			mp, _ := json.Marshal(mapeo)
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO importaciones (id, competition_id, archivo, columnas, mapeo, total, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
					id, in.CID, files[0].Filename, cols, mp, len(body), actor(ctx)); err != nil {
					return err
				}
				batch := &pgx.Batch{}
				for i, r := range body {
					d := map[string]string{}
					for j, h := range head {
						if j < len(r) {
							d[h] = strings.TrimSpace(r[j])
						}
					}
					b, _ := json.Marshal(d)
					batch.Queue(`INSERT INTO importacion_filas (importacion_id, fila, datos) VALUES ($1,$2,$3)`, id, i+2, b)
				}
				return tx.SendBatch(ctx, batch).Close()
			})
			if err != nil {
				return nil, err
			}
			imp, err := s.getImport(ctx, s.a.DB, in.CID, id)
			if err != nil {
				return nil, err
			}
			for i := 0; i < 3 && i < len(body); i++ {
				imp.Muestra = append(imp.Muestra, body[i])
			}
			return &impOut{Body: imp}, nil
		})

	type idImp struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-import-get", Method: http.MethodGet, Path: base + "/{id}/estado", Summary: "Estado de una importación", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idImp) (*impOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			imp, err := s.getImport(ctx, s.a.DB, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			imp.Filas, err = s.filasDiff(ctx, in.ID, imp.Mapeo)
			return &impOut{Body: imp}, err
		})

	type mapIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Mapeo map[string]string `json:"mapeo" doc:"campo → columna del archivo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-import-mapeo", Method: http.MethodPut, Path: base + "/{id}/mapeo", Summary: "Mapear columnas y revisar los cambios (diff)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *mapIn) (*impOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			imp, err := s.getImport(ctx, s.a.DB, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			if imp.Estado != "subida" && imp.Estado != "revisada" {
				return nil, problem.Conflict("IMPORTACION_CERRADA", "Esta importación ya se confirmó.")
			}
			m := map[string]string{}
			for campo, col := range in.Body.Mapeo {
				if col == "" {
					continue
				}
				if !containsCol(imp.Columnas, col) {
					return nil, problem.Unprocessable("COLUMNA_DESCONOCIDA", "La columna «"+col+"» no está en el archivo.")
				}
				m[campo] = col
			}
			for _, c := range Campos {
				if c.Obligatorio && m[c.Clave] == "" {
					return nil, problem.Unprocessable("MAPEO_INCOMPLETO", "Falta indicar qué columna es «"+c.Etiqueta+"».")
				}
			}
			if m["nombre"] == "" && m["nombreCompleto"] == "" {
				return nil, problem.Unprocessable("MAPEO_INCOMPLETO", "Falta indicar la columna del nombre (o del nombre completo).")
			}
			year := s.compYear(ctx, in.CID)
			if err := s.diff(ctx, in.CID, in.ID, m, year); err != nil {
				return nil, err
			}
			imp, err = s.getImport(ctx, s.a.DB, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			imp.Filas, err = s.filasDiff(ctx, in.ID, imp.Mapeo)
			return &impOut{Body: imp}, err
		})

	huma.Register(api, huma.Operation{OperationID: "atletas-import-confirmar", Method: http.MethodPost, Path: base + "/{id}/confirmar", Summary: "Confirmar la importación (por lotes; progreso por SSE import.progreso)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *idImp) (*impOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			// Claim it (a stuck run older than 2 minutes can be resumed: rows are applied idempotently by licence).
			tag, err := s.a.DB.Exec(ctx, `UPDATE importaciones SET estado = 'importando', hechas = 0, updated_at = now() WHERE competition_id = $1 AND id = $2
				AND (estado = 'revisada' OR estado = 'importando' AND updated_at < now() - interval '2 minutes')`, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				imp, err := s.getImport(ctx, s.a.DB, in.CID, in.ID)
				if err != nil {
					return nil, err
				}
				switch imp.Estado {
				case "subida":
					return nil, problem.Conflict("SIN_REVISAR", "Revisa el mapeo antes de confirmar.")
				case "confirmada":
					return nil, problem.Conflict("YA_CONFIRMADA", "Esta importación ya se confirmó.")
				}
				return nil, problem.Conflict("EN_CURSO", "La importación ya está en marcha.")
			}
			bg := context.WithoutCancel(ctx)
			go s.confirmar(bg, in.CID, in.ID)
			imp, err := s.getImport(ctx, s.a.DB, in.CID, in.ID)
			return &impOut{Body: imp}, err
		})

	// Template of the expected list («Formato del acta»).
	s.a.Mux.HandleFunc("GET /api/admin/competiciones/{cid}/atletas/importaciones/plantilla.xlsx", func(w http.ResponseWriter, r *http.Request) {
		cid, err := uuid.Parse(r.PathValue("cid"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if _, err := auth.Require(r.Context(), cid.String(), "atletas.editar"); err != nil {
			problem.Write(w, err.(*problem.Error))
			return
		}
		f := excelize.NewFile()
		defer f.Close()
		sh := f.GetSheetName(0)
		rows := [][]any{
			{"Licencia", "Nombre", "Apellidos", "Sexo", "Fecha de nacimiento", "Categoría", "División", "Club", "Ciudad", "Email", "Teléfono", "Estado", "Orden reserva"},
			{"VAL-0412", "Laura", "Gómez Ruiz", "F", "1998-04-12", "-63", "Open", "GRStrength", "Valencia", "laura@ejemplo.com", "600000000", "Confirmado", ""},
			{"VAL-0533", "Javier", "Torres", "M", "1984-09-30", "-93", "Máster 1", "Club Paterna", "Paterna", "", "", "Reserva", "1"},
		}
		for i, row := range rows {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			_ = f.SetSheetRow(sh, cell, &row)
		}
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", `attachment; filename="plantilla-acta-aep.xlsx"`)
		_ = f.Write(w)
	})
}

func containsCol(cols []string, c string) bool {
	for _, x := range cols {
		if x == c {
			return true
		}
	}
	return false
}

func (s *Svc) compYear(ctx context.Context, cid uuid.UUID) int {
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		return c.Year()
	}
	return time.Now().Year()
}

// diff reviews every row against the current athletes and stores the action of each one.
func (s *Svc) diff(ctx context.Context, cid, id uuid.UUID, mapeo map[string]string, year int) error {
	existing, err := listRows(ctx, s.a.DB, `a.competition_id = $1`, cid)
	if err != nil {
		return err
	}
	byLic := map[string]row{}
	for _, r := range existing {
		if r.Licencia != "" {
			byLic[r.Licencia] = r
		}
	}
	rows, err := s.a.DB.Query(ctx, `SELECT fila, datos FROM importacion_filas WHERE importacion_id = $1 ORDER BY fila`, id)
	if err != nil {
		return err
	}
	type fr struct {
		fila  int
		datos map[string]string
	}
	var filas []fr
	for rows.Next() {
		var f fr
		if err := rows.Scan(&f.fila, &f.datos); err != nil {
			rows.Close()
			return err
		}
		filas = append(filas, f)
	}
	rows.Close()
	res := Resumen{ListaBajas: []BajaDiff{}}
	seen := map[string]int{}
	batch := &pgx.Batch{}
	for _, f := range filas {
		p, errTxt := leerFila(f.datos, mapeo, year)
		accion, cambios := "", []string{}
		var atleta *uuid.UUID
		switch {
		case errTxt != "":
			accion = "error"
		case seen[p.Licencia] > 0:
			accion, errTxt = "error", fmt.Sprintf("Licencia duplicada con la fila %d", seen[p.Licencia])
		default:
			seen[p.Licencia] = f.fila
			if prev, ok := byLic[p.Licencia]; ok {
				atleta = &prev.ID
				if cambios = diffCambios(prev, p); len(cambios) > 0 {
					accion = "actualizar"
				} else {
					accion = "igual"
				}
			} else {
				accion = "crear"
				cambios = []string{fmt.Sprintf("Nueva · %s %s %s · %s", p.Sexo, p.Categoria, DivisionNombre(p.Division), orDash(p.Club))}
			}
		}
		switch accion {
		case "crear":
			res.Nuevos++
		case "actualizar":
			res.Cambios++
		case "igual":
			res.Iguales++
		case "error":
			res.Errores++
		}
		cb, _ := json.Marshal(cambios)
		batch.Queue(`UPDATE importacion_filas SET accion = $3, cambios = $4, error = $5, atleta_id = $6 WHERE importacion_id = $1 AND fila = $2`, id, f.fila, accion, cb, errTxt, atleta)
	}
	for lic, r := range byLic {
		if _, ok := seen[lic]; !ok && r.Origen == "aep" && r.Estado != "baja" {
			res.Bajas++
			res.ListaBajas = append(res.ListaBajas, BajaDiff{AtletaID: r.ID, Nombre: r.nombreCompleto(), Licencia: r.Licencia})
		}
	}
	mp, _ := json.Marshal(mapeo)
	rs, _ := json.Marshal(res)
	batch.Queue(`UPDATE importaciones SET mapeo = $2, resumen = $3, estado = 'revisada', updated_at = now() WHERE id = $1`, id, mp, rs)
	return s.a.DB.SendBatch(ctx, batch).Close()
}

func (s *Svc) filasDiff(ctx context.Context, id uuid.UUID, mapeo map[string]string) ([]FilaDiff, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT fila, datos, accion, cambios, error FROM importacion_filas WHERE importacion_id = $1 AND accion IN ('crear', 'actualizar', 'error') ORDER BY accion = 'error' DESC, fila LIMIT 500`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FilaDiff{}
	for rows.Next() {
		var f FilaDiff
		var datos map[string]string
		if err := rows.Scan(&f.Fila, &datos, &f.Accion, &f.Cambios, &f.Error); err != nil {
			return nil, err
		}
		f.Licencia = NormLicencia(valor(datos, mapeo, "licencia"))
		f.Nombre = strings.TrimSpace(valor(datos, mapeo, "nombre") + " " + valor(datos, mapeo, "apellidos"))
		if f.Nombre == "" {
			f.Nombre = valor(datos, mapeo, "nombreCompleto")
		}
		if f.Cambios == nil {
			f.Cambios = []string{}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// confirmar applies the reviewed import in batches of 50 rows, emitting import.progreso after each batch.
func (s *Svc) confirmar(ctx context.Context, cid, id uuid.UUID) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	fail := func(err error) {
		s.a.Log.Error("importación fallida", "id", id, "err", err)
		_, _ = s.a.DB.Exec(ctx, `UPDATE importaciones SET estado = 'fallida', updated_at = now() WHERE id = $1`, id)
		_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			return events.Enqueue(ctx, tx, events.New(ctx, "import.progreso", map[string]any{"importacionId": id, "estado": "fallida"}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
		})
	}
	imp, err := s.getImport(ctx, s.a.DB, cid, id)
	if err != nil {
		fail(err)
		return
	}
	year := s.compYear(ctx, cid)
	rows, err := s.a.DB.Query(ctx, `SELECT fila, datos, accion, atleta_id, cambios FROM importacion_filas WHERE importacion_id = $1 AND accion IN ('crear', 'actualizar') ORDER BY fila`, id)
	if err != nil {
		fail(err)
		return
	}
	type work struct {
		fila    int
		datos   map[string]string
		accion  string
		atleta  *uuid.UUID
		cambios []string
	}
	var todo []work
	for rows.Next() {
		var w work
		if err := rows.Scan(&w.fila, &w.datos, &w.accion, &w.atleta, &w.cambios); err != nil {
			rows.Close()
			fail(err)
			return
		}
		todo = append(todo, w)
	}
	rows.Close()
	total := len(todo) + len(imp.Resumen.ListaBajas)
	hechas := 0
	progreso := func(tx pgx.Tx, estado string) error {
		if _, err := tx.Exec(ctx, `UPDATE importaciones SET hechas = $2, updated_at = now() WHERE id = $1`, id, hechas); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "import.progreso", map[string]any{"importacionId": id, "hechas": hechas, "total": total, "errores": imp.Resumen.Errores, "estado": estado},
			events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	}
	for i := 0; i < len(todo); i += 50 {
		chunk := todo[i:min(i+50, len(todo))]
		err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			for _, w := range chunk {
				p, errTxt := leerFila(w.datos, imp.Mapeo, year)
				if errTxt != "" {
					continue
				}
				if err := s.aplicar(ctx, tx, cid, p, w.cambios); err != nil {
					return fmt.Errorf("fila %d: %w", w.fila, err)
				}
			}
			hechas += len(chunk)
			return progreso(tx, "importando")
		})
		if err != nil {
			fail(err)
			return
		}
	}
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		for _, b := range imp.Resumen.ListaBajas {
			tag, err := tx.Exec(ctx, `UPDATE atletas SET estado = 'baja', orden_reserva = NULL, version = version + 1, updated_at = now() WHERE id = $1 AND competition_id = $2 AND estado <> 'baja'`, b.AtletaID, cid)
			if err != nil {
				return err
			}
			if tag.RowsAffected() > 0 {
				if err := hist(ctx, tx, b.AtletaID, "Baja: no aparece en el acta nueva", imp.Archivo); err != nil {
					return err
				}
			}
			hechas++
		}
		if _, err := tx.Exec(ctx, `UPDATE importaciones SET estado = 'confirmada', updated_at = now() WHERE id = $1`, id); err != nil {
			return err
		}
		if err := progreso(tx, "confirmada"); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.importacion_confirmada", map[string]any{"id": id, "archivo": imp.Archivo, "nuevos": imp.Resumen.Nuevos,
			"cambios": imp.Resumen.Cambios, "bajas": imp.Resumen.Bajas, "errores": imp.Resumen.Errores}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
	if err != nil {
		fail(err)
		return
	}
	s.bump(ctx, cid)
}

// aplicar upserts one athlete from the list (idempotent by licence).
func (s *Svc) aplicar(ctx context.Context, tx pgx.Tx, cid uuid.UUID, p parsed, cambios []string) error {
	var id uuid.UUID
	var creado bool
	err := tx.QueryRow(ctx, `INSERT INTO atletas (id, competition_id, licencia, nombre, apellidos, email, telefono, sexo, fecha_nacimiento, categoria, division, club, ciudad, estado, orden_reserva, origen)
		VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8,$9,$10,$11,$12,$13,$14,$15,'aep')
		ON CONFLICT (competition_id, licencia) WHERE licencia <> '' DO UPDATE SET nombre = EXCLUDED.nombre, apellidos = EXCLUDED.apellidos,
			email = COALESCE(EXCLUDED.email, atletas.email), telefono = CASE WHEN EXCLUDED.telefono <> '' THEN EXCLUDED.telefono ELSE atletas.telefono END,
			sexo = EXCLUDED.sexo, fecha_nacimiento = COALESCE(EXCLUDED.fecha_nacimiento, atletas.fecha_nacimiento), categoria = EXCLUDED.categoria, division = EXCLUDED.division,
			club = CASE WHEN EXCLUDED.club <> '' THEN EXCLUDED.club ELSE atletas.club END, ciudad = CASE WHEN EXCLUDED.ciudad <> '' THEN EXCLUDED.ciudad ELSE atletas.ciudad END,
			estado = EXCLUDED.estado, orden_reserva = EXCLUDED.orden_reserva, version = atletas.version + 1, updated_at = now()
		RETURNING id, (xmax = 0)`, newID(), cid, p.Licencia, p.Nombre, p.Apellidos, p.Email, p.Telefono, p.Sexo, p.fecha(), p.Categoria, p.Division, p.Club, p.Ciudad, p.Estado, p.OrdenReserva).Scan(&id, &creado)
	if err != nil {
		return err
	}
	if creado {
		if err := createPerfil(ctx, tx, cid, id, p.Nombre+" "+p.Apellidos); err != nil {
			return err
		}
		return hist(ctx, tx, id, "Alta desde el acta de la AEP", strings.Join(cambios, " · "))
	}
	return hist(ctx, tx, id, "Actualizado desde el acta de la AEP", strings.Join(cambios, " · "))
}
