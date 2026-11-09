package athletes

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// pesar records a weigh-in (weight, rack heights, openers) of a confirmed athlete. por is who did it: the backoffice
// user, or «OpenLifter · <user>» when it comes from the competition desk (openlifter service).
func (s *Svc) pesar(ctx context.Context, cid, id uuid.UUID, b PesajeIn, por string) (ok bool, sug string, err error) {
	err = s.change(ctx, cid, "athletes.pesaje_registrado", map[string]any{"id": id, "peso": b.Peso}, func(tx pgx.Tx) error {
		r, err := s.lock(ctx, tx, cid, id, "")
		if err != nil {
			return err
		}
		if r.Estado != "confirmado" {
			return problem.Conflict("NO_CONFIRMADO", "Solo se pesa a atletas confirmados.")
		}
		ok, sug = CheckPesaje(r.Sexo, r.Categoria, r.Division, b.Peso)
		estado := map[bool]string{true: "ok", false: "fuera"}[ok]
		if ok {
			sug = ""
		}
		if _, err := tx.Exec(ctx, `UPDATE atletas SET peso_corporal=$2, rack_sq=COALESCE($3, rack_sq), rack_bp=COALESCE(NULLIF($4,''), rack_bp), seguros_bp=COALESCE($5, seguros_bp),
			intento_sq=COALESCE($6, intento_sq), intento_bp=COALESCE($7, intento_bp), intento_dl=COALESCE($8, intento_dl), pesaje_estado=$9, pesaje_sugerencia=$10,
			pesado_at=now(), pesado_por=$11, version=version+1, updated_at=now() WHERE id=$1`,
			id, b.Peso, b.RackSQ, b.RackBP, b.SegurosBP, b.Intentos.SQ, b.Intentos.BP, b.Intentos.DL, estado, sug, por); err != nil {
			return err
		}
		detalle := fmt.Sprintf("%s kg · %s", kg(&b.Peso), map[bool]string{true: "dentro de " + r.Categoria, false: "fuera de " + r.Categoria + " (le corresponde " + sug + ")"}[ok])
		return histPor(ctx, tx, id, por, "Pesaje registrado", detalle)
	})
	return ok, sug, err
}

// Identidad is what the openlifter service needs to match an OpenLifter entry with an athlete (personal data:
// internal only, never logged).
type Identidad struct {
	ID              uuid.UUID `json:"id"`
	Nombre          string    `json:"nombre"`
	Apellidos       string    `json:"apellidos"`
	Email           string    `json:"email,omitempty"`
	Licencia        string    `json:"licencia,omitempty"`
	Sexo            string    `json:"sexo"`
	FechaNacimiento string    `json:"fechaNacimiento,omitempty" doc:"AAAA-MM-DD"`
	Categoria       string    `json:"categoria"`
	Division        string    `json:"division"`
	Club            string    `json:"club,omitempty"`
	Instagram       string    `json:"instagram,omitempty"`
	Flight          string    `json:"flight,omitempty"`
	Plataforma      *int      `json:"plataforma,omitempty"`
	PesoCorporal    *float64  `json:"pesoCorporal,omitempty"`
	Primeros        Marcas    `json:"primeros"`
	RackSQ          *int      `json:"rackSq,omitempty"`
	RackBP          string    `json:"rackBp,omitempty"`
}

// registerOpenLifter exposes, to the openlifter service only (NetworkPolicy), the identity of the confirmed athletes
// and the weigh-in coming from the OpenLifter desk.
func (s *Svc) registerOpenLifter() {
	type idOut struct {
		Body []Identidad
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-atletas-identidad", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/atletas/identidad",
		Summary: "Identidad de los atletas confirmados para emparejarlos con OpenLifter (solo openlifter)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidIn) (*idOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND a.estado = 'confirmado' ORDER BY a.apellidos, a.nombre`, in.CID)
			if err != nil {
				return nil, err
			}
			o := &idOut{Body: make([]Identidad, 0, len(list))}
			for _, r := range list {
				x := Identidad{ID: r.ID, Nombre: r.Nombre, Apellidos: r.Apellidos, Licencia: r.Licencia, Sexo: r.Sexo, Categoria: r.Categoria, Division: r.Division,
					Club: r.Club, Instagram: r.Instagram, Flight: r.Flight, Plataforma: r.Plataforma, PesoCorporal: r.PesoCorporal,
					Primeros: Marcas{r.IntentoSQ, r.IntentoBP, r.IntentoDL}, RackSQ: r.RackSQ, RackBP: r.RackBP}
				if r.Email != nil {
					x.Email = *r.Email
				}
				if r.FechaNacimiento != nil {
					x.FechaNacimiento = r.FechaNacimiento.Format("2006-01-02")
				}
				o.Body = append(o.Body, x)
			}
			return o, nil
		})

	type pesajeIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			PesajeIn
			Por string `json:"por" maxLength:"120" doc:"Quién pesa (auditoría)"`
		}
	}
	type pesajeOut struct {
		Body struct {
			CategoriaOk bool   `json:"categoriaOk"`
			Sugerencia  string `json:"sugerencia"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-atletas-pesaje", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/atletas/{id}/pesaje",
		Summary: "Pesaje registrado en la mesa de OpenLifter (solo openlifter)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *pesajeIn) (*pesajeOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			por := in.Body.Por
			if por == "" {
				por = "OpenLifter"
			}
			o := &pesajeOut{}
			var err error
			o.Body.CategoriaOk, o.Body.Sugerencia, err = s.pesar(ctx, in.CID, in.ID, in.Body.PesajeIn, por)
			return o, err
		})
}
