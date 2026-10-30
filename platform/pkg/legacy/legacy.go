// Package legacy reads the database of the previous web (ASP.NET Core + MySQL, `grcup`) for the per-service ETL of
// roadmap step 16. Every service imports only its own data with an «etl-mysql» command; ids are derived from the
// old ids (UUIDv5), so running it again updates instead of duplicating. The old site is never written to: the
// MySQL session is read-only.
//
// Order: competition first (it maps the old competitions to editions and leaves the map in Redis, so the other
// ETLs need no new network path), then identity, athletes, raffle and live. crm receives the contacts through the
// usual internal events of athletes and raffle.
//
// The old backend and database are shared with the FER web (fercup.com, Competiciones.Tipo = 'fer'): only GR Cup
// competitions are migrated unless --mapa names another one, and FER keeps running on the old system.
package legacy

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql" // MySQL driver
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/redisx"
)

// ns is the namespace of the derived ids.
var ns = uuid.MustParse("6f1d2c3e-7a4b-5c8d-9e0f-1a2b3c4d5e6f")

// ID derives the stable new id of an old row: ID("Inscripciones", 42).
func ID(tabla string, id any) uuid.UUID {
	return uuid.NewSHA1(ns, []byte(fmt.Sprintf("grweb/%s/%v", tabla, id)))
}

// Opciones of an «etl-mysql» run.
type Opciones struct {
	DSN      string         // user:pass@tcp(host:3306)/grcup
	DryRun   bool           // report only: nothing is written
	Etiqueta string         // «publicado por» of imported content (QA: «Datos de ejemplo» with the synthetic database)
	Mapa     map[int]string // competition ETL: old id → slug ("-" = do not migrate), over the default rule
	Web      string         // cms ETL: edition of the public web that receives the redirects of the old routes
}

// Leer parses the flags of the command (MYSQL_DSN as default DSN).
func Leer(args []string) (Opciones, error) {
	fs := flag.NewFlagSet("etl-mysql", flag.ContinueOnError)
	o := Opciones{}
	fs.StringVar(&o.DSN, "mysql", config.Str("MYSQL_DSN", ""), "DSN de MySQL de la web anterior (solo lectura)")
	fs.BoolVar(&o.DryRun, "dry-run", false, "solo informe, sin escribir")
	fs.StringVar(&o.Etiqueta, "etiqueta", "Migración de la web anterior", "autor de lo importado")
	mapa := fs.String("mapa", "", "competiciones: id_antiguo=slug,… («-» = no migrar)")
	fs.StringVar(&o.Web, "web", "", "edición de la web pública que recibe las redirecciones (por defecto, la de la competición más reciente)")
	if err := fs.Parse(args); err != nil {
		return o, err
	}
	o.Mapa = map[int]string{}
	for _, par := range strings.Split(*mapa, ",") {
		if strings.TrimSpace(par) == "" {
			continue
		}
		k, v, ok := strings.Cut(par, "=")
		id, err := strconv.Atoi(strings.TrimSpace(k))
		if !ok || err != nil || strings.TrimSpace(v) == "" {
			return o, fmt.Errorf("--mapa: «%s» no es id=slug", par)
		}
		o.Mapa[id] = strings.TrimSpace(v)
	}
	return o, nil
}

// Abrir connects to MySQL read-only (the session is set READ ONLY: an ETL bug can never write to the old site).
func Abrir(ctx context.Context, dsn string) (*sql.DB, error) {
	if dsn == "" {
		return nil, fmt.Errorf("falta --mysql (o MYSQL_DSN)")
	}
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	if !strings.Contains(dsn, "parseTime") {
		dsn += sep + "parseTime=true&loc=UTC&charset=utf8mb4"
		sep = "&"
	}
	// a system variable in the DSN is set by the driver on every connection it opens (also after a reconnect)
	dsn += sep + "transaction_read_only=1"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	var ro int
	if err := db.QueryRowContext(ctx, "SELECT @@SESSION.transaction_read_only").Scan(&ro); err != nil || ro != 1 {
		_ = db.Close()
		if err == nil {
			err = errors.New("la sesión no quedó en solo lectura")
		}
		return nil, fmt.Errorf("mysql: %w", err)
	}
	return db, nil
}

// Competicion is an old competition and its edition in the new platform.
type Competicion struct {
	ID          int       `json:"id"`
	Nombre      string    `json:"nombre"`
	Slug        string    `json:"slug"` // old slug
	Fecha       time.Time `json:"fecha"`
	Lugar       string    `json:"lugar"`
	Descripcion string    `json:"-"`
	Email       string    `json:"-"`
	Telefono    string    `json:"-"`
	Tipo        string    `json:"tipo"`       // grcup | fer (the old backend serves both webs)
	Nueva       string    `json:"nueva"`      // slug in the new platform ("-" = not migrated)
	NuevaID     uuid.UUID `json:"nuevaId"`    // id in the new platform
	Existe      bool      `json:"existe"`     // the edition exists (a dry run maps without creating)
	Finalizada  bool      `json:"finalizada"` // held before the import: results are final, nothing is pending
}

