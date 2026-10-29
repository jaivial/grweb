package identity

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagTeam = []string{"Equipo y permisos"}

type miembro struct {
	UsuarioID    uuid.UUID  `db:"usuario_id" json:"usuarioId"`
	Email        string     `db:"email" json:"email"`
	Nombre       string     `db:"nombre" json:"nombre"`
	RolSlug      string     `db:"rol_slug" json:"rolSlug"`
	RolNombre    string     `db:"rol_nombre" json:"rolNombre"`
	Estado       string     `db:"estado" json:"estado"`
	UltimoAcceso *time.Time `db:"ultimo_acceso" json:"ultimoAcceso,omitempty"`
	Desde        time.Time  `db:"desde" json:"desde"`
}

const selMiembro = `SELECT m.usuario_id, u.email::text AS email, u.nombre, r.slug AS rol_slug, r.nombre AS rol_nombre, m.estado, u.ultimo_acceso, m.created_at AS desde
	FROM membresias m JOIN usuarios u ON u.id = m.usuario_id JOIN roles r ON r.id = m.rol_id`

type rol struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Slug      string    `db:"slug" json:"slug"`
	Nombre    string    `db:"nombre" json:"nombre"`
	Sistema   bool      `db:"sistema" json:"sistema"`
	Bloqueado bool      `db:"bloqueado" json:"bloqueado" doc:"Sus permisos no se pueden editar (Admin)"`
	Permisos  []string  `db:"permisos" json:"permisos"`
	Miembros  int       `db:"miembros" json:"miembros"`
	Version   int       `db:"version" json:"version"`
}

type rolOut struct{ Body rol }

const selRol = `SELECT r.id, r.slug, r.nombre, r.sistema, r.bloqueado, r.permisos, r.version,
	(SELECT count(*) FROM membresias m WHERE m.rol_id = r.id AND m.estado = 'activo')::int AS miembros FROM roles r`

type invitacion struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Email     string    `db:"email" json:"email"`
	RolSlug   string    `db:"rol_slug" json:"rolSlug"`
	ExpiresAt time.Time `db:"expires_at" json:"expiresAt"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
}

type sesionInfo struct {
	ID         uuid.UUID `db:"id" json:"id"`
	Origen     string    `db:"origen" json:"origen"`
	UserAgent  string    `db:"user_agent" json:"userAgent"`
	IP         string    `db:"ip" json:"ip"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
	LastUsedAt time.Time `db:"last_used_at" json:"lastUsedAt"`
}

// ensureDefaultRoles creates the default roles of a competition (idempotent).
func ensureDefaultRoles(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	for _, r := range auth.DefaultRoles {
		if _, err := tx.Exec(ctx, `INSERT INTO roles (id, competition_id, slug, nombre, sistema, bloqueado, permisos) VALUES ($1,$2,$3,$4,true,$5,$6)
			ON CONFLICT (competition_id, slug) DO NOTHING`, uuid.Must(uuid.NewV7()), cid, r.Slug, r.Name, r.Locked, r.Perms); err != nil {
			return err
		}
	}
	return nil
}

func roleID(ctx context.Context, q querier, cid uuid.UUID, slug string) (uuid.UUID, error) {
	var id uuid.UUID
	if err := q.QueryRow(ctx, `SELECT id FROM roles WHERE competition_id = $1 AND slug = $2`, cid, slug).Scan(&id); err != nil {
		return uuid.Nil, problem.Unprocessable("ROL_DESCONOCIDO", "El rol «"+slug+"» no existe en esta competición.")
	}
	return id, nil
}

// lastAdminGuard fails when the change would leave the competition without an active admin.
func lastAdminGuard(ctx context.Context, tx pgx.Tx, cid, uid uuid.UUID) error {
	var others int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM membresias m JOIN roles r ON r.id = m.rol_id
		WHERE m.competition_id = $1 AND r.slug = 'admin' AND m.estado = 'activo' AND m.usuario_id <> $2`, cid, uid).Scan(&others); err != nil {
		return err
	}
	var isAdmin bool
	_ = tx.QueryRow(ctx, `SELECT r.slug = 'admin' AND m.estado = 'activo' FROM membresias m JOIN roles r ON r.id = m.rol_id WHERE m.competition_id = $1 AND m.usuario_id = $2`, cid, uid).Scan(&isAdmin)
	if isAdmin && others == 0 {
		return problem.Conflict("ULTIMO_ADMIN", "Es el último Admin de la competición: asigna otro Admin antes.")
	}
	return nil
}

func ifMatch(h string) int {
	h = strings.Trim(strings.TrimPrefix(strings.TrimSpace(h), "W/"), `"`)
	v, _ := strconv.Atoi(h)
	return v
}

