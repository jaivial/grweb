package identity

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Usuarios (Root)"}

type detalleOut struct{ Body usuarioDetalle }

type usuarioDetalle struct {
	usuario
	Competiciones []membresiaMe `json:"competiciones"`
}

func (s *Svc) registerAdmin() {
	api := s.a.API

	type listIn struct {
		Q      string `query:"q" maxLength:"100"`
		Pagina int    `query:"pagina" minimum:"1" default:"1"`
	}
	type listOut struct {
		Body struct {
			Items  []usuario `json:"items"`
			Total  int       `json:"total"`
			Pagina int       `json:"pagina"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "admin-users-list", Method: http.MethodGet, Path: "/api/admin/usuarios", Summary: "Usuarios de la plataforma", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listIn) (*listOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			q := "%" + strings.ToLower(in.Q) + "%"
			out := &listOut{}
			out.Body.Pagina = in.Pagina
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM usuarios WHERE lower(email::text) LIKE $1 OR lower(nombre) LIKE $1`, q).Scan(&out.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT `+selUsuario+` FROM usuarios WHERE lower(email::text) LIKE $1 OR lower(nombre) LIKE $1 ORDER BY nombre, email LIMIT 50 OFFSET $2`, q, (in.Pagina-1)*50)
			if err != nil {
				return nil, err
			}
			out.Body.Items, err = pgx.CollectRows(rows, pgx.RowToStructByName[usuario])
			return out, err
		})

	type createIn struct {
		Body struct {
			Email    string `json:"email" format:"email" maxLength:"254"`
			Nombre   string `json:"nombre" minLength:"1" maxLength:"120"`
			Password string `json:"password,omitempty" maxLength:"256" doc:"Opcional: sin contraseña solo podrá entrar por enlace mágico"`
			Root     bool   `json:"root,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "admin-users-create", Method: http.MethodPost, Path: "/api/admin/usuarios", Summary: "Crear un usuario", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *createIn) (*detalleOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			var hash *string
			if in.Body.Password != "" {
				if err := validPassword(in.Body.Password); err != nil {
					return nil, err
				}
				h := hashPassword(in.Body.Password)
				hash = &h
			}
			id := uuid.Must(uuid.NewV7())
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO usuarios (id, email, nombre, password_hash, root) VALUES ($1,$2,$3,$4,$5)`,
					id, strings.ToLower(strings.TrimSpace(in.Body.Email)), strings.TrimSpace(in.Body.Nombre), hash, in.Body.Root); err != nil {
					if db.IsUniqueViolation(err, "") {
						return problem.Conflict("EMAIL_EN_USO", "Ya existe un usuario con ese email.")
					}
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.usuario_creado", map[string]any{"usuarioId": id, "root": in.Body.Root}, events.Subject("usuario:"+id.String())))
			})
			if err != nil {
				return nil, err
			}
			return s.detalle(ctx, id)
		})

	type idIn struct {
		ID uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "admin-users-get", Method: http.MethodGet, Path: "/api/admin/usuarios/{id}", Summary: "Ficha de un usuario", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*detalleOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			return s.detalle(ctx, in.ID)
		})

	type patchIn struct {
		ID   uuid.UUID `path:"id"`
		Body struct {
			Nombre *string `json:"nombre,omitempty" maxLength:"120"`
			Estado *string `json:"estado,omitempty" enum:"activo,suspendido"`
			Root   *bool   `json:"root,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "admin-users-update", Method: http.MethodPatch, Path: "/api/admin/usuarios/{id}", Summary: "Editar o suspender un usuario", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *patchIn) (*detalleOut, error) {
			p, err := auth.RequireRoot(ctx)
			if err != nil {
				return nil, err
			}
			if in.ID == p.UserID && ((in.Body.Root != nil && !*in.Body.Root) || (in.Body.Estado != nil && *in.Body.Estado != "activo")) {
				return nil, problem.Conflict("AUTOBLOQUEO", "No puedes quitarte Root ni suspenderte a ti mismo.")
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE usuarios SET nombre = COALESCE($2, nombre), estado = COALESCE($3, estado), root = COALESCE($4, root), updated_at = now(), version = version + 1 WHERE id = $1`,
				in.ID, in.Body.Nombre, in.Body.Estado, in.Body.Root)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Usuario no encontrado.")
			}
			if (in.Body.Estado != nil && *in.Body.Estado == "suspendido") || in.Body.Root != nil {
				s.revokeUserSessions(ctx, in.ID)
			}
			if err := s.emit(ctx, events.New(ctx, "identity.usuario_actualizado", map[string]any{"usuarioId": in.ID}, events.Subject("usuario:"+in.ID.String()), events.WithDiff(in.Body))); err != nil {
				return nil, err
			}
			return s.detalle(ctx, in.ID)
		})

	huma.Register(api, huma.Operation{OperationID: "admin-users-delete", Method: http.MethodDelete, Path: "/api/admin/usuarios/{id}", Summary: "Borrar un usuario", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			p, err := auth.RequireRoot(ctx)
			if err != nil {
				return nil, err
			}
			if in.ID == p.UserID {
				return nil, problem.Conflict("AUTOBLOQUEO", "No puedes borrarte a ti mismo.")
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				rows, err := tx.Query(ctx, `SELECT competition_id FROM membresias WHERE usuario_id = $1`, in.ID)
				if err != nil {
					return err
				}
				cids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
				if err != nil {
					return err
				}
				for _, cid := range cids {
					if err := lastAdminGuard(ctx, tx, cid, in.ID); err != nil {
						return err
					}
				}
				if _, err := tx.Exec(ctx, `DELETE FROM usuarios WHERE id = $1`, in.ID); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.usuario_eliminado", map[string]any{"usuarioId": in.ID}, events.Subject("usuario:"+in.ID.String())))
			})
		})

	type assignIn struct {
		ID   uuid.UUID `path:"id"`
		Body struct {
			CompetitionID uuid.UUID `json:"competitionId"`
			RolSlug       string    `json:"rolSlug" minLength:"1"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "admin-users-assign", Method: http.MethodPost, Path: "/api/admin/usuarios/{id}/competiciones", Summary: "Dar acceso a una competición con un rol", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *assignIn) (*detalleOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				rid, err := roleID(ctx, tx, in.Body.CompetitionID, in.Body.RolSlug)
				if err != nil {
					return err
				}
				_, err = tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id) VALUES ($1,$2,$3)
					ON CONFLICT (usuario_id, competition_id) DO UPDATE SET rol_id = EXCLUDED.rol_id, estado = 'activo', updated_at = now()`, in.ID, in.Body.CompetitionID, rid)
				if err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.miembro_anadido", map[string]any{"usuarioId": in.ID, "rol": in.Body.RolSlug},
					events.Competition(in.Body.CompetitionID.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			return s.detalle(ctx, in.ID)
		})

	type unassignIn struct {
		ID  uuid.UUID `path:"id"`
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "admin-users-unassign", Method: http.MethodDelete, Path: "/api/admin/usuarios/{id}/competiciones/{cid}", Summary: "Quitar el acceso a una competición", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *unassignIn) (*struct{}, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := lastAdminGuard(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				_, err := tx.Exec(ctx, `DELETE FROM membresias WHERE usuario_id = $1 AND competition_id = $2`, in.ID, in.CID)
				return err
			})
		})
}

func (s *Svc) detalle(ctx context.Context, id uuid.UUID) (*detalleOut, error) {
	u, err := getUsuario(ctx, s.a.DB, "id", id)
	if err != nil {
		return nil, problem.NotFound("Usuario no encontrado.")
	}
	me, err := s.me(ctx, u)
	if err != nil {
		return nil, err
	}
	return &detalleOut{Body: usuarioDetalle{usuario: u, Competiciones: me.Competiciones}}, nil
}

// registerInternal exposes endpoints only other services may call (service token).
func (s *Svc) registerInternal() {
	api := s.a.API
	tags := []string{"Interno"}

	type rolesIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			PropietarioID *uuid.UUID `json:"propietarioId,omitempty" doc:"Usuario que pasa a ser Admin"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-default-roles", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/roles-por-defecto", Summary: "Crear los roles por defecto de una competición (idempotente)", Tags: tags, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *rolesIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := ensureDefaultRoles(ctx, tx, in.CID); err != nil {
					return err
				}
				if in.Body.PropietarioID == nil {
					return nil
				}
				rid, err := roleID(ctx, tx, in.CID, "admin")
				if err != nil {
					return err
				}
				_, err = tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, *in.Body.PropietarioID, in.CID, rid)
				return err
			})
		})

	type exIn struct {
		Body struct {
			Token string `json:"token" minLength:"10"`
		}
	}
	type exOut struct {
		Body struct {
			AccessToken string    `json:"accessToken"`
			ExpiresAt   time.Time `json:"expiresAt"`
			TokenID     uuid.UUID `json:"tokenId"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-token-exchange", Method: http.MethodPost, Path: "/internal/tokens/intercambio", Summary: "Canjear un token personal por un JWT de acceso restringido (lo usa el gateway)", Tags: tags, Hidden: true},
		func(ctx context.Context, in *exIn) (*exOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			var t tokenAcceso
			var uid uuid.UUID
			err := s.a.DB.QueryRow(ctx, `SELECT id, nombre, scopes, competition_id, expires_at, usuario_id FROM tokens_acceso WHERE token_hash = $1 AND revoked_at IS NULL`, hashToken(in.Body.Token)).
				Scan(&t.ID, &t.Nombre, &t.Scopes, &t.CompetitionID, &t.ExpiresAt, &uid)
			if err != nil || (t.ExpiresAt != nil && time.Now().After(*t.ExpiresAt)) {
				return nil, problem.Unauthorized("TOKEN_INVALIDO", "Token personal no válido, revocado o caducado.")
			}
			u, err := getUsuario(ctx, s.a.DB, "id", uid)
			if err != nil || u.Estado != "activo" {
				return nil, problem.Unauthorized("TOKEN_INVALIDO", "La cuenta del token no está activa.")
			}
			held, err := s.permsFor(ctx, uid)
			if err != nil {
				return nil, err
			}
			comp := map[string][]string{}
			if t.CompetitionID != nil {
				cid := t.CompetitionID.String()
				if u.Root {
					comp[cid] = auth.Expand(t.Scopes)
				} else {
					comp[cid] = intersect(auth.Expand(t.Scopes), held[cid])
				}
			}
			_, _ = s.a.DB.Exec(ctx, `UPDATE tokens_acceso SET last_used_at = now() WHERE id = $1`, t.ID)
			// A token never carries Root: it only gets its scopes.
			u.Root = false
			tok, exp, err := s.mintAccess(ctx, u, "", "token:"+t.Nombre, comp)
			if err != nil {
				return nil, err
			}
			if t.ExpiresAt != nil && exp.After(*t.ExpiresAt) {
				exp = *t.ExpiresAt
			}
			out := &exOut{}
			out.Body.AccessToken, out.Body.ExpiresAt, out.Body.TokenID = tok, exp, t.ID
			return out, nil
		})
}

// bootstrapRoot creates the first Root user from ROOT_EMAIL / ROOT_PASSWORD / ROOT_NOMBRE (idempotent).
func (s *Svc) bootstrapRoot(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	email := strings.ToLower(config.Str("ROOT_EMAIL", ""))
	pw := config.Str("ROOT_PASSWORD", "")
	if email == "" || pw == "" {
		return errors.New("define ROOT_EMAIL y ROOT_PASSWORD")
	}
	if err := validPassword(pw); err != nil {
		return err
	}
	tag, err := a.DB.Exec(ctx, `INSERT INTO usuarios (id, email, nombre, password_hash, root) VALUES ($1,$2,$3,$4,true) ON CONFLICT (email) DO NOTHING`,
		uuid.Must(uuid.NewV7()), email, config.Str("ROOT_NOMBRE", "Root"), hashPassword(pw))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		a.Log.Info("el usuario Root ya existía; no se cambia", "email", email)
	} else {
		a.Log.Info("usuario Root creado", "email", email)
	}
	return nil
}

// loginLink prints a one-time magic link (15 min) for an existing user. Operators use it to open a QA session
// in a browser (or in cu) without typing a password: kubectl exec deploy/identity -- /app enlace-acceso <email> [ruta].
func (s *Svc) loginLink(ctx context.Context, a *app.App, args []string) error {
	if len(args) < 1 {
		return errors.New("uso: enlace-acceso <email> [ruta del backoffice]")
	}
	bo := config.Str("BACKOFFICE_URL", "http://localhost:4201")
	u, err := getUsuario(ctx, a.DB, "email", strings.ToLower(strings.TrimSpace(args[0])))
	if err != nil || u.Estado != "activo" {
		return errors.New("no hay ningún usuario activo con ese email")
	}
	next := ""
	if len(args) > 1 {
		next = safeNext(args[1])
	}
	tok := randomToken(32)
	host, _ := os.Hostname()
	ev := events.New(ctx, "identity.enlace_acceso_emitido", map[string]any{"usuarioId": u.ID, "ruta": next, "caducaEn": "15m"}, events.Subject("usuario:"+u.ID.String()))
	ev.Actor = &events.Actor{Name: "operador (kubectl exec " + host + ")", Origin: "cli", Service: "identity"}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO enlaces_magicos (id, usuario_id, token_hash, siguiente, expires_at) VALUES ($1,$2,$3,$4,$5)`,
			uuid.Must(uuid.NewV7()), u.ID, hashToken(tok), next, time.Now().Add(15*time.Minute)); err != nil {
			return err
		}
		// Audited like any other mutation: someone can open a session on behalf of this user.
		return events.Enqueue(ctx, tx, ev)
	})
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(os.Stdout, bo+"/api/auth/magic/"+tok)
	return err
}
