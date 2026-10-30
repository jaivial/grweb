package messaging

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagCamp = []string{"Campañas"}

func requirePerm(ctx context.Context, cid uuid.UUID) (*auth.Principal, error) {
	return auth.Require(ctx, cid.String(), perm)
}

func requireIntegraciones(ctx context.Context, cid uuid.UUID) (*auth.Principal, error) {
	return auth.Require(ctx, cid.String(), "integraciones.config")
}

func actorDe(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}

// Canal is the progress of a channel.
type Canal struct {
	Total      int `json:"total"`
	Pendientes int `json:"pendientes"`
	Enviados   int `json:"enviados" doc:"Enviados, entregados o leídos"`
	Entregados int `json:"entregados"`
	Leidos     int `json:"leidos"`
	Fallidos   int `json:"fallidos" doc:"Fallidos o rebotados"`
}

// Campana is a campaign (the editor loads it whole).
type Campana struct {
	ID           uuid.UUID        `json:"id"`
	Nombre       string           `json:"nombre"`
	Asunto       string           `json:"asunto"`
	Preheader    string           `json:"preheader"`
	Canales      []string         `json:"canales"`
	Estado       string           `json:"estado" enum:"borrador,programada,enviando,pausada,enviada,cancelada"`
	Diseno       []Bloque         `json:"diseno"`
	SegmentoID   *uuid.UUID       `json:"segmentoId,omitempty"`
	Segmento     string           `json:"segmento"`
	EmailPorMin  int              `json:"emailPorMin"`
	WaPorMin     int              `json:"waPorMin"`
	ProgramadaAt *time.Time       `json:"programadaAt,omitempty"`
	IniciadaAt   *time.Time       `json:"iniciadaAt,omitempty"`
	TerminadaAt  *time.Time       `json:"terminadaAt,omitempty"`
	Version      int              `json:"version"`
	CreadaPor    string           `json:"creadaPor"`
	UpdatedPor   string           `json:"updatedPor"`
	CreatedAt    time.Time        `json:"createdAt"`
	UpdatedAt    time.Time        `json:"updatedAt"`
	Progreso     map[string]Canal `json:"progreso"`
}

const selCampana = `SELECT id, nombre, asunto, preheader, canales, estado, diseno, segmento_id, segmento, email_por_min, wa_por_min, programada_at, iniciada_at, terminada_at,
	version, creada_por, updated_por, created_at, updated_at FROM campanas`

func scanCampana(r pgx.Row) (Campana, error) {
	var c Campana
	err := r.Scan(&c.ID, &c.Nombre, &c.Asunto, &c.Preheader, &c.Canales, &c.Estado, &c.Diseno, &c.SegmentoID, &c.Segmento, &c.EmailPorMin, &c.WaPorMin, &c.ProgramadaAt, &c.IniciadaAt, &c.TerminadaAt,
		&c.Version, &c.CreadaPor, &c.UpdatedPor, &c.CreatedAt, &c.UpdatedAt)
	if c.Diseno == nil {
		c.Diseno = []Bloque{}
	}
	return c, err
}

