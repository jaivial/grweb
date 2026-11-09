// config.go: the configurable amounts of the games (contract §6.2–6.4): bets, clauses, protection, rewards and the
// points table. One row per competition with the defaults of the contract.
package juegos

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// querier is satisfied by *pgxpool.Pool and pgx.Tx, so the same helpers serve HTTP and worker paths.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PuntosCfg is the configurable points table (contract §6.3); the jsonb of config_juegos holds it.
type PuntosCfg struct {
	IntentoValido int    `json:"intentoValido"` // +3 per valid attempt
	Pleno         int    `json:"pleno"`         // +5 for a 9/9 (bonus «Pleno 9/9»)
	Blanqueo      int    `json:"blanqueo"`      // −15 for 3 nulls in one lift
	Cat           [5]int `json:"cat"`           // 1.º, 2.º, 3.º, 4.º–5.º, resto que acaba
	GL            [4]int `json:"gl"`            // 1.º, 2.º, 3.º, 4.º–10.º
	Mov           [3]int `json:"mov"`           // 1.º, 2.º, 3.º por movimiento
}

// puntosPorDefecto is the table of the contract §6.3.
func puntosPorDefecto() PuntosCfg {
	return PuntosCfg{IntentoValido: 3, Pleno: 5, Blanqueo: -15,
		Cat: [5]int{20, 14, 10, 5, 2}, GL: [4]int{25, 18, 12, 4}, Mov: [3]int{10, 6, 3}}
}

// Config is a row of config_juegos.
type Config struct {
	PorraMin        int       `json:"porraMin"`
	PorraMax        int       `json:"porraMax"`
	Hito5Porra      int       `json:"hito5Porra"`
	Hito10Porra     int       `json:"hito10Porra"`
	Hito5Fantasy    int       `json:"hito5Fantasy"`
	Hito10Fantasy   int       `json:"hito10Fantasy"`
	FantasyPorEuro  int       `json:"fantasyPorEuro"`
	MaxHitos        int       `json:"maxHitos"`
	MaxClausulazos  int       `json:"maxClausulazos"`
	ProteccionMin   int       `json:"proteccionMin"`
	PlantillaMax    int       `json:"plantillaMax"`
	TitularesMax    int       `json:"titularesMax"`
	ClausulaInicial int64     `json:"clausulaInicial"`
	ClausulaMin     int64     `json:"clausulaMin"`
	ClausulaMax     int64     `json:"clausulaMax"`
	PctValido       int       `json:"pctValido"`
	PctNulo         int       `json:"pctNulo"`
	PctBlanqueo     int       `json:"pctBlanqueo"`
	PctDemanda      int       `json:"pctDemanda"`
	PctPuesto       [3]int    `json:"pctPuesto"`
	Puntos          PuntosCfg `json:"puntos"`
	Activo          bool      `json:"activo"`
	Version         int       `json:"version" required:"false"`
	UpdatedPor      string    `json:"updatedPor" required:"false"`
}

// configPorDefecto matches the migration defaults (contract values).
func configPorDefecto() Config {
	return Config{
		PorraMin: 100, PorraMax: 50000,
		Hito5Porra: 100, Hito10Porra: 500, Hito5Fantasy: 10000, Hito10Fantasy: 50000,
		FantasyPorEuro: 10000, MaxHitos: 100, MaxClausulazos: 3, ProteccionMin: 10,
		PlantillaMax: 8, TitularesMax: 5,
		ClausulaInicial: 200000, ClausulaMin: 50000, ClausulaMax: 5000000,
		PctValido: 5, PctNulo: -4, PctBlanqueo: -30, PctDemanda: 3, PctPuesto: [3]int{25, 15, 8},
		Puntos: puntosPorDefecto(), Activo: true, Version: 1,
	}
}

const selConfig = `SELECT porra_min, porra_max, hito5_porra, hito10_porra, hito5_fantasy, hito10_fantasy,
	fantasy_por_euro, max_hitos, max_clausulazos, proteccion_min, plantilla_max, titulares_max,
	clausula_inicial, clausula_min, clausula_max, pct_valido, pct_nulo, pct_blanqueo, pct_demanda, pct_puesto,
	puntos, activo, version, updated_por
	FROM config_juegos WHERE competition_id = $1`

func scanConfig(r pgx.Row) (*Config, error) {
	var c Config
	var pt []byte
	if err := r.Scan(&c.PorraMin, &c.PorraMax, &c.Hito5Porra, &c.Hito10Porra, &c.Hito5Fantasy, &c.Hito10Fantasy,
		&c.FantasyPorEuro, &c.MaxHitos, &c.MaxClausulazos, &c.ProteccionMin, &c.PlantillaMax, &c.TitularesMax,
		&c.ClausulaInicial, &c.ClausulaMin, &c.ClausulaMax, &c.PctValido, &c.PctNulo, &c.PctBlanqueo, &c.PctDemanda, &c.PctPuesto,
		&pt, &c.Activo, &c.Version, &c.UpdatedPor); err != nil {
		return nil, err
	}
	c.Puntos = puntosPorDefecto()
	if len(pt) > 0 {
		_ = json.Unmarshal(pt, &c.Puntos)
	}
	return &c, nil
}

// configJuegos reads (creating with defaults if needed) the configuration of a competition.
func configJuegos(ctx context.Context, q querier, cid uuid.UUID) (*Config, error) {
	if _, err := q.Exec(ctx, `INSERT INTO config_juegos (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, cid); err != nil {
		return nil, err
	}
	return scanConfig(q.QueryRow(ctx, selConfig, cid))
}
