package juegos

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
)

// fichajeVista is one signing of the market feed («@pepe clausuló a M. García por 340.000»). Only public aliases
// and public athlete names: never fan ids.
type fichajeVista struct {
	ID        uuid.UUID `json:"id"`
	AtletaID  uuid.UUID `json:"atletaId"`
	Atleta    string    `json:"atleta"`
	Tipo      string    `json:"tipo" enum:"compra,venta,clausulazo"`
	AliasDe   string    `json:"aliasDe,omitempty"`
	AliasA    string    `json:"aliasA,omitempty"`
	Precio    int64     `json:"precio"`
	CreatedAt time.Time `json:"createdAt"`
}

// configPublica is what the web needs to explain and enforce the games (the rest of config_juegos is staff-only).
type configPublica struct {
	PorraMin        int       `json:"porraMin"`
	PorraMax        int       `json:"porraMax"`
	Hito5Porra      int       `json:"hito5Porra"`
	Hito10Porra     int       `json:"hito10Porra"`
	Hito5Fantasy    int       `json:"hito5Fantasy"`
	Hito10Fantasy   int       `json:"hito10Fantasy"`
	FantasyPorEuro  int       `json:"fantasyPorEuro"`
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
}

// registerPublicExtra adds the public config and the signings feed (asked by the web: «Cómo se juega», the bet
// limits, the protection countdown and the market feed loaded on entry, then kept live by SSE).
func (s *Svc) registerPublicExtra() {
	api := s.a.API
	base := "/api/competiciones/{slug}/juegos"

	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type configOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         configPublica
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-config-publica", Method: http.MethodGet, Path: base + "/config",
		Summary: "Reglas de los juegos: puntos, cláusulas, límites de la porra y recompensas", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*configOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			return &configOut{CacheControl: "public, max-age=30", Body: configPublica{
				PorraMin: cfg.PorraMin, PorraMax: cfg.PorraMax, Hito5Porra: cfg.Hito5Porra, Hito10Porra: cfg.Hito10Porra,
				Hito5Fantasy: cfg.Hito5Fantasy, Hito10Fantasy: cfg.Hito10Fantasy, FantasyPorEuro: cfg.FantasyPorEuro,
				MaxClausulazos: cfg.MaxClausulazos, ProteccionMin: cfg.ProteccionMin, PlantillaMax: cfg.PlantillaMax,
				TitularesMax: cfg.TitularesMax, ClausulaInicial: cfg.ClausulaInicial, ClausulaMin: cfg.ClausulaMin,
				ClausulaMax: cfg.ClausulaMax, PctValido: cfg.PctValido, PctNulo: cfg.PctNulo, PctBlanqueo: cfg.PctBlanqueo,
				PctDemanda: cfg.PctDemanda, PctPuesto: cfg.PctPuesto, Puntos: cfg.Puntos,
			}}, nil
		})

	type fichajesIn struct {
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada" required:"false"`
		AtletaID  uuid.UUID `query:"atleta" required:"false"`
		Limite    int       `query:"limite" minimum:"1" maximum:"100" default:"30" required:"false"`
	}
	type fichajesOut struct {
		Body struct {
			Fichajes []fichajeVista `json:"fichajes"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-fichajes", Method: http.MethodGet, Path: base + "/fantasy/fichajes",
		Summary: "Últimos fichajes del mercado de fantasy (de una jornada o de un atleta)", Tags: tagJuegos},
		func(ctx context.Context, in *fichajesIn) (*fichajesOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			limite := in.Limite
			if limite <= 0 {
				limite = 30
			}
			var atleta *uuid.UUID
			if in.AtletaID != uuid.Nil {
				atleta = &in.AtletaID
			}
			// aliases come from the fantasy wallets of the jornada (juegos keeps the public nickname there)
			rows, err := s.a.DB.Query(ctx, `SELECT f.id, f.atleta_id, COALESCE(fa.nombre_publico, ''), f.tipo,
					COALESCE(sd.alias, ''), COALESCE(sa.alias, ''), f.precio, f.created_at
				FROM fichajes f
				LEFT JOIN fantasy_atletas fa ON fa.jornada_id = f.jornada_id AND fa.atleta_id = f.atleta_id
				LEFT JOIN saldos sd ON sd.jornada_id = f.jornada_id AND sd.fan_id = f.de_fan AND sd.moneda = 'fantasy'
				LEFT JOIN saldos sa ON sa.jornada_id = f.jornada_id AND sa.fan_id = f.a_fan AND sa.moneda = 'fantasy'
				WHERE f.jornada_id = $1 AND f.competition_id = $2 AND ($3::uuid IS NULL OR f.atleta_id = $3)
				ORDER BY f.created_at DESC LIMIT $4`, j.ID, c.ID, atleta, limite)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &fichajesOut{}
			o.Body.Fichajes = []fichajeVista{}
			for rows.Next() {
				var v fichajeVista
				if err := rows.Scan(&v.ID, &v.AtletaID, &v.Atleta, &v.Tipo, &v.AliasDe, &v.AliasA, &v.Precio, &v.CreatedAt); err != nil {
					return nil, err
				}
				if v.Tipo == "compra" {
					v.AliasDe = "" // bought from the market
				}
				if v.Tipo == "venta" {
					v.AliasA = "" // sold to the market (a_fan repeats the seller)
				}
				o.Body.Fichajes = append(o.Body.Fichajes, v)
			}
			return o, rows.Err()
		})
}