// Ediciones reads the old competitions and maps them to editions: a GR Cup of 2025 → grcup-2025, of 2026 →
// grcup, another GR Cup one keeps its slug, and a competition of another web (FER) is not migrated ("-");
// --mapa overrides the rule.
func Ediciones(ctx context.Context, db *sql.DB, mapa map[int]string) ([]Competicion, error) {
	rows, err := db.QueryContext(ctx, `SELECT Id, Nombre, Slug, Fecha, COALESCE(Lugar, ''), COALESCE(Descripcion, ''), COALESCE(EmailContacto, ''), COALESCE(Telefono, ''),
		LOWER(COALESCE(NULLIF(Tipo, ''), 'grcup')) FROM Competiciones ORDER BY Id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Competicion
	for rows.Next() {
		var c Competicion
		if err := rows.Scan(&c.ID, &c.Nombre, &c.Slug, &c.Fecha, &c.Lugar, &c.Descripcion, &c.Email, &c.Telefono, &c.Tipo); err != nil {
			return nil, err
		}
		gr := strings.Contains(strings.ToLower(c.Slug+" "+c.Nombre), "grcup") || strings.Contains(strings.ToLower(c.Nombre), "gr strength")
		switch {
		case mapa[c.ID] != "":
			c.Nueva = mapa[c.ID]
		case c.Tipo != "grcup":
			c.Nueva = "-" // another web of the same old backend (FER): it stays there
		case gr && c.Fecha.Year() == 2025:
			c.Nueva = "grcup-2025"
		case gr && c.Fecha.Year() == 2026:
			c.Nueva = "grcup"
		default:
			c.Nueva = strings.ToLower(c.Slug)
		}
		c.Finalizada = c.Fecha.Before(time.Now().AddDate(0, 0, -1))
		out = append(out, c)
	}
	return out, rows.Err()
}

// clave of the edition map in Redis (written by the competition ETL, read by the others; 30 days).
func clave(keys redisx.Keys) string { return keys.Of("legado", "ediciones") }

// GuardarMapa stores the edition map for the other ETLs.
func GuardarMapa(ctx context.Context, r *redis.Client, keys redisx.Keys, cs []Competicion) error {
	b, _ := json.Marshal(cs)
	return r.Set(ctx, clave(keys), b, 30*24*time.Hour).Err()
}

// CargarMapa returns the editions mapped by the competition ETL, by old id (only those that exist, unless dry).
func CargarMapa(ctx context.Context, r *redis.Client, keys redisx.Keys, dry bool) (map[int]Competicion, error) {
	b, err := r.Get(ctx, clave(keys)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, fmt.Errorf("no hay mapa de ediciones: ejecuta antes «competition etl-mysql»")
	} else if err != nil {
		return nil, err
	}
	var cs []Competicion
	if err := json.Unmarshal(b, &cs); err != nil {
		return nil, err
	}
	out := map[int]Competicion{}
	for _, c := range cs {
		if c.Nueva != "-" && (c.Existe || dry) {
			out[c.ID] = c
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("el mapa de ediciones está vacío: ejecuta «competition etl-mysql» sin --dry-run")
	}
	return out, nil
}

// Centimos converts euros to cents.
func Centimos(v float64) int { return int(v*100 + 0.5) }

// Informe counts what an ETL run read, wrote and skipped (with the reasons).
type Informe struct {
	Servicio string
	Leidos   map[string]int
	Escritos map[string]int
	Omitidos map[string]int
	Notas    []string
	DryRun   bool
}

// NuevoInforme returns an empty report.
func NuevoInforme(servicio string, dry bool) *Informe {
	return &Informe{Servicio: servicio, Leidos: map[string]int{}, Escritos: map[string]int{}, Omitidos: map[string]int{}, DryRun: dry}
}

// Omitir counts a skipped row with its reason.
func (i *Informe) Omitir(motivo string) { i.Omitidos[motivo]++ }

// Log prints the report.
func (i *Informe) Log(log *slog.Logger) {
	modo := "aplicado"
	if i.DryRun {
		modo = "dry-run (sin escribir)"
	}
	log.Info("etl-mysql "+i.Servicio, "modo", modo, "leidos", fmtMapa(i.Leidos), "escritos", fmtMapa(i.Escritos), "omitidos", fmtMapa(i.Omitidos))
	for _, n := range i.Notas {
		log.Info("etl-mysql "+i.Servicio, "nota", n)
	}
}

func fmtMapa(m map[string]int) string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	p := make([]string, 0, len(ks))
	for _, k := range ks {
		p = append(p, fmt.Sprintf("%s=%d", k, m[k]))
	}
	return strings.Join(p, " ")
}

// ErrDryRun rolls back the transaction of a dry run.
var ErrDryRun = fmt.Errorf("dry-run")

// Partir splits «Laura Gómez Ruiz» into first name and surnames.
func Partir(n string) (string, string) {
	f := strings.Fields(n)
	if len(f) == 0 {
		return "", ""
	}
	return f[0], strings.Join(f[1:], " ")
}

// Categoria normalises an old weight class («63», «-63kg», «+84 kg», «52,5») to the new format («-63», «+84»,
// «-52.5»); anything else («Open», «Sin categoría») is "" (no class: reported, never a made-up key).
func Categoria(c string) string {
	c = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(c), " ", ""))
	c = strings.ReplaceAll(strings.TrimSuffix(c, "kg"), ",", ".")
	signo := "-"
	if strings.HasPrefix(c, "+") || strings.HasPrefix(c, "-") {
		signo, c = c[:1], c[1:]
	}
	if !reClase.MatchString(c) {
		return ""
	}
	if v, _ := strconv.ParseFloat(c, 64); v < 30 || v > 200 {
		return ""
	}
	return signo + c
}

var reClase = regexp.MustCompile(`^[0-9]{2,3}(\.[0-9]+)?$`)

// Sexo maps «femenino»/«masculino»/1/2 to F/M.
func Sexo(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if strings.HasPrefix(s, "f") || s == "1" {
		return "F"
	}
	return "M"
}
