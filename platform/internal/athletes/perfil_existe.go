package athletes

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/text/unicode/norm"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/crypto"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

const plantillaPerfilExiste = "atleta-perfil-existe"

// passwordInicial is the initial password of an athlete profile created by the organisers (Jaime 25-nov): the
// first name in lowercase, without accents, spaces or symbols, plus 4 random digits («jaime4589»).
// It can be shorter than the 10 characters a person must choose: it is issued by the organisers, marked temporary
// (password_temporal) and the area asks for a new one (≥ 10) on the first login. The policy for chosen passwords
// does not change.
func passwordInicial(nombre string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(strings.ToLower(nombre)) {
		if r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
			b.WriteRune(r)
		}
	}
	base := b.String()
	if base == "" {
		base = "atleta"
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(10000))
	return fmt.Sprintf("%s%04d", base, n.Int64())
}

// PerfilExisteOut is the result (or, with simular, the preview) of the batch.
type PerfilExisteOut struct {
	Enviables     int      `json:"enviables" doc:"Atletas que lo reciben (o lo recibirían)"`
	Emails        int      `json:"emails"`
	WhatsApps     int      `json:"whatsapps"`
	SinEmail      int      `json:"sinEmail"`
	YaEnviados    int      `json:"yaEnviados" doc:"Ya lo recibieron: no se reenvía ni se cambia su contraseña (salvo reenviar)"`
	ConContrasena int      `json:"conContrasena" doc:"Ya tienen su propia contraseña: no se cambia (salvo reenviar)"`
	Menores       int      `json:"menores" doc:"Menores o posibles menores excluidos (salvo incluirMenores)"`
	MenoresNombre []string `json:"menoresNombres"`
	MenoresIncl   int      `json:"menoresIncluidos"`
}

