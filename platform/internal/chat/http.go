package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// maxReplay caps the history replayed on connect (WS ?desde= and SSE Last-Event-ID): the room holds at most
// ~5000 entries and a reconnecting client does not need more than a screenful to catch up.
const maxReplay = 500

// registrarPublico registers the public endpoints of the chat. WS and SSE are plain net/http (huma does not do
// WebSocket, and SSE wants a raw ResponseWriter); the REST endpoints go through huma for OpenAPI.
func (s *Svc) registrarPublico() {
	s.a.Mux.HandleFunc("GET /api/competiciones/{slug}/chat/ws", s.ws)
	s.a.Mux.HandleFunc("GET /api/competiciones/{slug}/chat/stream", s.sse)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-enviar", Method: http.MethodPost, Path: "/api/competiciones/{slug}/chat/mensajes",
		Summary: "Enviar un mensaje al chat (sesión de fan)", Tags: tagChat},
		s.postMensaje)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-historial", Method: http.MethodGet, Path: "/api/competiciones/{slug}/chat/mensajes",
		Summary: "Historial de la sala (por defecto la de hoy; ?dia= para otra jornada, solo lectura)", Tags: tagChat},
		s.getHistorial)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-reportar", Method: http.MethodPost, Path: "/api/competiciones/{slug}/chat/mensajes/{id}/reportar",
		Summary: "Reportar un mensaje para la moderación", Tags: tagChat},
		s.reportar)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-estado", Method: http.MethodGet, Path: "/api/competiciones/{slug}/chat/estado",
		Summary: "Estado del chat: conexiones y configuración pública", Tags: tagChat},
		s.estado)
}

var tagChat = []string{"Chat"}

// entrada de fan (§3): cookie `grcup_fan` o cabecera X-GrCup-Fan (la prueba de carga y los clientes no navegador).
// En los inputs de huma van como campos propios (camposFan), no embebidos: huma no recorre los anónimos al
// construir los parámetros.
type sesionFan struct {
	Session string `cookie:"grcup_fan" maxLength:"4096"`
	Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
}

// tokenFanDe assembles the session token of a huma input.
func tokenFanDe(in sesionFan) string {
	if in.Session != "" {
		return in.Session
	}
	return in.Header
}

// fanDe verifies a fan session token against the competition.
func (s *Svc) fanDe(ctx context.Context, tok string, cid uuid.UUID) (fanauth.Fan, error) {
	f, err := s.fans.Verify(ctx, tok)
	if err != nil {
		return fanauth.Fan{}, fanauth.Problem(err)
	}
	if f.CompetitionID != cid {
		return fanauth.Fan{}, fanauth.Problem(fanauth.ErrInvalid)
	}
	return f, nil
}

// fanDeRequest verifies the fan session of a plain net/http request (WS).
func (s *Svc) fanDeRequest(r *http.Request, cid uuid.UUID) (fanauth.Fan, error) {
	tok := ""
	if c, err := r.Cookie(fanauth.Cookie); err == nil {
		tok = c.Value
	}
	if tok == "" {
		tok = r.Header.Get("X-GrCup-Fan")
	}
	f, err := s.fans.Verify(r.Context(), tok)
	if err != nil {
		return fanauth.Fan{}, fanauth.Problem(err)
	}
	if f.CompetitionID != cid {
		return fanauth.Fan{}, fanauth.Problem(fanauth.ErrInvalid)
	}
	return f, nil
}

// fanKeyDeRequest returns the public pseudonym of the fan of a request (empty when there is no session): the
// client compares it with the fanKey of the frames to know which messages are its own, without ever seeing the
// UUID of the fans. Anonymous requests skip the verification (no session, nothing to compute).
func (s *Svc) fanKeyDeRequest(r *http.Request, cid uuid.UUID) string {
	tok := r.Header.Get("X-GrCup-Fan")
	if tok == "" {
		if c, err := r.Cookie(fanauth.Cookie); err == nil {
			tok = c.Value
		}
	}
	if tok == "" {
		return ""
	}
	f, err := s.fanDeRequest(r, cid)
	if err != nil {
		return ""
	}
	return s.hub.hashFan(f.ID.String())
}

