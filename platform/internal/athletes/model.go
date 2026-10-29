package athletes

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

type querier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// row is an athlete joined with its profile (all columns the views need).
type row struct {
	ID               uuid.UUID  `db:"id"`
	CompetitionID    uuid.UUID  `db:"competition_id"`
	Licencia         string     `db:"licencia"`
	Nombre           string     `db:"nombre"`
	Apellidos        string     `db:"apellidos"`
	Email            *string    `db:"email"`
	Telefono         string     `db:"telefono"`
	Sexo             string     `db:"sexo"`
	FechaNacimiento  *time.Time `db:"fecha_nacimiento"`
	Categoria        string     `db:"categoria"`
	Division         string     `db:"division"`
	Club             string     `db:"club"`
	Ciudad           string     `db:"ciudad"`
	Estado           string     `db:"estado"`
	OrdenReserva     *int       `db:"orden_reserva"`
	Origen           string     `db:"origen"`
	Flight           string     `db:"flight"`
	Plataforma       *int       `db:"plataforma"`
	HoraInicio       *time.Time `db:"hora_inicio"`
	PesajeInicio     *time.Time `db:"pesaje_inicio"`
	PesajeFin        *time.Time `db:"pesaje_fin"`
	PesoCorporal     *float64   `db:"peso_corporal"`
	RackSQ           *int       `db:"rack_sq"`
	RackBP           string     `db:"rack_bp"`
	SegurosBP        *int       `db:"seguros_bp"`
	IntentoSQ        *float64   `db:"intento_sq"`
	IntentoBP        *float64   `db:"intento_bp"`
	IntentoDL        *float64   `db:"intento_dl"`
	PesajeEstado     string     `db:"pesaje_estado"`
	PesajeSugerencia string     `db:"pesaje_sugerencia"`
	PesadoAt         *time.Time `db:"pesado_at"`
	PesadoPor        string     `db:"pesado_por"`
	Version          int        `db:"version"`
	CreatedAt        time.Time  `db:"created_at"`
	UpdatedAt        time.Time  `db:"updated_at"`
	Slug             string     `db:"slug"`
	FotoURL          string     `db:"foto_url"`
	FocalX           int16      `db:"focal_x"`
	FocalY           int16      `db:"focal_y"`
	Frase            string     `db:"frase"`
	Bio              string     `db:"bio"`
	Instagram        string     `db:"instagram"`
	Entrenador       string     `db:"entrenador"`
	Historial        string     `db:"historial"`
	MarcaSQ          *float64   `db:"marca_sq"`
	MarcaBP          *float64   `db:"marca_bp"`
	MarcaDL          *float64   `db:"marca_dl"`
	Visible          bool       `db:"visible"`
	MostrarMarcas    bool       `db:"mostrar_marcas"`
	PermiteSeguir    bool       `db:"permite_seguir"`
	AutorizacionURL  string     `db:"autorizacion_url"`
	ImagenAt         *time.Time `db:"imagen_at"`
	ImagenVersion    string     `db:"imagen_version"`
	ImagenHash       string     `db:"imagen_hash"`
	ImagenOrigen     string     `db:"imagen_origen"`
	ImagenIP         string     `db:"imagen_ip"`
	Seguidores       int        `db:"seguidores"`
}

const selRow = `SELECT a.id, a.competition_id, a.licencia, a.nombre, a.apellidos, a.email::text AS email, a.telefono, a.sexo, a.fecha_nacimiento,
	a.categoria, a.division, a.club, a.ciudad, a.estado, a.orden_reserva, a.origen, a.flight, a.plataforma, a.hora_inicio, a.pesaje_inicio, a.pesaje_fin,
	a.peso_corporal::float8 AS peso_corporal, a.rack_sq, a.rack_bp, a.seguros_bp, a.intento_sq::float8 AS intento_sq, a.intento_bp::float8 AS intento_bp,
	a.intento_dl::float8 AS intento_dl, a.pesaje_estado, a.pesaje_sugerencia, a.pesado_at, a.pesado_por, a.version, a.created_at, a.updated_at,
	p.slug, p.foto_url, p.focal_x, p.focal_y, p.frase, p.bio, p.instagram, p.entrenador, p.historial,
	p.marca_sq::float8 AS marca_sq, p.marca_bp::float8 AS marca_bp, p.marca_dl::float8 AS marca_dl, p.visible, p.mostrar_marcas, p.permite_seguir,
	p.autorizacion_url, p.imagen_at, p.imagen_version, p.imagen_hash, p.imagen_origen, p.imagen_ip,
	(SELECT count(*) FROM seguimientos s WHERE s.atleta_id = a.id AND s.confirmado_at IS NOT NULL AND s.baja_at IS NULL)::int AS seguidores
	FROM atletas a JOIN perfiles p ON p.atleta_id = a.id`

