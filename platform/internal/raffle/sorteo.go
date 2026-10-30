package raffle

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Sorteo is a draw.
type Sorteo struct {
	ID           uuid.UUID  `json:"id"`
	SemillaHash  string     `json:"semillaHash"`
	HashLista    string     `json:"hashLista"`
	Total        int        `json:"total"`
	Indice       *int       `json:"indice,omitempty"`
	Numero       *int       `json:"-"`
	NumeroTxt    string     `json:"numero,omitempty"`
	CompraID     *uuid.UUID `json:"-"`
	Ganador      *GanadorBO `json:"ganador,omitempty" doc:"Solo para el equipo"`
	Estado       string     `json:"estado" enum:"congelado,sorteado,confirmado,repetido"`
	Motivo       string     `json:"motivo,omitempty"`
	Testigo      string     `json:"testigo,omitempty"`
	Por          string     `json:"por"`
	CreatedAt    time.Time  `json:"createdAt"`
	SorteadoAt   *time.Time `json:"sorteadoAt,omitempty"`
	ConfirmadoAt *time.Time `json:"confirmadoAt,omitempty"`
	Lista        []int      `json:"-"`
	semilla      string
}

// GanadorBO is the winner for the team (full name, how many tickets, when).
type GanadorBO struct {
	Nombre   string    `json:"nombre"`
	Email    string    `json:"email"`
	Cantidad int       `json:"cantidad"`
	Compra   time.Time `json:"compra"`
}

const selSorteo = `SELECT id, semilla, semilla_hash, lista, hash_lista, total, indice, numero, compra_id, estado, motivo, testigo, por, created_at, sorteado_at, confirmado_at FROM sorteos`

func scanSorteo(r pgx.Row) (Sorteo, error) {
	var x Sorteo
	err := r.Scan(&x.ID, &x.semilla, &x.SemillaHash, &x.Lista, &x.HashLista, &x.Total, &x.Indice, &x.Numero, &x.CompraID, &x.Estado, &x.Motivo, &x.Testigo, &x.Por, &x.CreatedAt, &x.SorteadoAt, &x.ConfirmadoAt)
	if x.Numero != nil {
		x.NumeroTxt = numero(*x.Numero)
	}
	return x, err
}

// ganadorDe is the deterministic draw: index = first 8 bytes of HMAC-SHA256(key = seed, message = list hash) mod N.
func ganadorDe(semilla, hashLista string, n int) int {
	key, _ := hex.DecodeString(semilla)
	m := hmac.New(sha256.New, key)
	m.Write([]byte(hashLista))
	return int(binary.BigEndian.Uint64(m.Sum(nil)[:8]) % uint64(n))
}

func (s *Svc) conGanador(ctx context.Context, x *Sorteo) {
	if x.CompraID == nil {
		return
	}
	var g GanadorBO
	var em *string
	if err := s.a.DB.QueryRow(ctx, `SELECT nombre, email::text, cantidad, created_at FROM compras WHERE id = $1`, *x.CompraID).Scan(&g.Nombre, &em, &g.Cantidad, &g.Compra); err == nil {
		if em != nil {
			g.Email = mascara(*em)
		}
		x.Ganador = &g
	}
}

