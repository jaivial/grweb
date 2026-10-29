package competition

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Estados of a competition, in lifecycle order (Figma page 53 · "Evento · estado").
var Estados = []string{"borrador", "proximamente", "inscripciones", "completas", "hoy", "finalizado", "archivada"}

// ModulosCatalogo lists the web modules a competition can switch on (Figma page 53 · "Evento · módulos").
var ModulosCatalogo = []struct{ Clave, Nombre, Descripcion string }{
	{"entradas", "Entradas", "Reserva de entradas gratuitas por sesión con QR"},
	{"atletas", "Atletas", "Listado y perfiles públicos de atletas"},
	{"horarios", "Horarios", "Flights y horarios publicados"},
	{"directo", "Directo", "Resultados en vivo y pantalla del pabellón"},
	{"resultados", "Resultados", "Clasificaciones y acta"},
	{"sorteo", "Sorteo benéfico", "Venta de boletos y sorteo (requiere checklist legal)"},
	{"areaAtleta", "Área del atleta", "Acceso del atleta a su ficha y avisos"},
	{"voluntarios", "Voluntarios", "Formulario de voluntariado"},
	{"blog", "Blog", "Noticias de la competición"},
	{"galeria", "Galería", "Fotos por álbum"},
	{"patrocinadores", "Patrocinadores", "Logos y niveles de patrocinio"},
	{"campanas", "Campañas", "Campañas de email y WhatsApp (backoffice)"},
}

func validModulo(k string) bool {
	for _, m := range ModulosCatalogo {
		if m.Clave == k {
			return true
		}
	}
	return false
}

// ChecklistPasos are the set-up steps of Figma page 52 · "Inicio · primer uso".
var ChecklistPasos = []struct{ Clave, Titulo, Ayuda string }{
	{"datos-evento", "Datos del evento", "Nombre, fechas y descripción"},
	{"sede", "Sede y cómo llegar", "Dirección, mapa y transporte"},
	{"modulos", "Módulos de la web", "Qué secciones se publican"},
	{"inscripcion-aep", "Inscripción AEP", "Enlace a la inscripción externa"},
	{"equipo", "Equipo y roles", "Invitar a quien gestiona el evento"},
	{"integracion-email", "Email de envío", "SMTP probado"},
	{"textos-legales", "Textos legales", "Privacidad, términos y consentimientos"},
	{"entradas-sesiones", "Sesiones de entradas", "Aforo y ventana de reserva"},
	{"horarios-publicados", "Horarios publicados", "Flights visibles en la web"},
	{"web-publicada", "Web publicada", "Primera publicación de contenidos"},
}

type Sede struct {
	Nombre    string   `json:"nombre"`
	Direccion string   `json:"direccion"`
	CP        string   `json:"cp"`
	Ciudad    string   `json:"ciudad"`
	Provincia string   `json:"provincia"`
	Lat       *float64 `json:"lat,omitempty"`
	Lng       *float64 `json:"lng,omitempty"`
	MapsURL   string   `json:"mapsUrl"`
}

type Evento struct {
	Descripcion   string `json:"descripcion"`
	Nivel         string `json:"nivel" doc:"Nivel o federación (p. ej. AEP · nacional)"`
	Organizador   string `json:"organizador"`
	EmailContacto string `json:"emailContacto" format:"email"`
	Telefono      string `json:"telefono"`
	Puertas       string `json:"puertas" doc:"Apertura de puertas (HH:MM)"`
	AforoPabellon int    `json:"aforoPabellon" minimum:"0"`
	Instagram     string `json:"instagram"`
	Web           string `json:"web"`
}

type Modulo struct {
	Activo    bool   `json:"activo"`
	Bloqueado bool   `json:"bloqueado"`
	Motivo    string `json:"motivo,omitempty"`
}

type Responsable struct {
	Nombre string `json:"nombre"`
	Email  string `json:"email"`
}

type Inscripcion struct {
	Modo        string      `json:"modo" enum:"externa,cerrada"`
	URL         string      `json:"url"`
	Estado      string      `json:"estado" enum:"proximamente,abierta,completa,cerrada"`
	Plazas      int         `json:"plazas,omitempty" minimum:"0" maximum:"5000" doc:"Plazas de atleta (cupo de la AEP)"`
	Responsable Responsable `json:"responsable"`
	Nota        string      `json:"nota"`
}