func (s *Svc) registerTeam() {
	api := s.a.API
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}

	type miembrosOut struct{ Body []miembro }
	huma.Register(api, huma.Operation{OperationID: "team-members-list", Method: http.MethodGet, Path: "/api/competition/{cid}/users", Summary: "Miembros del equipo de la competición", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *cidIn) (*miembrosOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selMiembro+` WHERE m.competition_id = $1 ORDER BY u.nombre`, in.CID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[miembro])
			return &miembrosOut{Body: list}, err
		})

	type addIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Email   string `json:"email" format:"email" maxLength:"254"`
			RolSlug string `json:"rolSlug" minLength:"1"`
		}
	}
	type addOut struct {
		Body struct {
			Resultado string `json:"resultado" enum:"miembro,invitacion" doc:"miembro si ya tenía cuenta; si no, se envía una invitación"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "team-members-add", Method: http.MethodPost, Path: "/api/competition/{cid}/users", Summary: "Añadir a alguien al equipo (o invitarle si no tiene cuenta)", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *addIn) (*addOut, error) {
			p, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar")
			if err != nil {
				return nil, err
			}
			out := &addOut{}
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				rid, err := roleID(ctx, tx, in.CID, in.Body.RolSlug)
				if err != nil {
					return err
				}
				u, err := getUsuario(ctx, tx, "email", email)
				if isNoRows(err) {
					out.Body.Resultado = "invitacion"
					return s.invite(ctx, tx, p, in.CID, email, rid)
				} else if err != nil {
					return err
				}
				out.Body.Resultado = "miembro"
				if _, err := tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id) VALUES ($1,$2,$3)
					ON CONFLICT (usuario_id, competition_id) DO UPDATE SET rol_id = EXCLUDED.rol_id, estado = 'activo', updated_at = now()`, u.ID, in.CID, rid); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.miembro_anadido", map[string]any{"usuarioId": u.ID, "nombre": u.Nombre, "rol": in.Body.RolSlug},
					events.Competition(in.CID.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+u.ID.String())))
			})
			return out, err
		})

	type memberIn struct {
		CID       uuid.UUID `path:"cid"`
		UsuarioID uuid.UUID `path:"usuarioId"`
	}
	type miembroOut struct{ Body miembro }
	huma.Register(api, huma.Operation{OperationID: "team-members-get", Method: http.MethodGet, Path: "/api/competition/{cid}/users/{usuarioId}", Summary: "Ficha de un miembro", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *memberIn) (*miembroOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selMiembro+` WHERE m.competition_id = $1 AND m.usuario_id = $2`, in.CID, in.UsuarioID)
			if err != nil {
				return nil, err
			}
			m, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[miembro])
			if err != nil {
				return nil, problem.NotFound("No es miembro de esta competición.")
			}
			return &miembroOut{Body: m}, nil
		})

	type patchIn struct {
		CID       uuid.UUID `path:"cid"`
		UsuarioID uuid.UUID `path:"usuarioId"`
		Body      struct {
			RolSlug string `json:"rolSlug,omitempty"`
			Estado  string `json:"estado,omitempty" enum:"activo,suspendido"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "team-members-update", Method: http.MethodPatch, Path: "/api/competition/{cid}/users/{usuarioId}", Summary: "Cambiar el rol o suspender a un miembro", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *patchIn) (*miembroOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if (in.Body.RolSlug != "" && in.Body.RolSlug != "admin") || in.Body.Estado == "suspendido" {
					if err := lastAdminGuard(ctx, tx, in.CID, in.UsuarioID); err != nil {
						return err
					}
				}
				if in.Body.RolSlug != "" {
					rid, err := roleID(ctx, tx, in.CID, in.Body.RolSlug)
					if err != nil {
						return err
					}
					if _, err := tx.Exec(ctx, `UPDATE membresias SET rol_id = $3, updated_at = now() WHERE competition_id = $1 AND usuario_id = $2`, in.CID, in.UsuarioID, rid); err != nil {
						return err
					}
				}
				if in.Body.Estado != "" {
					if _, err := tx.Exec(ctx, `UPDATE membresias SET estado = $3, updated_at = now() WHERE competition_id = $1 AND usuario_id = $2`, in.CID, in.UsuarioID, in.Body.Estado); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.miembro_actualizado", map[string]any{"usuarioId": in.UsuarioID, "rol": in.Body.RolSlug, "estado": in.Body.Estado},
					events.Competition(in.CID.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+in.UsuarioID.String()), events.WithDiff(in.Body)))
			})
			if err != nil {
				return nil, err
			}
			if in.Body.Estado == "suspendido" {
				s.revokeUserSessions(ctx, in.UsuarioID)
			}
			rows, err := s.a.DB.Query(ctx, selMiembro+` WHERE m.competition_id = $1 AND m.usuario_id = $2`, in.CID, in.UsuarioID)
			if err != nil {
				return nil, err
			}
			m, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[miembro])
			if err != nil {
				return nil, problem.NotFound("No es miembro de esta competición.")
			}
			return &miembroOut{Body: m}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "team-members-remove", Method: http.MethodDelete, Path: "/api/competition/{cid}/users/{usuarioId}", Summary: "Quitar a alguien del equipo", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *memberIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := lastAdminGuard(ctx, tx, in.CID, in.UsuarioID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `DELETE FROM membresias WHERE competition_id = $1 AND usuario_id = $2`, in.CID, in.UsuarioID); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.miembro_eliminado", map[string]any{"usuarioId": in.UsuarioID},
					events.Competition(in.CID.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+in.UsuarioID.String())))
			})
		})

	// ---- roles ----
	type rolesOut struct {
		Body struct {
			Roles     []rol               `json:"roles"`
			Permisos  []auth.Perm         `json:"permisos" doc:"Catálogo de claves de permiso"`
			Heredados map[string][]string `json:"heredados" doc:"Permisos concedidos por otro permiso"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "team-roles-list", Method: http.MethodGet, Path: "/api/competition/{cid}/roles", Summary: "Roles y matriz de permisos", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *cidIn) (*rolesOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selRol+` WHERE r.competition_id = $1 ORDER BY r.sistema DESC, r.created_at`, in.CID)
			if err != nil {
				return nil, err
			}
			out := &rolesOut{}
			out.Body.Roles, err = pgx.CollectRows(rows, pgx.RowToStructByName[rol])
			out.Body.Permisos, out.Body.Heredados = auth.Perms, auth.Implies
			return out, err
		})

	type rolWriteIn struct {
		CID     uuid.UUID `path:"cid"`
		Slug    string    `path:"slug"`
		IfMatch string    `header:"If-Match" doc:"Versión leída (ETag)"`
		Body    struct {
			Nombre   string   `json:"nombre,omitempty" maxLength:"60"`
			Permisos []string `json:"permisos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "team-roles-update", Method: http.MethodPut, Path: "/api/competition/{cid}/roles/{slug}", Summary: "Editar los permisos de un rol", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *rolWriteIn) (*rolOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			for _, k := range in.Body.Permisos {
				if !auth.Valid(k) {
					return nil, problem.Unprocessable("PERMISO_DESCONOCIDO", "Permiso desconocido: "+k)
				}
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var version int
				var locked bool
				if err := tx.QueryRow(ctx, `SELECT version, bloqueado FROM roles WHERE competition_id = $1 AND slug = $2 FOR UPDATE`, in.CID, in.Slug).Scan(&version, &locked); err != nil {
					return problem.NotFound("Rol no encontrado.")
				}
				if locked {
					return problem.Conflict("ROL_PROTEGIDO", "Los permisos de este rol no se pueden editar.")
				}
				if v := ifMatch(in.IfMatch); v != 0 && v != version {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado este rol. Recarga y vuelve a intentarlo.")
				}
				if _, err := tx.Exec(ctx, `UPDATE roles SET nombre = COALESCE(NULLIF($3, ''), nombre), permisos = $4, version = version + 1, updated_at = now() WHERE competition_id = $1 AND slug = $2`,
					in.CID, in.Slug, in.Body.Nombre, in.Body.Permisos); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.rol_actualizado", map[string]any{"slug": in.Slug, "permisos": in.Body.Permisos},
					events.Competition(in.CID.String()), events.ForPermission("equipo.gestionar"), events.Subject("rol:"+in.Slug)))
			})
			if err != nil {
				return nil, err
			}
			return s.getRol(ctx, in.CID, in.Slug)
		})

	type rolCreateIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Slug       string   `json:"slug" pattern:"^[a-z0-9-]{2,40}$"`
			Nombre     string   `json:"nombre" minLength:"2" maxLength:"60"`
			Permisos   []string `json:"permisos,omitempty"`
			DuplicarDe string   `json:"duplicarDe,omitempty" doc:"Slug del rol a copiar"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "team-roles-create", Method: http.MethodPost, Path: "/api/competition/{cid}/roles", Summary: "Crear un rol a medida (o duplicar uno)", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *rolCreateIn) (*rolOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			perms := in.Body.Permisos
			if in.Body.DuplicarDe != "" {
				if err := s.a.DB.QueryRow(ctx, `SELECT permisos FROM roles WHERE competition_id = $1 AND slug = $2`, in.CID, in.Body.DuplicarDe).Scan(&perms); err != nil {
					return nil, problem.NotFound("El rol a duplicar no existe.")
				}
			}
			for _, k := range perms {
				if !auth.Valid(k) {
					return nil, problem.Unprocessable("PERMISO_DESCONOCIDO", "Permiso desconocido: "+k)
				}
			}
			if perms == nil {
				perms = []string{}
			}
			_, err := s.a.DB.Exec(ctx, `INSERT INTO roles (id, competition_id, slug, nombre, permisos) VALUES ($1,$2,$3,$4,$5)`, uuid.Must(uuid.NewV7()), in.CID, in.Body.Slug, in.Body.Nombre, perms)
			if db.IsUniqueViolation(err, "") {
				return nil, problem.Conflict("ROL_DUPLICADO", "Ya existe un rol con ese identificador.")
			} else if err != nil {
				return nil, err
			}
			return s.getRol(ctx, in.CID, in.Body.Slug)
		})

	type rolIn struct {
		CID  uuid.UUID `path:"cid"`
		Slug string    `path:"slug"`
	}
	huma.Register(api, huma.Operation{OperationID: "team-roles-delete", Method: http.MethodDelete, Path: "/api/competition/{cid}/roles/{slug}", Summary: "Borrar un rol a medida sin miembros", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *rolIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `DELETE FROM roles WHERE competition_id = $1 AND slug = $2 AND NOT sistema AND NOT EXISTS (SELECT 1 FROM membresias m WHERE m.rol_id = roles.id)`, in.CID, in.Slug)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.Conflict("ROL_EN_USO", "Solo se pueden borrar roles a medida sin miembros.")
			}
			return nil, nil
		})

	// ---- invitaciones y sesiones ----
	type invIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Email   string `json:"email" format:"email" maxLength:"254"`
			RolSlug string `json:"rolSlug" minLength:"1"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "team-invitations-create", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/equipo/invitaciones", Summary: "Invitar a una persona por email", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *invIn) (*struct{}, error) {
			p, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar")
			if err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				rid, err := roleID(ctx, tx, in.CID, in.Body.RolSlug)
				if err != nil {
					return err
				}
				return s.invite(ctx, tx, p, in.CID, strings.ToLower(strings.TrimSpace(in.Body.Email)), rid)
			})
		})
	type invsOut struct{ Body []invitacion }
	huma.Register(api, huma.Operation{OperationID: "team-invitations-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/equipo/invitaciones", Summary: "Invitaciones pendientes", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *cidIn) (*invsOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT i.id, i.email::text AS email, r.slug AS rol_slug, i.expires_at, i.created_at FROM invitaciones i JOIN roles r ON r.id = i.rol_id
				WHERE i.competition_id = $1 AND i.aceptada_at IS NULL AND i.revocada_at IS NULL AND i.expires_at > now() ORDER BY i.created_at DESC`, in.CID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[invitacion])
			return &invsOut{Body: list}, err
		})
	type invDelIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "team-invitations-revoke", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}/equipo/invitaciones/{id}", Summary: "Revocar una invitación", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *invDelIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "equipo.gestionar"); err != nil {
				return nil, err
			}
			_, err := s.a.DB.Exec(ctx, `UPDATE invitaciones SET revocada_at = now() WHERE competition_id = $1 AND id = $2 AND aceptada_at IS NULL`, in.CID, in.ID)
			return nil, err
		})

	type sesionesOut struct{ Body []sesionInfo }
	huma.Register(api, huma.Operation{OperationID: "team-sessions-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/equipo/{usuarioId}/sesiones", Summary: "Sesiones activas de un miembro", Tags: tagTeam, Security: bearer},
		func(ctx context.Context, in *memberIn) (*sesionesOut, error) {
			if err := s.requireMemberAdmin(ctx, in.CID, in.UsuarioID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, origen, user_agent, ip, created_at, last_used_at FROM sesiones WHERE usuario_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC`, in.UsuarioID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[sesionInfo])
			return &sesionesOut{Body: list}, err
		})
	type sesDelIn struct {
		CID       uuid.UUID `path:"cid"`
		UsuarioID uuid.UUID `path:"usuarioId"`
		ID        uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "team-sessions-revoke", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}/equipo/{usuarioId}/sesiones/{id}", Summary: "Cerrar una sesión (p. ej. móvil de taquilla perdido)", Tags: tagTeam, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *sesDelIn) (*struct{}, error) {
			if err := s.requireMemberAdmin(ctx, in.CID, in.UsuarioID); err != nil {
				return nil, err
			}
			var owner uuid.UUID
			if err := s.a.DB.QueryRow(ctx, `SELECT usuario_id FROM sesiones WHERE id = $1`, in.ID).Scan(&owner); err != nil || owner != in.UsuarioID {
				return nil, problem.NotFound("Sesión no encontrada.")
			}
			s.revokeSession(ctx, in.ID)
			return nil, s.emit(ctx, events.New(ctx, "identity.sesion_revocada", map[string]any{"usuarioId": in.UsuarioID, "sesionId": in.ID},
				events.Competition(in.CID.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+in.UsuarioID.String())))
		})
}

// requireMemberAdmin: equipo.gestionar in cid and the target belongs to cid.
func (s *Svc) requireMemberAdmin(ctx context.Context, cid, uid uuid.UUID) error {
	if _, err := auth.Require(ctx, cid.String(), "equipo.gestionar"); err != nil {
		return err
	}
	var ok bool
	_ = s.a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM membresias WHERE competition_id = $1 AND usuario_id = $2)`, cid, uid).Scan(&ok)
	if !ok {
		return problem.NotFound("No es miembro de esta competición.")
	}
	return nil
}

func (s *Svc) getRol(ctx context.Context, cid uuid.UUID, slug string) (*rolOut, error) {
	rows, err := s.a.DB.Query(ctx, selRol+` WHERE r.competition_id = $1 AND r.slug = $2`, cid, slug)
	if err != nil {
		return nil, err
	}
	r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[rol])
	if err != nil {
		return nil, problem.NotFound("Rol no encontrado.")
	}
	return &rolOut{Body: r}, nil
}