func (s *Svc) progreso(ctx context.Context, q querier, ids []uuid.UUID) (map[uuid.UUID]map[string]Canal, error) {
	rows, err := q.Query(ctx, `SELECT campana_id, canal, count(*), count(*) FILTER (WHERE estado IN ('pendiente', 'enviando')),
		count(*) FILTER (WHERE estado IN ('enviado', 'entregado', 'leido')), count(*) FILTER (WHERE estado IN ('entregado', 'leido')), count(*) FILTER (WHERE estado = 'leido'),
		count(*) FILTER (WHERE estado IN ('fallido', 'rebotado')) FROM campana_destinatarios WHERE campana_id = ANY($1) GROUP BY 1, 2`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]map[string]Canal{}
	for rows.Next() {
		var id uuid.UUID
		var canal string
		var c Canal
		if err := rows.Scan(&id, &canal, &c.Total, &c.Pendientes, &c.Enviados, &c.Entregados, &c.Leidos, &c.Fallidos); err != nil {
			return nil, err
		}
		if out[id] == nil {
			out[id] = map[string]Canal{}
		}
		out[id][canal] = c
	}
	return out, rows.Err()
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func (s *Svc) campana(ctx context.Context, cid, id uuid.UUID) (Campana, error) {
	c, err := scanCampana(s.a.DB.QueryRow(ctx, selCampana+` WHERE competition_id = $1 AND id = $2`, cid, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return c, problem.NotFound("Campaña no encontrada.")
	}
	if err != nil {
		return c, err
	}
	p, err := s.progreso(ctx, s.a.DB, []uuid.UUID{id})
	c.Progreso = p[id]
	if c.Progreso == nil {
		c.Progreso = map[string]Canal{}
	}
	return c, err
}

// contexto builds what the compiler needs: brand, web, the published flights (for the «Flight / horario» block).
func (s *Svc) contexto(ctx context.Context, cid uuid.UUID, asunto, pre string, d []Bloque, canal, slug string) Contexto {
	m := s.marca(ctx, cid)
	c := Contexto{Marca: m, Asunto: asunto, Pre: pre, Ahora: time.Now(), Flights: map[string][]FlightResumen{}}
	img := absoluto(m.Web)
	c.Absoluto = func(u string) string {
		a := img(u)
		if slug != "" && canal != "" {
			return conUTM(a, canal, slug, m.Web)
		}
		return a
	}
	for _, b := range d {
		if b.Tipo == "horario" {
			c.Flights = s.flightsPublicados(ctx, cid)
			break
		}
	}
	return c
}

// flightsPublicados reads the public schedule (only what /horarios shows).
func (s *Svc) flightsPublicados(ctx context.Context, cid uuid.UUID) map[string][]FlightResumen {
	out := map[string][]FlightResumen{}
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return out
	}
	var h struct {
		Dias []struct {
			Fecha   string `json:"fecha"`
			Flights []struct {
				Codigo string    `json:"codigo"`
				Titulo string    `json:"titulo"`
				Inicio time.Time `json:"inicio"`
			} `json:"flights"`
		} `json:"dias"`
	}
	if err := s.schedule.Do(ctx, http.MethodGet, "/api/competiciones/"+c.Slug+"/horarios", nil, &h); err != nil {
		s.a.Log.Warn("horarios para la campaña", "err", err)
		return out
	}
	for _, d := range h.Dias {
		for _, f := range d.Flights {
			out[d.Fecha] = append(out[d.Fecha], FlightResumen{Codigo: f.Codigo, Titulo: f.Titulo, Hora: f.Inicio.In(madrid).Format("15:04")})
		}
	}
	return out
}

// Audiencia is the reachable audience (crm: the channel consent always applied, suppressions excluded).
type Audiencia struct {
	Segmento  string `json:"segmento"`
	Total     int    `json:"total"`
	Email     int    `json:"email"`
	WhatsApp  int    `json:"whatsapp"`
	Excluidos int    `json:"excluidos" doc:"En el segmento pero sin consentimiento del canal o con baja"`
}

type destinatarioCRM struct {
	ContactoID uuid.UUID `json:"contactoId"`
	Nombre     string    `json:"nombre"`
	Canal      string    `json:"canal"`
	Destino    string    `json:"destino"`
	Mascara    string    `json:"mascara"`
	Baja       string    `json:"baja"`
	BajaPost   string    `json:"bajaPost"`
}

func (s *Svc) audiencia(ctx context.Context, cid uuid.UUID, seg *uuid.UUID, canales []string, lista bool) (Audiencia, []destinatarioCRM, error) {
	var out struct {
		Audiencia
		Destinatarios []destinatarioCRM `json:"destinatarios"`
	}
	body := map[string]any{"canales": canales, "lista": lista}
	if seg != nil {
		body["segmentoId"] = seg
	}
	if err := s.crm.Do(ctx, http.MethodPost, "/internal/competiciones/"+cid.String()+"/audiencia", body, &out); err != nil {
		var p *problem.Error
		if errors.As(err, &p) && p.Status == http.StatusNotFound {
			return Audiencia{}, nil, problem.Unprocessable("SEGMENTO_NO_EXISTE", "Ese segmento ya no existe: elige otro.")
		}
		s.a.Log.Warn("audiencia de crm", "err", err)
		return Audiencia{}, nil, problem.New(http.StatusServiceUnavailable, "CONTACTOS_NO_DISPONIBLES", "No se pudo calcular la audiencia. Reintenta en unos segundos.")
	}
	return out.Audiencia, out.Destinatarios, nil
}

var disenoBase = []Bloque{
	{ID: "b1", Tipo: "cabecera"},
	{ID: "b2", Tipo: "portada", Imagen: "https://jaimedigitalstudio.b-cdn.net/grcup/images/club/alfonso-fernandez/img-3276.webp", Alt: "GR Strength Cup"},
	{ID: "b3", Tipo: "titulo", Texto: "Título de la campaña"},
	{ID: "b4", Tipo: "texto", Texto: "Hola {{nombre}}, escribe aquí el mensaje. Usa **negrita** para lo importante."},
	{ID: "b5", Tipo: "boton", Texto: "Reserva tu entrada gratis", URL: "/entradas"},
}

type campanaIn struct {
	Nombre       string     `json:"nombre" minLength:"1" maxLength:"160"`
	Asunto       string     `json:"asunto" maxLength:"160"`
	Preheader    string     `json:"preheader,omitempty" maxLength:"200"`
	Canales      []string   `json:"canales" minItems:"1" maxItems:"2"`
	Diseno       []Bloque   `json:"diseno" maxItems:"40"`
	SegmentoID   *uuid.UUID `json:"segmentoId,omitempty"`
	EmailPorMin  int        `json:"emailPorMin" minimum:"1" maximum:"600"`
	WaPorMin     int        `json:"waPorMin" minimum:"1" maximum:"60"`
	ProgramadaAt *time.Time `json:"programadaAt,omitempty"`
	Autor        string     `json:"autor,omitempty" enum:"usuario,ia"`
	Modelo       string     `json:"modelo,omitempty" maxLength:"60"`
	Nota         string     `json:"nota,omitempty" maxLength:"300"`
}

func (s *Svc) registerCampanas() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/campanas"
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type campOut struct {
		ETag string `header:"ETag"`
		Body Campana
	}
	salida := func(c Campana, err error) (*campOut, error) {
		if err != nil {
			return nil, err
		}
		return &campOut{ETag: fmt.Sprintf(`"%d"`, c.Version), Body: c}, nil
	}

	type listaIn struct {
		CID    uuid.UUID `path:"cid"`
		Estado string    `query:"estado" enum:"borrador,programada,enviando,pausada,enviada,cancelada,"`
	}
	type item struct {
		ID           uuid.UUID        `json:"id"`
		Nombre       string           `json:"nombre"`
		Asunto       string           `json:"asunto"`
		Canales      []string         `json:"canales"`
		Estado       string           `json:"estado"`
		Segmento     string           `json:"segmento"`
		ProgramadaAt *time.Time       `json:"programadaAt,omitempty"`
		TerminadaAt  *time.Time       `json:"terminadaAt,omitempty"`
		UpdatedAt    time.Time        `json:"updatedAt"`
		Progreso     map[string]Canal `json:"progreso"`
	}
	type listaOut struct {
		Body struct {
			Items    []item `json:"items"`
			Total    int    `json:"total"`
			EnCurso  int    `json:"enCurso"`
			WhatsApp string `json:"whatsapp" doc:"Modo del canal: evo-weai, simulado o ninguno"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-lista", Method: http.MethodGet, Path: base, Summary: "Campañas con canales, audiencia y progreso", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			q := `SELECT id, nombre, asunto, canales, estado, segmento, programada_at, terminada_at, updated_at FROM campanas WHERE competition_id = $1`
			args := []any{in.CID}
			if in.Estado != "" {
				q += ` AND estado = $2`
				args = append(args, in.Estado)
			}
			rows, err := s.a.DB.Query(ctx, q+` ORDER BY CASE WHEN estado IN ('enviando', 'programada', 'pausada') THEN 0 ELSE 1 END, updated_at DESC LIMIT 200`, args...)
			if err != nil {
				return nil, err
			}
			o := &listaOut{}
			o.Body.Items = []item{}
			ids := []uuid.UUID{}
			for rows.Next() {
				var x item
				if err := rows.Scan(&x.ID, &x.Nombre, &x.Asunto, &x.Canales, &x.Estado, &x.Segmento, &x.ProgramadaAt, &x.TerminadaAt, &x.UpdatedAt); err != nil {
					rows.Close()
					return nil, err
				}
				o.Body.Items = append(o.Body.Items, x)
				ids = append(ids, x.ID)
			}
			rows.Close()
			p, err := s.progreso(ctx, s.a.DB, ids)
			if err != nil {
				return nil, err
			}
			for i := range o.Body.Items {
				o.Body.Items[i].Progreso = p[o.Body.Items[i].ID]
				if o.Body.Items[i].Progreso == nil {
					o.Body.Items[i].Progreso = map[string]Canal{}
				}
				if e := o.Body.Items[i].Estado; e == "enviando" || e == "programada" || e == "pausada" {
					o.Body.EnCurso++
				}
			}
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM campanas WHERE competition_id = $1`, in.CID).Scan(&o.Body.Total)
			o.Body.WhatsApp = s.waDe(ctx, in.CID).Modo
			return o, nil
		})

	type crearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Nombre string `json:"nombre" minLength:"1" maxLength:"160"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-crear", Method: http.MethodPost, Path: base, Summary: "Nueva campaña (diseño base)", Tags: tagCamp, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *crearIn) (*campOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			id := uuid.Must(uuid.NewV7())
			nombre := strings.TrimSpace(in.Body.Nombre)
			err := s.tx(ctx, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO campanas (id, competition_id, nombre, asunto, diseno, creada_por, updated_por) VALUES ($1,$2,$3,$3,$4,$5,$5)`,
					id, in.CID, nombre, disenoBase, actorDe(ctx)); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "campana.creada", map[string]any{"nombre": nombre, "por": actorDe(ctx)},
					events.Competition(in.CID.String()), events.ForPermission(perm), events.Subject("campana:"+id.String())))
			})
			if err != nil {
				return nil, err
			}
			return salida(s.campana(ctx, in.CID, id))
		})

	huma.Register(api, huma.Operation{OperationID: "campanas-get", Method: http.MethodGet, Path: base + "/{id}", Summary: "Campaña", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *idIn) (*campOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			return salida(s.campana(ctx, in.CID, in.ID))
		})

	type putIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    campanaIn
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-guardar", Method: http.MethodPut, Path: base + "/{id}", Summary: "Guardar (compila el email y deriva el WhatsApp)", Tags: tagCamp, Security: bearer, MaxBodyBytes: 512 << 10},
		func(ctx context.Context, in *putIn) (*campOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			d, err := validarDiseno(b.Diseno)
			if err != nil {
				return nil, problem.Unprocessable("DISENO_NO_VALIDO", err.Error())
			}
			canales := map[string]bool{}
			for _, c := range b.Canales {
				if c != "email" && c != "whatsapp" {
					return nil, problem.Unprocessable("CANAL_NO_VALIDO", "Los canales son email y whatsapp.")
				}
				canales[c] = true
			}
			if canales["email"] && strings.TrimSpace(b.Asunto) == "" {
				return nil, problem.Unprocessable("FALTA_ASUNTO", "Escribe el asunto del email.")
			}
			segNombre := ""
			if b.SegmentoID != nil {
				a, _, err := s.audiencia(ctx, in.CID, b.SegmentoID, b.Canales, false)
				if err != nil {
					return nil, err
				}
				segNombre = a.Segmento
			}
			lista := []string{}
			for _, c := range []string{"email", "whatsapp"} {
				if canales[c] {
					lista = append(lista, c)
				}
			}
			cur, err := s.campana(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			ctxEmail := s.contexto(ctx, in.CID, b.Asunto, b.Preheader, d, "email", slugCampana(b.Nombre))
			ctxWA := s.contexto(ctx, in.CID, b.Asunto, b.Preheader, d, "whatsapp", slugCampana(b.Nombre))
			w := derivarWhatsApp(d, ctxWA)
			autor := b.Autor
			if autor == "" {
				autor = "usuario"
			}
			err = s.tx(ctx, func(tx pgx.Tx) error {
				var ver int
				var estado string
				if err := tx.QueryRow(ctx, `SELECT version, estado FROM campanas WHERE competition_id = $1 AND id = $2 FOR UPDATE`, in.CID, in.ID).Scan(&ver, &estado); err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != fmt.Sprint(ver) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha guardado esta campaña. Recárgala para ver sus cambios.")
				}
				if estado == "enviando" || estado == "enviada" || estado == "cancelada" {
					return problem.Conflict("CAMPANA_EN_ENVIO", "Una campaña enviada o en envío no se puede editar: pausa o duplica.")
				}
				if _, err := tx.Exec(ctx, `UPDATE campanas SET nombre=$3, asunto=$4, preheader=$5, canales=$6, diseno=$7, email_html=$8, wa_texto=$9, wa_imagen=$10, segmento_id=$11, segmento=$12,
					email_por_min=$13, wa_por_min=$14, version = version + 1, updated_por=$15, updated_at = now() WHERE id = $2 AND competition_id = $1`,
					in.CID, in.ID, strings.TrimSpace(b.Nombre), strings.TrimSpace(b.Asunto), strings.TrimSpace(b.Preheader), lista, d, compilarEmail(d, ctxEmail), w.Texto, w.Imagen,
					b.SegmentoID, segNombre, max(1, b.EmailPorMin), max(1, b.WaPorMin), actorDe(ctx)); err != nil {
					return err
				}
				// History: AI changes always; manual saves when the design changed.
				antes, _ := json.Marshal(cur.Diseno)
				ahora, _ := json.Marshal(d)
				if autor == "ia" || string(antes) != string(ahora) {
					if _, err := tx.Exec(ctx, `INSERT INTO campana_revisiones (id, campana_id, diseno, autor, por, modelo, nota) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
						uuid.Must(uuid.NewV7()), in.ID, d, autor, actorDe(ctx), b.Modelo, b.Nota); err != nil {
						return err
					}
					_, err := tx.Exec(ctx, `DELETE FROM campana_revisiones WHERE campana_id = $1 AND id NOT IN (SELECT id FROM campana_revisiones WHERE campana_id = $1 ORDER BY created_at DESC LIMIT 50)`, in.ID)
					return err
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			return salida(s.campana(ctx, in.CID, in.ID))
		})

	huma.Register(api, huma.Operation{OperationID: "campanas-borrar", Method: http.MethodDelete, Path: base + "/{id}", Summary: "Borrar un borrador", Tags: tagCamp, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			return nil, s.tx(ctx, func(tx pgx.Tx) error {
				var nombre string
				err := tx.QueryRow(ctx, `DELETE FROM campanas WHERE competition_id = $1 AND id = $2 AND estado IN ('borrador', 'cancelada') RETURNING nombre`, in.CID, in.ID).Scan(&nombre)
				if errors.Is(err, pgx.ErrNoRows) {
					return problem.Conflict("CAMPANA_NO_BORRABLE", "Solo se borran borradores o campañas canceladas.")
				}
				if err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "campana.borrada", map[string]any{"nombre": nombre, "por": actorDe(ctx)},
					events.Competition(in.CID.String()), events.ForPermission(perm), events.Subject("campana:"+in.ID.String())))
			})
		})

	huma.Register(api, huma.Operation{OperationID: "campanas-duplicar", Method: http.MethodPost, Path: base + "/{id}/duplicar", Summary: "Duplicar (nuevo borrador)", Tags: tagCamp, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *idIn) (*campOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			id := uuid.Must(uuid.NewV7())
			tag, err := s.a.DB.Exec(ctx, `INSERT INTO campanas (id, competition_id, nombre, asunto, preheader, canales, diseno, email_html, wa_texto, wa_imagen, segmento_id, segmento, email_por_min, wa_por_min, creada_por, updated_por)
				SELECT $3, competition_id, left(nombre || ' (copia)', 160), asunto, preheader, canales, diseno, email_html, wa_texto, wa_imagen, segmento_id, segmento, email_por_min, wa_por_min, $4, $4
				FROM campanas WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, id, actorDe(ctx))
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Campaña no encontrada.")
			}
			return salida(s.campana(ctx, in.CID, id))
		})

	type rev struct {
		ID        uuid.UUID `json:"id"`
		Autor     string    `json:"autor"`
		Por       string    `json:"por"`
		Modelo    string    `json:"modelo,omitempty"`
		Nota      string    `json:"nota,omitempty"`
		Diseno    []Bloque  `json:"diseno"`
		CreatedAt time.Time `json:"createdAt"`
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-revisiones", Method: http.MethodGet, Path: base + "/{id}/revisiones", Summary: "Historial del diseño (últimas 50)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *idIn) (*struct{ Body []rev }, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT r.id, r.autor, r.por, r.modelo, r.nota, r.diseno, r.created_at FROM campana_revisiones r JOIN campanas c ON c.id = r.campana_id
				WHERE c.competition_id = $1 AND r.campana_id = $2 ORDER BY r.created_at DESC LIMIT 50`, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			out := []rev{}
			for rows.Next() {
				var r rev
				if err := rows.Scan(&r.ID, &r.Autor, &r.Por, &r.Modelo, &r.Nota, &r.Diseno, &r.CreatedAt); err != nil {
					return nil, err
				}
				out = append(out, r)
			}
			return &struct{ Body []rev }{out}, rows.Err()
		})

	// Live preview of the editor (also for unsaved designs): the email as a sample recipient sees it and the
	// WhatsApp version.
	type previaIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Nombre    string   `json:"nombre,omitempty" maxLength:"160"`
			Asunto    string   `json:"asunto" maxLength:"160"`
			Preheader string   `json:"preheader,omitempty" maxLength:"200"`
			Diseno    []Bloque `json:"diseno" maxItems:"40"`
		}
	}
	type previaOut struct {
		Body struct {
			EmailHTML string   `json:"emailHtml"`
			Texto     string   `json:"texto"`
			WhatsApp  WhatsApp `json:"whatsapp"`
			Error     string   `json:"error,omitempty" doc:"El diseño tiene un problema (se muestra lo válido)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-previsualizar", Method: http.MethodPost, Path: base + "/previsualizar", Summary: "Previsualizar un diseño (email y WhatsApp)", Tags: tagCamp, Security: bearer, MaxBodyBytes: 512 << 10},
		func(ctx context.Context, in *previaIn) (*previaOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			o := &previaOut{}
			d, err := validarDiseno(in.Body.Diseno)
			if err != nil {
				o.Body.Error = err.Error()
				d = []Bloque{}
				for _, b := range in.Body.Diseno {
					if x, e := validarDiseno([]Bloque{b}); e == nil {
						d = append(d, x...)
					}
				}
			}
			slug := slugCampana(in.Body.Nombre)
			ce := s.contexto(ctx, in.CID, in.Body.Asunto, in.Body.Preheader, d, "email", slug)
			cw := s.contexto(ctx, in.CID, in.Body.Asunto, in.Body.Preheader, d, "whatsapp", slug)
			baja := s.webURL + "/baja?t=ejemplo"
			o.Body.EmailHTML = personalizar(compilarEmail(d, ce), "Laura", baja, true)
			o.Body.Texto = personalizar(textoPlano(d, ce), "Laura", baja, false)
			o.Body.WhatsApp = derivarWhatsApp(d, cw)
			o.Body.WhatsApp.Texto = personalizar(o.Body.WhatsApp.Texto, "Laura", baja, false)
			return o, nil
		})

	type audOut struct {
		Body struct {
			Audiencia
			WhatsApp WAEstado `json:"whatsappEstado"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-audiencia", Method: http.MethodGet, Path: base + "/{id}/audiencia", Summary: "A cuántos llega por canal", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *idIn) (*audOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			c, err := s.campana(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			a, _, err := s.audiencia(ctx, in.CID, c.SegmentoID, c.Canales, false)
			if err != nil {
				return nil, err
			}
			o := &audOut{}
			o.Body.Audiencia, o.Body.WhatsApp = a, s.waEstado(ctx, in.CID)
			return o, nil
		})

	// Test send to an email or a phone (the saved version), right away.
	type pruebaIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Destino string `json:"destino" minLength:"5" maxLength:"254" doc:"Email o teléfono (+34…)"`
		}
	}
	type pruebaOut struct {
		Body struct {
			Canal   string `json:"canal"`
			Detalle string `json:"detalle"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-prueba", Method: http.MethodPost, Path: base + "/{id}/prueba", Summary: "Enviar una prueba (email o WhatsApp según el destino)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *pruebaIn) (*pruebaOut, error) {
			p, err := requirePerm(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "campana-prueba", p.UserID.String()), 20, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has enviado muchas pruebas. Espera un poco.")
			}
			c, err := s.campana(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			var html, texto, wa, waImg string
			_ = s.a.DB.QueryRow(ctx, `SELECT email_html, wa_texto, wa_imagen FROM campanas WHERE id = $1`, in.ID).Scan(&html, &wa, &waImg)
			ce := s.contexto(ctx, in.CID, c.Asunto, c.Preheader, c.Diseno, "email", slugCampana(c.Nombre))
			texto = textoPlano(c.Diseno, ce)
			dest := strings.TrimSpace(in.Body.Destino)
			o := &pruebaOut{}
			baja := s.webURL + "/baja?t=prueba"
			if strings.Contains(dest, "@") {
				if a, err := mail.ParseAddress(dest); err != nil || a.Address != dest {
					return nil, problem.Unprocessable("DESTINO_NO_VALIDO", "Ese email no es válido.")
				}
				if html == "" {
					return nil, problem.Conflict("SIN_GUARDAR", "Guarda la campaña antes de probarla.")
				}
				r := Render{Asunto: "[Prueba] " + c.Asunto, HTML: personalizar(html, "Prueba", baja, true), Texto: personalizar(texto, "Prueba", baja, false)}
				id, err := enviarSMTP(ctx, s.smtpDe(ctx, in.CID), dest, r, map[string]string{"X-GRCup-Campana": in.ID.String()})
				if err != nil {
					return nil, problem.New(http.StatusBadGateway, "ENVIO_FALLIDO", "No se pudo enviar la prueba: "+err.Error())
				}
				o.Body.Canal, o.Body.Detalle = "email", "Enviada a "+dest+" · "+id
			} else {
				tel := normTelefono(dest)
				if tel == "" {
					return nil, problem.Unprocessable("DESTINO_NO_VALIDO", "Escribe un email o un teléfono con prefijo (+34…).")
				}
				cfg := s.waDe(ctx, in.CID)
				id, err := s.enviarWA(ctx, cfg, tel, WhatsApp{Texto: personalizar("[Prueba]\n\n"+wa, "Prueba", baja, false), Imagen: waImg})
				if err != nil {
					return nil, problem.New(http.StatusBadGateway, "ENVIO_FALLIDO", "No se pudo enviar la prueba: "+err.Error())
				}
				o.Body.Canal, o.Body.Detalle = "whatsapp", "Enviada a "+tel+" · "+id
				if cfg.Modo == "simulado" {
					o.Body.Detalle = "Simulada (WhatsApp sin número conectado) · " + tel
				}
			}
			return o, nil
		})

	type enviarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    struct {
			ProgramadaAt *time.Time `json:"programadaAt,omitempty" doc:"Si se indica (futuro), queda programada"`
			SoloEmail    bool       `json:"soloEmail,omitempty" doc:"Enviar solo por email aunque tenga WhatsApp (canal no disponible)"`
		}
	}
	type enviarOut struct {
		Body struct {
			Estado    string `json:"estado"`
			Encolados int    `json:"encolados"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-enviar", Method: http.MethodPost, Path: base + "/{id}/enviar", Summary: "Enviar ahora o programar", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *enviarIn) (*enviarOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			c, err := s.campana(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			if strings.Trim(in.IfMatch, `"W/`) != fmt.Sprint(c.Version) {
				return nil, problem.Conflict("CAMBIOS_SIN_GUARDAR", "Hay cambios sin guardar o de otra persona: guarda o recarga antes de enviar.")
			}
			if c.Estado != "borrador" && c.Estado != "programada" {
				return nil, problem.Conflict("CAMPANA_YA_ENVIADA", "Esta campaña ya se envió o está enviándose.")
			}
			if len(c.Diseno) == 0 {
				return nil, problem.Unprocessable("DISENO_VACIO", "El diseño está vacío.")
			}
			canales := c.Canales
			if in.Body.SoloEmail {
				canales = []string{"email"}
			}
			for _, ch := range canales {
				if ch == "whatsapp" && s.waDe(ctx, in.CID).Modo == "ninguno" {
					return nil, problem.Conflict("WHATSAPP_NO_DISPONIBLE", "WhatsApp no está conectado: envía solo por email o conecta el número en «Emails y avisos › WhatsApp».")
				}
			}
			o := &enviarOut{}
			if in.Body.ProgramadaAt != nil && in.Body.ProgramadaAt.After(time.Now().Add(time.Minute)) {
				err := s.tx(ctx, func(tx pgx.Tx) error {
					if _, err := tx.Exec(ctx, `UPDATE campanas SET estado = 'programada', programada_at = $3, canales = $4, version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`,
						in.CID, in.ID, in.Body.ProgramadaAt, canales); err != nil {
						return err
					}
					return events.Enqueue(ctx, tx, events.New(ctx, "campana.programada", map[string]any{"nombre": c.Nombre, "at": in.Body.ProgramadaAt, "por": actorDe(ctx)},
						events.Competition(in.CID.String()), events.ForPermission(perm), events.Subject("campana:"+in.ID.String())))
				})
				o.Body.Estado = "programada"
				return o, err
			}
			n, err := s.iniciar(ctx, in.CID, in.ID, canales, actorDe(ctx))
			o.Body.Estado, o.Body.Encolados = "enviando", n
			return o, err
		})

	cambiar := func(id, desde, hacia, evento, msg string) {
		huma.Register(api, huma.Operation{OperationID: "campanas-" + id, Method: http.MethodPost, Path: base + "/{id}/" + id, Summary: msg, Tags: tagCamp, Security: bearer},
			func(ctx context.Context, in *idIn) (*campOut, error) {
				if _, err := requirePerm(ctx, in.CID); err != nil {
					return nil, err
				}
				err := s.tx(ctx, func(tx pgx.Tx) error {
					var nombre string
					err := tx.QueryRow(ctx, `UPDATE campanas SET estado = $3, version = version + 1, updated_at = now(), terminada_at = CASE WHEN $3 = 'cancelada' THEN now() ELSE terminada_at END
						WHERE competition_id = $1 AND id = $2 AND estado = ANY($4) RETURNING nombre`, in.CID, in.ID, hacia, strings.Split(desde, ",")).Scan(&nombre)
					if errors.Is(err, pgx.ErrNoRows) {
						return problem.Conflict("ESTADO_NO_VALIDO", "La campaña no está en un estado que lo permita.")
					}
					if err != nil {
						return err
					}
					if hacia == "cancelada" {
						if _, err := tx.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'cancelado', destino = mascara, updated_at = now() WHERE campana_id = $1 AND estado = 'pendiente'`, in.ID); err != nil {
							return err
						}
					}
					return events.Enqueue(ctx, tx, events.New(ctx, evento, map[string]any{"nombre": nombre, "por": actorDe(ctx)},
						events.Competition(in.CID.String()), events.ForPermission(perm), events.Subject("campana:"+in.ID.String())))
				})
				if err != nil {
					return nil, err
				}
				return salida(s.campana(ctx, in.CID, in.ID))
			})
	}
	cambiar("pausar", "enviando", "pausada", "campana.pausada", "Pausar el envío (continúa donde se quedó)")
	cambiar("reanudar", "pausada", "enviando", "campana.reanudada", "Reanudar el envío")
	cambiar("cancelar", "enviando,pausada,programada", "cancelada", "campana.cancelada", "Cancelar (los pendientes no se envían)")
	cambiar("desprogramar", "programada", "borrador", "campana.desprogramada", "Quitar la programación")

	type destIn struct {
		CID    uuid.UUID `path:"cid"`
		ID     uuid.UUID `path:"id"`
		Canal  string    `query:"canal" enum:"email,whatsapp,"`
		Estado string    `query:"estado" enum:"pendiente,enviado,entregado,leido,fallido,rebotado,cancelado,"`
		Pagina int       `query:"pagina" minimum:"1" default:"1"`
	}
	type dest struct {
		Destino   string     `json:"destino" doc:"Enmascarado"`
		Nombre    string     `json:"nombre"`
		Canal     string     `json:"canal"`
		Estado    string     `json:"estado"`
		Detalle   string     `json:"detalle"`
		EnviadoAt *time.Time `json:"enviadoAt,omitempty"`
		LeidoAt   *time.Time `json:"leidoAt,omitempty"`
	}
	type destOut struct {
		Body struct {
			Items  []dest `json:"items"`
			Total  int    `json:"total"`
			Pagina int    `json:"pagina"`
			Por    int    `json:"por"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "campanas-destinatarios", Method: http.MethodGet, Path: base + "/{id}/destinatarios", Summary: "Registro por destinatario (enmascarado)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *destIn) (*destOut, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			where := `d.campana_id = $1 AND c.competition_id = $2`
			args := []any{in.ID, in.CID}
			if in.Canal != "" {
				args = append(args, in.Canal)
				where += fmt.Sprintf(` AND d.canal = $%d`, len(args))
			}
			if in.Estado != "" {
				args = append(args, in.Estado)
				where += fmt.Sprintf(` AND d.estado = $%d`, len(args))
			}
			o := &destOut{}
			o.Body.Pagina, o.Body.Por = in.Pagina, 50
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM campana_destinatarios d JOIN campanas c ON c.id = d.campana_id WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT d.mascara, d.nombre, d.canal, d.estado, d.detalle, d.enviado_at, d.leido_at FROM campana_destinatarios d JOIN campanas c ON c.id = d.campana_id
				WHERE `+where+fmt.Sprintf(` ORDER BY d.updated_at DESC, d.id LIMIT 50 OFFSET %d`, (in.Pagina-1)*50), args...)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o.Body.Items = []dest{}
			for rows.Next() {
				var x dest
				if err := rows.Scan(&x.Destino, &x.Nombre, &x.Canal, &x.Estado, &x.Detalle, &x.EnviadoAt, &x.LeidoAt); err != nil {
					return nil, err
				}
				o.Body.Items = append(o.Body.Items, x)
			}
			return o, rows.Err()
		})
}

// iniciar freezes the audience into campana_destinatarios (idempotent per contact and channel) and starts sending.
func (s *Svc) iniciar(ctx context.Context, cid, id uuid.UUID, canales []string, por string) (int, error) {
	var seg *uuid.UUID
	var nombre string
	if err := s.a.DB.QueryRow(ctx, `SELECT segmento_id, nombre FROM campanas WHERE id = $1`, id).Scan(&seg, &nombre); err != nil {
		return 0, err
	}
	_, lista, err := s.audiencia(ctx, cid, seg, canales, true)
	if err != nil {
		return 0, err
	}
	if len(lista) == 0 {
		return 0, problem.Conflict("SIN_DESTINATARIOS", "Nadie de la audiencia acepta recibir por estos canales.")
	}
	n := 0
	err = s.tx(ctx, func(tx pgx.Tx) error {
		var estado string
		if err := tx.QueryRow(ctx, `SELECT estado FROM campanas WHERE id = $1 FOR UPDATE`, id).Scan(&estado); err != nil {
			return err
		}
		if estado != "borrador" && estado != "programada" {
			return problem.Conflict("CAMPANA_YA_ENVIADA", "Esta campaña ya se envió o está enviándose.")
		}
		for _, d := range lista {
			tag, err := tx.Exec(ctx, `INSERT INTO campana_destinatarios (id, campana_id, contacto_id, canal, destino, mascara, nombre, baja_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				ON CONFLICT (campana_id, contacto_id, canal) DO NOTHING`, uuid.Must(uuid.NewV7()), id, d.ContactoID, d.Canal, d.Destino, d.Mascara, d.Nombre, d.Baja+"\n"+d.BajaPost)
			if err != nil {
				return err
			}
			n += int(tag.RowsAffected())
		}
		if _, err := tx.Exec(ctx, `UPDATE campanas SET estado = 'enviando', canales = $2, iniciada_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, id, canales); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "campana.iniciada", map[string]any{"nombre": nombre, "destinatarios": n, "canales": canales, "por": por},
			events.Competition(cid.String()), events.ForPermission(perm), events.Subject("campana:"+id.String())))
	})
	return n, err
}

// normTelefono: +34600111222 (Spanish numbers without prefix get +34).
func normTelefono(t string) string {
	var b strings.Builder
	for i, r := range strings.TrimSpace(t) {
		if r == '+' && i == 0 {
			b.WriteRune(r)
		} else if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if !strings.HasPrefix(s, "+") {
		if len(s) == 9 {
			s = "+34" + s
		} else {
			s = "+" + s
		}
	}
	if len(s) < 10 || len(s) > 16 {
		return ""
	}
	return s
}

var _ = db.Tx
