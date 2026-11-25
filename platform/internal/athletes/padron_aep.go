package athletes

// BIZ-210 · Padrón AEP: the AEP lists of entries (the xlsx published on the CDN, one per level) become the roll of
// each competition and level. The backoffice uploads the file (or pastes its CDN URL), sees a preview with the
// problems of the list and imports it; the rows are then linked with the entries of the level's OpenLifter meet
// (openlifter service) so the desk can import them.

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
	"golang.org/x/text/unicode/norm"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// FilaPadron is a lifter of the list.
type FilaPadron struct {
	Fila          int      `json:"fila" doc:"Fila del xlsx"`
	Nombre        string   `json:"nombre"`
	Apellidos     string   `json:"apellidos"`
	Sexo          string   `json:"sexo" enum:"M,F"`
	Anio          int      `json:"anio"`
	Club          string   `json:"club"`
	Division      string   `json:"division" doc:"subjunior, junior, open, master1…"`
	Equipamiento  string   `json:"equipamiento" enum:"raw,equipado"`
	Categoria     string   `json:"categoria" doc:"«-63», «+84»"`
	TotalAnterior *float64 `json:"totalAnterior,omitempty"`
	Accion        string   `json:"accion" enum:"nueva,actualizada,igual" doc:"Qué hará la importación con la fila"`
	Cambios       []string `json:"cambios,omitempty"`
	Avisos        []string `json:"avisos,omitempty" doc:"Problemas corregidos solos (categoría dañada recuperada del bloque…)"`
	normNombre    string
}

// FilaFuera is a row that is not imported (coach, photographer, withdrawal or a row with errors).
type FilaFuera struct {
	Fila   int    `json:"fila"`
	Nombre string `json:"nombre"`
	Motivo string `json:"motivo"`
}

// VistaPadron is the preview (and the result) of an import.
type VistaPadron struct {
	Nivel     string       `json:"nivel" enum:"aep2,aep3"`
	Titulo    string       `json:"titulo" doc:"Título de la lista («AEP 2 - GR STRENGTH CUP II»)"`
	Fecha     string       `json:"fecha,omitempty" doc:"AAAA-MM-DD"`
	Origen    string       `json:"origen" doc:"Nombre del archivo o URL"`
	Resumen   ResumenPad   `json:"resumen"`
	Filas     []FilaPadron `json:"filas"`
	Excluidas []FilaFuera  `json:"excluidas" doc:"Entrenadores, fotógrafos y bajas: no se importan"`
	Errores   []FilaFuera  `json:"errores" doc:"Filas que no se pueden importar"`
	// Only after importing.
	Importada  bool            `json:"importada"`
	OpenLifter *PadronOLResult `json:"openlifter,omitempty"`
}

// ResumenPad counts the preview.
type ResumenPad struct {
	Atletas      int `json:"atletas"`
	Nuevas       int `json:"nuevas"`
	Actualizadas int `json:"actualizadas"`
	Iguales      int `json:"iguales"`
	Excluidas    int `json:"excluidas"`
	Errores      int `json:"errores"`
	Avisos       int `json:"avisos"`
	NoEnLista    int `json:"noEnLista" doc:"Filas ya importadas de este nivel que no están en esta lista (se conservan)"`
}

// PadronOLResult is what the OpenLifter meet of the level answered.
type PadronOLResult struct {
	Mesa       string `json:"mesa,omitempty" doc:"Clave de la competición de OpenLifter del nivel"`
	Enlazadas  int    `json:"enlazadas" doc:"Filas con su atleta de OpenLifter"`
	Pendientes int    `json:"pendientes" doc:"Filas que la mesa aún no tiene (se añaden con «Importar atletas» del fork)"`
	Aviso      string `json:"aviso,omitempty"`
}

var reNivel = regexp.MustCompile(`(?i)\bAEP\s*-?\s*([23])\b`)

// nivelDe reads the level from a text («AEP 2 - GR STRENGTH CUP II», «aep3»).
func nivelDe(s string) string {
	if m := reNivel.FindStringSubmatch(s); m != nil {
		return "aep" + m[1]
	}
	return ""
}