// salaDe resolves the slug, the day (today unless a valid ?dia= is given) and checks the connection budget.
// The WS and SSE handlers share it.
func (s *Svc) salaDe(w http.ResponseWriter, r *http.Request) (uuid.UUID, string, bool) {
	cid, err := s.comps.ID(r.Context(), r.PathValue("slug"))
	if err != nil {
		writeErr(w, err)
		return uuid.Nil, "", false
	}
	if conexActivas.Load() >= s.max {
		writeErr(w, problem.New(http.StatusServiceUnavailable, "SERVICIO_SATURADO", "El chat está saturado ahora mismo. Reintenta en unos segundos."))
		return uuid.Nil, "", false
	}
	dia := hoy()
	if d := r.URL.Query().Get("dia"); d != "" {
		if !diaValido(d) {
			writeErr(w, problem.BadRequest("DIA_INVALIDO", "El parámetro dia tiene que ser una fecha YYYY-MM-DD."))
			return uuid.Nil, "", false
		}
		dia = d
	}
	return cid, dia, true
}

// ---- WebSocket ----

// ws serves GET …/chat/ws: JSON frames in (msg, ping) and room items out. Reading is anonymous; sending needs a
// fan session (checked per message: a ban or a silencio applies without reconnecting).
func (s *Svc) ws(w http.ResponseWriter, r *http.Request) {
	cid, dia, ok := s.salaDe(w, r)
	if !ok {
		return
	}
	// The handler owns its context: the request context of a hijacked connection is only cancelled when the
	// handler returns, so the writer goroutine would wait for it forever (and the handler waited for the writer:
	// a deadlock that leaked the goroutine, the subscription and the connection slot).
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	// The gateway rewrites the Host, so the browser's Origin is checked against the whitelist (CHAT_ORIGENES).
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.origenes})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(4 << 10) // a chat message fits easily; bigger frames are abuse
	// one writer at a time (coder/websocket): the room fanout, the greeting, the pongs and the error frames
	// share this mutex
	var wmu sync.Mutex
	escribir := func(b []byte) bool {
		wmu.Lock()
		defer wmu.Unlock()
		return conn.Write(ctx, websocket.MessageText, b) == nil
	}
	sl := s.hub.abrir(s.ctxRaiz, salaID{cid.String(), dia})
	ch := sl.sub()
	conexActivas.Add(1)
	defer func() {
		conexActivas.Add(-1)
		sl.unsub(ch)
	}()

	// writer: room items from the hub; a closed channel means the client was too slow → 1008.
	done := make(chan struct{})
	// the client may reconnect with ?desde=<id>: the missed entries are replayed before the live ones and the
	// writer skips the ones already sent (same contract as the SSE with Last-Event-ID).
	visto := ""
	if from := lastID(r); from != "" {
		nombre := s.streamDe(cid.String(), dia)
		msgs, err := s.a.Redis.XRangeN(ctx, nombre, from, "+", maxReplay+1).Result()
		if err == nil {
			truncado := len(msgs) > maxReplay
			if truncado {
				msgs = msgs[:maxReplay]
			}
			for _, m := range msgs {
				if m.ID == from {
					continue
				}
				var it item
				raw, _ := m.Values["d"].(string)
				if json.Unmarshal([]byte(raw), &it) == nil && it.T != "" {
					it.ID = m.ID
					// el replay es público (la conexión es anónima): el UUID del fan se sustituye por su
					// seudónimo, igual que en el SSE y en el fanout de la sala
					b, _ := json.Marshal(it.publica(s.hub.hashFan))
					if !escribir(b) {
						return
					}
					visto = m.ID
				}
			}
			if truncado {
				b, _ := json.Marshal(item{T: "sistema", Motivo: "resync", Texto: "demasiados_eventos"})
				_ = escribir(b)
			}
		}
	}
	go func() {
		defer close(done)
		for {
			select {
			case fr, ok := <-ch:
				if !ok {
					_ = conn.Close(websocket.StatusPolicyViolation, "lento")
					return
				}
				// the room already encoded the frame (once for the whole room): no per-client JSON
				b := fr.json
				if b == nil {
					b, _ = json.Marshal(fr.it)
				}
				if fr.it.ID != "" {
					if visto != "" && !after(fr.it.ID, visto) {
						continue // already sent in the replay
					}
					visto = fr.it.ID
				}
				if !escribir(b) {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	saludo, _ := json.Marshal(item{T: "estado", Dia: dia, Motivo: "conectado"})
	_ = escribir(saludo)
	// cerrar ends the connection: the writer goroutine leaves its select (its context is cancelled), the socket
	// is closed and the writer gets a moment to finish (it may be in the middle of a write).
	cerrar := func(estado websocket.StatusCode, motivo string) {
		cancel()
		_ = conn.Close(estado, motivo)
		select {
		case <-done:
		case <-time.After(2 * time.Second):
		}
	}
	// read loop: one read every CHAT_WS_IDLE_SEG at most (clients ping); each read resets the deadline.
	for {
		rctx, cancelLectura := context.WithTimeout(ctx, time.Duration(config.Int("CHAT_WS_IDLE_SEG", defWsIdleSegundos))*time.Second)
		_, data, err := conn.Read(rctx)
		cancelLectura()
		if err != nil {
			cerrar(websocket.StatusNormalClosure, "")
			return
		}
		var fr struct {
			T     string `json:"t"`
			Texto string `json:"texto"`
			Cid   string `json:"cid"`
		}
		if json.Unmarshal(data, &fr) != nil {
			continue
		}
		switch fr.T {
		case "ping":
			pong, _ := json.Marshal(item{T: "pong", Ts: time.Now().UnixMilli()})
			if !escribir(pong) {
				cerrar(websocket.StatusNormalClosure, "")
				return
			}
		case "msg":
			f, err := s.fanDeRequest(r, cid)
			if err != nil {
				writeWSProblem(ctx, &wmu, conn, err)
				continue
			}
			if _, err := s.enviar(ctx, cid, dia, f, fr.Texto, fr.Cid); err != nil && !errors.Is(err, errDuplicado) {
				writeWSProblem(ctx, &wmu, conn, err)
			}
			// the message itself (and any hito) reaches everyone —including the author— through the room reader
		}
	}
}

// writeWSProblem answers an error as a `sistema` frame (the WS channel stays open: the client may fix and retry).
func writeWSProblem(ctx context.Context, wmu *sync.Mutex, conn *websocket.Conn, err error) {
	var p *problem.Error
	if !errors.As(err, &p) {
		p = problem.Internal()
	}
	b, _ := json.Marshal(item{T: "sistema", Motivo: p.Code, Texto: p.Detail})
	wmu.Lock()
	defer wmu.Unlock()
	_ = conn.Write(ctx, websocket.MessageText, b)
}

// ---- SSE ----

// sse serves GET …/chat/stream: same room as the WebSocket, Server-Sent Events with Last-Event-ID (XRANGE) and a
// 15 s heartbeat, for clients that cannot open WebSockets.
func (s *Svc) sse(w http.ResponseWriter, r *http.Request) {
	cid, dia, ok := s.salaDe(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	rc := http.NewResponseController(w)
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprint(w, "retry: 3000\n\n")
	_ = rc.Flush()

	sl := s.hub.abrir(s.ctxRaiz, salaID{cid.String(), dia})
	ch := sl.sub()
	conexActivas.Add(1)
	defer func() {
		conexActivas.Add(-1)
		sl.unsub(ch)
	}()

	escribir := func(id string, fr frame) bool {
		b := fr.json
		if b == nil {
			var err error
			b, err = json.Marshal(fr.it)
			if err != nil {
				return true
			}
		}
		if _, err := fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", id, fr.it.T, b); err != nil {
			return false
		}
		return rc.Flush() == nil
	}

	// replay before subscribing live is not needed (the channel was created first), but order matters: replay
	// first, skipping entries already received on the channel.
	nombre := s.streamDe(cid.String(), dia)
	last := ""
	if from := lastID(r); from != "" {
		if msgs, err := s.a.Redis.XRangeN(ctx, nombre, from, "+", maxReplay+1).Result(); err == nil {
			truncado := len(msgs) > maxReplay
			if truncado {
				msgs = msgs[:maxReplay]
			}
			for _, m := range msgs {
				if m.ID == from {
					continue
				}
				var it item
				raw, _ := m.Values["d"].(string)
				if json.Unmarshal([]byte(raw), &it) == nil && it.T != "" {
					it.ID = m.ID
					if !escribir(m.ID, nuevaFrame(it.publica(s.hub.hashFan))) {
						return
					}
				}
				last = m.ID
			}
			if truncado && !control(w, rc, "resync", "demasiados_eventos") {
				return
			}
		}
	}
	if last == "" { // no position given (or unusable): start with the last screenful for context
		if msgs, err := s.a.Redis.XRevRangeN(ctx, nombre, "+", "-", maxReplay).Result(); err == nil {
			for i := len(msgs) - 1; i >= 0; i-- {
				m := msgs[i]
				var it item
				raw, _ := m.Values["d"].(string)
				if json.Unmarshal([]byte(raw), &it) == nil && it.T != "" {
					it.ID = m.ID
					if !escribir(m.ID, nuevaFrame(it.publica(s.hub.hashFan))) {
						return
					}
				}
				last = m.ID
			}
		}
	}
	visto := last
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	reciclar := time.NewTimer(30 * time.Minute) // spread reconnects over the pods (like realtime)
	defer reciclar.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case fr, ok := <-ch:
			if !ok {
				return // too slow: the client reconnects with Last-Event-ID
			}
			// only stream items carry an id (estado is published locally without one): replay duplicates
			// are skipped by id, the rest always go out
			if fr.it.ID != "" {
				if visto != "" && !after(fr.it.ID, visto) {
					continue
				}
				visto = fr.it.ID
			}
			if !escribir(fr.it.ID, fr) {
				return
			}
		case <-ping.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil || rc.Flush() != nil {
				return
			}
		case <-reciclar.C:
			_, _ = fmt.Fprint(w, "event: reconectar\ndata: {\"motivo\":\"fin_de_conexion\"}\n\n")
			_ = rc.Flush()
			return
		}
	}
}

// lastID reads the SSE position: the Last-Event-ID header or the ?desde= parameter.
func lastID(r *http.Request) string {
	id := r.Header.Get("Last-Event-ID")
	if id == "" {
		id = r.URL.Query().Get("desde")
	}
	if _, _, err := parseID(id); err != nil {
		return ""
	}
	return id
}

// parseID parses a Redis stream id (ms-seq).
func parseID(id string) (uint64, uint64, error) {
	ms, seq, ok := strings.Cut(id, "-")
	if !ok {
		return 0, 0, errors.New("id sin guion")
	}
	a, e1 := strconv.ParseUint(ms, 10, 64)
	b, e2 := strconv.ParseUint(seq, 10, 64)
	if e1 != nil || e2 != nil {
		return 0, 0, errors.New("id no numérico")
	}
	return a, b, nil
}

// after reports whether stream id a is newer than b.
func after(a, b string) bool {
	am, as, e1 := parseID(a)
	bm, bs, e2 := parseID(b)
	if e1 != nil || e2 != nil {
		return false
	}
	return am > bm || (am == bm && as > bs)
}

func control(w http.ResponseWriter, rc *http.ResponseController, event, motivo string) bool {
	if _, err := fmt.Fprintf(w, "event: %s\ndata: {\"motivo\":%q}\n\n", event, motivo); err != nil {
		return false
	}
	return rc.Flush() == nil
}

// ---- REST (huma) ----

type enviarIn struct {
	Session string `cookie:"grcup_fan" maxLength:"4096"`
	Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
	Slug    string `path:"slug"`
	Body    struct {
		Texto string `json:"texto" maxLength:"300" doc:"Mensaje (280 runas como máximo)"`
		Cid   string `json:"cid,omitempty" required:"false" pattern:"^[0-9a-fA-F-]{8,64}$" doc:"Id del mensaje en el cliente, para deduplicar reintentos"`
	}
}

type enviarBody struct {
	ID        string `json:"id"`
	Duplicado bool   `json:"duplicado"`
}

// enviarOut wraps the body for huma (the response field convention of the repo).
type enviarOut struct {
	CacheControl string `header:"Cache-Control"`
	Body         enviarBody
}

// postMensaje is the REST way of sending (SSE clients), same validation and limits as the WS path.
func (s *Svc) postMensaje(ctx context.Context, in *enviarIn) (*enviarOut, error) {
	cid, err := s.comps.ID(ctx, in.Slug)
	if err != nil {
		return nil, err
	}
	f, err := s.fanDe(ctx, tokenFanDe(sesionFan{Session: in.Session, Header: in.Header}), cid)
	if err != nil {
		return nil, err
	}
	it, err := s.enviar(ctx, cid, hoy(), f, in.Body.Texto, in.Body.Cid)
	if err != nil {
		if errors.Is(err, errDuplicado) {
			return &enviarOut{Body: enviarBody{Duplicado: true}}, nil
		}
		return nil, err
	}
	return &enviarOut{Body: enviarBody{ID: it.ID}}, nil
}

type historialIn struct {
	Slug   string `path:"slug"`
	Dia    string `query:"dia"`
	Antes  string `query:"antes"`
	Limite int    `query:"limite"`
}

type historialBody struct {
	Dia      string `json:"dia"`
	Mensajes []item `json:"mensajes"`
}

type historialOut struct {
	CacheControl string `header:"Cache-Control"`
	Body         historialBody
}

// getHistorial returns the recent messages: today's room comes from Redis (complete, with the trims), other days
// come from the persisted table (solo lectura: sending only works against today's room).
func (s *Svc) getHistorial(ctx context.Context, in *historialIn) (*historialOut, error) {
	cid, err := s.comps.ID(ctx, in.Slug)
	if err != nil {
		return nil, err
	}
	dia := hoy()
	if in.Dia != "" {
		if !diaValido(in.Dia) {
			return nil, problem.BadRequest("DIA_INVALIDO", "El parámetro dia tiene que ser una fecha YYYY-MM-DD.")
		}
		dia = in.Dia
	}
	limite := in.Limite
	if limite <= 0 || limite > 100 {
		limite = 50
	}
	var msgs []item
	if dia == hoy() {
		nombre := s.streamDe(cid.String(), dia)
		var fin, omitir string
		fin = "+" // XREVRANGE empieza por el más nuevo (con «» Redis rechaza el rango y el historial se queda solo con la tabla)
		if in.Antes != "" {
			if _, _, err := parseID(in.Antes); err != nil {
				return nil, problem.BadRequest("ID_INVALIDO", "El parámetro antes tiene que ser un id del stream.")
			}
			// Redis 6.0 no tiene rangos exclusivos: leemos desde `antes` incluido y lo saltamos después
			fin = in.Antes
			omitir = in.Antes
		}
		msgsRedis, err := s.a.Redis.XRevRangeN(ctx, nombre, fin, "-", int64(limite)+boolToInt(omitir != "")).Result()
		if err == nil {
			for _, m := range msgsRedis {
				if m.ID == omitir {
					continue
				}
				var it item
				raw, _ := m.Values["d"].(string)
				if json.Unmarshal([]byte(raw), &it) != nil {
					continue
				}
				if it.T == "msg" || it.T == "donacion" {
					it.ID = m.ID
					msgs = append(msgs, it.publica(s.hub.hashFan))
				} else if it.T == "borrado" && it.MensajeID != "" {
					// the deleted message left the stream (XDEL): its placeholder keeps its place in the history
					msgs = append(msgs, item{T: "borrado", ID: it.MensajeID, Ts: tsDeID(it.MensajeID), Dia: dia})
				}
			}
		}
		// the «borrado» entries were published later than their message: order by the message id (newest first)
		sort.SliceStable(msgs, func(i, j int) bool { return after(msgs[i].ID, msgs[j].ID) })
		if len(msgs) < limite { // trimmed: the older part is in PostgreSQL
			// only what is older than the oldest entry read from Redis (the persisted rows repeat the stream ids)
			cursor := in.Antes
			if len(msgs) > 0 {
				cursor = msgs[len(msgs)-1].ID
			}
			resto, err := s.historialDB(ctx, cid, dia, cursor, limite-len(msgs))
			if err == nil {
				vistos := make(map[string]bool, len(msgs))
				for _, m := range msgs {
					vistos[m.ID] = true
				}
				for _, m := range resto {
					if !vistos[m.ID] {
						msgs = append(msgs, m)
					}
				}
			}
		}
	} else {
		var err error
		msgs, err = s.historialDB(ctx, cid, dia, in.Antes, limite)
		if err != nil {
			return nil, err
		}
	}
	if msgs == nil {
		msgs = []item{}
	}
	return &historialOut{CacheControl: "no-cache", Body: historialBody{Dia: dia, Mensajes: msgs}}, nil
}

// idNumerico is the numeric form of the stream id («<ms>-<seq>»). Compared as text, «1000-0» < «999-0» is false:
// the cursor skipped or repeated entries depending on the number of digits of the millisecond.
const idNumerico = `(CASE WHEN id LIKE '%-%' THEN split_part(id, '-', 1)::numeric END, ` +
	`CASE WHEN id LIKE '%-%' THEN split_part(id, '-', 2)::numeric END)`

// historialDB reads the persisted messages of a day (newest first).
func (s *Svc) historialDB(ctx context.Context, cid uuid.UUID, dia, antes string, limite int) ([]item, error) {
	var args []any
	// the deleted rows come back as «borrado» placeholders (without author or text)
	q := `SELECT id, fan_id, alias, tipo, texto, borrado, extract(epoch from created_at)::bigint * 1000 FROM mensajes WHERE competition_id = $1 AND dia = $2`
	args = append(args, cid, dia)
	if antes != "" {
		ms, seq, err := parseID(antes)
		if err != nil {
			return nil, problem.BadRequest("ID_INVALIDO", "El parámetro antes tiene que ser un id del stream.")
		}
		// the stream id encodes the publication time: it is a good cursor for a day's history
		q += ` AND ` + idNumerico + ` < ($3::numeric, $4::numeric)`
		args = append(args, int64(ms), int64(seq))
	}
	q += ` ORDER BY created_at DESC, ` + idNumerico + ` DESC LIMIT $` + strconv.Itoa(len(args)+1)
	args = append(args, limite)
	rows, err := s.a.DB.Query(ctx, q, args...)
	if err != nil {
		return nil, problem.Internal()
	}
	defer rows.Close()
	var out []item
	for rows.Next() {
		var it item
		var ts int64
		var borrado bool
		if err := rows.Scan(&it.ID, &it.FanID, &it.Alias, &it.T, &it.Texto, &borrado, &ts); err != nil {
			continue
		}
		it.Ts = ts
		it.Dia = dia
		if borrado {
			out = append(out, item{T: "borrado", ID: it.ID, Ts: ts, Dia: dia})
			continue
		}
		// el historial es público: el UUID del fan se sustituye por su seudónimo, igual que en la parte que
		// sale de Redis
		out = append(out, it.publica(s.hub.hashFan))
	}
	return out, nil
}

type reportarIn struct {
	Session string `cookie:"grcup_fan" maxLength:"4096"`
	Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
	Slug    string `path:"slug"`
	ID      string `path:"id"`
	Dia     string `query:"dia" doc:"Jornada del mensaje (YYYY-MM-DD). Si no se manda, se reporta el más reciente con ese id"`
	Body    struct {
		Motivo string `json:"motivo,omitempty" maxLength:"200"`
	}
}

type reportarBody struct {
	Reportes int `json:"reportes"`
}

type reportarOut struct {
	Body reportarBody
}

// reportar flags a message for the moderation queue: fan session required, one report per fan and message,
// limited per fan and per IP. A message still in the stream (persistence lag) is persisted here with its report.
func (s *Svc) reportar(ctx context.Context, in *reportarIn) (*reportarOut, error) {
	cid, err := s.comps.ID(ctx, in.Slug)
	if err != nil {
		return nil, err
	}
	f, err := s.fanDe(ctx, tokenFanDe(sesionFan{Session: in.Session, Header: in.Header}), cid)
	if err != nil {
		return nil, err
	}
	if _, _, err := parseID(in.ID); err != nil {
		return nil, problem.BadRequest("ID_INVALIDO", "El id del mensaje no es válido.")
	}
	if in.Dia != "" && !diaValido(in.Dia) {
		return nil, problem.BadRequest("DIA_INVALIDO", "El parámetro dia tiene que ser una fecha YYYY-MM-DD.")
	}
	ip := httpx.ClientIPFrom(ctx)
	if r, err := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("chat", "reportes", ip), 20, time.Hour); err == nil && !r.Allowed {
		return nil, problem.TooMany("Has reportado demasiado. Inténtalo más tarde.")
	}
	if r, err := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("chat", "reportes", "fan", f.ID.String()), 20, time.Hour); err == nil && !r.Allowed {
		return nil, problem.TooMany("Has reportado demasiado. Inténtalo más tarde.")
	}
	// the id of the stream is only unique inside a room: with the day of the message the report goes to that
	// jornada; without it, to the most recent day with that id (fallback)
	cond := `id = $1 AND competition_id = $2`
	args := []any{in.ID, cid}
	if in.Dia != "" {
		cond += ` AND dia = $3`
		args = append(args, in.Dia)
	} else {
		cond += ` AND dia = (SELECT dia FROM mensajes WHERE id = $1 AND competition_id = $2 ORDER BY dia DESC LIMIT 1)`
	}
	// one report per fan and message (SET NX): a repeated report answers the current count without adding
	dk := s.a.Keys.Of("chat", "rep", cid.String(), in.Dia, in.ID, f.ID.String())
	if nuevo, err := s.a.Redis.SetNX(ctx, dk, 1, 48*time.Hour).Result(); err == nil && !nuevo {
		var n int
		if err := s.a.DB.QueryRow(ctx, `SELECT reportes FROM mensajes WHERE `+cond, args...).Scan(&n); err != nil {
			return nil, problem.NotFound("Mensaje no encontrado.")
		}
		return &reportarOut{Body: reportarBody{Reportes: n}}, nil
	}
	var n int
	err = s.a.DB.QueryRow(ctx, `UPDATE mensajes SET reportes = reportes + 1 WHERE `+cond+` RETURNING reportes`, args...).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		n, err = s.reportarDelStream(ctx, cid, in.Dia, in.ID)
	}
	if err != nil {
		s.a.Redis.Del(ctx, dk) // not counted: the fan may report again
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, problem.NotFound("Mensaje no encontrado.")
		}
		return nil, problem.Internal()
	}
	return &reportarOut{Body: reportarBody{Reportes: n}}, nil
}

