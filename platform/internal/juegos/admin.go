// admin.go: the backoffice endpoints (contract §6.5–6.6) behind C/juegos/* with the permission «directo.operar»
// (the same key as chat and the desk): jornadas, markets, config, prizes and the full classifications.
package juegos

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// premioVista is one prize row.
type premioVista struct {
	ID           uuid.UUID `json:"id"`
	Ranking      string    `json:"ranking" enum:"porra,fantasy,donantes"`
	PuestoDesde  int       `json:"puestoDesde"`
	PuestoHasta  int       `json:"puestoHasta"`
	Titulo       string    `json:"titulo"`
	Descripcion  string    `json:"descripcion"`
	ImagenURL    string    `json:"imagenUrl,omitempty"`
	ValorTexto   string    `json:"valorTexto,omitempty"`
	Patrocinador string    `json:"patrocinador,omitempty"`
	// admin only (the public endpoint returns only active prizes and does not fill these)
	JornadaID *uuid.UUID `json:"jornadaId,omitempty" doc:"Vacío: premio común a todas las jornadas"`
	Orden     int        `json:"orden"`
	Activo    bool       `json:"activo"`
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/juegos"

	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	operar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := requireAny(ctx, cid, "Tu rol no puede gestionar los juegos (permiso «directo.operar»).", "directo.operar")
		return err
	}
	type cidJornadaIn struct {
		CID       uuid.UUID `path:"cid"`
		JornadaID uuid.UUID `query:"jornada"`
	}

	// ---- jornadas (CRUD y cambio de estado) ----
	type jornadasAdminOut struct {
		Body struct {
			Jornadas []jornadaOut `json:"jornadas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-jornadas", Method: http.MethodGet, Path: base + "/jornadas",
		Summary: "Jornadas de la competición", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *cidIn) (*jornadasAdminOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, dia::text, nombre, estado FROM jornadas WHERE competition_id = $1 ORDER BY dia DESC`, in.CID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &jornadasAdminOut{}
			o.Body.Jornadas = []jornadaOut{}
			for rows.Next() {
				var j jornadaOut
				if err := rows.Scan(&j.ID, &j.Dia, &j.Nombre, &j.Estado); err != nil {
					return nil, err
				}
				o.Body.Jornadas = append(o.Body.Jornadas, j)
			}
			return o, rows.Err()
		})

	type jornadaCrearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Dia    string `json:"dia" pattern:"^[0-9]{4}-[0-9]{2}-[0-9]{2}$" doc:"Europe/Madrid"`
			Nombre string `json:"nombre" minLength:"1" maxLength:"40" example:"AEP-2"`
		}
	}
	type jornadaCreadaOut struct {
		Body struct {
			ID uuid.UUID `json:"id"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-jornada-crear", Method: http.MethodPost, Path: base + "/jornadas",
		Summary: "Crear una jornada", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *jornadaCrearIn) (*jornadaCreadaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			id := newID()
			_, err := s.a.DB.Exec(ctx, `INSERT INTO jornadas (id, competition_id, dia, nombre) VALUES ($1,$2,$3,$4)`, id, in.CID, in.Body.Dia, in.Body.Nombre)
			if db.IsUniqueViolation(err, "jornadas_competition_id_dia_key") {
				return nil, problem.Conflict("JORNADA_YA_EXISTE", "Ya hay una jornada para ese día.")
			}
			if err != nil {
				return nil, err
			}
			o := &jornadaCreadaOut{}
			o.Body.ID = id
			return o, nil
		})

	type jornadaPatchIn struct {
		CID  uuid.UUID `path:"cid"`
		JID  uuid.UUID `path:"jid"`
		Body struct {
			Nombre *string `json:"nombre,omitempty" minLength:"1" maxLength:"40"`
			Estado *string `json:"estado,omitempty" enum:"borrador,abierta,en_juego,cerrada"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-jornada-patch", Method: http.MethodPatch, Path: base + "/jornadas/{jid}",
		Summary: "Renombrar una jornada o cambiar su estado", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *jornadaPatchIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if b.Nombre == nil && b.Estado == nil {
				return nil, problem.BadRequest("NADA_QUE_CAMBIAR", "Nada que cambiar.")
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE jornadas SET
				nombre = COALESCE($3, nombre), estado = COALESCE($4, estado), version = version + 1, updated_at = now()
				WHERE id = $1 AND competition_id = $2`, in.JID, in.CID, b.Nombre, b.Estado)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Jornada no encontrada.")
			}
			return nil, nil
		})

	// ---- mercados ----
	type jornadaBodyIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Jornada uuid.UUID `json:"jornada"`
		}
	}
	type generadosOut struct {
		Body struct {
			Creados int `json:"creados"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-mercados-generar", Method: http.MethodPost, Path: base + "/mercados/generar",
		Summary: "Generar los mercados de la porra desde el marcador", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *jornadaBodyIn) (*generadosOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			j, err := s.jornadaPublicaAdmin(ctx, in.CID, in.Body.Jornada)
			if err != nil {
				return nil, err
			}
			n, err := s.generarMercados(ctx, in.CID, *j)
			if err != nil {
				return nil, err
			}
			o := &generadosOut{}
			o.Body.Creados = n
			return o, nil
		})

	type mercadoIDIn struct {
		CID uuid.UUID `path:"cid"`
		MID uuid.UUID `path:"mid"`
	}
	type mercadoPatchIn struct {
		mercadoIDIn
		Body struct {
			Titulo *string `json:"titulo,omitempty" minLength:"1" maxLength:"80"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-mercado-patch", Method: http.MethodPatch, Path: base + "/mercados/{mid}",
		Summary: "Editar el título de un mercado", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *mercadoPatchIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			if in.Body.Titulo == nil {
				return nil, problem.BadRequest("NADA_QUE_CAMBIAR", "Nada que cambiar.")
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE mercados SET titulo = $3, version = version + 1, updated_at = now()
				WHERE id = $1 AND competition_id = $2 AND estado <> 'liquidado'`, in.MID, in.CID, *in.Body.Titulo)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Mercado no encontrado o ya liquidado.")
			}
			return nil, nil
		})

	cerrarLiquidar := func(accion string) func(ctx context.Context, in *mercadoIDIn) (*struct{}, error) {
		return func(ctx context.Context, in *mercadoIDIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			j, err := jornadaDeMercado(ctx, s.a.DB, in.CID, in.MID)
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			m, err := s.marcador(ctx, in.CID, j.Dia)
			if err != nil {
				return nil, problem.New(http.StatusServiceUnavailable, "MARCADOR_NO_DISPONIBLE", "No se pudo leer el marcador del directo. Reintenta en unos segundos.")
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var mc mercadoRow
				e := tx.QueryRow(ctx, `SELECT id, tipo, sexo, categoria, movimiento, estado, opciones FROM mercados WHERE id = $1 AND competition_id = $2`, in.MID, in.CID).
					Scan(&mc.ID, &mc.Tipo, &mc.Sexo, &mc.Categoria, &mc.Movimiento, &mc.Estado, &mc.Opciones)
				if db.IsNoRows(e) {
					return problem.NotFound("Mercado no encontrado.")
				}
				if e != nil {
					return e
				}
				if accion == "cerrar" {
					return cerrarMercadosTx(ctx, tx, in.CID, *j, m, []mercadoRow{mc})
				}
				// liquidar a mano: winners from the scoreboard now
				return liquidarDesdeMarcadorTx(ctx, tx, in.CID, *j, cfg, m, mc)
			})
			return nil, err
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-mercado-cerrar", Method: http.MethodPost, Path: base + "/mercados/{mid}/cerrar",
		Summary: "Cerrar un mercado a mano", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent}, cerrarLiquidar("cerrar"))
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-mercado-liquidar", Method: http.MethodPost, Path: base + "/mercados/{mid}/liquidar",
		Summary: "Liquidar un mercado a mano (reparte el bote parimutuel)", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent}, cerrarLiquidar("liquidar"))

	// ---- fantasy: sincronizar atletas ----
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-fantasy-sincronizar", Method: http.MethodPost, Path: base + "/fantasy/sincronizar",
		Summary: "Sincronizar los atletas de la jornada desde el marcador", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *jornadaBodyIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			j, err := s.jornadaPublicaAdmin(ctx, in.CID, in.Body.Jornada)
			if err != nil {
				return nil, err
			}
			return nil, s.sincronizar(ctx, in.CID, *j)
		})

	// ---- config ----
	type configOut struct {
		Body *Config
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-config", Method: http.MethodGet, Path: base + "/config",
		Summary: "Configuración de puntos, cláusulas y recompensas", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *cidIn) (*configOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, in.CID)
			return &configOut{Body: cfg}, err
		})

	type configPutIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match" required:"true" doc:"Versión leída (ETag): si otra persona guardó antes → 409 CONFLICTO_EDICION"`
		Body    Config
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-config-guardar", Method: http.MethodPut, Path: base + "/config",
		Summary: "Guardar la configuración de puntos, cláusulas y recompensas (If-Match)", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *configPutIn) (*configOut, error) {
			p, err := requireAny(ctx, in.CID, "Tu rol no puede gestionar los juegos (permiso «directo.operar»).", "directo.operar")
			if err != nil {
				return nil, err
			}
			b := in.Body
			if b.PorraMin <= 0 || b.PorraMax < b.PorraMin {
				return nil, problem.Unprocessable("CONFIG_NO_VALIDA", "El mínimo y el máximo de apuesta no son coherentes.")
			}
			pt, _ := json.Marshal(b.Puntos)
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				// The row may not exist yet (the first save): it is created with the defaults (version 1).
				if _, err := tx.Exec(ctx, `INSERT INTO config_juegos (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, in.CID); err != nil {
					return err
				}
				var actual int
				if err := tx.QueryRow(ctx, `SELECT version FROM config_juegos WHERE competition_id = $1 FOR UPDATE`, in.CID).Scan(&actual); err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != strconv.Itoa(actual) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración de los juegos. Recarga para ver la última versión.")
				}
				_, err := tx.Exec(ctx, `UPDATE config_juegos SET porra_min = $2, porra_max = $3, hito5_porra = $4, hito10_porra = $5,
					hito5_fantasy = $6, hito10_fantasy = $7, fantasy_por_euro = $8, max_hitos = $9, max_clausulazos = $10, proteccion_min = $11,
					plantilla_max = $12, titulares_max = $13, clausula_inicial = $14, clausula_min = $15, clausula_max = $16,
					pct_valido = $17, pct_nulo = $18, pct_blanqueo = $19, pct_demanda = $20, pct_puesto = $21, puntos = $22,
					version = version + 1, updated_por = $23, updated_at = now()
					WHERE competition_id = $1`,
					in.CID, b.PorraMin, b.PorraMax, b.Hito5Porra, b.Hito10Porra, b.Hito5Fantasy, b.Hito10Fantasy,
					b.FantasyPorEuro, b.MaxHitos, b.MaxClausulazos, b.ProteccionMin, b.PlantillaMax, b.TitularesMax,
					b.ClausulaInicial, b.ClausulaMin, b.ClausulaMax, b.PctValido, b.PctNulo, b.PctBlanqueo, b.PctDemanda, b.PctPuesto,
					pt, p.Name)
				return err
			})
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, in.CID)
			return &configOut{Body: cfg}, err
		})

	// ---- premios (contract §6.5) ----
	type premiosAdminOut struct {
		Body struct {
			Premios []premioVista `json:"premios"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-premios", Method: http.MethodGet, Path: base + "/premios",
		Summary: "Premios de la competición", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *cidJornadaIn) (*premiosAdminOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			pS, err := s.premios(ctx, in.CID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			o := &premiosAdminOut{}
			o.Body.Premios = pS
			return o, nil
		})

	type premioCrearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Jornada      *uuid.UUID `json:"jornada,omitempty"`
			Ranking      string     `json:"ranking" enum:"porra,fantasy,donantes"`
			PuestoDesde  int        `json:"puestoDesde" minimum:"1" maximum:"999"`
			PuestoHasta  int        `json:"puestoHasta" minimum:"1" maximum:"999"`
			Titulo       string     `json:"titulo" minLength:"1" maxLength:"120"`
			Descripcion  string     `json:"descripcion,omitempty" maxLength:"400"`
			ImagenURL    string     `json:"imagenUrl,omitempty" maxLength:"400"`
			ValorTexto   string     `json:"valorTexto,omitempty" maxLength:"60"`
			Patrocinador string     `json:"patrocinador,omitempty" maxLength:"80"`
			Orden        int        `json:"orden"`
		}
	}
	type premioIDOut struct {
		Body struct {
			ID uuid.UUID `json:"id"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-premio-crear", Method: http.MethodPost, Path: base + "/premios",
		Summary: "Crear un premio", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *premioCrearIn) (*premioIDOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if b.PuestoHasta < b.PuestoDesde {
				return nil, problem.Unprocessable("PUESTOS_NO_VALIDOS", "El rango de puestos no es válido.")
			}
			id := newID()
			var jid any
			if b.Jornada != nil && *b.Jornada != uuid.Nil {
				jid = *b.Jornada
			}
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO premios (id, competition_id, jornada_id, ranking, puesto_desde, puesto_hasta,
				titulo, descripcion, imagen_url, valor_texto, patrocinador, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
				id, in.CID, jid, b.Ranking, b.PuestoDesde, b.PuestoHasta, b.Titulo, b.Descripcion, b.ImagenURL, b.ValorTexto, b.Patrocinador, b.Orden); err != nil {
				return nil, err
			}
			o := &premioIDOut{}
			o.Body.ID = id
			return o, nil
		})

	type premioPatchIn struct {
		CID  uuid.UUID `path:"cid"`
		PID  uuid.UUID `path:"pid"`
		Body struct {
			Titulo       *string `json:"titulo,omitempty" minLength:"1" maxLength:"120"`
			Descripcion  *string `json:"descripcion,omitempty" maxLength:"400"`
			ImagenURL    *string `json:"imagenUrl,omitempty" maxLength:"400"`
			ValorTexto   *string `json:"valorTexto,omitempty" maxLength:"60"`
			Patrocinador *string `json:"patrocinador,omitempty" maxLength:"80"`
			Orden        *int    `json:"orden,omitempty"`
			Activo       *bool   `json:"activo,omitempty"`
			PuestoDesde  *int    `json:"puestoDesde,omitempty" minimum:"1" maximum:"1000"`
			PuestoHasta  *int    `json:"puestoHasta,omitempty" minimum:"1" maximum:"1000"`
			// "" = common to every jornada; absent = unchanged
			JornadaID *string `json:"jornadaId,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-premio-patch", Method: http.MethodPatch, Path: base + "/premios/{pid}",
		Summary: "Editar un premio", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *premioPatchIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			cambiaJornada, jornada := false, (*uuid.UUID)(nil)
			if b.JornadaID != nil {
				cambiaJornada = true
				if *b.JornadaID != "" {
					j, err := uuid.Parse(*b.JornadaID)
					if err != nil {
						return nil, problem.Unprocessable("JORNADA_NO_VALIDA", "La jornada no es válida.")
					}
					jornada = &j
				}
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE premios SET
				titulo = COALESCE($3, titulo), descripcion = COALESCE($4, descripcion), imagen_url = COALESCE($5, imagen_url),
				valor_texto = COALESCE($6, valor_texto), patrocinador = COALESCE($7, patrocinador),
				orden = COALESCE($8, orden), activo = COALESCE($9, activo),
				puesto_desde = COALESCE($10, puesto_desde), puesto_hasta = COALESCE($11, puesto_hasta),
				jornada_id = CASE WHEN $12 THEN $13 ELSE jornada_id END,
				version = version + 1, updated_at = now()
				WHERE id = $1 AND competition_id = $2`, in.PID, in.CID, b.Titulo, b.Descripcion, b.ImagenURL, b.ValorTexto, b.Patrocinador, b.Orden, b.Activo,
				b.PuestoDesde, b.PuestoHasta, cambiaJornada, jornada)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Premio no encontrado.")
			}
			return nil, nil
		})

	huma.Register(api, huma.Operation{OperationID: "juegos-admin-premio-borrar", Method: http.MethodDelete, Path: base + "/premios/{pid}",
		Summary: "Borrar un premio", Tags: tagJuegos, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *premioIDIn) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `DELETE FROM premios WHERE id = $1 AND competition_id = $2`, in.PID, in.CID)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Premio no encontrado.")
			}
			return nil, nil
		})

	// ---- clasificaciones e histórico ----
	type clasificacionesOut struct {
		Body struct {
			Porra   []filaPorra   `json:"porra"`
			Fantasy []filaFantasy `json:"fantasy"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-admin-clasificaciones", Method: http.MethodGet, Path: base + "/clasificaciones",
		Summary: "Clasificaciones completas de una jornada", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *cidJornadaIn) (*clasificacionesOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			j, err := s.jornadaPublicaAdmin(ctx, in.CID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			o := &clasificacionesOut{}
			o.Body.Porra, _ = s.rankingPorra(ctx, *j, uuid.Nil)
			o.Body.Fantasy, _ = s.rankingFantasy(ctx, *j, uuid.Nil)
			return o, nil
		})

	huma.Register(api, huma.Operation{OperationID: "juegos-admin-historico", Method: http.MethodGet, Path: base + "/historico",
		Summary: "Histórico: jornadas cerradas", Tags: tagJuegos, Security: bearer},
		func(ctx context.Context, in *cidIn) (*jornadasAdminOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, dia::text, nombre, estado FROM jornadas WHERE competition_id = $1 AND estado = 'cerrada' ORDER BY dia DESC`, in.CID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &jornadasAdminOut{}
			o.Body.Jornadas = []jornadaOut{}
			for rows.Next() {
				var j jornadaOut
				if err := rows.Scan(&j.ID, &j.Dia, &j.Nombre, &j.Estado); err != nil {
					return nil, err
				}
				o.Body.Jornadas = append(o.Body.Jornadas, j)
			}
			return o, rows.Err()
		})
}

type premioIDIn struct {
	CID uuid.UUID `path:"cid"`
	PID uuid.UUID `path:"pid"`
}

// premios lists the prizes of a competition (all jornadas, or only those of one jornada or shared ones).
func (s *Svc) premios(ctx context.Context, cid, jid uuid.UUID) ([]premioVista, error) {
	var rows pgx.Rows
	var err error
	if jid == uuid.Nil {
		rows, err = s.a.DB.Query(ctx, `SELECT id, ranking, puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador, jornada_id, orden, activo
			FROM premios WHERE competition_id = $1 ORDER BY jornada_id NULLS FIRST, ranking, orden`, cid)
	} else {
		rows, err = s.a.DB.Query(ctx, `SELECT id, ranking, puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador, jornada_id, orden, activo
			FROM premios WHERE competition_id = $1 AND (jornada_id = $2 OR jornada_id IS NULL) ORDER BY ranking, orden`, cid, jid)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []premioVista{}
	for rows.Next() {
		var p premioVista
		if err := rows.Scan(&p.ID, &p.Ranking, &p.PuestoDesde, &p.PuestoHasta, &p.Titulo, &p.Descripcion, &p.ImagenURL, &p.ValorTexto, &p.Patrocinador, &p.JornadaID, &p.Orden, &p.Activo); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// jornadaPublicaAdmin resolves the jornada for admin endpoints (must exist; any estado).
func (s *Svc) jornadaPublicaAdmin(ctx context.Context, cid, jid uuid.UUID) (*jornada, error) {
	if jid == uuid.Nil {
		j, err := s.jornadaActiva(ctx, s.a.DB, cid)
		if err != nil {
			return nil, err
		}
		if j == nil {
			return nil, problem.NotFound("Indica la jornada o deja una activa hoy.")
		}
		return j, nil
	}
	j, err := scanJornada(s.a.DB.QueryRow(ctx, selJornada+" FROM jornadas WHERE id = $1 AND competition_id = $2", jid, cid))
	if db.IsNoRows(err) {
		return nil, problem.NotFound("Jornada no encontrada.")
	}
	return &j, err
}

func jornadaDeMercado(ctx context.Context, q querier, cid, mid uuid.UUID) (*jornada, error) {
	j, err := scanJornada(q.QueryRow(ctx, selJornada+" FROM jornadas j JOIN mercados m ON m.jornada_id = j.id WHERE m.id = $1 AND m.competition_id = $2", mid, cid))
	if db.IsNoRows(err) {
		return nil, problem.NotFound("Mercado no encontrado.")
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// liquidarDesdeMarcadorTx liquidates a market by hand: winners are the athletes at the winning place of the
// scoreboard right now (puestoCategoria/puestoGL/puestoMovimiento == 1).
func liquidarDesdeMarcadorTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, m *Marcador, mc mercadoRow) error {
	var ganadores []uuid.UUID
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		switch mc.Tipo {
		case "categoria":
			if ma.Sexo == mc.Sexo && ma.Categoria == mc.Categoria && ma.PuestoCategoria == 1 {
				ganadores = append(ganadores, ma.AtletaID)
			}
		case "gl":
			if ma.Sexo == mc.Sexo && ma.PuestoGL == 1 {
				ganadores = append(ganadores, ma.AtletaID)
			}
		case "movimiento":
			if ma.Sexo == mc.Sexo && ma.PuestoMovimiento[mc.Movimiento] == 1 {
				ganadores = append(ganadores, ma.AtletaID)
			}
		}
	}
	return liquidarMercadoTx(ctx, tx, cid, j, cfg, &mc, ganadores)
}
