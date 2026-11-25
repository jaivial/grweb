package athletes

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"unicode"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/text/unicode/norm"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/crypto"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

const plantillaPerfilExiste = "atleta-perfil-existe"

// passwordInicial is the initial password of an athlete profile created by the organisers (Jaime 25-nov): the
// first name in lowercase, without accents, spaces or symbols, plus 4 random digits («jaime4589»).
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

// registerPerfilExiste: «Tu perfil de atleta en la GRS Cup 2 ya existe». For each chosen athlete it sets a new
// initial password and queues the email (and the WhatsApp when asked and there is a phone) with it. The password
// only lives in the message body: it travels sealed, and the audit and the history carry counts only.
func (s *Svc) registerPerfilExiste(base string) {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs      []uuid.UUID `json:"ids,omitempty" maxItems:"1000" doc:"Atletas a los que se envía; vacío con todos=true = todos los atletas con email"`
			Todos    bool        `json:"todos,omitempty" doc:"Todos los atletas de la competición con email (no de baja)"`
			WhatsApp bool        `json:"whatsapp,omitempty" doc:"También por WhatsApp a quien tenga teléfono"`
		}
	}
	type out struct {
		Body struct {
			Emails    int `json:"emails"`
			WhatsApps int `json:"whatsapps"`
			SinEmail  int `json:"sinEmail"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "atletas-perfil-existe", Method: http.MethodPost, Path: base + "/perfil-existe",
		Summary: "Enviar «Tu perfil de atleta ya existe» con una contraseña inicial nueva (email + WhatsApp opcional)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, i *in) (*out, error) {
			if _, err := auth.Require(ctx, i.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if !i.Body.Todos && len(i.Body.IDs) == 0 {
				return nil, problem.Unprocessable("SIN_ATLETAS", "Elige al menos un atleta.")
			}
			o := &out{}
			ev := map[string]any{"todos": i.Body.Todos, "whatsapp": i.Body.WhatsApp}
			err := s.change(ctx, i.CID, "athletes.perfil_existe_enviado", ev, func(tx pgx.Tx) error {
				where, args := `a.competition_id = $1 AND a.estado <> 'baja'`, []any{i.CID}
				if !i.Body.Todos {
					where += ` AND a.id = ANY($2)`
					args = append(args, i.Body.IDs)
				}
				list, err := listRows(ctx, tx, where, args...)
				if err != nil {
					return err
				}
				for _, r := range list {
					if r.Email == nil || *r.Email == "" {
						o.Body.SinEmail++
						continue
					}
					pw := passwordInicial(r.Nombre)
					if _, err := tx.Exec(ctx, `UPDATE atletas SET password_hash = $2, updated_at = now() WHERE id = $1`, r.ID, areaHash(pw)); err != nil {
						return err
					}
					// Sessions opened with the old password close with it.
					if _, err := tx.Exec(ctx, `DELETE FROM area_sesiones WHERE atleta_id = $1`, r.ID); err != nil {
						return err
					}
					v := map[string]string{"nombre": r.Nombre, "enlace": s.webURL + "/area-atleta", "email": *r.Email,
						"password": crypto.SellarVar(s.a.Cfg.InternalToken, plantillaPerfilExiste, pw)}
					if err := email(ctx, tx, i.CID, *r.Email, plantillaPerfilExiste, v); err != nil {
						return err
					}
					o.Body.Emails++
					if i.Body.WhatsApp && r.Telefono != "" {
						if err := whatsapp(ctx, tx, i.CID, r.Telefono, false, plantillaPerfilExiste, v, ""); err != nil {
							return err
						}
						o.Body.WhatsApps++
					}
					if err := hist(ctx, tx, r.ID, "Acceso al perfil enviado", "Contraseña inicial nueva por email"); err != nil {
						return err
					}
				}
				ev["emails"], ev["whatsapps"], ev["sinEmail"] = o.Body.Emails, o.Body.WhatsApps, o.Body.SinEmail
				return nil
			})
			return o, err
		})
}