// normNombre is the identity key of a name: lower case, no accents, only letters and digits, single spaces.
func normNombre(s string) string {
	var b strings.Builder
	for _, r := range norm.NFKD.String(strings.ToLower(s)) {
		switch {
		case unicode.Is(unicode.Mn, r):
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		default:
			b.WriteByte(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

// divisionAEP maps the AEP «DIV.» column (SNR, JUN, SBJ, MAS1…) to a division key.
func divisionAEP(s string) string {
	switch t := strings.ToUpper(strings.TrimSpace(s)); {
	case t == "SNR" || t == "SEN" || t == "OPEN":
		return "open"
	case t == "JUN":
		return "junior"
	case t == "SBJ" || t == "SUB":
		return "subjunior"
	}
	return NormDivision(s)
}

func categoriaValida(sexo, c string) bool {
	for _, x := range Categorias(sexo, true) {
		if x == c {
			return true
		}
	}
	return false
}

// seccionFuera says why a section of the list is not lifters (coaches, club photographers…).
func seccionFuera(sec string) string {
	t := normNombre(sec)
	switch {
	case strings.Contains(t, "entrenador"):
		return "Entrenador/a"
	case strings.Contains(t, "fotograf"):
		return "Fotógrafo/a de club"
	case strings.Contains(t, "juez") || strings.Contains(t, "arbitr") || strings.Contains(t, "voluntari") || strings.Contains(t, "delegad"):
		return "No es atleta («" + sec + "»)"
	}
	return ""
}

var reCatBloque = regexp.MustCompile(`(?i)^cat\.?\s*(.+?)\s*(kg)?$`)

// parsePadron reads an AEP list: the title and date at the top, then sections («MUJERES POWERLIFTING RAW»,
// «ENTRENADORES/AS»…), each with a header (F/M · APELLIDOS · NOMBRE · AÑO · CLUB, then division, equipment and
// class without a header, and «anterior total» when the list has it) and blocks «Cat. -63 kg». A block with any
// other title («En plazo (con derecho a devolución)») holds withdrawals. nivel overrides the level of the title.
func parsePadron(data []byte, nivel string) (VistaPadron, error) {
	v := VistaPadron{Filas: []FilaPadron{}, Excluidas: []FilaFuera{}, Errores: []FilaFuera{}}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return v, fmt.Errorf("no se pudo abrir el Excel")
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return v, fmt.Errorf("el Excel no tiene hojas")
	}
	rows, err := f.GetRows(sheets[0], excelize.Options{RawCellValue: true})
	if err != nil {
		return v, fmt.Errorf("no se pudo leer la hoja")
	}
	if len(rows) > 5000 {
		return v, fmt.Errorf("la hoja tiene más de 5000 filas")
	}
	cell := func(r []string, i int) string {
		if i >= 0 && i < len(r) {
			return strings.TrimSpace(r[i])
		}
		return ""
	}
	// Column layout, from the first header with «F/M».
	cSexo, cApe, cNom, cAnio, cClub, cTotal := -1, -1, -1, -1, -1, -1
	seccion, fuera := "", ""
	bloque, bloqueCat, bloqueBaja := "", "", false
	vistos := map[string]int{}
	for i, r := range rows {
		n := i + 1
		var llenas []int
		for j := range r {
			if cell(r, j) != "" {
				llenas = append(llenas, j)
			}
		}
		if len(llenas) == 0 {
			continue
		}
		// Header row.
		if k := indexOf(r, "APELLIDOS"); k >= 0 {
			if cSexo < 0 {
				if s := indexOf(r, "F/M"); s >= 0 {
					cSexo, cApe, cNom, cAnio, cClub = s, k, indexOf(r, "NOMBRE"), indexOf(r, "AÑO"), indexOf(r, "CLUB")
				}
			}
			for j := range r {
				if cTotal < 0 && strings.Contains(strings.ToLower(cell(r, j)), "anterior") {
					cTotal = j
				}
			}
			continue
		}
		if cSexo < 0 {
			// Before the first header: title (level) and date.
			for _, j := range llenas {
				t := cell(r, j)
				if v.Titulo == "" && nivelDe(t) != "" {
					v.Titulo = t
				} else if v.Fecha == "" && v.Titulo != "" {
					if x, err := strconv.ParseFloat(t, 64); err == nil && x > 30000 && x < 80000 {
						if d, err := excelize.ExcelDateToTime(x, false); err == nil {
							v.Fecha = d.Format("2006-01-02")
						}
					} else if d, ok := ParseFecha(t); ok {
						v.Fecha = d.Format("2006-01-02")
					}
				}
			}
			// The first section title can come before the first header.
		}
		ape, nom := cell(r, cApe), cell(r, cNom)
		// Section title: text in the F/M column alone (the count goes in the column before).
		if sec := cell(r, max(cSexo, 3)); sec != "" && len([]rune(sec)) > 3 && ape == "" && nom == "" {
			seccion, fuera = sec, seccionFuera(sec)
			bloque, bloqueCat, bloqueBaja = "", "", false
			continue
		}
		if cSexo < 0 {
			continue
		}
		// Block title: text in the surname column with no first name.
		if ape != "" && nom == "" {
			bloque, bloqueCat, bloqueBaja = ape, "", false
			if m := reCatBloque.FindStringSubmatch(ape); m != nil {
				bloqueCat = NormCategoria(m[1])
			} else {
				bloqueBaja = true
			}
			continue
		}
		if ape == "" || nom == "" {
			continue // counters and empty rows
		}
		nombreVista := strings.TrimSpace(nom + " " + ape)
		if fuera != "" {
			v.Excluidas = append(v.Excluidas, FilaFuera{n, nombreVista, fuera})
			continue
		}
		if bloqueBaja {
			v.Excluidas = append(v.Excluidas, FilaFuera{n, nombreVista, "Baja: bloque «" + bloque + "»"})
			continue
		}
		p := FilaPadron{Fila: n, Nombre: nom, Apellidos: ape, Club: cell(r, cClub), normNombre: normNombre(nom + " " + ape)}
		var errs []string
		if p.Sexo = NormSexo(cell(r, cSexo)); p.Sexo == "" {
			errs = append(errs, "Sexo «"+cell(r, cSexo)+"» no reconocido")
		}
		if a, err := strconv.ParseFloat(cell(r, cAnio), 64); err == nil && a >= 1900 && a <= 2100 {
			p.Anio = int(a)
		} else {
			errs = append(errs, "Año de nacimiento «"+cell(r, cAnio)+"» no válido")
		}
		div := cell(r, cClub+1)
		if p.Division = divisionAEP(div); p.Division == "" || !validDivision(p.Division) {
			errs = append(errs, "División «"+div+"» no reconocida")
		}
		p.Equipamiento = "raw"
		if strings.HasPrefix(strings.ToUpper(cell(r, cClub+2)), "EQUIP") || strings.Contains(strings.ToUpper(seccion), "EQUIP") {
			p.Equipamiento = "equipado"
		}
		raw := cell(r, cClub+3)
		if x, err := strconv.ParseFloat(raw, 64); err == nil && x == math.Trunc(x) {
			raw = strconv.Itoa(int(math.Abs(x)))
		}
		cat := NormCategoria(raw)
		switch {
		case p.Sexo == "":
		case categoriaValida(p.Sexo, cat):
			p.Categoria = cat
			if bloqueCat != "" && bloqueCat != cat {
				p.Avisos = append(p.Avisos, fmt.Sprintf("Categoría %s en la fila y bloque «%s»: se usa la de la fila", cat, bloque))
			}
		case bloqueCat != "" && categoriaValida(p.Sexo, bloqueCat):
			p.Categoria = bloqueCat
			p.Avisos = append(p.Avisos, fmt.Sprintf("Categoría dañada «%s»: se usa la del bloque «%s»", raw, bloque))
		case bloqueCat == "":
			errs = append(errs, fmt.Sprintf("Categoría «%s» no válida y la fila no está en un bloque «Cat. … kg»", raw))
		default:
			errs = append(errs, fmt.Sprintf("Categoría «%s» no válida", raw))
		}
		if cTotal >= 0 {
			if t, err := strconv.ParseFloat(strings.ReplaceAll(cell(r, cTotal), ",", "."), 64); err == nil && t > 0 && t < 2000 {
				p.TotalAnterior = &t
			}
		}
		if prev, ok := vistos[p.normNombre+"|"+strconv.Itoa(p.Anio)]; ok && len(errs) == 0 {
			errs = append(errs, fmt.Sprintf("Duplicada con la fila %d", prev))
		}
		if len(errs) > 0 {
			v.Errores = append(v.Errores, FilaFuera{n, nombreVista, strings.Join(errs, " · ")})
			continue
		}
		vistos[p.normNombre+"|"+strconv.Itoa(p.Anio)] = n
		v.Filas = append(v.Filas, p)
	}
	if nivel != "" {
		v.Nivel = nivel
	} else {
		v.Nivel = nivelDe(v.Titulo)
	}
	if v.Nivel == "" {
		return v, fmt.Errorf("no hemos encontrado el nivel (AEP 2 o AEP 3) en el título de la lista: indícalo a mano")
	}
	if cSexo < 0 || len(v.Filas) == 0 {
		return v, fmt.Errorf("no hemos encontrado atletas: la hoja no tiene el formato de las listas de la AEP (F/M · APELLIDOS · NOMBRE · AÑO · CLUB)")
	}
	return v, nil
}

func indexOf(r []string, s string) int {
	for i, c := range r {
		if strings.EqualFold(strings.TrimSpace(c), s) {
			return i
		}
	}
	return -1
}

// ---- reading the input (file or CDN URL) ----

var padronHTTP = &http.Client{Timeout: 20 * time.Second}

// padronHosts are the hosts a list URL may point to (the CDN by default): the service never fetches anything else.
func padronHosts() []string {
	return strings.Split(config.Str("PADRON_URL_HOSTS", "jaimedigitalstudio.b-cdn.net"), ",")
}

func hostPermitido(u *url.URL) bool {
	if u.Scheme != "https" {
		return false
	}
	for _, h := range padronHosts() {
		if h = strings.TrimSpace(h); h != "" && strings.EqualFold(u.Hostname(), h) {
			return true
		}
	}
	return false
}

func descargarPadron(ctx context.Context, raw string) ([]byte, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !hostPermitido(u) {
		return nil, "", problem.Unprocessable("URL_NO_PERMITIDA", "La URL debe ser https y de la CDN ("+strings.Join(padronHosts(), ", ")+").")
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	cl := *padronHTTP
	cl.CheckRedirect = func(r *http.Request, _ []*http.Request) error {
		if !hostPermitido(r.URL) {
			return fmt.Errorf("redirección fuera de la CDN")
		}
		return nil
	}
	res, err := cl.Do(req)
	if err != nil {
		return nil, "", problem.Unprocessable("URL_NO_DISPONIBLE", "No hemos podido descargar la lista de la CDN.")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, "", problem.Unprocessable("URL_NO_DISPONIBLE", fmt.Sprintf("La CDN ha respondido %d al descargar la lista.", res.StatusCode))
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 5<<20+1))
	if err != nil {
		return nil, "", problem.Unprocessable("URL_NO_DISPONIBLE", "No hemos podido descargar la lista de la CDN.")
	}
	if len(data) > 5<<20 {
		return nil, "", problem.Unprocessable("ARCHIVO_GRANDE", "La lista supera los 5 MB.")
	}
	nombre, _ := url.PathUnescape(u.Path[strings.LastIndex(u.Path, "/")+1:])
	return data, nombre, nil
}

// leerPadron reads the multipart input (field «file» or «url», optional «nivel») and parses the list.
func leerPadron(ctx context.Context, form *multipart.Form) (VistaPadron, error) {
	val := func(k string) string {
		if form != nil && len(form.Value[k]) > 0 {
			return strings.TrimSpace(form.Value[k][0])
		}
		return ""
	}
	nivel := strings.ToLower(val("nivel"))
	if nivel != "" && nivel != "aep2" && nivel != "aep3" {
		return VistaPadron{}, problem.Unprocessable("NIVEL_INVALIDO", "El nivel debe ser aep2 o aep3.")
	}
	var data []byte
	var origen string
	switch {
	case form != nil && len(form.File["file"]) == 1:
		fh := form.File["file"][0]
		if fh.Size > 5<<20 {
			return VistaPadron{}, problem.Unprocessable("ARCHIVO_GRANDE", "La lista supera los 5 MB.")
		}
		fl, err := fh.Open()
		if err != nil {
			return VistaPadron{}, err
		}
		data, err = io.ReadAll(fl)
		fl.Close()
		if err != nil {
			return VistaPadron{}, err
		}
		origen = fh.Filename
	case val("url") != "":
		var err error
		if data, origen, err = descargarPadron(ctx, val("url")); err != nil {
			return VistaPadron{}, err
		}
	default:
		return VistaPadron{}, problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta el xlsx en «file» o pega su URL de la CDN en «url».")
	}
	v, err := parsePadron(data, nivel)
	if err != nil {
		return v, problem.Unprocessable("LISTA_INVALIDA", "No hemos podido leer la lista: "+err.Error()+".")
	}
	v.Origen = origen
	return v, nil
}

// ---- storage ----

type filaGuardada struct {
	ID         uuid.UUID
	NormNombre string
	Anio       int
	Club       string
	Division   string
	Equipo     string
	Categoria  string
	Total      *float64
	Sexo       string
	Nombre     string
	Apellidos  string
	LifterID   *int
}

func (s *Svc) padronGuardado(ctx context.Context, q querier, cid uuid.UUID, nivel string) (map[string]filaGuardada, error) {
	rows, err := q.Query(ctx, `SELECT id, nombre_norm, anio, club, division, equipamiento, categoria, total_anterior::float8, sexo, nombre, apellidos, openlifter_lifter_id
		FROM inscripciones_aep WHERE competition_id = $1 AND nivel = $2`, cid, nivel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]filaGuardada{}
	for rows.Next() {
		var g filaGuardada
		if err := rows.Scan(&g.ID, &g.NormNombre, &g.Anio, &g.Club, &g.Division, &g.Equipo, &g.Categoria, &g.Total, &g.Sexo, &g.Nombre, &g.Apellidos, &g.LifterID); err != nil {
			return nil, err
		}
		m[g.NormNombre+"|"+strconv.Itoa(g.Anio)] = g
	}
	return m, rows.Err()
}

func fmtTotal(t *float64) string {
	if t == nil {
		return ""
	}
	return strconv.FormatFloat(*t, 'f', -1, 64) + " kg"
}

// comparar fills the action of every row against what is stored for the level.
func comparar(v *VistaPadron, prev map[string]filaGuardada) {
	enLista := map[string]bool{}
	v.Resumen = ResumenPad{Atletas: len(v.Filas), Excluidas: len(v.Excluidas), Errores: len(v.Errores)}
	for i := range v.Filas {
		p := &v.Filas[i]
		k := p.normNombre + "|" + strconv.Itoa(p.Anio)
		enLista[k] = true
		if len(p.Avisos) > 0 {
			v.Resumen.Avisos++
		}
		g, ok := prev[k]
		if !ok {
			p.Accion = "nueva"
			v.Resumen.Nuevas++
			continue
		}
		add := func(campo, a, z string) {
			if a != z {
				p.Cambios = append(p.Cambios, campo+": "+orDash(a)+" → "+orDash(z))
			}
		}
		add("Nombre", strings.TrimSpace(g.Nombre+" "+g.Apellidos), strings.TrimSpace(p.Nombre+" "+p.Apellidos))
		add("Sexo", g.Sexo, p.Sexo)
		add("Categoría", g.Categoria, p.Categoria)
		add("División", DivisionNombre(g.Division), DivisionNombre(p.Division))
		add("Equipamiento", g.Equipo, p.Equipamiento)
		add("Club", g.Club, p.Club)
		add("Total anterior", fmtTotal(g.Total), fmtTotal(p.TotalAnterior))
		if len(p.Cambios) > 0 {
			p.Accion = "actualizada"
			v.Resumen.Actualizadas++
		} else {
			p.Accion = "igual"
			v.Resumen.Iguales++
		}
	}
	for k := range prev {
		if !enLista[k] {
			v.Resumen.NoEnLista++
		}
	}
}

// ---- OpenLifter (openlifter service) ----

// LifterPadron is a row as the openlifter service needs it to find (or prepare) its entry in the level's meet.
type LifterPadron struct {
	ID            uuid.UUID  `json:"id"`
	Nombre        string     `json:"nombre"`
	Apellidos     string     `json:"apellidos"`
	Sexo          string     `json:"sexo"`
	Anio          int        `json:"anio"`
	Club          string     `json:"club,omitempty"`
	Division      string     `json:"division"`
	Equipamiento  string     `json:"equipamiento"`
	Categoria     string     `json:"categoria"`
	TotalAnterior *float64   `json:"totalAnterior,omitempty"`
	LifterID      *int       `json:"openlifterLifterId,omitempty"`
	AtletaID      *uuid.UUID `json:"atletaId,omitempty"`
	EstadoEnlace  string     `json:"estadoEnlace"`
	Nivel         string     `json:"nivel,omitempty"`
}

func (s *Svc) lifters(ctx context.Context, q querier, cid uuid.UUID, nivel string) ([]LifterPadron, error) {
	rows, err := q.Query(ctx, `SELECT id, nombre, apellidos, sexo, anio, club, division, equipamiento, categoria, total_anterior::float8, openlifter_lifter_id, atleta_id, estado_enlace
		FROM inscripciones_aep WHERE competition_id = $1 AND nivel = $2 ORDER BY sexo DESC, categoria, apellidos, nombre`, cid, nivel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LifterPadron{}
	for rows.Next() {
		var l LifterPadron
		if err := rows.Scan(&l.ID, &l.Nombre, &l.Apellidos, &l.Sexo, &l.Anio, &l.Club, &l.Division, &l.Equipamiento, &l.Categoria, &l.TotalAnterior, &l.LifterID, &l.AtletaID, &l.EstadoEnlace); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// enlazarOpenLifter asks the openlifter service for the entry of each row in the level's meet (matched by name and
// sex) and stores openlifter_lifter_id. A failure leaves the roll imported (the link is retried on the next import).
func (s *Svc) enlazarOpenLifter(ctx context.Context, cid uuid.UUID, v *VistaPadron) *PadronOLResult {
	res := &PadronOLResult{}
	list, err := s.lifters(ctx, s.a.DB, cid, v.Nivel)
	if err != nil {
		res.Aviso = "No se ha podido leer el padrón para enlazarlo con OpenLifter."
		return res
	}
	var r struct {
		Mesa    string `json:"mesa"`
		Enlaces []struct {
			ID      uuid.UUID `json:"id"`
			EntryID *int      `json:"entryId"`
		} `json:"enlaces"`
	}
	body := map[string]any{"nivel": v.Nivel, "titulo": v.Titulo, "fecha": v.Fecha, "lifters": list}
	if err := s.openlifter.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/openlifter/padron", body, &r); err != nil {
		s.a.Log.Warn("padron_aep.openlifter_fallo", "nivel", v.Nivel, "err", err)
		res.Aviso = "OpenLifter no ha respondido: el padrón está importado y se enlazará al volver a importarlo."
		return res
	}
	res.Mesa = r.Mesa
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		for _, e := range r.Enlaces {
			if _, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET openlifter_lifter_id = $3, updated_at = now() WHERE competition_id = $1 AND id = $2
				AND openlifter_lifter_id IS DISTINCT FROM $3`, cid, e.ID, e.EntryID); err != nil {
				return err
			}
			if e.EntryID != nil {
				res.Enlazadas++
			} else {
				res.Pendientes++
			}
		}
		return nil
	})
	if err != nil {
		res.Aviso = "No se han podido guardar los enlaces con OpenLifter."
	}
	s.a.Log.Info("padron_aep.openlifter_enlazado", "nivel", v.Nivel, "mesa", r.Mesa, "enlazadas", res.Enlazadas, "pendientes", res.Pendientes)
	return res
}

// ---- endpoints ----

func (s *Svc) registerPadron() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/atletas/padron-aep"

	type upIn struct {
		CID     uuid.UUID `path:"cid"`
		RawBody multipart.Form
	}
	type vistaOut struct{ Body VistaPadron }
	preparar := func(ctx context.Context, in *upIn) (VistaPadron, error) {
		if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
			return VistaPadron{}, err
		}
		v, err := leerPadron(ctx, &in.RawBody)
		if err != nil {
			return v, err
		}
		prev, err := s.padronGuardado(ctx, s.a.DB, in.CID, v.Nivel)
		if err != nil {
			return v, err
		}
		comparar(&v, prev)
		return v, nil
	}
	huma.Register(api, huma.Operation{OperationID: "padron-aep-vista-previa", Method: http.MethodPost, Path: base + "/vista-previa",
		Summary: "Vista previa de una lista de inscritos AEP (xlsx en «file» o URL de la CDN en «url»; no guarda nada)", Tags: tagAdmin, Security: bearer,
		MaxBodyBytes: maxImport, BodyReadTimeout: time.Minute},
		func(ctx context.Context, in *upIn) (*vistaOut, error) {
			v, err := preparar(ctx, in)
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("padron_aep.vista_previa", "nivel", v.Nivel, "atletas", v.Resumen.Atletas, "excluidas", v.Resumen.Excluidas, "errores", v.Resumen.Errores)
			return &vistaOut{Body: v}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "padron-aep-importar", Method: http.MethodPost, Path: base + "/importar",
		Summary: "Importar una lista de inscritos AEP: crea o actualiza el padrón del nivel (sin duplicar) y lo enlaza con OpenLifter", Tags: tagAdmin, Security: bearer,
		MaxBodyBytes: maxImport, BodyReadTimeout: time.Minute},
		func(ctx context.Context, in *upIn) (*vistaOut, error) {
			v, err := preparar(ctx, in)
			if err != nil {
				return nil, err
			}
			por := actor(ctx)
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				// One import of a level at a time (the identity index already keeps the rows unique).
				if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 210))`, in.CID.String()+"|"+v.Nivel); err != nil {
					return err
				}
				for _, p := range v.Filas {
					if p.Accion == "igual" {
						continue
					}
					if _, err := tx.Exec(ctx, `INSERT INTO inscripciones_aep (id, competition_id, nivel, nombre, apellidos, nombre_norm, sexo, anio, club, division, equipamiento, categoria, total_anterior, fila, importado_por)
						VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
						ON CONFLICT (competition_id, nivel, nombre_norm, anio) DO UPDATE SET nombre = EXCLUDED.nombre, apellidos = EXCLUDED.apellidos, sexo = EXCLUDED.sexo,
							club = EXCLUDED.club, division = EXCLUDED.division, equipamiento = EXCLUDED.equipamiento, categoria = EXCLUDED.categoria,
							total_anterior = EXCLUDED.total_anterior, fila = EXCLUDED.fila, importado_por = EXCLUDED.importado_por, updated_at = now()`,
						newID(), in.CID, v.Nivel, p.Nombre, p.Apellidos, p.normNombre, p.Sexo, p.Anio, p.Club, p.Division, p.Equipamiento, p.Categoria, p.TotalAnterior, p.Fila, por); err != nil {
						return err
					}
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			v.Importada = true
			s.a.Log.Info("padron_aep.importado", "nivel", v.Nivel, "atletas", v.Resumen.Atletas, "nuevas", v.Resumen.Nuevas, "actualizadas", v.Resumen.Actualizadas,
				"iguales", v.Resumen.Iguales, "excluidas", v.Resumen.Excluidas, "errores", v.Resumen.Errores)
			v.OpenLifter = s.enlazarOpenLifter(context.WithoutCancel(ctx), in.CID, &v)
			return &vistaOut{Body: v}, nil
		})

	type listIn struct {
		CID   uuid.UUID `path:"cid"`
		Nivel string    `query:"nivel" enum:"aep2,aep3" required:"true"`
	}
	type listOut struct {
		Body struct {
			Items []LifterPadron `json:"items"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "padron-aep-list", Method: http.MethodGet, Path: base, Summary: "Padrón AEP de un nivel", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listIn) (*listOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			o := &listOut{}
			var err error
			o.Body.Items, err = s.lifters(ctx, s.a.DB, in.CID, in.Nivel)
			return o, err
		})

	// For the openlifter service: the roll of a level («Importar atletas» of the fork) and the entry the desk
	// created for each row.
	type intListOut struct{ Body []LifterPadron }
	huma.Register(api, huma.Operation{OperationID: "internal-padron-aep", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/padron-aep",
		Summary: "Padrón AEP de un nivel (solo openlifter)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *listIn) (*intListOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			list, err := s.lifters(ctx, s.a.DB, in.CID, in.Nivel)
			return &intListOut{Body: list}, err
		})

	type enlIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Enlaces []struct {
				ID      uuid.UUID `json:"id"`
				EntryID int       `json:"entryId" minimum:"0"`
			} `json:"enlaces" maxItems:"1000"`
		}
	}
	type enlOut struct {
		Body struct {
			Enlazadas int `json:"enlazadas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-padron-aep-openlifter", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/padron-aep/openlifter",
		Summary: "Entradas de OpenLifter creadas por la mesa para filas del padrón (solo openlifter)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *enlIn) (*enlOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &enlOut{}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				for _, e := range in.Body.Enlaces {
					t, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET openlifter_lifter_id = $3, updated_at = now() WHERE competition_id = $1 AND id = $2`, in.CID, e.ID, e.EntryID)
					if err != nil {
						return err
					}
					o.Body.Enlazadas += int(t.RowsAffected())
				}
				return nil
			})
			s.a.Log.Info("padron_aep.openlifter_mesa", "enlazadas", o.Body.Enlazadas)
			return o, err
		})
}
