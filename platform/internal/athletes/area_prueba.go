package athletes

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// PruebaArea is the «Tu competición» choice of the athlete area (Figma 42 · «Tu competición · estados»).
type PruebaArea struct {
	Elegida   string       `json:"elegida" doc:"aep2, aep3 o vacío (sin elegir)"`
	Opciones  []PruebaAlta `json:"opciones"`
	Limite    string       `json:"limite,omitempty" doc:"Último día para cambiarla (AAAA-MM-DD, hasta las 12:00)"`
	Cerrada   bool         `json:"cerrada" doc:"Pasó el límite: solo la organización puede cambiarla"`
	CambioOrg string       `json:"cambioOrg,omitempty" doc:"Fecha (RFC 3339) en que la organización la cambió"`
}

func (s *Svc) pruebaArea(ctx context.Context, cid, atleta uuid.UUID, elegida string) *PruebaArea {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return nil
	}
	p := &PruebaArea{Elegida: elegida}
	p.Opciones, p.Limite = s.pruebas(ctx, c)
	if p.Limite != "" {
		if d, err := time.ParseInLocation(time.DateOnly, p.Limite, madrid); err == nil {
			p.Cerrada = time.Now().After(d.Add(12 * time.Hour))
		}
	}
	var org *time.Time
	if s.a.DB.QueryRow(ctx, `SELECT prueba_org_at FROM atletas WHERE id = $1`, atleta).Scan(&org) == nil && org != nil {
		p.CambioOrg = org.Format(time.RFC3339)
	}
	return p
}

func (s *Svc) registerAreaPrueba() {
	type pruebaIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			Prueba string `json:"prueba" enum:"aep2,aep3"`
		}
	}
	type panelOut struct{ Body Panel }
	huma.Register(s.a.API, huma.Operation{OperationID: "area-prueba", Method: http.MethodPut, Path: "/api/area-atleta/prueba", Summary: "Elegir mi competición (AEP-2 o AEP-3)", Tags: tagArea},
		func(ctx context.Context, in *pruebaIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if pa := s.pruebaArea(ctx, r.CompetitionID, r.ID, r.Prueba); pa != nil && pa.Cerrada {
				return nil, problem.Conflict("ELECCION_CERRADA", "La elección de competición ya está cerrada. Escribe a la organización para cambiarla.")
			}
			if in.Body.Prueba != r.Prueba {
				err = s.change(ctx, r.CompetitionID, "athletes.prueba_elegida", map[string]any{"id": r.ID, "prueba": in.Body.Prueba}, func(tx pgx.Tx) error {
					if err := s.muevePlaza(ctx, tx, r.CompetitionID, r.ID, in.Body.Prueba, false); err != nil {
						if pe := (*problem.Error)(nil); errors.As(err, &pe) && pe.Status == http.StatusConflict {
							return problem.Conflict("CUPO_COMPLETO", "No quedan plazas en "+pruebaTexto(in.Body.Prueba)+".")
						}
						return err
					}
					if _, err := tx.Exec(ctx, `UPDATE atletas SET prueba = $2, prueba_org_at = NULL, version = version + 1, updated_at = now() WHERE id = $1`, r.ID, in.Body.Prueba); err != nil {
						return err
					}
					return hist(ctx, tx, r.ID, "Competición elegida por el atleta", pruebaTexto(in.Body.Prueba))
				})
				if err != nil {
					return nil, err
				}
			}
			if r, err = s.session(ctx, in.Session); err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})
}