type ComoLlegar struct {
	Tipo    string `json:"tipo" enum:"coche,parking,bus,tren,metro,bici,avion,otro"`
	Titulo  string `json:"titulo" maxLength:"80"`
	Detalle string `json:"detalle" maxLength:"600"`
	Estado  string `json:"estado" enum:"confirmado,por_confirmar"`
}

// Competicion is the full admin view.
type Competicion struct {
	ID          uuid.UUID         `json:"id" db:"id"`
	Slug        string            `json:"slug" db:"slug"`
	Nombre      string            `json:"nombre" db:"nombre"`
	NombreCorto string            `json:"nombreCorto" db:"nombre_corto"`
	Edicion     int               `json:"edicion" db:"edicion"`
	Estado      string            `json:"estado" db:"estado"`
	FechaInicio *string           `json:"fechaInicio,omitempty" db:"fecha_inicio" format:"date"`
	FechaFin    *string           `json:"fechaFin,omitempty" db:"fecha_fin" format:"date"`
	ZonaHoraria string            `json:"zonaHoraria" db:"zona_horaria"`
	Sede        Sede              `json:"sede" db:"sede"`
	Evento      Evento            `json:"evento" db:"evento"`
	Modulos     map[string]Modulo `json:"modulos" db:"modulos"`
	Inscripcion Inscripcion       `json:"inscripcion" db:"inscripcion"`
	ComoLlegar  []ComoLlegar      `json:"comoLlegar" db:"como_llegar"`
	LogoURL     string            `json:"logoUrl" db:"logo_url"`
	CreatedAt   time.Time         `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time         `json:"updatedAt" db:"updated_at"`
	Version     int               `json:"version" db:"version"`
	ArchivedAt  *time.Time        `json:"archivedAt,omitempty" db:"archived_at"`
}

const selComp = `SELECT id, slug, nombre, nombre_corto, edicion, estado, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin,
	zona_horaria, sede, evento, modulos, inscripcion, como_llegar, logo_url, created_at, updated_at, version, archived_at FROM competiciones`

// Publica is what the public web gets (no internal fields, modules as on/off).
type Publica struct {
	Slug        string          `json:"slug"`
	Nombre      string          `json:"nombre"`
	NombreCorto string          `json:"nombreCorto"`
	Edicion     int             `json:"edicion"`
	Estado      string          `json:"estado"`
	FechaInicio *string         `json:"fechaInicio,omitempty"`
	FechaFin    *string         `json:"fechaFin,omitempty"`
	ZonaHoraria string          `json:"zonaHoraria"`
	Sede        Sede            `json:"sede"`
	Evento      Evento          `json:"evento"`
	Modulos     map[string]bool `json:"modulos"`
	Inscripcion struct {
		Modo   string `json:"modo"`
		URL    string `json:"url"`
		Estado string `json:"estado"`
		Plazas int    `json:"plazas,omitempty"`
	} `json:"inscripcion"`
	ComoLlegar []ComoLlegar `json:"comoLlegar"`
	LogoURL    string       `json:"logoUrl"`
}

func (c Competicion) publica() Publica {
	p := Publica{Slug: c.Slug, Nombre: c.Nombre, NombreCorto: c.NombreCorto, Edicion: c.Edicion, Estado: c.Estado, FechaInicio: c.FechaInicio, FechaFin: c.FechaFin,
		ZonaHoraria: c.ZonaHoraria, Sede: c.Sede, Evento: c.Evento, Modulos: map[string]bool{}, ComoLlegar: c.ComoLlegar, LogoURL: c.LogoURL}
	for k, m := range c.Modulos {
		if k != "campanas" {
			p.Modulos[k] = m.Activo && !m.Bloqueado
		}
	}
	p.Inscripcion.Modo, p.Inscripcion.URL, p.Inscripcion.Estado, p.Inscripcion.Plazas = c.Inscripcion.Modo, c.Inscripcion.URL, c.Inscripcion.Estado, c.Inscripcion.Plazas
	if p.ComoLlegar == nil {
		p.ComoLlegar = []ComoLlegar{}
	}
	return p
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func getComp(ctx context.Context, q querier, where string, arg any) (Competicion, error) {
	rows, err := q.Query(ctx, selComp+` WHERE `+where+` = $1`, arg)
	if err != nil {
		return Competicion{}, err
	}
	c, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Competicion])
	if err != nil {
		return Competicion{}, problem.NotFound("Competición no encontrada.")
	}
	if c.Modulos == nil {
		c.Modulos = map[string]Modulo{}
	}
	return c, nil
}
