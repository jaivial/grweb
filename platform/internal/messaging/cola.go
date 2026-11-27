package messaging

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/crypto"
)

// «Sistema › Cola de envío»: the outbox seen as a queue, one channel at a time. Pending messages ordered by the time
// their turn comes (ritmo.go), failed ones with the log of their tries (mensaje_intentos). The page reloads on the
// «mensaje.estado» events of the admin stream (queued, turn moved, sent, failed).

// ColaItem is a row of «Cola de envío».
type ColaItem struct {
	ID        uuid.UUID  `json:"id"`
	Canal     string     `json:"canal" enum:"email,whatsapp"`
	Destino   string     `json:"destino" doc:"Teléfono o email; el grupo de organizadores sale como «Grupo de organizadores»"`
	Atleta    string     `json:"atleta" doc:"Nombre del atleta del aviso (vacío si la plantilla no lo lleva)"`
	Titulo    string     `json:"titulo" doc:"Asunto del email o nombre del aviso de WhatsApp"`
	Resumen   string     `json:"resumen" doc:"Contenido en texto plano, como mucho 280 caracteres (enlaces personales y secretos ocultos)"`
	Estado    string     `json:"estado"`
	Intentos  int        `json:"intentos"`
	Detalle   string     `json:"detalle"`
	Prueba    bool       `json:"prueba"`
	ProximoAt *time.Time `json:"proximoAt,omitempty" doc:"Cuándo vuelve a mirarlo el worker (solo pendientes)"`
	SalidaAt  *time.Time `json:"salidaAt,omitempty" doc:"Hora estimada de salida según su puesto en la cola, el turno del número, los topes y el horario de descanso (solo pendientes)"`
	EnviadoAt *time.Time `json:"enviadoAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// ColaPausa is the pause of a channel (the number unlinked or blocked, the server down).
type ColaPausa struct {
	Motivo string    `json:"motivo"`
	Hasta  time.Time `json:"hasta" doc:"Siguiente intento"`
}

// estimarSalidas fills SalidaAt of the pending messages of a page, playing the queue in order (from the first
// pending one, so a later page counts the ones before it) against the sender's turn, its hourly and daily caps (with
// the warm-up), the pause of the channel and the quiet hours. An estimate: the first-contact cap and the campaigns
// that share the number are not simulated. Returns the pause of the channel, if any.
func (s *Svc) estimarSalidas(ctx context.Context, cid uuid.UUID, canal string, offset int, items []ColaItem) *ColaPausa {
	ahora := time.Now()
	var remitente string
	var paso time.Duration
	porHora, porDia := 0, emailPorDia
	if canal == "whatsapp" {
		remitente, paso, porHora = remitenteWA(s.waDe(ctx, cid), cid), (waIntervaloMin+waIntervaloMax)/2, waPorHora
	} else {
		ritmo := 120
		_ = s.a.DB.QueryRow(ctx, `SELECT ritmo_minuto FROM ajustes WHERE competition_id = $1`, cid).Scan(&ritmo)
		remitente, paso = remitenteEmail(s.smtpDe(ctx, cid)), time.Minute/time.Duration(max(ritmo, 1))
	}
	t := ahora
	var sig, desde time.Time
	if s.a.DB.QueryRow(ctx, `SELECT siguiente_at, calentamiento_desde FROM envio_turnos WHERE remitente = $1`, remitente).Scan(&sig, &desde) == nil {
		t = later(t, sig)
		if canal == "whatsapp" {
			porDia = porDiaWA(desde, ahora)
		}
	} else if canal == "whatsapp" {
		porDia = porDiaWA(ahora, ahora)
	}
	var pausa *ColaPausa
	caido := s.a.Keys.Of("messaging", "canal-caido", cid.String(), canal)
	if motivo, err := s.a.Redis.Get(ctx, caido).Result(); err == nil {
		ttl, _ := s.a.Redis.TTL(ctx, caido).Result()
		pausa = &ColaPausa{Motivo: motivo, Hasta: ahora.Add(max(ttl, 0))}
		t = later(t, pausa.Hasta)
	}
	// What the sender already sent in the windows of the caps, then each message of the queue as it would go out.
	var envios []time.Time
	if rows, err := s.a.DB.Query(ctx, `SELECT at FROM envio_registro WHERE remitente = $1 AND at > now() - interval '24 hours' ORDER BY at`, remitente); err == nil {
		envios, _ = pgx.CollectRows(rows, pgx.RowTo[time.Time])
	}
	rows, err := s.a.DB.Query(ctx, `SELECT proximo_at FROM mensajes WHERE competition_id = $1 AND canal = $2 AND estado IN ('en_cola', 'reintentando', 'enviando')
		ORDER BY `+colaFiltros["pendientes"].orden+` LIMIT $3`, cid, canal, offset+len(items))
	if err != nil {
		return pausa
	}
	proximos, err := pgx.CollectRows(rows, pgx.RowTo[time.Time])
	if err != nil {
		return pausa
	}
	loc := s.zonaDe(ctx, cid)
	lleno := func(ventana time.Duration, tope int) (time.Time, bool) {
		i := sort.Search(len(envios), func(i int) bool { return envios[i].After(t.Add(-ventana)) })
		if tope > 0 && len(envios)-i >= tope {
			return envios[i].Add(ventana), true
		}
		return t, false
	}
	for k, p := range proximos {
		t = later(t, p)
		for {
			if canal == "whatsapp" {
				t = finSilencio(t, loc)
			}
			if nt, ok := lleno(24*time.Hour, porDia); ok {
				t = nt
				continue
			}
			if nt, ok := lleno(time.Hour, porHora); ok {
				t = nt
				continue
			}
			break
		}
		if k >= offset && k-offset < len(items) {
			salida := t
			items[k-offset].SalidaAt = &salida
		}
		envios = append(envios, t)
		t = t.Add(paso)
	}
	return pausa
}

func later(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}
	return a
}

// ColaCuentas are the counters of a channel in «Cola de envío».
type ColaCuentas struct {
	Pendientes int `json:"pendientes"`
	Fallidos   int `json:"fallidos"`
	Enviados   int `json:"enviados"`
}

// Intento is one try of a message.
type Intento struct {
	At      time.Time `json:"at"`
	Intento int       `json:"intento"`
	Estado  string    `json:"estado" doc:"enviado, reintentando, pausa, fallido, rebotado, omitido…"`
	Detalle string    `json:"detalle" doc:"Motivo para la persona"`
	Tecnico string    `json:"tecnico,omitempty" doc:"Respuesta técnica del proveedor (sin teléfonos)"`
}

// colaFiltros: the states of each filter and its order (pending: the next to go out first).
var colaFiltros = map[string]struct {
	estados []string
	orden   string
}{
	"pendientes": {[]string{"en_cola", "reintentando", "enviando"}, "proximo_at, created_at"},
	"fallidos":   {[]string{"fallido", "rebotado"}, "updated_at DESC"},
	"enviados":   {[]string{"enviado"}, "enviado_at DESC NULLS LAST"},
}

const colaPorPagina = 25

// visor caches the templates and the brand while a page of messages is rendered.
type visor struct {
	plantillas map[string]plantillaEfectiva
	marca      *Marca
}

// contenidoVisible is what staff may read of a message: its subject (or the name of the WhatsApp notice), HTML and
// text. A sent message shows what it sent; a queued one what it will send. Access links (magic links, payments,
// unsubscribe) belong to the recipient and never show, and a secret variable (an initial password) shows as dots.
func (s *Svc) contenidoVisible(ctx context.Context, cid uuid.UUID, canal, clave string, vars map[string]string, enviado *Contenido, v *visor) (string, string, string) {
	if v == nil {
		v = &visor{}
	}
	e, ok := v.plantillas[clave]
	if !ok {
		var err error
		if e, err = s.plantilla(ctx, cid, clave); err != nil {
			return "", "", ""
		}
		if v.plantillas == nil {
			v.plantillas = map[string]plantillaEfectiva{}
		}
		v.plantillas[clave] = e
	}
	vis := crypto.OcultarVars(vars)
	for k := range vis {
		if varEnlacePersonal[k] && vis[k] != "" {
			vis[k] = enlacePersonal
		}
	}
	// A WhatsApp keeps the exact text it sent (Contenido.Cuerpo): no email layout.
	if canal == "whatsapp" {
		texto := ""
		if enviado != nil {
			texto = enviado.Cuerpo
		} else if e.WA != nil {
			texto, _ = renderizarWA(e.WA.Texto, vis, e.Variables)
		}
		// The stored copy may keep the real personal links: masked here too.
		for k, val := range vars {
			if varEnlacePersonal[k] && val != "" {
				texto = strings.ReplaceAll(texto, val, enlacePersonal)
			}
		}
		return e.Nombre, "", texto
	}
	c := e.Contenido
	if enviado != nil {
		c = *enviado
	}
	if v.marca == nil {
		m := s.marca(ctx, cid)
		v.marca = &m
	}
	r, err := renderizarDe(e.Plantilla, c, vis, *v.marca)
	if err != nil {
		return e.Asunto, "", ""
	}
	return r.Asunto, r.HTML, r.Texto
}

// resumir is a text in one paragraph of at most n characters.
func resumir(t string, n int) string {
	t = strings.Join(strings.Fields(t), " ")
	if r := []rune(t); len(r) > n {
		return strings.TrimSpace(string(r[:n-1])) + "…"
	}
	return t
}

func (s *Svc) registerCola() {
	api := s.a.API
	type colaIn struct {
		CID    uuid.UUID `path:"cid"`
		Canal  string    `query:"canal" enum:"email,whatsapp" default:"whatsapp"`
		Filtro string    `query:"filtro" enum:"pendientes,fallidos,enviados" default:"pendientes"`
		Pagina int       `query:"pagina" minimum:"1" default:"1"`
	}
	type colaOut struct {
		Body struct {
			Items   []ColaItem             `json:"items"`
			Total   int                    `json:"total"`
			Pagina  int                    `json:"pagina"`
			Por     int                    `json:"por"`
			Cuentas map[string]ColaCuentas `json:"cuentas" doc:"Por canal (email, whatsapp)"`
			Ahora   time.Time              `json:"ahora" doc:"Hora del servidor (la cuenta atrás no depende del reloj del navegador)"`
			Pausa   *ColaPausa             `json:"pausa,omitempty" doc:"El canal está en pausa (número desconectado o bloqueado, servidor caído)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-cola", Method: http.MethodGet, Path: base + "/cola", Summary: "Cola de envío por canal (pendientes por turno, fallidos, enviados)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *colaIn) (*colaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			f := colaFiltros[in.Filtro]
			o := &colaOut{}
			o.Body.Pagina, o.Body.Por, o.Body.Items = in.Pagina, colaPorPagina, []ColaItem{}
			o.Body.Cuentas = map[string]ColaCuentas{"email": {}, "whatsapp": {}}
			rows, err := s.a.DB.Query(ctx, `SELECT canal, count(*) FILTER (WHERE estado IN ('en_cola', 'reintentando', 'enviando')),
				count(*) FILTER (WHERE estado IN ('fallido', 'rebotado')), count(*) FILTER (WHERE estado = 'enviado'), now()
				FROM mensajes WHERE competition_id = $1 GROUP BY canal`, in.CID)
			if err != nil {
				return nil, err
			}
			for rows.Next() {
				var canal string
				var c ColaCuentas
				if err := rows.Scan(&canal, &c.Pendientes, &c.Fallidos, &c.Enviados, &o.Body.Ahora); err != nil {
					rows.Close()
					return nil, err
				}
				o.Body.Cuentas[canal] = c
			}
			rows.Close()
			if o.Body.Ahora.IsZero() {
				o.Body.Ahora = time.Now()
			}
			c := o.Body.Cuentas[in.Canal]
			o.Body.Total = map[string]int{"pendientes": c.Pendientes, "fallidos": c.Fallidos, "enviados": c.Enviados}[in.Filtro]
			rows, err = s.a.DB.Query(ctx, `SELECT id, canal, destino::text, plantilla, asunto, vars, contenido, estado, intentos, detalle, prueba, proximo_at, enviado_at, created_at, updated_at
				FROM mensajes WHERE competition_id = $1 AND canal = $2 AND estado = ANY($3)`+fmt.Sprintf(` ORDER BY %s LIMIT %d OFFSET %d`, f.orden, colaPorPagina, (in.Pagina-1)*colaPorPagina),
				in.CID, in.Canal, f.estados)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			v := &visor{}
			for rows.Next() {
				var it ColaItem
				var clave, asunto string
				var vars map[string]string
				var enviado *Contenido
				var proximo time.Time
				if err := rows.Scan(&it.ID, &it.Canal, &it.Destino, &clave, &asunto, &vars, &enviado, &it.Estado, &it.Intentos, &it.Detalle, &it.Prueba, &proximo, &it.EnviadoAt, &it.CreatedAt, &it.UpdatedAt); err != nil {
					return nil, err
				}
				if in.Filtro == "pendientes" {
					it.ProximoAt = &proximo
				}
				if strings.HasSuffix(it.Destino, "@g.us") {
					it.Destino = "Grupo de organizadores"
				}
				it.Atleta = vars["nombre"]
				if it.Atleta == "" {
					it.Atleta = vars["atleta"]
				}
				titulo, _, texto := s.contenidoVisible(ctx, in.CID, it.Canal, clave, vars, enviado, v)
				it.Titulo, it.Resumen = titulo, resumir(texto, 280)
				if asunto != "" && it.Canal == "email" {
					it.Titulo = asunto
				}
				o.Body.Items = append(o.Body.Items, it)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			rows.Close()
			// The pause shows in every filter; the estimated times only for the pending ones.
			if in.Filtro == "pendientes" {
				o.Body.Pausa = s.estimarSalidas(ctx, in.CID, in.Canal, (in.Pagina-1)*colaPorPagina, o.Body.Items)
			} else {
				o.Body.Pausa = s.estimarSalidas(ctx, in.CID, in.Canal, 0, nil)
			}
			return o, nil
		})

	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "emails-cola-intentos", Method: http.MethodGet, Path: base + "/cola/{id}/intentos", Summary: "Registro de intentos de un mensaje (motivo de cada fallo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*struct{ Body []Intento }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			if _, err := s.mensaje(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT at, intento, estado, detalle, tecnico FROM mensaje_intentos WHERE mensaje_id = $1 ORDER BY at DESC, id DESC LIMIT 100`, in.ID)
			if err != nil {
				return nil, err
			}
			out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Intento, error) {
				var i Intento
				err := r.Scan(&i.At, &i.Intento, &i.Estado, &i.Detalle, &i.Tecnico)
				return i, err
			})
			if err != nil {
				return nil, err
			}
			return &struct{ Body []Intento }{out}, nil
		})
}