// reportarDelStream persists a message that is still only in the room stream together with its first report;
// the persister's later INSERT … DO NOTHING keeps the row. pgx.ErrNoRows when the stream does not have it.
func (s *Svc) reportarDelStream(ctx context.Context, cid uuid.UUID, dia, id string) (int, error) {
	if dia == "" {
		dia = hoy()
	}
	ms, err := s.a.Redis.XRange(ctx, s.streamDe(cid.String(), dia), id, id).Result()
	if err != nil || len(ms) == 0 {
		return 0, pgx.ErrNoRows
	}
	var it item
	raw, _ := ms[0].Values["d"].(string)
	if json.Unmarshal([]byte(raw), &it) != nil || it.T != "msg" {
		return 0, pgx.ErrNoRows
	}
	var n int
	err = s.a.DB.QueryRow(ctx, `INSERT INTO mensajes (id, competition_id, dia, fan_id, alias, tipo, texto, created_at, reportes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8/1000.0), 1)
		ON CONFLICT (competition_id, dia, id) DO UPDATE SET reportes = mensajes.reportes + 1 RETURNING reportes`,
		id, cid, dia, it.FanID, it.Alias, it.T, it.Texto, tsDeID(id)).Scan(&n)
	return n, err
}

type estadoIn struct {
	Slug    string `path:"slug"`
	Session string `cookie:"grcup_fan" maxLength:"4096"`
	Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
}