// registerPerfilExiste: «Tu perfil de atleta en la GRS Cup 2 ya existe». For each chosen athlete it sets a new
// initial password (the athlete's login of the área de atleta), links the fan account of the same email (one account
// per email) and queues the email (and the WhatsApp when asked and there is a phone). Idempotent: an athlete already
// notified, or with a password of their own, is skipped unless «reenviar». Minors (and possible minors: sub-júnior
// without a birth date) are excluded unless «incluirMenores». The password only lives in the message body: it travels
// sealed, and the audit and the history carry counts only.
func (s *Svc) registerPerfilExiste(base string) {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs            []uuid.UUID `json:"ids,omitempty" maxItems:"1000" doc:"Atletas a los que se envía; vacío con todos=true = todos los atletas con email"`
			Todos          bool        `json:"todos,omitempty" doc:"Todos los atletas de la competición (no de baja)"`
			WhatsApp       bool        `json:"whatsapp,omitempty" doc:"También por WhatsApp a quien tenga teléfono"`
			IncluirMenores bool        `json:"incluirMenores,omitempty" doc:"Incluir menores y posibles menores (por defecto se excluyen)"`
			Reenviar       bool        `json:"reenviar,omitempty" doc:"Reenviar también a quien ya lo recibió o ya tiene contraseña (se le genera una nueva)"`
			Simular        bool        `json:"simular,omitempty" doc:"Solo contar: no cambia nada ni envía nada"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "atletas-perfil-existe", Method: http.MethodPost, Path: base + "/perfil-existe",
		Summary: "Enviar «Tu perfil de atleta ya existe» con una contraseña inicial (email + WhatsApp opcional); simular=true solo cuenta", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, i *in) (*struct{ Body PerfilExisteOut }, error) {
			if _, err := auth.Require(ctx, i.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			b := i.Body
			if !b.Todos && len(b.IDs) == 0 {
				return nil, problem.Unprocessable("SIN_ATLETAS", "Elige al menos un atleta.")
			}
			compDate := s.compDate(ctx, i.CID)
			where, args := `a.competition_id = $1 AND a.estado <> 'baja'`, []any{i.CID}
			if !b.Todos {
				where += ` AND a.id = ANY($2)`
				args = append(args, b.IDs)
			}
			o := PerfilExisteOut{MenoresNombre: []string{}}
			// One batch per competition at a time: two clicks never send twice.
			lock := s.a.Keys.Of("athletes", "perfil-existe", i.CID.String())
			if !b.Simular {
				if ok, err := s.a.Redis.SetNX(ctx, lock, 1, 5*time.Minute).Result(); err != nil || !ok {
					return nil, problem.Conflict("ENVIO_EN_CURSO", "Ya se está enviando el acceso al perfil. Espera a que termine.")
				}
				defer s.a.Redis.Del(context.WithoutCancel(ctx), lock)
			}
			run := func(tx pgx.Tx) error {
				list, err := listRows(ctx, tx, where, args...)
				if err != nil {
					return err
				}
				for _, r := range list {
					if r.Email == nil || strings.TrimSpace(*r.Email) == "" {
						o.SinEmail++
						continue
					}
					if r.menor(compDate) {
						if !b.IncluirMenores {
							o.Menores++
							o.MenoresNombre = append(o.MenoresNombre, r.nombreCompleto())
							continue
						}
						o.MenoresIncl++
					}
					var enviado bool
					var conPw bool
					if err := tx.QueryRow(ctx, `SELECT acceso_enviado_at IS NOT NULL, COALESCE(password_hash, '') <> '' FROM atletas WHERE id = $1`, r.ID).Scan(&enviado, &conPw); err != nil {
						return err
					}
					if !b.Reenviar && enviado {
						o.YaEnviados++
						continue
					}
					if !b.Reenviar && conPw {
						o.ConContrasena++
						continue
					}
					o.Enviables++
					if b.Simular {
						continue
					}
					pw := passwordInicial(r.Nombre)
					// Guarded update: a concurrent batch that got here first wins (no second password, no second email).
					tag, err := tx.Exec(ctx, `UPDATE atletas SET password_hash = $2, password_temporal = true, acceso_enviado_at = now(), updated_at = now()
						WHERE id = $1 AND ($3 OR (acceso_enviado_at IS NULL AND COALESCE(password_hash, '') = ''))`, r.ID, areaHash(pw), b.Reenviar)
					if err != nil {
						return err
					}
					if tag.RowsAffected() == 0 {
						o.Enviables--
						o.YaEnviados++
						continue
					}
					// Sessions opened with the old password close with it.
					if _, err := tx.Exec(ctx, `DELETE FROM area_sesiones WHERE atleta_id = $1`, r.ID); err != nil {
						return err
					}
					// One account per email: the fan account of this email (if any) becomes this athlete's.
					if err := unirCuentaFan(ctx, tx, i.CID, r.ID, *r.Email, r.Telefono, nil); err != nil {
						return err
					}
					v := map[string]string{"nombre": r.Nombre, "enlace": s.webURL + "/area-atleta", "email": normEmail(*r.Email),
						"password": crypto.SellarVar(s.a.Cfg.InternalToken, plantillaPerfilExiste, pw)}
					if err := email(ctx, tx, i.CID, normEmail(*r.Email), plantillaPerfilExiste, v); err != nil {
						return err
					}
					o.Emails++
					if b.WhatsApp && r.Telefono != "" {
						if err := whatsapp(ctx, tx, i.CID, r.Telefono, false, plantillaPerfilExiste, v, ""); err != nil {
							return err
						}
						o.WhatsApps++
					}
					if err := hist(ctx, tx, r.ID, "Acceso al perfil enviado", "Contraseña inicial nueva por email"); err != nil {
						return err
					}
				}
				return nil
			}
			if b.Simular {
				return &struct{ Body PerfilExisteOut }{o}, db.Tx(ctx, s.a.DB, run)
			}
			ev := map[string]any{"todos": b.Todos, "whatsapp": b.WhatsApp, "incluirMenores": b.IncluirMenores, "reenviar": b.Reenviar}
			err := s.change(ctx, i.CID, "athletes.perfil_existe_enviado", ev, func(tx pgx.Tx) error {
				if err := run(tx); err != nil {
					return err
				}
				ev["emails"], ev["whatsapps"], ev["sinEmail"], ev["yaEnviados"], ev["conContrasena"], ev["menores"] = o.Emails, o.WhatsApps, o.SinEmail, o.YaEnviados, o.ConContrasena, o.Menores
				return nil
			})
			return &struct{ Body PerfilExisteOut }{o}, err
		})
}