func getRow(ctx context.Context, q querier, cid, id uuid.UUID) (row, error) {
	rows, err := q.Query(ctx, selRow+` WHERE a.competition_id = $1 AND a.id = $2`, cid, id)
	if err != nil {
		return row{}, err
	}
	r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[row])
	if err != nil {
		return r, problem.NotFound("Atleta no encontrado.")
	}
	return r, nil
}

func listRows(ctx context.Context, q querier, where string, args ...any) ([]row, error) {
	rows, err := q.Query(ctx, selRow+` WHERE `+where, args...)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[row])
	if list == nil {
		list = []row{}
	}
	return list, err
}

// ---- derived facts ----

func (r row) nombreCompleto() string { return strings.TrimSpace(r.Nombre + " " + r.Apellidos) }

// edad at the first day of the competition (nil without a birth date).
func (r row) edad(compDate time.Time) *int {
	if r.FechaNacimiento == nil {
		return nil
	}
	e := Edad(*r.FechaNacimiento, compDate)
	return &e
}

func (r row) menor(compDate time.Time) bool {
	e := r.edad(compDate)
	return e != nil && *e < 18
}

// extrasPublicos: photo, bio, social links and best lifts may be shown (visible, and authorised if a minor).
func (r row) extrasPublicos(compDate time.Time) bool {
	return r.Visible && (!r.menor(compDate) || r.AutorizacionURL != "")
}

func (r row) fotoPublica(compDate time.Time) string {
	if r.extrasPublicos(compDate) && r.FotoURL != "" && r.ImagenAt != nil {
		return r.FotoURL
	}
	return ""
}

// completo is the public profile completeness (photo 40 · best lifts 30 · text 20 · links 10).
func (r row) completo() int {
	n := 0
	if r.FotoURL != "" {
		n += 40
	}
	if r.MarcaSQ != nil && r.MarcaBP != nil && r.MarcaDL != nil {
		n += 30
	}
	if r.Frase != "" || r.Bio != "" {
		n += 20
	}
	if r.Instagram != "" || r.Entrenador != "" {
		n += 10
	}
	return n
}

func (r row) totalPrevisto() *float64 {
	if r.MarcaSQ == nil || r.MarcaBP == nil || r.MarcaDL == nil {
		return nil
	}
	t := *r.MarcaSQ + *r.MarcaBP + *r.MarcaDL
	return &t
}

// Incidencia is something the team must resolve (Figma «Atletas · casos límite»).
type Incidencia struct {
	Tipo  string `json:"tipo" enum:"menor_sin_autorizacion,categoria_invalida,pesaje_fuera,foto_sin_consentimiento"`
	Texto string `json:"texto"`
}

func (r row) incidencias(compDate time.Time) []Incidencia {
	out := []Incidencia{}
	if r.Estado == "baja" {
		return out
	}
	if r.menor(compDate) && r.AutorizacionURL == "" {
		out = append(out, Incidencia{"menor_sin_autorizacion", fmt.Sprintf("%s es menor de edad (%d años): perfil público y foto desactivados hasta tener la autorización del tutor.", r.Nombre, *r.edad(compDate))})
	}
	if err := ValidarCategoria(r.Sexo, r.Categoria, r.Division); err != nil {
		out = append(out, Incidencia{"categoria_invalida", "Categoría: " + err.Error() + "."})
	}
	if r.PesajeEstado == "fuera" {
		out = append(out, Incidencia{"pesaje_fuera", fmt.Sprintf("Pesaje fuera de categoría: inscrito en %s %s kg, pesa %s kg (le corresponde %s).", r.Sexo, r.Categoria, kg(r.PesoCorporal), r.PesajeSugerencia)})
	}
	if r.FotoURL != "" && r.ImagenAt == nil {
		out = append(out, Incidencia{"foto_sin_consentimiento", "Tiene foto pero no consta el consentimiento de imagen: no se publica."})
	}
	return out
}

