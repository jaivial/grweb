package auth

import "slices"

// Perm is one permission key of the backoffice (Figma page 63 · "Roles y permisos").
type Perm struct {
	Key, Label, Group string
}

// Perms is the canonical list of the 17 permission keys, in matrix order.
var Perms = []Perm{
	{"evento.editar", "Datos, estado y módulos", "EVENTO"},
	{"web.editar", "Textos, FAQ, patrocinadores", "EVENTO"},
	{"web.publicar", "Publicar cambios de la web", "EVENTO"},
	{"atletas.editar", "Fichas, importar acta", "COMPETICIÓN"},
	{"horarios.publicar", "Publicar flights", "COMPETICIÓN"},
	{"directo.operar", "Mesa de control", "COMPETICIÓN"},
	{"resultados.publicar", "Publicar resultados", "COMPETICIÓN"},
	{"entradas.gestionar", "Sesiones, reservas, anular", "PÚBLICO"},
	{"checkin.escanear", "Escáner de puerta", "PÚBLICO"},
	{"sorteo.gestionar", "Precio, boletos, reembolsos", "PÚBLICO"},
	{"sorteo.sortear", "Realizar el sorteo", "PÚBLICO"},
	{"contactos.ver", "Ver contactos", "PÚBLICO"},
	{"contactos.exportar", "Exportar / RGPD", "PÚBLICO"},
	{"campanas.enviar", "Enviar campañas (email y WhatsApp)", "PÚBLICO"},
	{"equipo.gestionar", "Invitar y asignar roles", "EQUIPO Y SISTEMA"},
	{"auditoria.ver", "Ver auditoría", "EQUIPO Y SISTEMA"},
	{"integraciones.config", "Email, Stripe, AEP, CDN", "EQUIPO Y SISTEMA"},
}

// Implies lists permissions granted by another one ("heredado" in the matrix).
var Implies = map[string][]string{
	"entradas.gestionar": {"checkin.escanear"},
	"contactos.exportar": {"contactos.ver"},
	"web.publicar":       {"web.editar"},
}

// AllKeys returns every permission key.
func AllKeys() []string {
	out := make([]string, len(Perms))
	for i, p := range Perms {
		out[i] = p.Key
	}
	return out
}

// Valid reports whether k is a known permission key.
func Valid(k string) bool {
	return slices.ContainsFunc(Perms, func(p Perm) bool { return p.Key == k })
}

// Expand adds implied permissions and returns a sorted, de-duplicated list.
func Expand(perms []string) []string {
	set := map[string]bool{}
	var add func(string)
	add = func(k string) {
		if set[k] {
			return
		}
		set[k] = true
		for _, i := range Implies[k] {
			add(i)
		}
	}
	for _, p := range perms {
		add(p)
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

// RoleDef is a default role created for every competition (Root is a user flag, not a role).
type RoleDef struct {
	Slug, Name string
	Perms      []string
	Locked     bool // permissions cannot be edited (Admin)
}

// DefaultRoles follows the Figma matrix: Admin all; Comunicación web + contactos.ver + campañas;
// Staff atletas, horarios, directo, entradas (+checkin heredado), contactos.ver; Taquilla checkin; Juez/Mesa directo.
var DefaultRoles = []RoleDef{
	{Slug: "admin", Name: "Admin", Perms: AllKeys(), Locked: true},
	{Slug: "comunicacion", Name: "Comunicación", Perms: []string{"web.editar", "web.publicar", "contactos.ver", "campanas.enviar"}},
	{Slug: "staff", Name: "Staff", Perms: []string{"atletas.editar", "horarios.publicar", "directo.operar", "entradas.gestionar", "contactos.ver"}},
	{Slug: "taquilla", Name: "Taquilla", Perms: []string{"checkin.escanear"}},
	{Slug: "juez-mesa", Name: "Juez / Mesa", Perms: []string{"directo.operar"}},
}