func (s *Svc) registerSorteos() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/sorteo/sorteos"
	sortear := func(ctx context.Context, cid uuid.UUID) error {
		_, err := auth.Require(ctx, cid.String(), "sorteo.sortear")
		return err
	}
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type uno struct{ Body Sorteo }
	cargar := func(ctx context.Context, cid, id uuid.UUID) (*uno, error) {
		x, err := scanSorteo(s.a.DB.QueryRow(ctx, selSorteo+` WHERE competition_id = $1 AND id = $2`, cid, id))
		if err != nil {
			return nil, problem.NotFound("Sorteo no encontrado.")
		}
		s.conGanador(ctx, &x)
		return &uno{x}, nil
	}

	huma.Register(api, huma.Operation{OperationID: "sorteos-lista", Method: http.MethodGet, Path: base, Summary: "Historial de sorteos", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body []Sorteo }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "sorteo.gestionar"); err != nil {
				if err := sortear(ctx, in.CID); err != nil {
					return nil, err
				}
			}
			rows, err := s.a.DB.Query(ctx, selSorteo+` WHERE competition_id = $1 ORDER BY created_at DESC LIMIT 50`, in.CID)
			if err != nil {
				return nil, err
			}
			out := []Sorteo{}
			for rows.Next() {
				x, err := scanSorteo(rows)
				if err != nil {
					rows.Close()
					return nil, err
				}
				out = append(out, x)
			}
			rows.Close()
			for i := range out {
				s.conGanador(ctx, &out[i])
			}
			return &struct{ Body []Sorteo }{out}, nil
		})

	type congelarIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Testigo string `json:"testigo,omitempty" maxLength:"120" doc:"Quién da fe (persona del staff, notario…)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteos-congelar", Method: http.MethodPost, Path: base, Summary: "Congelar la lista y la semilla (se publican sus hashes)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *congelarIn) (*uno, error) {
			if err := sortear(ctx, in.CID); err != nil {
				return nil, err
			}
			id := newID()
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				cfg, err := cargarConfig(ctx, tx, in.CID, true)
				if err != nil {
					return err
				}
				if cfg.Activa && (cfg.VentaHasta == nil || time.Now().Before(*cfg.VentaHasta)) {
					return problem.Conflict("VENTA_ABIERTA", "Cierra antes la venta (desactívala o espera a su fecha de fin): la lista no puede cambiar durante el sorteo.")
				}
				if x, _ := s.sorteoActual(ctx, tx, in.CID); x != nil {
					return problem.Conflict("SORTEO_EN_CURSO", "Ya hay un sorteo en curso o confirmado. Para hacer otro, repítelo con un motivo.")
				}
				var pend int
				_ = tx.QueryRow(ctx, `SELECT count(*) FROM compras WHERE competition_id = $1 AND estado = 'pendiente' AND created_at > now() - interval '40 minutes'`, in.CID).Scan(&pend)
				if pend > 0 {
					return problem.Conflict("PAGOS_PENDIENTES", "Hay pagos en curso: espera a que terminen (30 minutos como mucho) para que sus boletos entren.")
				}
				rows, err := tx.Query(ctx, `SELECT numero FROM boletos WHERE competition_id = $1 AND NOT anulado ORDER BY numero`, in.CID)
				if err != nil {
					return err
				}
				var lista []int
				for rows.Next() {
					var n int
					if err := rows.Scan(&n); err != nil {
						rows.Close()
						return err
					}
					lista = append(lista, n)
				}
				rows.Close()
				if len(lista) == 0 {
					return problem.Conflict("SIN_BOLETOS", "No hay boletos válidos.")
				}
				semilla := randomHex(32)
				hl := sha(listaTexto(lista))
				if _, err := tx.Exec(ctx, `INSERT INTO sorteos (id, competition_id, semilla, semilla_hash, lista, hash_lista, total, testigo, por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
					id, in.CID, semilla, sha(semilla), lista, hl, len(lista), strings.TrimSpace(in.Body.Testigo), actor(ctx)); err != nil {
					return err
				}
				d := map[string]any{"sorteoId": id, "estado": "congelado", "total": len(lista), "semillaHash": sha(semilla), "hashLista": hl}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "sorteo.estado", d, events.Competition(in.CID.String()), events.Audience(events.Public))); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "sorteo.congelado", map[string]any{"total": len(lista), "testigo": in.Body.Testigo, "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("sorteo.sortear"), events.Subject("sorteo:"+id.String())))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return cargar(ctx, in.CID, id)
		})

	huma.Register(api, huma.Operation{OperationID: "sorteos-ejecutar", Method: http.MethodPost, Path: base + "/{id}/ejecutar", Summary: "Sortear (índice = HMAC(semilla, hash de la lista) mod N)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*uno, error) {
			if err := sortear(ctx, in.CID); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				x, err := scanSorteo(tx.QueryRow(ctx, selSorteo+` WHERE competition_id = $1 AND id = $2 FOR UPDATE`, in.CID, in.ID))
				if err != nil {
					return problem.NotFound("Sorteo no encontrado.")
				}
				if x.Estado != "congelado" {
					return problem.Conflict("YA_SORTEADO", "Este sorteo ya se hizo.")
				}
				i := ganadorDe(x.semilla, x.HashLista, x.Total)
				n := x.Lista[i]
				var compra uuid.UUID
				if err := tx.QueryRow(ctx, `SELECT compra_id FROM boletos WHERE competition_id = $1 AND numero = $2`, in.CID, n).Scan(&compra); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE sorteos SET estado = 'sorteado', indice = $2, numero = $3, compra_id = $4, sorteado_at = now() WHERE id = $1`, in.ID, i, n, compra); err != nil {
					return err
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "sorteo.estado", map[string]any{"sorteoId": in.ID, "estado": "sorteando"}, events.Competition(in.CID.String()), events.Audience(events.Public))); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "sorteo.ejecutado", map[string]any{"numero": numero(n), "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("sorteo.sortear"), events.Subject("sorteo:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			return cargar(ctx, in.CID, in.ID)
		})

	type confIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Notificar bool `json:"notificar" doc:"Email al ganador"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteos-confirmar", Method: http.MethodPost, Path: base + "/{id}/confirmar", Summary: "Confirmar el ganador: se publica en /sorteo y se revela la semilla", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *confIn) (*uno, error) {
			if err := sortear(ctx, in.CID); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				x, err := scanSorteo(tx.QueryRow(ctx, selSorteo+` WHERE competition_id = $1 AND id = $2 FOR UPDATE`, in.CID, in.ID))
				if err != nil {
					return problem.NotFound("Sorteo no encontrado.")
				}
				if x.Estado != "sorteado" {
					return problem.Conflict("ESTADO_NO_VALIDO", "Primero hay que sortear.")
				}
				var nombre string
				var em *string
				if err := tx.QueryRow(ctx, `SELECT nombre, email::text FROM compras WHERE id = $1`, *x.CompraID).Scan(&nombre, &em); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE sorteos SET estado = 'confirmado', confirmado_at = now() WHERE id = $1`, in.ID); err != nil {
					return err
				}
				cfg, _ := cargarConfig(ctx, tx, in.CID, false)
				if in.Body.Notificar && em != nil {
					if err := email(ctx, tx, in.CID, *em, "sorteo-ganador", map[string]string{"nombre": strings.Fields(nombre + " ")[0], "numero": numero(*x.Numero), "premio": cfg.Premio, "enlace": s.webURL + "/sorteo"}); err != nil {
						return err
					}
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "sorteo.ganador", map[string]any{"numero": numero(*x.Numero), "nombre": nombrePublico(nombre)}, events.Competition(in.CID.String()), events.Audience(events.Public))); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "sorteo.confirmado", map[string]any{"numero": numero(*x.Numero), "notificado": in.Body.Notificar, "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("sorteo.sortear"), events.Subject("sorteo:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return cargar(ctx, in.CID, in.ID)
		})

	type repIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Motivo        string `json:"motivo" minLength:"5" maxLength:"200"`
			AnularGanador bool   `json:"anularGanador,omitempty" doc:"Anular el boleto que salió (no entra en el siguiente sorteo)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteos-repetir", Method: http.MethodPost, Path: base + "/{id}/repetir", Summary: "Repetir (con motivo): este sorteo queda anulado en el historial", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *repIn) (*uno, error) {
			if err := sortear(ctx, in.CID); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				x, err := scanSorteo(tx.QueryRow(ctx, selSorteo+` WHERE competition_id = $1 AND id = $2 FOR UPDATE`, in.CID, in.ID))
				if err != nil {
					return problem.NotFound("Sorteo no encontrado.")
				}
				if x.Estado == "repetido" {
					return problem.Conflict("YA_REPETIDO", "Este sorteo ya se repitió.")
				}
				if _, err := tx.Exec(ctx, `UPDATE sorteos SET estado = 'repetido', motivo = $2 WHERE id = $1`, in.ID, strings.TrimSpace(in.Body.Motivo)); err != nil {
					return err
				}
				if in.Body.AnularGanador && x.Numero != nil {
					if _, err := tx.Exec(ctx, `UPDATE boletos SET anulado = true, motivo = $3 WHERE competition_id = $1 AND numero = $2`, in.CID, *x.Numero, "Sorteo repetido: "+in.Body.Motivo); err != nil {
						return err
					}
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "sorteo.estado", map[string]any{"sorteoId": in.ID, "estado": "repetido"}, events.Competition(in.CID.String()), events.Audience(events.Public))); err != nil {
					return err
				}
				d := map[string]any{"motivo": in.Body.Motivo, "anulado": in.Body.AnularGanador, "por": actor(ctx)}
				if x.Numero != nil {
					d["numero"] = numero(*x.Numero)
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "sorteo.repetido", d, events.Competition(in.CID.String()), events.ForPermission("sorteo.sortear"), events.Subject("sorteo:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return cargar(ctx, in.CID, in.ID)
		})
}

var _ = errors.New
