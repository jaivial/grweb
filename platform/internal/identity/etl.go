package identity

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/legacy"
)

// rolLegado maps the old per-competition roles (root, admin, staff, registrador) to the default roles.
var rolLegado = map[string]string{"root": "admin", "admin": "admin", "staff": "staff", "registrador": "taquilla"}

// etlMySQL («identity etl-mysql --mysql DSN [--dry-run]») imports the team: users with their old password (it
// moves to argon2id on their first login) and their membership of each migrated edition. An email that already
// exists keeps its account and role. Per-user permission grants of the old site have no equivalent (permissions
// belong to roles here): they are counted in the report to be reviewed in «Equipo y permisos».
func (s *Svc) etlMySQL(ctx context.Context, a *app.App, args []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	o, err := legacy.Leer(args)
	if err != nil {
		return err
	}
	mapa, err := legacy.CargarMapa(ctx, a.Redis, a.Keys, o.DryRun)
	if err != nil {
		return err
	}
	my, err := legacy.Abrir(ctx, o.DSN)
	if err != nil {
		return err
	}
	defer my.Close()

	type usuario struct {
		id                  int
		email, nombre, hash string
		superadmin, activo  bool
		root                bool
		ultimo              sql.NullTime
		creado              time.Time
	}
	rows, err := my.QueryContext(ctx, `SELECT Id, Email, COALESCE(PasswordHash, ''), COALESCE(Nombre, ''), IsSuperadmin, IsActive, IsRoot, LastLoginAt, CreatedAt FROM Usuarios ORDER BY Id`)
	if err != nil {
		return err
	}
	var us []usuario
	for rows.Next() {
		var u usuario
		if err := rows.Scan(&u.id, &u.email, &u.hash, &u.nombre, &u.superadmin, &u.activo, &u.root, &u.ultimo, &u.creado); err != nil {
			rows.Close()
			return err
		}
		us = append(us, u)
	}
	rows.Close()
	type miembro struct {
		usuario, comp int
		rol           string
		aceptada      bool
	}
	rows, err = my.QueryContext(ctx, `SELECT UsuarioId, CompeticionId, Role, InvitationAccepted FROM UsuariosCompeticiones ORDER BY Id`)
	if err != nil {
		return err
	}
	var ms []miembro
	for rows.Next() {
		var m miembro
		if err := rows.Scan(&m.usuario, &m.comp, &m.rol, &m.aceptada); err != nil {
			rows.Close()
			return err
		}
		ms = append(ms, m)
	}
	rows.Close()
	var permisos, conPermisos int
	if err := my.QueryRowContext(ctx, `SELECT count(*), count(DISTINCT UsuarioId) FROM UsuariosPermissions WHERE Granted = 1`).Scan(&permisos, &conPermisos); err != nil {
		return err
	}

	inf := legacy.NuevoInforme("identity", o.DryRun)
	ids := map[int]uuid.UUID{}
	// only the people of the migrated editions (and the old Roots): users of another web of the same backend (FER)
	// stay there
	conMembresia := map[int]bool{}
	for _, m := range ms {
		if _, ok := mapa[m.comp]; ok && m.aceptada {
			conMembresia[m.usuario] = true
		}
	}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for _, u := range us {
			inf.Leidos["usuarios"]++
			email := strings.ToLower(strings.TrimSpace(u.email))
			if !strings.Contains(email, "@") {
				inf.Omitir("usuario sin email válido")
				continue
			}
			if !conMembresia[u.id] && !u.root && !u.superadmin {
				inf.Omitir("usuario sin membresía en las ediciones migradas (p. ej. solo FER)")
				continue
			}
			var id uuid.UUID
			if err := tx.QueryRow(ctx, `SELECT id FROM usuarios WHERE email = $1`, email).Scan(&id); err == nil {
				ids[u.id] = id
				inf.Omitir("usuario que ya existe (se conserva su cuenta)")
				continue
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			id = legacy.ID("Usuarios", u.id)
			var hash *string
			if h := legacyHash(u.hash); h != "" {
				hash = &h
			} else {
				inf.Notas = append(inf.Notas, fmt.Sprintf("usuario %d sin contraseña reconocible: entrará con enlace de acceso", u.id))
			}
			estado := "activo"
			if !u.activo {
				estado = "suspendido"
			}
			var ultimo *time.Time
			if u.ultimo.Valid {
				ultimo = &u.ultimo.Time
			}
			nombre := strings.TrimSpace(u.nombre)
			if _, err := tx.Exec(ctx, `INSERT INTO usuarios (id, email, nombre, password_hash, root, estado, ultimo_acceso, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				ON CONFLICT (id) DO NOTHING`, id, email, nombre, hash, u.root || u.superadmin, estado, ultimo, u.creado); err != nil {
				return fmt.Errorf("usuario %d: %w", u.id, err)
			}
			ids[u.id] = id
			inf.Escritos["usuarios"]++
			if u.root || u.superadmin {
				inf.Escritos["usuarios root"]++
			}
		}
		roles := map[uuid.UUID]bool{}
		for _, m := range ms {
			inf.Leidos["membresias"]++
			c, ok := mapa[m.comp]
			if !ok {
				inf.Omitir("membresía de una competición no migrada")
				continue
			}
			if !m.aceptada {
				inf.Omitir("invitación sin aceptar (se vuelve a invitar desde Equipo)")
				continue
			}
			uid, ok := ids[m.usuario]
			if !ok {
				inf.Omitir("membresía de un usuario no migrado")
				continue
			}
			slug, ok := rolLegado[strings.ToLower(strings.TrimSpace(m.rol))]
			if !ok {
				slug = "staff"
				inf.Notas = append(inf.Notas, fmt.Sprintf("rol «%s» desconocido → Staff", m.rol))
			}
			if !roles[c.NuevaID] {
				if err := ensureDefaultRoles(ctx, tx, c.NuevaID); err != nil {
					return err
				}
				roles[c.NuevaID] = true
			}
			rid, err := roleID(ctx, tx, c.NuevaID, slug)
			if err != nil {
				return err
			}
			tag, err := tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, uid, c.NuevaID, rid)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				inf.Omitir("membresía que ya existe (se conserva su rol)")
				continue
			}
			inf.Escritos["membresias "+slug]++
		}
		if permisos > 0 {
			inf.Notas = append(inf.Notas, fmt.Sprintf("%d permisos individuales de %d usuarios no se migran (aquí los permisos van por rol): revisar en «Equipo y permisos»", permisos, conPermisos))
		}
		if o.DryRun {
			return legacy.ErrDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, legacy.ErrDryRun) {
		return err
	}
	inf.Log(a.Log)
	return nil
}