type estadoBody struct {
	Conectados   int64  `json:"conectados"`
	SalaActiva   bool   `json:"salaActiva"`
	ModoLentoSeg int    `json:"modoLentoSeg"`
	Dia          string `json:"dia"`
	FanKey       string `json:"fanKey,omitempty"` // pseudonym of the fan of the request (empty if anonymous)
}

type estadoOut struct {
	CacheControl string `header:"Cache-Control"`
	Body         estadoBody
}

// estado exposes the public view: connections (sum of pods, like the presence frames) and the public config.
func (s *Svc) estado(ctx context.Context, in *estadoIn) (*estadoOut, error) {
	cid, err := s.comps.ID(ctx, in.Slug)
	if err != nil {
		return nil, err
	}
	dia := hoy()
	cfg := s.configDe(ctx, cid)
	total := int64(0)
	pods, err := s.a.Redis.SMembers(ctx, s.a.Keys.Of("chat", "pods", cid.String())).Result()
	if err == nil {
		claves := make([]string, 0, len(pods))
		for _, p := range pods {
			claves = append(claves, s.a.Keys.Of("chat", "conex", cid.String(), p))
		}
		if len(claves) > 0 {
			if valores, err := s.a.Redis.MGet(ctx, claves...).Result(); err == nil {
				for _, v := range valores {
					if str, ok := v.(string); ok {
						var x int64
						if _, err := fmt.Sscanf(str, "%d", &x); err == nil {
							total += x
						}
					}
				}
			}
		}
	}
	fanKey := ""
	if tok := tokenFanDe(sesionFan{Session: in.Session, Header: in.Header}); tok != "" {
		if f, err := s.fanDe(ctx, tok, cid); err == nil {
			fanKey = s.hub.hashFan(f.ID.String())
		}
	}
	return &estadoOut{CacheControl: "no-cache", Body: estadoBody{Conectados: total, SalaActiva: cfg.Activo, ModoLentoSeg: cfg.ModoLentoSeg, Dia: dia, FanKey: fanKey}}, nil
}
