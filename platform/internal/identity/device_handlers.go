package identity

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// registerDevice implements the OAuth 2.0 device authorization grant (RFC 8628) used by `grcup login`.
func (s *Svc) registerDevice() {
	api := s.a.API

	type startIn struct {
		Body struct {
			Cliente string `json:"cliente" maxLength:"120" doc:"Nombre del cliente, p. ej. grcup-cli 0.1 (linux)"`
		}
	}
	type startOut struct {
		Body struct {
			DeviceCode              string `json:"deviceCode"`
			UserCode                string `json:"userCode"`
			VerificationURI         string `json:"verificationUri"`
			VerificationURIComplete string `json:"verificationUriComplete"`
			ExpiresIn               int    `json:"expiresIn"`
			Interval                int    `json:"interval"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-device-start", Method: http.MethodPost, Path: "/api/auth/device", Summary: "Iniciar el acceso por dispositivo (CLI)", Tags: tagAuth},
		func(ctx context.Context, in *startIn) (*startOut, error) {
			if err := s.limit(ctx, "device:ip:"+httpx.ClientIPFrom(ctx), 10, 10*time.Minute); err != nil {
				return nil, err
			}
			dc, uc := randomToken(32), userCode()
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO autorizaciones_dispositivo (id, device_hash, user_code, cliente, expires_at) VALUES ($1,$2,$3,$4,$5)`,
				uuid.Must(uuid.NewV7()), hashToken(dc), uc, in.Body.Cliente, time.Now().Add(10*time.Minute)); err != nil {
				return nil, err
			}
			out := &startOut{}
			out.Body.DeviceCode, out.Body.UserCode = dc, uc
			out.Body.VerificationURI = s.cfg.BOURL + "/dispositivo"
			out.Body.VerificationURIComplete = s.cfg.BOURL + "/dispositivo?codigo=" + uc
			out.Body.ExpiresIn, out.Body.Interval = 600, 5
			return out, nil
		})

	type tokenIn struct {
		Body struct {
			DeviceCode string `json:"deviceCode" minLength:"10"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-device-token", Method: http.MethodPost, Path: "/api/auth/device/token", Summary: "Canjear el código de dispositivo cuando el usuario lo aprueba", Tags: tagAuth},
		func(ctx context.Context, in *tokenIn) (*sesionOut, error) {
			if err := s.limit(ctx, "device:poll:"+in.Body.DeviceCode[:10], 40, 10*time.Minute); err != nil {
				return nil, err
			}
			var id uuid.UUID
			var uid *uuid.UUID
			var cliente string
			var aprobado, denegado, consumido *time.Time
			var expires time.Time
			err := s.a.DB.QueryRow(ctx, `SELECT id, usuario_id, cliente, aprobado_at, denegado_at, consumido_at, expires_at FROM autorizaciones_dispositivo WHERE device_hash = $1`,
				hashToken(in.Body.DeviceCode)).Scan(&id, &uid, &cliente, &aprobado, &denegado, &consumido, &expires)
			switch {
			case err != nil:
				return nil, problem.BadRequest("CODIGO_INVALIDO", "Código de dispositivo no válido.")
			case consumido != nil || time.Now().After(expires):
				return nil, problem.BadRequest("CODIGO_CADUCADO", "El código ha caducado. Vuelve a ejecutar «grcup login».")
			case denegado != nil:
				return nil, problem.BadRequest("ACCESO_DENEGADO", "El acceso se denegó desde el backoffice.")
			case aprobado == nil || uid == nil:
				return nil, problem.BadRequest("AUTORIZACION_PENDIENTE", "Aprueba el código en el navegador.")
			}
			if tag, err := s.a.DB.Exec(ctx, `UPDATE autorizaciones_dispositivo SET consumido_at = now() WHERE id = $1 AND consumido_at IS NULL`, id); err != nil || tag.RowsAffected() != 1 {
				return nil, problem.BadRequest("CODIGO_CADUCADO", "El código ya se ha usado.")
			}
			u, err := getUsuario(ctx, s.a.DB, "id", *uid)
			if err != nil || u.Estado != "activo" {
				return nil, problem.Forbidden("La cuenta no está activa.")
			}
			tp, err := s.startSession(ctx, u, "cli", cliente, httpx.ClientIPFrom(ctx))
			if err != nil {
				return nil, err
			}
			return s.sessionOut(ctx, u, tp, "cli")
		})

	type codeIn struct {
		Code string `path:"userCode" maxLength:"12"`
	}
	type infoOut struct {
		Body struct {
			UserCode  string    `json:"userCode"`
			Cliente   string    `json:"cliente"`
			Estado    string    `json:"estado" enum:"pendiente,aprobado,denegado,caducado"`
			CreatedAt time.Time `json:"createdAt"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-device-info", Method: http.MethodGet, Path: "/api/auth/device/{userCode}", Summary: "Ver una solicitud de acceso de dispositivo (pantalla Autorizar dispositivo)", Tags: tagAuth, Security: bearer},
		func(ctx context.Context, in *codeIn) (*infoOut, error) {
			if _, err := auth.User(ctx); err != nil {
				return nil, err
			}
			out := &infoOut{}
			var aprobado, denegado, consumido *time.Time
			var expires time.Time
			err := s.a.DB.QueryRow(ctx, `SELECT user_code, cliente, created_at, aprobado_at, denegado_at, consumido_at, expires_at FROM autorizaciones_dispositivo WHERE user_code = $1`,
				strings.ToUpper(in.Code)).Scan(&out.Body.UserCode, &out.Body.Cliente, &out.Body.CreatedAt, &aprobado, &denegado, &consumido, &expires)
			if err != nil {
				return nil, problem.NotFound("No hay ninguna solicitud con ese código.")
			}
			switch {
			case denegado != nil:
				out.Body.Estado = "denegado"
			case aprobado != nil:
				out.Body.Estado = "aprobado"
			case consumido != nil || time.Now().After(expires):
				out.Body.Estado = "caducado"
			default:
				out.Body.Estado = "pendiente"
			}
			return out, nil
		})

	decide := func(approve bool) func(context.Context, *codeIn) (*struct{}, error) {
		return func(ctx context.Context, in *codeIn) (*struct{}, error) {
			p, err := auth.User(ctx)
			if err != nil {
				return nil, err
			}
			if p.IsService() {
				return nil, problem.Forbidden("Endpoint de usuario.")
			}
			col := "denegado_at"
			if approve {
				col = "aprobado_at"
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE autorizaciones_dispositivo SET `+col+` = now(), usuario_id = $2
				WHERE user_code = $1 AND aprobado_at IS NULL AND denegado_at IS NULL AND consumido_at IS NULL AND expires_at > now()`, strings.ToUpper(in.Code), p.UserID)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() != 1 {
				return nil, problem.Conflict("CODIGO_CADUCADO", "El código ya no está pendiente o ha caducado.")
			}
			return nil, nil
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-device-approve", Method: http.MethodPost, Path: "/api/auth/device/{userCode}/aprobar", Summary: "Aprobar el acceso de un dispositivo", Tags: tagAuth, Security: bearer, DefaultStatus: http.StatusNoContent}, decide(true))
	huma.Register(api, huma.Operation{OperationID: "auth-device-deny", Method: http.MethodPost, Path: "/api/auth/device/{userCode}/denegar", Summary: "Denegar el acceso de un dispositivo", Tags: tagAuth, Security: bearer, DefaultStatus: http.StatusNoContent}, decide(false))
}

type invitacionInfo struct {
	CompetitionID uuid.UUID `json:"competitionId" db:"competition_id"`
	Email         string    `json:"email" db:"email"`
	Rol           string    `json:"rol" db:"rol"`
	ExpiresAt     time.Time `json:"expiresAt" db:"expires_at"`
	Existe        bool      `json:"cuentaExistente" db:"existe" doc:"Si ya hay cuenta, no se pide contraseña"`
}

func (s *Svc) registerInvitationAccept() {
	api := s.a.API
	type tokIn struct {
		Token string `path:"token"`
	}
	type infoOut struct{ Body invitacionInfo }
	huma.Register(api, huma.Operation{OperationID: "auth-invitation-info", Method: http.MethodGet, Path: "/api/auth/invitaciones/{token}", Summary: "Datos de una invitación pendiente", Tags: tagAuth},
		func(ctx context.Context, in *tokIn) (*infoOut, error) {
			rows, err := s.a.DB.Query(ctx, `SELECT i.competition_id, i.email::text AS email, r.nombre AS rol, i.expires_at, EXISTS (SELECT 1 FROM usuarios u WHERE u.email = i.email) AS existe
				FROM invitaciones i JOIN roles r ON r.id = i.rol_id WHERE i.token_hash = $1 AND i.aceptada_at IS NULL AND i.revocada_at IS NULL AND i.expires_at > now()`, hashToken(in.Token))
			if err != nil {
				return nil, err
			}
			info, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[invitacionInfo])
			if err != nil {
				return nil, problem.NotFound("La invitación no existe, ya se usó o ha caducado.")
			}
			return &infoOut{Body: info}, nil
		})

	type acceptIn struct {
		UserAgent string `header:"User-Agent"`
		Body      struct {
			Token    string `json:"token" minLength:"10"`
			Nombre   string `json:"nombre,omitempty" maxLength:"120"`
			Password string `json:"password,omitempty" maxLength:"256" doc:"Obligatoria si no hay cuenta"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-invitation-accept", Method: http.MethodPost, Path: "/api/auth/invitaciones/aceptar", Summary: "Aceptar una invitación al equipo", Tags: tagAuth},
		func(ctx context.Context, in *acceptIn) (*sesionOut, error) {
			var u usuario
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var invID, cid, rolID uuid.UUID
				var email string
				err := tx.QueryRow(ctx, `SELECT id, competition_id, rol_id, email::text FROM invitaciones WHERE token_hash = $1 AND aceptada_at IS NULL AND revocada_at IS NULL AND expires_at > now() FOR UPDATE`,
					hashToken(in.Body.Token)).Scan(&invID, &cid, &rolID, &email)
				if err != nil {
					return problem.NotFound("La invitación no existe, ya se usó o ha caducado.")
				}
				u, err = getUsuario(ctx, tx, "email", email)
				if isNoRows(err) {
					if err := validPassword(in.Body.Password); err != nil {
						return err
					}
					if strings.TrimSpace(in.Body.Nombre) == "" {
						return problem.Unprocessable("NOMBRE_OBLIGATORIO", "Indica tu nombre.")
					}
					id := uuid.Must(uuid.NewV7())
					if _, err := tx.Exec(ctx, `INSERT INTO usuarios (id, email, nombre, password_hash) VALUES ($1,$2,$3,$4)`, id, email, strings.TrimSpace(in.Body.Nombre), hashPassword(in.Body.Password)); err != nil {
						return err
					}
					if u, err = getUsuario(ctx, tx, "id", id); err != nil {
						return err
					}
				} else if err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id) VALUES ($1,$2,$3)
					ON CONFLICT (usuario_id, competition_id) DO UPDATE SET rol_id = EXCLUDED.rol_id, estado = 'activo', updated_at = now()`, u.ID, cid, rolID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE invitaciones SET aceptada_at = now() WHERE id = $1`, invID); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "identity.miembro_anadido", map[string]any{"usuarioId": u.ID, "nombre": u.Nombre, "via": "invitacion"},
					events.Competition(cid.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+u.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			tp, err := s.startSession(ctx, u, "web", in.UserAgent, httpx.ClientIPFrom(ctx))
			if err != nil {
				return nil, err
			}
			return s.sessionOut(ctx, u, tp, "web")
		})
}
