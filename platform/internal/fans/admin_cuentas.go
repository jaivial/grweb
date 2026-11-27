package fans

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/passhash"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// minPassword is the team's password policy (identity): an admin-set password follows it too.
const minPassword = 10

// CuentaIn is the editable data of an account (create: all required but the phone and the password).
type CuentaIn struct {
	Email    *string `json:"email,omitempty" maxLength:"254"`
	Alias    *string `json:"alias,omitempty" maxLength:"20"`
	Tipo     *string `json:"tipo,omitempty" enum:"atleta,publico"`
	Telefono *string `json:"telefono,omitempty" maxLength:"30" doc:"Vacío = sin teléfono"`
	Password *string `json:"password,omitempty" maxLength:"128" doc:"Nueva contraseña (mín. 10 caracteres); vacío = no se cambia"`
}

// datosCuenta are the validated values of CuentaIn applied on top of the current account.
type datosCuenta struct {
	email, alias, tipo, telefono, password string
	atletaID                               uuid.UUID
	// actual is the account being edited (nil when creating): its athlete link stays while email and tipo do not change.
	actual *fanRow
}

// validarCuenta checks the fields present in in and fills d (which starts with the current values).
func (s *Svc) validarCuenta(ctx context.Context, cid, fanID uuid.UUID, in CuentaIn, d *datosCuenta) error {
	if in.Email != nil {
		e := strings.ToLower(strings.TrimSpace(*in.Email))
		if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
			return problem.Unprocessable("EMAIL_INVALIDO", "Escribe un email válido.")
		}
		d.email = e
	}
	if in.Alias != nil {
		if d.alias = validarAlias(*in.Alias); d.alias == "" {
			return problem.Unprocessable("ALIAS_NO_VALIDO", "El alias debe tener entre 3 y 20 letras, números, espacios o _ . - , sin palabras prohibidas.")
		}
	}
	if in.Tipo != nil {
		d.tipo = *in.Tipo
	}
	if in.Telefono != nil {
		tel, ok := normTelefono(*in.Telefono)
		if !ok {
			return problem.Unprocessable("TELEFONO_NO_VALIDO", "El teléfono no es válido. Escríbelo con prefijo, p. ej. +34 600 123 456, o déjalo vacío.")
		}
		d.telefono = tel
	}
	if in.Password != nil && *in.Password != "" {
		if len([]rune(*in.Password)) < minPassword {
			return problem.Unprocessable("CONTRASENA_DEBIL", "La contraseña debe tener al menos 10 caracteres.")
		}
		d.password = *in.Password
	}
	var n int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM fans WHERE competition_id = $1 AND email_hash = $2 AND id <> $3`, cid, emailHash(d.email), fanID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return problem.Conflict("EMAIL_REGISTRADO", "Ya hay otra cuenta con este email en la competición.")
	}
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM fans WHERE competition_id = $1 AND alias = $2 AND id <> $3`, cid, d.alias, fanID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return aliasOcupado()
	}
	if a := d.actual; a != nil && a.Tipo == fanauth.TipoAtleta && a.AtletaID != uuid.Nil && d.tipo == a.Tipo && d.email == strings.ToLower(a.Email) {
		d.atletaID = a.AtletaID
		return nil
	}
	d.atletaID = uuid.Nil
	// One account per email: the email of an athlete is always an atleta account.
	if d.tipo != fanauth.TipoAtleta {
		if aid := s.atletaDeEmail(ctx, cid, d.email); aid != uuid.Nil {
			d.tipo, d.atletaID = fanauth.TipoAtleta, aid
		}
		return nil
	}
	{
		aid, err := s.atletas.porEmail(ctx, cid, d.email)
		if err != nil {
			s.a.Log.Warn("athletes por-email no disponible", "err", err)
			return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No podemos comprobar la inscripción ahora mismo. Inténtalo en unos segundos.")
		}
		if aid == uuid.Nil {
			return problem.Unprocessable("ATLETA_NO_ENCONTRADO", "Ese email no es de ningún atleta inscrito. Crea la cuenta como público o usa el email de la inscripción.")
		}
		d.atletaID = aid
	}
	return nil
}