func kg(f *float64) string {
	if f == nil {
		return "–"
	}
	return strings.Replace(strconv.FormatFloat(*f, 'f', -1, 64), ".", ",", 1)
}

// ---- admin view ----

// Marcas are the three lifts (kg).
type Marcas struct {
	SQ *float64 `json:"sq,omitempty"`
	BP *float64 `json:"bp,omitempty"`
	DL *float64 `json:"dl,omitempty"`
}

// Pesaje is the weigh-in of an athlete.
type Pesaje struct {
	Peso       *float64   `json:"peso,omitempty"`
	RackSQ     *int       `json:"rackSq,omitempty"`
	RackBP     string     `json:"rackBp"`
	SegurosBP  *int       `json:"segurosBp,omitempty"`
	Intentos   Marcas     `json:"intentos"`
	Estado     string     `json:"estado" enum:"pendiente,ok,fuera,no_compite"`
	Sugerencia string     `json:"sugerencia"`
	At         *time.Time `json:"at,omitempty"`
	Por        string     `json:"por"`
}

// Perfil is the public profile as the team edits it.
type Perfil struct {
	Slug            string  `json:"slug"`
	FotoURL         string  `json:"fotoUrl"`
	FocalX          int16   `json:"focalX"`
	FocalY          int16   `json:"focalY"`
	Frase           string  `json:"frase"`
	Bio             string  `json:"bio"`
	Instagram       string  `json:"instagram"`
	Entrenador      string  `json:"entrenador"`
	Historial       string  `json:"historial"`
	Marcas          Marcas  `json:"marcas"`
	Visible         bool    `json:"visible"`
	MostrarMarcas   bool    `json:"mostrarMarcas"`
	PermiteSeguir   bool    `json:"permiteSeguir"`
	AutorizacionURL string  `json:"autorizacionUrl"`
	Imagen          *Imagen `json:"imagen,omitempty" doc:"Consentimiento de uso de imagen"`
}

// Imagen is the recorded image consent.
type Imagen struct {
	At      time.Time `json:"at"`
	Version string    `json:"version"`
	Hash    string    `json:"hash"`
	Origen  string    `json:"origen"`
	IP      string    `json:"ip"`
}

// Atleta is the backoffice record.
type Atleta struct {
	ID              uuid.UUID    `json:"id"`
	Licencia        string       `json:"licencia"`
	Nombre          string       `json:"nombre"`
	Apellidos       string       `json:"apellidos"`
	NombreCompleto  string       `json:"nombreCompleto"`
	Email           string       `json:"email"`
	Telefono        string       `json:"telefono"`
	Sexo            string       `json:"sexo" enum:"F,M"`
	FechaNacimiento string       `json:"fechaNacimiento,omitempty" format:"date"`
	Edad            *int         `json:"edad,omitempty"`
	Menor           bool         `json:"menor"`
	Categoria       string       `json:"categoria"`
	Division        string       `json:"division"`
	DivisionNombre  string       `json:"divisionNombre"`
	Club            string       `json:"club"`
	Ciudad          string       `json:"ciudad"`
	Estado          string       `json:"estado" enum:"confirmado,reserva,baja"`
	OrdenReserva    *int         `json:"ordenReserva,omitempty"`
	Origen          string       `json:"origen"`
	Flight          string       `json:"flight"`
	Plataforma      *int         `json:"plataforma,omitempty"`
	HoraInicio      *time.Time   `json:"horaInicio,omitempty"`
	PesajeInicio    *time.Time   `json:"pesajeInicio,omitempty"`
	PesajeFin       *time.Time   `json:"pesajeFin,omitempty"`
	Pesaje          Pesaje       `json:"pesaje"`
	Perfil          Perfil       `json:"perfil"`
	TotalPrevisto   *float64     `json:"totalPrevisto,omitempty"`
	Completo        int          `json:"completo" doc:"Perfil público completo (%)"`
	Seguidores      int          `json:"seguidores"`
	Incidencias     []Incidencia `json:"incidencias"`
	Version         int          `json:"version"`
	UpdatedAt       time.Time    `json:"updatedAt"`
}

