package messaging

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// WABoton is a button of a WhatsApp template.
type WABoton struct {
	Tipo  string `json:"tipo" enum:"url,respuesta"`
	Texto string `json:"texto" minLength:"1" maxLength:"25"`
	URL   string `json:"url,omitempty" maxLength:"300"`
}

// WAPlantilla is a row of «WhatsApp (Meta)» (Figma 62).
type WAPlantilla struct {
	Nombre     string     `json:"nombre"`
	Categoria  string     `json:"categoria" enum:"utilidad,marketing"`
	Idioma     string     `json:"idioma"`
	Cuerpo     string     `json:"cuerpo" doc:"Con variables posicionales {{1}}, {{2}}…"`
	Variables  []string   `json:"variables" doc:"Qué es cada variable posicional, en orden"`
	Botones    []WABoton  `json:"botones"`
	Uso        string     `json:"uso"`
	Estado     string     `json:"estado" enum:"PENDING,APPROVED,REJECTED,PAUSED"`
	Calidad    string     `json:"calidad"`
	Motivo     string     `json:"motivo,omitempty"`
	MetaID     string     `json:"metaId,omitempty"`
	Usos30d    int        `json:"usos30d"`
	Version    int        `json:"version"`
	AprobadaAt *time.Time `json:"aprobadaAt,omitempty"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

var reVarWA = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}`)

// posicional turns the named variables of a catalogue text into Meta's positional ones ({{nombre}} → {{1}}).
func posicional(texto string) (string, []string) {
	vars := []string{}
	idx := map[string]int{}
	out := reVarWA.ReplaceAllStringFunc(texto, func(m string) string {
		v := reVarWA.FindStringSubmatch(m)[1]
		if _, ok := idx[v]; !ok {
			vars = append(vars, v)
			idx[v] = len(vars)
		}
		return "{{" + strconv.Itoa(idx[v]) + "}}"
	})
	return out, vars
}

// nombreWA is the Meta name of a catalogue template (snake_case).
func nombreWA(clave string) string { return strings.ReplaceAll(clave, "-", "_") }

// sembrarWA adds the utility templates of the catalogue (the ones that travel by WhatsApp) if they are missing.
func (s *Svc) sembrarWA(ctx context.Context, cid uuid.UUID) error {
	for _, t := range catalogo {
		if t.WA == nil {
			continue
		}
		cuerpo, vars := posicional(t.WA.Texto)
		if _, err := s.a.DB.Exec(ctx, `INSERT INTO whatsapp_plantillas (competition_id, nombre, categoria, cuerpo, variables, uso, estado, calidad, aprobada_at)
			VALUES ($1,$2,'utilidad',$3,$4,$5,'APPROVED','HIGH',now()) ON CONFLICT DO NOTHING`, cid, nombreWA(t.Clave), cuerpo, vars, t.Disparador); err != nil {
			return err
		}
	}
	return nil
}

func (s *Svc) listaWA(ctx context.Context, cid uuid.UUID) ([]WAPlantilla, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT w.nombre, w.categoria, w.idioma, w.cuerpo, w.variables, w.botones, w.uso, w.estado, w.calidad, w.motivo, w.meta_id, w.version, w.aprobada_at, w.updated_at,
		(SELECT count(*) FROM mensajes m WHERE m.competition_id = w.competition_id AND m.canal = 'whatsapp' AND NOT m.prueba AND m.plantilla = replace(w.nombre, '_', '-') AND m.created_at > now() - interval '30 days')
		FROM whatsapp_plantillas w WHERE w.competition_id = $1 ORDER BY w.categoria DESC, w.nombre`, cid)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (WAPlantilla, error) {
		var w WAPlantilla
		err := r.Scan(&w.Nombre, &w.Categoria, &w.Idioma, &w.Cuerpo, &w.Variables, &w.Botones, &w.Uso, &w.Estado, &w.Calidad, &w.Motivo, &w.MetaID, &w.Version, &w.AprobadaAt, &w.UpdatedAt, &w.Usos30d)
		return w, err
	})
}

// estadoWA changes the review state of a template and tells the backoffice (SSE whatsapp.plantilla_estado).
func (s *Svc) estadoWA(ctx context.Context, cid uuid.UUID, nombre, estado, calidad, motivo string) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE whatsapp_plantillas SET estado = $3, calidad = CASE WHEN $4 = '' THEN calidad ELSE $4 END, motivo = $5,
			aprobada_at = CASE WHEN $3 = 'APPROVED' THEN now() ELSE aprobada_at END, updated_at = now() WHERE competition_id = $1 AND nombre = $2`, cid, nombre, estado, calidad, motivo)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "whatsapp.plantilla_estado", map[string]any{"nombre": nombre, "estado": estado, "calidad": calidad, "motivo": motivo},
			events.Competition(cid.String()), events.ForPermission("integraciones.config")))
	})
}

