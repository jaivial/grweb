package athletes

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// Asignacion is the published flight of an athlete (written by schedule).
type Asignacion struct {
	AtletaID     uuid.UUID `json:"atletaId"`
	Flight       string    `json:"flight" maxLength:"4"`
	Plataforma   int       `json:"plataforma" minimum:"1" maximum:"4"`
	Inicio       time.Time `json:"inicio"`
	PesajeInicio time.Time `json:"pesajeInicio"`
	PesajeFin    time.Time `json:"pesajeFin"`
}

// registerHorarios: schedule publishes a version → every confirmed athlete gets its flight and times (athletes not
// in the version are cleared), with a history entry, and the affected ones (and their followers, if asked) an email.
// Notices are idempotent per version, so a retried publication does not email twice.
func (s *Svc) registerHorarios() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Version          int          `json:"version" minimum:"1"`
			Asignaciones     []Asignacion `json:"asignaciones" maxItems:"2000"`
			Afectados        []uuid.UUID  `json:"afectados" maxItems:"2000"`
			AvisarAtletas    bool         `json:"avisarAtletas"`
			AvisarSeguidores bool         `json:"avisarSeguidores"`
		}
	}
	type out struct {
		Body struct {
			Actualizados     int `json:"actualizados"`
			AvisosAtletas    int `json:"avisosAtletas"`
			AvisosSeguidores int `json:"avisosSeguidores"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/horarios", Summary: "Aplicar los horarios publicados (solo schedule)", Tags: []string{"Interno"}, Hidden: true, MaxBodyBytes: 2 << 20},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			b := in.Body
			loc := madrid
			if c, err := s.comps.ByID(ctx, in.CID); err == nil && c.ZonaHoraria != "" {
				if l, err := time.LoadLocation(c.ZonaHoraria); err == nil {
					loc = l
				}
			}
			hm := func(t time.Time) string { return t.In(loc).Format("15:04") }
			dia := func(t time.Time) string {
				return strings.ToLower(diasSemana[t.In(loc).Weekday()]) + " " + t.In(loc).Format("2/1")
			}
			afectado := map[uuid.UUID]bool{}
			for _, id := range b.Afectados {
				afectado[id] = true
			}
			nueva := map[uuid.UUID]Asignacion{}
			ids := make([]uuid.UUID, 0, len(b.Asignaciones))
			for _, a := range b.Asignaciones {
				nueva[a.AtletaID] = a
				ids = append(ids, a.AtletaID)
			}
			err := s.change(ctx, in.CID, "", nil, func(tx pgx.Tx) error {
				// Clear whoever is no longer in a flight.
				rows, err := tx.Query(ctx, `UPDATE atletas SET flight = '', plataforma = NULL, hora_inicio = NULL, pesaje_inicio = NULL, pesaje_fin = NULL, updated_at = now(), version = version + 1
					WHERE competition_id = $1 AND flight <> '' AND NOT (id = ANY($2)) RETURNING id`, in.CID, ids)
				if err != nil {
					return err
				}
				quitados, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
				if err != nil {
					return err
				}
				for _, id := range quitados {
					o.Body.Actualizados++
					if err := hist(ctx, tx, id, "Horario retirado", fmt.Sprintf("Ya no está en ningún flight (v%d)", b.Version)); err != nil {
						return err
					}
				}
				for _, a := range b.Asignaciones {
					tag, err := tx.Exec(ctx, `UPDATE atletas SET flight = $3, plataforma = $4, hora_inicio = $5, pesaje_inicio = $6, pesaje_fin = $7, updated_at = now(), version = version + 1
						WHERE competition_id = $1 AND id = $2 AND (flight, plataforma, hora_inicio, pesaje_inicio, pesaje_fin) IS DISTINCT FROM ($3, $4, $5, $6, $7)`,
						in.CID, a.AtletaID, a.Flight, a.Plataforma, a.Inicio, a.PesajeInicio, a.PesajeFin)
					if err != nil {
						return err
					}
					if tag.RowsAffected() == 0 {
						continue
					}
					o.Body.Actualizados++
					if err := hist(ctx, tx, a.AtletaID, "Horario publicado", fmt.Sprintf("v%d · Flight %s · Plataforma %d · %s %s · pesaje %s–%s",
						b.Version, a.Flight, a.Plataforma, dia(a.Inicio), hm(a.Inicio), hm(a.PesajeInicio), hm(a.PesajeFin))); err != nil {
						return err
					}
				}
				if len(afectado) == 0 || (!b.AvisarAtletas && !b.AvisarSeguidores) {
					return nil
				}
				list, err := listRows(ctx, tx, `a.competition_id = $1 AND a.id = ANY($2)`, in.CID, b.Afectados)
				if err != nil {
					return err
				}
				for _, r := range list {
					a, tiene := nueva[r.ID]
					vars := map[string]string{"nombre": r.Nombre, "atleta": r.nombreCompleto(), "horarios": s.webURL + "/horarios", "version": fmt.Sprint(b.Version)}
					plantilla, plantillaSeg := "horario-cambio", "horario-seguidor"
					if tiene {
						vars["flight"], vars["plataforma"], vars["dia"], vars["hora"] = a.Flight, fmt.Sprint(a.Plataforma), dia(a.Inicio), hm(a.Inicio)
						vars["pesaje"] = hm(a.PesajeInicio) + "–" + hm(a.PesajeFin)
					} else {
						plantilla, plantillaSeg = "horario-sin-flight", ""
					}
					if b.AvisarAtletas && r.Email != nil && *r.Email != "" && r.Estado == "confirmado" {
						vars["enlace"] = s.webURL + "/area-atleta"
						if ok, err := s.avisoNuevo(ctx, tx, in.CID, b.Version, r.ID); err != nil {
							return err
						} else if ok {
							if err := email(ctx, tx, in.CID, *r.Email, plantilla, vars); err != nil {
								return err
							}
							o.Body.AvisosAtletas++
						}
					}
					if !b.AvisarSeguidores || plantillaSeg == "" || r.Estado != "confirmado" {
						continue
					}
					segs, err := tx.Query(ctx, `SELECT id, email::text FROM seguimientos WHERE atleta_id = $1 AND confirmado_at IS NOT NULL AND baja_at IS NULL`, r.ID)
					if err != nil {
						return err
					}
					type seg struct {
						id    uuid.UUID
						email string
					}
					var ss []seg
					for segs.Next() {
						var x seg
						if err := segs.Scan(&x.id, &x.email); err != nil {
							segs.Close()
							return err
						}
						ss = append(ss, x)
					}
					if err := segs.Err(); err != nil {
						return err
					}
					for _, x := range ss {
						if ok, err := s.avisoNuevo(ctx, tx, in.CID, b.Version, x.id); err != nil {
							return err
						} else if !ok {
							continue
						}
						v := map[string]string{"atleta": r.nombreCompleto(), "flight": vars["flight"], "dia": vars["dia"], "hora": vars["hora"], "horarios": vars["horarios"],
							"baja": s.webURL + "/atletas/" + r.Slug + "?baja=" + s.bajaToken(x.id)}
						if r.Slug != "" {
							v["enlace"] = s.webURL + "/atletas/" + r.Slug
						}
						if err := email(ctx, tx, in.CID, x.email, plantillaSeg, v); err != nil {
							return err
						}
						o.Body.AvisosSeguidores++
					}
				}
				return nil
			})
			return o, err
		})
}

var diasSemana = [...]string{"Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"}

// avisoNuevo records that a recipient (athlete or follower) got the notice of a version; false if it already did.
func (s *Svc) avisoNuevo(ctx context.Context, tx pgx.Tx, cid uuid.UUID, version int, dest uuid.UUID) (bool, error) {
	tag, err := tx.Exec(ctx, `INSERT INTO avisos_horario (competition_id, version, destinatario) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cid, version, dest)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// bajaToken is the unsubscribe link of a follow (b.<id>.<hmac>): stable, so every notice can carry it without
// keeping the confirmation token.
func (s *Svc) bajaToken(id uuid.UUID) string {
	m := hmac.New(sha256.New, s.qrKey)
	m.Write([]byte("baja:" + id.String()))
	return "b." + id.String() + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

func (s *Svc) validBaja(tok string) (uuid.UUID, bool) {
	parts := strings.Split(tok, ".")
	if len(parts) != 3 || parts[0] != "b" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return uuid.Nil, false
	}
	return id, hmac.Equal([]byte(s.bajaToken(id)), []byte(tok))
}
