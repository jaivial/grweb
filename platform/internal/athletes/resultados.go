package athletes

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// registerResultados: the live service publishes a category and asks for the notices (the athlete and the
// followers of a public profile), once per athlete; the competition desk's delay reaches the 30-minute notice.
func (s *Svc) registerResultados() {
	type fila struct {
		AtletaID uuid.UUID `json:"atletaId"`
		Puesto   int       `json:"puesto"`
		Total    *float64  `json:"total,omitempty"`
		SinTotal bool      `json:"sinTotal,omitempty"`
	}
	type resIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Titulo string `json:"titulo" maxLength:"60"`
			Filas  []fila `json:"filas" maxItems:"300"`
		}
	}
	type resOut struct {
		Body struct {
			Atletas    int `json:"atletas"`
			Seguidores int `json:"seguidores"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-resultados", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/resultados", Summary: "Avisos de resultados publicados (solo live)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *resIn) (*resOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &resOut{}
			c, err := s.comps.ByID(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			d := s.compDate(ctx, in.CID)
			enlace := s.webURL + "/resultados/" + itoa(c.Year())
			ids := make([]uuid.UUID, 0, len(in.Body.Filas))
			byID := map[uuid.UUID]fila{}
			for _, f := range in.Body.Filas {
				if f.Puesto > 0 || f.SinTotal {
					ids = append(ids, f.AtletaID)
					byID[f.AtletaID] = f
				}
			}
			list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND a.id = ANY($2)`, in.CID, ids)
			if err != nil {
				return nil, err
			}
			for _, r := range list {
				f := byID[r.ID]
				resultado := "sin total (algún movimiento sin intento válido)"
				puesto := "—"
				total := "—"
				if f.Puesto > 0 {
					suf := ".º"
					if r.Sexo == "F" {
						suf = ".ª"
					}
					puesto = itoa(f.Puesto) + suf
					total = kg(f.Total) + " kg"
					resultado = puesto + " con " + total
				}
				err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
					tag, err := tx.Exec(ctx, `INSERT INTO avisos_resultado (competition_id, atleta_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, in.CID, r.ID)
					if err != nil || tag.RowsAffected() == 0 {
						return err
					}
					v := map[string]string{"nombre": r.Nombre, "atleta": r.nombreCompleto(), "categoria": in.Body.Titulo, "puesto": puesto, "total": total, "resultado": resultado, "enlace": enlace}
					n := 0
					if r.Email != nil && strings.TrimSpace(*r.Email) != "" {
						if err := email(ctx, tx, in.CID, *r.Email, "resultados-atleta", v); err != nil {
							return err
						}
						o.Body.Atletas++
					}
					// Followers only hear about public profiles (a minor without authorisation stays out).
					if r.publico(d) {
						segs, err := tx.Query(ctx, `SELECT id, email::text FROM seguimientos WHERE atleta_id = $1 AND confirmado_at IS NOT NULL AND baja_at IS NULL`, r.ID)
						if err != nil {
							return err
						}
						type seg struct {
							id   uuid.UUID
							mail string
						}
						var ss []seg
						for segs.Next() {
							var g seg
							if err := segs.Scan(&g.id, &g.mail); err != nil {
								segs.Close()
								return err
							}
							ss = append(ss, g)
						}
						segs.Close()
						for _, g := range ss {
							vv := map[string]string{"atleta": v["atleta"], "categoria": v["categoria"], "puesto": puesto, "total": total, "resultado": resultado, "enlace": enlace,
								"baja": s.webURL + "/atletas/" + r.Slug + "?baja=" + s.bajaToken(g.id)}
							if err := email(ctx, tx, in.CID, g.mail, "resultados-seguidor", vv); err != nil {
								return err
							}
							n++
						}
						o.Body.Seguidores += n
					}
					_, err = tx.Exec(ctx, `UPDATE avisos_resultado SET enviados = $3 WHERE competition_id = $1 AND atleta_id = $2`, in.CID, r.ID, n)
					return err
				})
				if err != nil {
					return nil, err
				}
			}
			return o, nil
		})

	type retIn struct {
		CID    uuid.UUID `path:"cid"`
		Flight string    `path:"flight" maxLength:"8"`
		Body   struct {
			RetrasoMin int `json:"retrasoMin" minimum:"0" maximum:"600"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-retraso", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/flights/{flight}/retraso", Summary: "Retraso en directo de un flight (solo schedule)", Tags: []string{"Interno"}, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *retIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			_, err := s.a.DB.Exec(ctx, `INSERT INTO retrasos (competition_id, flight, retraso_min) VALUES ($1,$2,$3)
				ON CONFLICT (competition_id, flight) DO UPDATE SET retraso_min = EXCLUDED.retraso_min, updated_at = now()`, in.CID, in.Flight, in.Body.RetrasoMin)
			return nil, err
		})
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