func (s *Svc) registerWAPlantillas() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/whatsapp/plantillas"
	type listaOut struct{ Body []WAPlantilla }
	lista := func(ctx context.Context, cid uuid.UUID) (*listaOut, error) {
		if err := s.sembrarWA(ctx, cid); err != nil {
			return nil, err
		}
		l, err := s.listaWA(ctx, cid)
		return &listaOut{l}, err
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-plantillas", Method: http.MethodGet, Path: base, Summary: "Plantillas de WhatsApp con su estado de revisión, calidad y uso", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*listaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			return lista(ctx, in.CID)
		})
	huma.Register(api, huma.Operation{OperationID: "whatsapp-plantillas-sincronizar", Method: http.MethodPost, Path: base + "/sincronizar", Summary: "Sincronizar las plantillas con el proveedor", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*listaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			return lista(ctx, in.CID)
		})

	type revIn struct {
		CID    uuid.UUID `path:"cid"`
		Nombre string    `path:"nombre" pattern:"^[a-z0-9_]{3,60}$"`
		Body   struct {
			Categoria string    `json:"categoria" enum:"utilidad,marketing"`
			Cuerpo    string    `json:"cuerpo" minLength:"1" maxLength:"1024"`
			Variables []string  `json:"variables,omitempty" maxItems:"10"`
			Botones   []WABoton `json:"botones,omitempty" maxItems:"3"`
			Uso       string    `json:"uso,omitempty" maxLength:"80"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-plantilla-revision", Method: http.MethodPost, Path: base + "/{nombre}/revision", Summary: "Enviar una plantilla (nueva o cambiada) a revisión de Meta", Tags: tagCamp, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *revIn) (*struct{ Body WAPlantilla }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			b := in.Body
			n := 0
			for _, m := range reVarWA.FindAllStringSubmatch(b.Cuerpo, -1) {
				k, err := strconv.Atoi(m[1])
				if err != nil {
					return nil, problem.Unprocessable("VARIABLE_NO_POSICIONAL", "Las variables de WhatsApp son posicionales: {{1}}, {{2}}…")
				}
				n = max(n, k)
			}
			vars := b.Variables
			if vars == nil {
				vars = []string{}
			}
			if len(vars) < n {
				return nil, problem.Unprocessable("VARIABLES_SIN_DESCRIBIR", "Di qué es cada variable ({{1}}…{{"+strconv.Itoa(n)+"}}).")
			}
			bot := b.Botones
			if bot == nil {
				bot = []WABoton{}
			}
			for _, x := range bot {
				if x.Tipo == "url" && !strings.HasPrefix(x.URL, "https://") {
					return nil, problem.Unprocessable("URL_INVALIDA", "El enlace del botón debe empezar por https://")
				}
			}
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO whatsapp_plantillas (competition_id, nombre, categoria, cuerpo, variables, botones, uso, estado)
				VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')
				ON CONFLICT (competition_id, nombre) DO UPDATE SET categoria = $3, cuerpo = $4, variables = $5, botones = $6,
				uso = CASE WHEN $7 = '' THEN whatsapp_plantillas.uso ELSE $7 END, estado = 'PENDING', motivo = '', version = whatsapp_plantillas.version + 1, updated_at = now()`,
				in.CID, in.Nombre, b.Categoria, b.Cuerpo, vars, bot, b.Uso); err != nil {
				return nil, err
			}
			if err := s.estadoWA(ctx, in.CID, in.Nombre, "PENDING", "", ""); err != nil {
				return nil, err
			}
			// Today messages leave through evo-weai (no Meta review): in QA the review resolves itself in a few seconds.
			if config.Bool("WHATSAPP_SIMULADO", false) {
				cid, nombre := in.CID, in.Nombre
				time.AfterFunc(5*time.Second, func() {
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()
					_ = s.estadoWA(ctx, cid, nombre, "APPROVED", "HIGH", "")
				})
			}
			l, err := s.listaWA(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			for _, w := range l {
				if w.Nombre == in.Nombre {
					return &struct{ Body WAPlantilla }{w}, nil
				}
			}
			return nil, problem.NotFound("Esa plantilla no existe.")
		})
}

// estadoPlantillaHook applies Meta's message_template_status_update / quality update to a template.
func (s *Svc) estadoPlantillaHook(ctx context.Context, cid uuid.UUID, data json.RawMessage) error {
	var d struct {
		Nombre  string `json:"message_template_name"`
		Evento  string `json:"event"`
		Motivo  string `json:"reason"`
		Calidad string `json:"new_quality_score"`
	}
	if json.Unmarshal(data, &d) != nil || d.Nombre == "" {
		return nil
	}
	estado := map[string]string{"APPROVED": "APPROVED", "REJECTED": "REJECTED", "PAUSED": "PAUSED", "PENDING": "PENDING", "FLAGGED": "PAUSED"}[strings.ToUpper(d.Evento)]
	if estado == "" {
		return nil
	}
	if strings.EqualFold(d.Motivo, "NONE") {
		d.Motivo = ""
	}
	return s.estadoWA(ctx, cid, d.Nombre, estado, strings.ToUpper(d.Calidad), d.Motivo)
}