func (s *Svc) invite(ctx context.Context, tx pgx.Tx, p *auth.Principal, cid uuid.UUID, email string, rid uuid.UUID) error {
	tok := randomToken(32)
	var by *uuid.UUID
	if p.UserID != uuid.Nil {
		by = &p.UserID
	}
	if _, err := tx.Exec(ctx, `UPDATE invitaciones SET revocada_at = now() WHERE competition_id = $1 AND email = $2 AND aceptada_at IS NULL AND revocada_at IS NULL`, cid, email); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO invitaciones (id, competition_id, email, rol_id, token_hash, invitado_por, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		uuid.Must(uuid.NewV7()), cid, email, rid, hashToken(tok), by, time.Now().Add(7*24*time.Hour)); err != nil {
		return err
	}
	if err := requestEmail(ctx, tx, email, "equipo-invitacion", map[string]string{"invita": p.Name, "url": s.cfg.BOURL + "/invitacion/" + tok}); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "identity.invitacion_creada", map[string]any{"email": email},
		events.Competition(cid.String()), events.ForPermission("equipo.gestionar")))
}

func (s *Svc) revokeUserSessions(ctx context.Context, uid uuid.UUID) {
	rows, err := s.a.DB.Query(ctx, `SELECT id FROM sesiones WHERE usuario_id = $1 AND revoked_at IS NULL`, uid)
	if err != nil {
		return
	}
	ids, _ := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	for _, id := range ids {
		s.revokeSession(ctx, id)
	}
}

// emit writes standalone events to the outbox.
func (s *Svc) emit(ctx context.Context, evs ...events.Event) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return events.Enqueue(ctx, tx, evs...) })
}
