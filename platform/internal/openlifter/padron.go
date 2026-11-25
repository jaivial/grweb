package openlifter

// BIZ-210 · Padrón AEP: the roll of each competition level (athletes service, table inscripciones_aep) and the
// OpenLifter meet of that level. The meet of a level is the desk whose key starts with «aep2 · » / «aep3 · » or
// whose name says «AEP 2» / «AEP 3». The browser holds the meet, so this service never writes entries itself: it
// finds the entry of every roll row (name and sex) and, through «Importar atletas» of the fork, offers the rows the
// desk does not have yet; the fork reports back the entry it created for each one.

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// lifterPadron is a roll row as athletes reports it (public data of the AEP list).
type lifterPadron struct {
	ID            uuid.UUID  `json:"id"`
	Nombre        string     `json:"nombre"`
	Apellidos     string     `json:"apellidos"`
	Sexo          string     `json:"sexo"`
	Anio          int        `json:"anio"`
	Club          string     `json:"club,omitempty"`
	Division      string     `json:"division"`
	Equipamiento  string     `json:"equipamiento"`
	Categoria     string     `json:"categoria"`
	TotalAnterior *float64   `json:"totalAnterior,omitempty"`
	LifterID      *int       `json:"openlifterLifterId,omitempty"`
	AtletaID      *uuid.UUID `json:"atletaId,omitempty"`
	EstadoEnlace  string     `json:"estadoEnlace"`
}

func (l *lifterPadron) nombreCompleto() string {
	return strings.TrimSpace(l.Nombre + " " + l.Apellidos)
}

var reNivelMesa = regexp.MustCompile(`(?i)\bAEP\s*-?\s*([23])\b`)

// nivelMesa is the AEP level of a desk key («aep2 · AEP 2 - GR STRENGTH CUP II · 2026-11-22»), or "".
func nivelMesa(mesa string) string {
	t := strings.ToLower(strings.TrimSpace(mesa))
	for _, n := range []string{"aep2", "aep3"} {
		if strings.HasPrefix(t, n+" ") || t == n {
			return n
		}
	}
	if m := reNivelMesa.FindStringSubmatch(mesa); m != nil {
		return "aep" + m[1]
	}
	return ""
}