func unicidad(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		if strings.Contains(pg.ConstraintName, "alias") {
			return aliasOcupado()
		}
		return problem.Conflict("EMAIL_REGISTRADO", "Ya hay otra cuenta con este email en la competición.")
	}
	return err
}

func nulo(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}

func (s *Svc) fanAdmin(ctx context.Context, cid, id uuid.UUID) (FanAdmin, error) {
	var f FanAdmin
	err := s.a.DB.QueryRow(ctx, selAdmin+` WHERE id = $1 AND competition_id = $2`, id, cid).Scan(scanAdmin(&f)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, problem.NotFound("No existe esa cuenta de directo en la competición.")
	}
	return f, err
}

// registerCuentas: create, edit (password included), delete and send a password-reset link (backoffice «Fans»).
func (s *Svc) registerCuentas(api huma.API, base string, operar func(context.Context, uuid.UUID) error) {
	sec := []map[string][]string{{"bearer": {}}}
	type CidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type FanIn struct {
		CID   uuid.UUID `path:"cid"`
		FanID uuid.UUID `path:"fanId"`
	}
	evento := func(ctx context.Context, tx pgx.Tx, cid uuid.UUID, typ string, data map[string]any) error {
		return events.Enqueue(ctx, tx, events.New(ctx, typ, data, events.Competition(cid.String()), events.ForPermission("directo.operar")))
	}

	// ---- crear ----
	type crearIn struct {
		CidIn
		Body CuentaIn
	}
	huma.Register(api, huma.Operation{OperationID: "fans-admin-crear", Method: http.MethodPost, Path: base,
		Summary: "Crear una cuenta de directo (sin enlace: entra con la contraseña o pidiendo uno)", Tags: tagAdmin, Security: sec, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *crearIn) (*struct{ Body FanAdmin }, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if b.Email == nil || b.Alias == nil || b.Tipo == nil {
				return nil, problem.Unprocessable("FALTAN_DATOS", "Escribe el email, el alias y el tipo de la cuenta.")
			}
			d := datosCuenta{}
			if err := s.validarCuenta(ctx, in.CID, uuid.Nil, b, &d); err != nil {
				return nil, err
			}
			hash := ""
			if d.password != "" {
				hash = passhash.Hash(d.password)
			}
			id := newID()
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO fans (id, competition_id, email, email_hash, tipo, alias, atleta_id, telefono, password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
					id, in.CID, d.email, emailHash(d.email), d.tipo, d.alias, nulo(d.atletaID), d.telefono, hash); err != nil {
					return unicidad(err)
				}
				return evento(ctx, tx, in.CID, "fans.creado", map[string]any{"fanId": id, "alias": d.alias, "tipo": d.tipo, "conContrasena": hash != ""})
			})
			if err != nil {
				return nil, err
			}
			s.passwordAAtleta(ctx, in.CID, d.tipo, d.atletaID, hash)
			f, err := s.fanAdmin(ctx, in.CID, id)
			return &struct{ Body FanAdmin }{f}, err
		})

	// ---- editar ----
	type editarIn struct {
		FanIn
		Body CuentaIn
	}
	huma.Register(api, huma.Operation{OperationID: "fans-admin-editar", Method: http.MethodPatch, Path: base + "/{fanId}",
		Summary: "Editar una cuenta de directo (email, alias, tipo, teléfono y contraseña); cierra sus sesiones si cambia algo de la cuenta", Tags: tagAdmin, Security: sec},
		func(ctx context.Context, in *editarIn) (*struct{ Body FanAdmin }, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1 AND competition_id = $2`, in.FanID, in.CID))
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("No existe esa cuenta de directo en la competición.")
			} else if err != nil {
				return nil, err
			}
			d := datosCuenta{email: strings.ToLower(row.Email), alias: row.Alias, tipo: row.Tipo, telefono: row.Telefono, actual: &row}
			if err := s.validarCuenta(ctx, in.CID, row.ID, in.Body, &d); err != nil {
				return nil, err
			}
			var campos []string
			for _, c := range []struct {
				n       string
				cambiar bool
			}{{"email", d.email != strings.ToLower(row.Email)}, {"alias", d.alias != row.Alias}, {"tipo", d.tipo != row.Tipo}, {"teléfono", d.telefono != row.Telefono}, {"contraseña", d.password != ""}} {
				if c.cambiar {
					campos = append(campos, c.n)
				}
			}
			if len(campos) == 0 {
				f, err := s.fanAdmin(ctx, in.CID, row.ID)
				return &struct{ Body FanAdmin }{f}, err
			}
			hash := ""
			if d.password != "" {
				hash = passhash.Hash(d.password)
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE fans SET email = $3, email_hash = $4, alias = $5, tipo = $6, atleta_id = $7, telefono = $8,
					password_hash = CASE WHEN $9 = '' THEN password_hash ELSE $9 END, password_reset_hasta = CASE WHEN $9 = '' THEN password_reset_hasta ELSE NULL END, updated_at = now()
					WHERE id = $1 AND competition_id = $2`, row.ID, in.CID, d.email, emailHash(d.email), d.alias, d.tipo, nulo(d.atletaID), d.telefono, hash); err != nil {
					return unicidad(err)
				}
				return evento(ctx, tx, in.CID, "fans.editado", map[string]any{"fanId": row.ID, "alias": d.alias, "campos": campos})
			})
			if err != nil {
				return nil, err
			}
			s.passwordAAtleta(ctx, in.CID, d.tipo, d.atletaID, hash)
			// The session carries alias and tipo, and a new password or email must close the old sessions.
			if !(len(campos) == 1 && campos[0] == "teléfono") {
				if _, err := s.bumpVersion(ctx, row.ID); err != nil {
					return nil, err
				}
			}
			f, err := s.fanAdmin(ctx, in.CID, row.ID)
			return &struct{ Body FanAdmin }{f}, err
		})

	// ---- borrar ----
	huma.Register(api, huma.Operation{OperationID: "fans-admin-borrar", Method: http.MethodDelete, Path: base + "/{fanId}",
		Summary: "Borrar una cuenta de directo (cierra sus sesiones y anula sus enlaces pendientes)", Tags: tagAdmin, Security: sec, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *FanIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1 AND competition_id = $2`, in.FanID, in.CID))
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("No existe esa cuenta de directo en la competición.")
			} else if err != nil {
				return nil, err
			}
			if _, err := s.bumpVersion(ctx, row.ID); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `DELETE FROM accesos WHERE competition_id = $1 AND email_hash = $2 AND usado_at IS NULL`, in.CID, emailHash(row.Email)); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `DELETE FROM fans WHERE id = $1 AND competition_id = $2`, row.ID, in.CID); err != nil {
					return err
				}
				return evento(ctx, tx, in.CID, "fans.borrado", map[string]any{"fanId": row.ID, "alias": row.Alias, "tipo": row.Tipo})
			})
		})

	// ---- enlace para cambiar la contraseña ----
	huma.Register(api, huma.Operation{OperationID: "fans-admin-reset", Method: http.MethodPost, Path: base + "/{fanId}/reset-contrasena",
		Summary: "Enviar al fan un enlace para crear o cambiar su contraseña (caduca en 30 minutos)", Tags: tagAdmin, Security: sec, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *FanIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1 AND competition_id = $2`, in.FanID, in.CID))
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("No existe esa cuenta de directo en la competición.")
			} else if err != nil {
				return nil, err
			}
			tok := randomToken()
			email := strings.ToLower(row.Email)
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				// Same link as «¿Has olvidado tu contraseña?» (no alias: redeeming it opens the 30-minute window).
				if _, err := tx.Exec(ctx, `INSERT INTO accesos (id, competition_id, token_hash, fan_email, email_hash, tipo, alias, ip, next, telefono, expires_at)
					VALUES ($1,$2,$3,$4,$5,$6,'','','','', now() + interval '30 minutes')`, newID(), in.CID, hashToken(tok), email, emailHash(email), row.Tipo); err != nil {
					return err
				}
				if err := emailSolicitado(ctx, tx, in.CID, email, "fans-acceso-contrasena", map[string]string{"alias": row.Alias, "tipo": row.Tipo, "enlace": s.webURL + "/restablecer-contrasena?token=" + tok}); err != nil {
					return err
				}
				return evento(ctx, tx, in.CID, "fans.reset_enviado", map[string]any{"fanId": row.ID, "alias": row.Alias})
			})
		})
}