func (r row) admin(compDate time.Time) Atleta {
	a := Atleta{
		ID: r.ID, Licencia: r.Licencia, Nombre: r.Nombre, Apellidos: r.Apellidos, NombreCompleto: r.nombreCompleto(), Telefono: r.Telefono,
		Sexo: r.Sexo, Edad: r.edad(compDate), Menor: r.menor(compDate), Categoria: r.Categoria, Division: r.Division, DivisionNombre: DivisionNombre(r.Division),
		Club: r.Club, Ciudad: r.Ciudad, Estado: r.Estado, OrdenReserva: r.OrdenReserva, Origen: r.Origen,
		Flight: r.Flight, Plataforma: r.Plataforma, HoraInicio: r.HoraInicio, PesajeInicio: r.PesajeInicio, PesajeFin: r.PesajeFin,
		Pesaje: Pesaje{Peso: r.PesoCorporal, RackSQ: r.RackSQ, RackBP: r.RackBP, SegurosBP: r.SegurosBP, Intentos: Marcas{r.IntentoSQ, r.IntentoBP, r.IntentoDL},
			Estado: r.PesajeEstado, Sugerencia: r.PesajeSugerencia, At: r.PesadoAt, Por: r.PesadoPor},
		Perfil: Perfil{Slug: r.Slug, FotoURL: r.FotoURL, FocalX: r.FocalX, FocalY: r.FocalY, Frase: r.Frase, Bio: r.Bio, Instagram: r.Instagram, Entrenador: r.Entrenador,
			Historial: r.Historial, Marcas: Marcas{r.MarcaSQ, r.MarcaBP, r.MarcaDL}, Visible: r.Visible, MostrarMarcas: r.MostrarMarcas, PermiteSeguir: r.PermiteSeguir,
			AutorizacionURL: r.AutorizacionURL},
		TotalPrevisto: r.totalPrevisto(), Completo: r.completo(), Seguidores: r.Seguidores, Incidencias: r.incidencias(compDate), Version: r.Version, UpdatedAt: r.UpdatedAt,
	}
	if r.Email != nil {
		a.Email = *r.Email
	}
	if r.FechaNacimiento != nil {
		a.FechaNacimiento = r.FechaNacimiento.Format("2006-01-02")
	}
	if r.ImagenAt != nil {
		a.Perfil.Imagen = &Imagen{At: *r.ImagenAt, Version: r.ImagenVersion, Hash: r.ImagenHash, Origen: r.ImagenOrigen, IP: r.ImagenIP}
	}
	return a
}

// compDate is the first day of the competition (ages and divisions are computed against it).
func (s *Svc) compDate(ctx context.Context, cid uuid.UUID) time.Time {
	c, err := s.comps.ByID(ctx, cid)
	if err == nil {
		if t, err := time.Parse("2006-01-02", c.FechaInicio); err == nil {
			return t
		}
	}
	return time.Now()
}

// uniqueSlug returns a free profile slug for name in the competition ("laura-gomez", "laura-gomez-2"…).
func uniqueSlug(ctx context.Context, tx pgx.Tx, cid uuid.UUID, name string, except uuid.UUID) (string, error) {
	base := Slugify(name)
	for i := 1; i < 1000; i++ {
		cand := base
		if i > 1 {
			cand = base + "-" + strconv.Itoa(i)
		}
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM perfiles WHERE competition_id = $1 AND slug = $2 AND atleta_id <> $3`, cid, cand, except).Scan(&n); err != nil {
			return "", err
		}
		if n == 0 {
			return cand, nil
		}
	}
	return base + "-" + newID().String()[:8], nil
}
