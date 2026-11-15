package athletes

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// registerAccionNecesaria: the organisers ask one or more athletes for something («Sube tu licencia», «Paga la
// diferencia»): an email and, when there is a phone, a WhatsApp with an interactive button to the athlete's area.
func (s *Svc) registerAccionNecesaria(base string) {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs     []uuid.UUID `json:"ids" minItems:"1" maxItems:"500" doc:"Atletas a los que se pide la acción"`
			Accion  string      `json:"accion" minLength:"3" maxLength:"120" doc:"Qué tiene que hacer («Sube tu licencia AEP»)"`
			Detalle string      `json:"detalle,omitempty" maxLength:"400" doc:"Explicación (opcional)"`
			Fecha   string      `json:"fecha,omitempty" maxLength:"60" doc:"Fecha límite en texto («viernes 11 de diciembre»); vacío = sin fecha"`
			Enlace  string      `json:"enlace,omitempty" maxLength:"300" pattern:"^(https?://.*)?$" doc:"Dónde resolverlo; vacío = un enlace a su área"`
		}
	}
	type out struct {
		Body struct {
			Emails    int `json:"emails"`
			WhatsApps int `json:"whatsapps"`
			SinEmail  int `json:"sinEmail"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "atletas-accion-necesaria", Method: http.MethodPost, Path: base + "/accion-necesaria", Summary: "Pedir una acción a uno o varios atletas (email + WhatsApp)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, i *in) (*out, error) {
			if _, err := auth.Require(ctx, i.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			o := &out{}
			err := s.change(ctx, i.CID, "athletes.accion_necesaria", map[string]any{"atletas": len(i.Body.IDs), "accion": i.Body.Accion}, func(tx pgx.Tx) error {
				list, err := listRows(ctx, tx, `a.competition_id = $1 AND a.id = ANY($2) AND a.estado <> 'baja'`, i.CID, i.Body.IDs)
				if err != nil {
					return err
				}
				for _, r := range list {
					if r.Email == nil || *r.Email == "" {
						o.Body.SinEmail++
						continue
					}
					enlace := i.Body.Enlace
					if enlace == "" {
						if enlace, err = s.newAreaLink(ctx, tx, r.ID); err != nil {
							return err
						}
					}
					v := map[string]string{"nombre": r.Nombre, "accion": i.Body.Accion, "detalle": i.Body.Detalle, "fecha": i.Body.Fecha, "enlace": enlace}
					if err := email(ctx, tx, i.CID, *r.Email, "atleta-accion-necesaria", v); err != nil {
						return err
					}
					o.Body.Emails++
					if r.Telefono != "" {
						if err := whatsapp(ctx, tx, i.CID, r.Telefono, false, "atleta-accion-necesaria", v, ""); err != nil {
							return err
						}
						o.Body.WhatsApps++
					}
					if err := hist(ctx, tx, r.ID, "Acción necesaria pedida", i.Body.Accion); err != nil {
						return err
					}
				}
				return nil
			})
			return o, err
		})
}