// mesaDeNivel is the most recently synchronised desk of a level in the competition ("" when there is none yet).
func (s *Svc) mesaDeNivel(ctx context.Context, cid uuid.UUID, nivel string) (string, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT mesa FROM entradas WHERE competition_id = $1 GROUP BY mesa ORDER BY max(updated_at) DESC`, cid)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err != nil {
			return "", err
		}
		if nivelMesa(m) == nivel {
			return m, nil
		}
	}
	return "", rows.Err()
}

func (s *Svc) padron(ctx context.Context, cid uuid.UUID, nivel string) ([]lifterPadron, error) {
	var list []lifterPadron
	if err := s.athletes.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/padron-aep?nivel="+nivel, nil, &list); err != nil {
		s.a.Log.Warn("padron_aep.atletas_fallo", "nivel", nivel, "err", err)
		return nil, problem.New(http.StatusServiceUnavailable, "PADRON_NO_DISPONIBLE", "No se pudo leer el padrón AEP. Reintenta en unos segundos.")
	}
	return list, nil
}

func (s *Svc) registerPadron() {
	api := s.a.API

	// athletes, after importing a roll: the entry of each row in the level's meet.
	type enlace struct {
		ID      uuid.UUID `json:"id"`
		EntryID *int      `json:"entryId,omitempty"`
	}
	type padIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Nivel   string         `json:"nivel" enum:"aep2,aep3"`
			Titulo  string         `json:"titulo,omitempty" maxLength:"200"`
			Fecha   string         `json:"fecha,omitempty" maxLength:"10"`
			Lifters []lifterPadron `json:"lifters" maxItems:"1000"`
		}
	}
	type padOut struct {
		Body struct {
			Mesa    string   `json:"mesa" doc:"Mesa del nivel (vacío: ninguna mesa ha sincronizado aún)"`
			Enlaces []enlace `json:"enlaces"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-openlifter-padron", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/openlifter/padron",
		Summary: "Entradas de la mesa del nivel para las filas del padrón AEP (solo athletes)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *padIn) (*padOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &padOut{}
			o.Body.Enlaces = make([]enlace, 0, len(in.Body.Lifters))
			mesa, err := s.mesaDeNivel(ctx, in.CID, in.Body.Nivel)
			if err != nil {
				return nil, err
			}
			o.Body.Mesa = mesa
			var filas []*fila
			if mesa != "" {
				if filas, err = cargar(ctx, s.a.DB, in.CID, mesa); err != nil {
					return nil, err
				}
			}
			porID := map[int]*fila{}
			porNombre := map[string][]*fila{}
			for _, f := range filas {
				porID[f.EntryID] = f
				if k := clave(f.Datos.Name); k != "" {
					porNombre[k+"|"+f.Datos.Sex] = append(porNombre[k+"|"+f.Datos.Sex], f)
				}
			}
			usadas := map[int]bool{}
			for _, l := range in.Body.Lifters {
				if l.LifterID != nil && porID[*l.LifterID] != nil && clave(porID[*l.LifterID].Datos.Name) == clave(l.nombreCompleto()) {
					usadas[*l.LifterID] = true
				}
			}
			for _, l := range in.Body.Lifters {
				e := enlace{ID: l.ID}
				if l.LifterID != nil && usadas[*l.LifterID] && porID[*l.LifterID] != nil && clave(porID[*l.LifterID].Datos.Name) == clave(l.nombreCompleto()) {
					e.EntryID = l.LifterID
				} else {
					for _, f := range porNombre[clave(l.nombreCompleto())+"|"+l.Sexo] {
						if !usadas[f.EntryID] {
							id := f.EntryID
							e.EntryID, usadas[id] = &id, true
							break
						}
					}
				}
				o.Body.Enlaces = append(o.Body.Enlaces, e)
			}
			s.a.Log.Info("padron_aep.mesa_enlazada", "nivel", in.Body.Nivel, "mesa", mesa, "lifters", len(in.Body.Lifters), "entradas", len(filas))
			return o, nil
		})

	// athletes, after linking a roll row with an athlete (BIZ-211): the entry of the row is that athlete's on the
	// level's desk (confirmed: the automatic matching of the desk does not move it).
	type vincIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Nivel    string    `json:"nivel" enum:"aep2,aep3"`
			EntryID  int       `json:"entryId" minimum:"0"`
			AtletaID uuid.UUID `json:"atletaId"`
			Por      string    `json:"por,omitempty" maxLength:"120"`
		}
	}
	type vincOut struct {
		Body struct {
			Mesa     string `json:"mesa"`
			Enlazada bool   `json:"enlazada"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-openlifter-padron-vinculo", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/openlifter/padron/vinculo",
		Summary: "Vincular la entrada de una fila del padrón AEP con su atleta (solo athletes)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *vincIn) (*vincOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			b := in.Body
			o := &vincOut{}
			mesa, err := s.mesaDeNivel(ctx, in.CID, b.Nivel)
			if err != nil || mesa == "" {
				return o, err
			}
			o.Body.Mesa = mesa
			motivo := "Padrón AEP"
			if b.Por != "" {
				motivo += " · " + b.Por
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := bloquear(ctx, tx, in.CID, mesa); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE entradas SET atleta_id = NULL, vinculo = 'sin_coincidencia', puntuacion = 0, motivo = '', updated_at = now()
					WHERE competition_id = $1 AND mesa = $2 AND atleta_id = $3 AND entry_id <> $4`, in.CID, mesa, b.AtletaID, b.EntryID); err != nil {
					return err
				}
				var nombre string
				err := tx.QueryRow(ctx, `UPDATE entradas SET atleta_id = $4, vinculo = 'confirmado', puntuacion = 1, motivo = $5, pesaje_hash = '', intentos_hash = '', updated_at = now()
					WHERE competition_id = $1 AND mesa = $2 AND entry_id = $3 RETURNING COALESCE(datos->>'name', '')`, in.CID, mesa, b.EntryID, b.AtletaID, motivo).Scan(&nombre)
				if errors.Is(err, pgx.ErrNoRows) {
					return nil // the desk no longer has that entry
				}
				if err != nil {
					return err
				}
				o.Body.Enlazada = true
				if k := clave(nombre); k != "" {
					_, err = tx.Exec(ctx, `INSERT INTO alias (competition_id, clave, atleta_id) VALUES ($1,$2,$3) ON CONFLICT (competition_id, clave) DO UPDATE SET atleta_id = $3`, in.CID, k, b.AtletaID)
				}
				return err
			})
			s.a.Log.Info("padron_aep.vinculo_mesa", "nivel", b.Nivel, "mesa", mesa, "enlazada", o.Body.Enlazada)
			return o, err
		})

	// The fork, after «Importar atletas»: the entry it created for each roll row.
	type mesaPadIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Mesa    string `json:"mesa" minLength:"1" maxLength:"120"`
			Enlaces []struct {
				InscripcionID uuid.UUID `json:"inscripcionId"`
				EntryID       int       `json:"entryId" minimum:"0"`
			} `json:"enlaces" minItems:"1" maxItems:"1000"`
		}
	}
	type mesaPadOut struct {
		Body struct {
			Enlazadas int `json:"enlazadas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "openlifter-padron", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/openlifter/padron",
		Summary: "Guardar la entrada de OpenLifter creada para cada fila del padrón AEP importada", Tags: tag, Security: bearer},
		func(ctx context.Context, in *mesaPadIn) (*mesaPadOut, error) {
			if _, err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			if nivelMesa(in.Body.Mesa) == "" {
				return nil, problem.Unprocessable("MESA_SIN_NIVEL", "Esta mesa no es de AEP 2 ni de AEP 3: empieza su clave por «aep2 · » o «aep3 · ».")
			}
			type e struct {
				ID      uuid.UUID `json:"id"`
				EntryID int       `json:"entryId"`
			}
			body := struct {
				Enlaces []e `json:"enlaces"`
			}{}
			for _, x := range in.Body.Enlaces {
				body.Enlaces = append(body.Enlaces, e{x.InscripcionID, x.EntryID})
			}
			o := &mesaPadOut{}
			if err := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+in.CID.String()+"/padron-aep/openlifter", body, &o.Body); err != nil {
				s.a.Log.Warn("padron_aep.atletas_fallo", "err", err)
				return nil, problem.New(http.StatusServiceUnavailable, "PADRON_NO_DISPONIBLE", "No se pudo guardar el enlace con el padrón. Reintenta en unos segundos.")
			}
			s.a.Log.Info("padron_aep.mesa_importada", "mesa", in.Body.Mesa, "enlazadas", o.Body.Enlazadas)
			return o, nil
		})
}

// ---- «Importar atletas» of the fork ----

// padronImport adds the roll rows of the desk's level to the import list (rows whose athlete is already in it are
// skipped: the athlete brings them).
func padronImport(list []lifterPadron, nivel string, enLista map[uuid.UUID]bool) []AtletaImport {
	out := make([]AtletaImport, 0, len(list))
	for _, l := range list {
		if l.AtletaID != nil && enLista[*l.AtletaID] {
			continue
		}
		a := AtletaImport{ID: l.ID, Nombre: l.nombreCompleto(), Sexo: l.Sexo, Categoria: l.Categoria, Division: l.Division, Club: l.Club, Prueba: nivel,
			Padron: true, AtletaID: l.AtletaID, EntryID: l.LifterID, Equipamiento: l.Equipamiento, AnioNacimiento: l.Anio, TotalAnterior: l.TotalAnterior}
		out = append(out, a)
	}
	return out
}
