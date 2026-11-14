// Package realtime serves Server-Sent Events from the platform event stream (Redis Streams):
//   - GET /api/competiciones/{slug}/stream        public events of a competition (no personal data)
//   - GET /api/admin/competiciones/{cid}/stream   public + admin events the caller may see (by permission)
//
// The stream id is the SSE id, so clients resume with Last-Event-ID (replayed with XRANGE, Redis 6.0 compatible).
package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

type msg struct {
	id  string
	ev  events.Event
	key string // coalescing key ("" = never coalesced), computed once in offer
	// the public/admin SSE frame is built once per event, not once per subscriber (ST2-R2-1, ST2-R5-1)
	pubOnce, admOnce sync.Once
	pub, adm         []byte
	// jornada/room of a fantasy.* event, parsed once (ST3-R1-4: public streams may follow one jornada/room)
	ambOnce   sync.Once
	jor, sala string
}

func (m *msg) ambito() (string, string) {
	m.ambOnce.Do(func() {
		if !strings.HasPrefix(m.ev.Type, "fantasy.") {
			return
		}
		var d struct {
			JornadaID string `json:"jornadaId"`
			SalaID    string `json:"salaId"`
		}
		if json.Unmarshal(m.ev.Data, &d) == nil {
			m.jor, m.sala = d.JornadaID, d.SalaID
		}
	})
	return m.jor, m.sala
}

// frame is the whole SSE frame of the event with the given data.
func (m *msg) frame(data []byte) []byte {
	b := make([]byte, 0, len(m.id)+len(m.ev.Type)+len(data)+24)
	b = append(b, "id: "...)
	b = append(b, m.id...)
	b = append(b, "\nevent: "...)
	b = append(b, m.ev.Type...)
	b = append(b, "\ndata: "...)
	b = append(b, data...)
	return append(b, "\n\n"...)
}

func (m *msg) publicFrame() []byte {
	m.pubOnce.Do(func() {
		data, _ := json.Marshal(publicView(m.ev))
		m.pub = m.frame(data)
	})
	return m.pub
}

func (m *msg) adminFrame() []byte {
	if m.ev.Actor == nil {
		return m.publicFrame() // same view
	}
	m.admOnce.Do(func() {
		data, _ := json.Marshal(adminView(m.ev))
		m.adm = m.frame(data)
	})
	return m.adm
}

// coalesceEvery is how often the live odds of an open market are fanned out at most (ST2-R2-1: one porra.mercado
// per bet × N spectators saturated the pods; the client only needs the latest pot/odds of each market).
// ST2-R4-1/R4-2: 100 ms meant ~80 events/s per client with many open markets (12 000/s at 150 SSE) and the
// gateways ran out of memory; 250 ms cuts the fan-out 2.5× and still keeps delivery well under 1 s.
// ST2-R8-2: at 500 spectators the per-client volume (~15 events/s) still outran slow readers and their backlog
// grew to seconds; 400 ms cuts the odds fan-out another 1.6× and adds at most 150 ms to a single delivery.
const coalesceEvery = 400 * time.Millisecond

// entregaEvery is how often every other event (signings, rooms, bets…) is fanned out (ST3-R3-4: waiting for the
// odds tick put up to 400 ms on every delivery and its tail grew past 1.6 s at peak). Odds keep coalesceEvery;
// they are sent without an id line when they go out after a newer event (see write), so order is never broken.
const entregaEvery = 100 * time.Millisecond

// hub fans the stream out to the connected clients of this pod in batches, one every coalesceEvery. Live odds
// (porra.mercado of an open market) are coalesced per market (latest wins); every other event is queued as is.
// Each batch is sorted by stream id, so clients always get ids in increasing order (Last-Event-ID resume replays
// the skipped ones). ST2-R6-2: flushing on every non-odds event (≈1 per bet) defeated the coalescing and woke
// every subscriber ~100×/s at 100 bets/s; one batch per tick = one wake, one write and one flush per client.
type hub struct {
	mu    sync.RWMutex
	subs  map[*sub]struct{}
	pmu   sync.Mutex // guards pend/queue
	pend  map[string]*msg
	queue []*msg
}

// maxPendiente caps what a client may have queued and unsent; past it the client is cut and resumes with
// Last-Event-ID (ST2-R7-2: a 256-batch channel let a slow client drift up to ~1 min behind).
const maxPendiente = 2048

// sub is the mailbox of one client. ST2-R7-2: batches no longer pile up per tick; a client that is behind gets
// everything pending in one write, with live odds still coalesced per market (latest wins), so its delay stays
// at one tick plus one write instead of growing with the backlog.
type sub struct {
	mu    sync.Mutex
	queue []*msg         // increasing ids; nil = replaced by a newer odds event of the same market
	idx   map[string]int // coalescing key → position in queue
	n     int            // non-nil entries
	dead  bool
	wake  chan struct{} // cap 1
}

func (c *sub) push(ms []*msg) {
	c.mu.Lock()
	if c.dead {
		c.mu.Unlock()
		return
	}
	for _, m := range ms {
		if m.key != "" {
			if i, ok := c.idx[m.key]; ok {
				c.queue[i] = nil
				c.n--
			}
			c.idx[m.key] = len(c.queue)
		}
		c.queue = append(c.queue, m)
		c.n++
	}
	if c.n > maxPendiente {
		c.dead = true
	} else if len(c.queue) > 2*maxPendiente {
		c.compact() // a client blocked in Write keeps getting replaced odds: drop the holes so memory stays bounded
	}
	c.mu.Unlock()
	select {
	case c.wake <- struct{}{}:
	default:
	}
}

// compact removes the replaced entries and rebuilds the index (caller holds mu).
func (c *sub) compact() {
	q := c.queue[:0]
	for _, m := range c.queue {
		if m != nil {
			if m.key != "" {
				c.idx[m.key] = len(q)
			}
			q = append(q, m)
		}
	}
	clear(c.queue[len(q):])
	c.queue = q
}

// take returns what is pending (in id order) and whether the client was cut.
func (c *sub) take() ([]*msg, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	q := c.queue
	c.queue, c.n = nil, 0
	clear(c.idx)
	return q, c.dead
}

func (h *hub) add() *sub {
	c := &sub{idx: map[string]int{}, wake: make(chan struct{}, 1)}
	h.mu.Lock()
	h.subs[c] = struct{}{}
	h.mu.Unlock()
	return c
}

func (h *hub) remove(c *sub) {
	h.mu.Lock()
	delete(h.subs, c)
	h.mu.Unlock()
}

// coalesceKey is the market of a live-odds event ("" = not coalescible).
func coalesceKey(e events.Event) string {
	if e.Type != "porra.mercado" {
		return ""
	}
	var d struct {
		MercadoID string `json:"mercadoId"`
		Estado    string `json:"estado"`
	}
	if json.Unmarshal(e.Data, &d) != nil || d.Estado != "abierto" || d.MercadoID == "" {
		return ""
	}
	return e.CompetitionID + "/" + d.MercadoID
}

func (h *hub) offer(m *msg) {
	h.pmu.Lock()
	defer h.pmu.Unlock()
	if m.key = coalesceKey(m.ev); m.key != "" {
		h.pend[m.key] = m
		return
	}
	h.queue = append(h.queue, m)
}

// flush publishes the pending batch (the coalesced odds only when odds is set); only the flusher goroutine calls
// it, so batches go out in order.
func (h *hub) flush(odds bool) {
	h.pmu.Lock()
	if len(h.queue) == 0 && (!odds || len(h.pend) == 0) {
		h.pmu.Unlock()
		return
	}
	ms := h.queue
	h.queue = nil
	if odds {
		for k, m := range h.pend {
			ms = append(ms, m)
			delete(h.pend, k)
		}
	}
	h.pmu.Unlock()
	sort.Slice(ms, func(i, j int) bool { return after(ms[j].id, ms[i].id) })
	h.publish(ms)
}

func (h *hub) publish(ms []*msg) {
	h.mu.RLock()
	for c := range h.subs {
		c.push(ms)
	}
	h.mu.RUnlock()
}

type Svc struct {
	a      *app.App
	hub    *hub
	comp   *svcclient.Client
	conns  atomic.Int64
	max    int64
	slugMu sync.Mutex
	slugs  map[string]slugEntry
	// public connections per competition on this pod (the «espectadores» of the live desk)
	pubMu sync.Mutex
	pub   map[string]int
	pod   string
}

type slugEntry struct {
	id  string
	exp time.Time
}

// Service returns the realtime service definition.
func Service() app.Service {
	s := &Svc{hub: &hub{subs: map[*sub]struct{}{}, pend: map[string]*msg{}}, slugs: map[string]slugEntry{}, pub: map[string]int{}}
	return app.Service{Name: "realtime", Title: "GR Cup · realtime (SSE)", NeedsRedis: true, MaxConns: -1, Setup: s.setup}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	s.max = int64(config.Int("SSE_MAX_CONEXIONES", 10000))
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "realtime", "competition", a.Cfg.InternalToken)
	s.pod, _ = os.Hostname()
	a.Go(s.reader)
	a.Go(s.flusher)
	a.Go(s.contar)
	a.Mux.HandleFunc("GET /api/competiciones/{slug}/stream", s.public)
	a.Mux.HandleFunc("GET /api/admin/competiciones/{cid}/stream", s.admin)
	a.Mux.HandleFunc("POST /api/admin/competiciones/{cid}/presencia", s.presencia)
	return nil
}

// contar reports the public connections of this pod every 20 s (one key per competition and pod, 60 s expiry: a
// pod that dies stops counting). live sums them for the desk and /en-directo.
func (s *Svc) contar(ctx context.Context) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		s.pubMu.Lock()
		snap := make(map[string]int, len(s.pub))
		for k, v := range s.pub {
			snap[k] = v
			if v <= 0 {
				delete(s.pub, k)
			}
		}
		s.pubMu.Unlock()
		for cid, n := range snap {
			// one counter per pod plus the set of pods of the competition: readers do SMEMBERS + MGET, never SCAN
			// (the Redis is shared with other apps).
			pods := s.a.Keys.Of("rt", "pods", cid)
			p := s.a.Redis.TxPipeline()
			p.Set(ctx, s.a.Keys.Of("rt", "conexiones", cid, s.pod), n, time.Minute)
			p.SAdd(ctx, pods, s.pod)
			p.Expire(ctx, pods, 10*time.Minute)
			_, _ = p.Exec(ctx)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// flusher fans out the queued events every entregaEvery and the coalesced live odds every coalesceEvery.
func (s *Svc) flusher(ctx context.Context) {
	t := time.NewTicker(entregaEvery)
	defer t.Stop()
	n := 0
	cada := int(coalesceEvery / entregaEvery)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n++
			s.hub.flush(n%cada == 0)
		}
	}
}

// reader tails the stream (XREAD from the newest entry) and publishes to the hub.
func (s *Svc) reader(ctx context.Context) {
	last := "$"
	for ctx.Err() == nil {
		res, err := s.a.Redis.XRead(ctx, &redis.XReadArgs{Streams: []string{s.a.Stream(), last}, Count: 200, Block: 5 * time.Second}).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) || ctx.Err() != nil {
				continue
			}
			s.a.Log.Warn("xread", "err", err)
			time.Sleep(time.Second)
			continue
		}
		for _, st := range res {
			for _, m := range st.Messages {
				last = m.ID
				if e, ok := decode(m); ok {
					s.hub.offer(&msg{id: m.ID, ev: e})
				}
			}
		}
	}
}

func decode(m redis.XMessage) (events.Event, bool) {
	raw, _ := m.Values["e"].(string)
	var e events.Event
	return e, json.Unmarshal([]byte(raw), &e) == nil
}

func (s *Svc) cidForSlug(ctx context.Context, slug string) (string, error) {
	s.slugMu.Lock()
	if e, ok := s.slugs[slug]; ok && time.Now().Before(e.exp) {
		s.slugMu.Unlock()
		return e.id, nil
	}
	s.slugMu.Unlock()
	var c struct {
		ID     string `json:"id"`
		Estado string `json:"estado"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/slug/"+slug, nil, &c); err != nil {
		return "", err
	}
	if c.Estado == "borrador" || c.Estado == "archivada" {
		return "", problem.NotFound("Competición no encontrada.")
	}
	s.slugMu.Lock()
	s.slugs[slug] = slugEntry{id: c.ID, exp: time.Now().Add(5 * time.Minute)}
	s.slugMu.Unlock()
	return c.ID, nil
}

func (s *Svc) public(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	cid, err := s.cidForSlug(r.Context(), slug)
	if err != nil {
		writeErr(w, err)
		return
	}
	s.pubMu.Lock()
	s.pub[cid]++
	s.pubMu.Unlock()
	defer func() {
		s.pubMu.Lock()
		s.pub[cid]-- // kept at 0 until the next report writes it
		s.pubMu.Unlock()
	}()
	// ST3-R1-4: ?jornada= drops the fantasy.* events of other jornadas and ?sala= the signings of other rooms
	// (a «solo enlace» signing carries no room and still goes out), so a spectator's volume no longer grows with
	// every signing of the competition.
	jornada, sala := uuidParam(r, "jornada"), uuidParam(r, "sala")
	// Public connections are recycled every 30 min so they spread over the pods after scaling.
	s.stream(w, r, time.Now().Add(30*time.Minute), "reconectar", func(m *msg) ([]byte, bool) {
		if m.ev.CompetitionID != cid || m.ev.Audience != events.Public {
			return nil, false
		}
		if jornada != "" {
			if j, sl := m.ambito(); j != "" && (j != jornada || (sala != "" && sl != "" && sl != sala && m.ev.Type == "fantasy.fichaje")) {
				return nil, false
			}
		}
		return m.publicFrame(), true
	})
}

// uuidParam is the query parameter when it is a valid uuid ("" otherwise).
func uuidParam(r *http.Request, k string) string {
	u, err := uuid.Parse(r.URL.Query().Get(k))
	if err != nil {
		return ""
	}
	return u.String()
}

func (s *Svc) admin(w http.ResponseWriter, r *http.Request) {
	cid := r.PathValue("cid")
	if _, err := uuid.Parse(cid); err != nil {
		writeErr(w, problem.NotFound("Competición no encontrada."))
		return
	}
	p, err := auth.RequireMember(r.Context(), cid)
	if err != nil {
		writeErr(w, err)
		return
	}
	// The permissions were checked with this token: the stream ends when it expires (the client refreshes
	// the token and resumes with Last-Event-ID), so revoked sessions or removed members stop receiving events.
	deadline := p.ExpiresAt
	if deadline.IsZero() || deadline.After(time.Now().Add(time.Hour)) {
		deadline = time.Now().Add(time.Hour)
	}
	s.stream(w, r, deadline, "reautenticar", func(m *msg) ([]byte, bool) {
		e := m.ev
		if e.CompetitionID != cid {
			return nil, false
		}
		switch e.Audience {
		case events.Public:
			return m.adminFrame(), true
		case events.Admin:
			if e.Permission == "" || p.Can(cid, e.Permission) {
				return m.adminFrame(), true
			}
		}
		return nil, false
	})
}

type view struct {
	ID         string          `json:"id"`
	Tipo       string          `json:"tipo"`
	Entidad    string          `json:"entidad,omitempty"`
	Datos      json.RawMessage `json:"datos,omitempty"`
	Actor      string          `json:"actor,omitempty"`
	Origen     string          `json:"origen,omitempty"`
	OccurredAt time.Time       `json:"fecha"`
}

func publicView(e events.Event) view {
	return view{ID: e.ID.String(), Tipo: e.Type, Entidad: e.Subject, Datos: e.Data, OccurredAt: e.OccurredAt}
}

func adminView(e events.Event) view {
	v := publicView(e)
	if e.Actor != nil {
		v.Actor, v.Origen = e.Actor.Name, e.Actor.Origin
	}
	return v
}

const maxReplay = 1000

// stream writes SSE: replay since Last-Event-ID (max 1000, else `resync`), then live events, with a heartbeat
// every 15 s, until the deadline (then it sends `endEvent` and closes so the client reconnects).
func (s *Svc) stream(w http.ResponseWriter, r *http.Request, deadline time.Time, endEvent string, filter func(*msg) ([]byte, bool)) {
	if s.conns.Load() >= s.max {
		writeErr(w, problem.New(http.StatusServiceUnavailable, "SERVICIO_SATURADO", "Demasiadas conexiones en tiempo real. Reintenta en unos segundos."))
		return
	}
	s.conns.Add(1)
	defer s.conns.Add(-1)
	rc := http.NewResponseController(w)
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprint(w, "retry: 3000\n\n")
	_ = rc.Flush()

	// Subscribe before replaying so nothing published meanwhile is lost; duplicates are skipped by id.
	c := s.hub.add()
	defer s.hub.remove(c)
	lastSent := ""
	// write appends one event to buf; the caller writes and flushes buf once per wake (one syscall, ST2-R7-2)
	var buf []byte
	write := func(m *msg) bool {
		late := lastSent != "" && !after(m.id, lastSent)
		if late && m.key == "" {
			return true
		}
		frame, ok := filter(m)
		if !ok {
			return true
		}
		if late {
			// coalesced odds held for their tick while newer events went out: latest-wins state, sent without its
			// id so Last-Event-ID never moves back (a resume replays from the newest id, odds included)
			buf = append(buf, frame[len("id: ")+len(m.id)+1:]...)
			return true
		}
		buf = append(buf, frame...)
		lastSent = m.id
		return true
	}
	send := func() bool {
		if len(buf) == 0 {
			return true
		}
		// a client that stops reading is cut after 10 s instead of pinning this goroutine and its mailbox
		_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Second))
		_, err := w.Write(buf)
		buf = buf[:0]
		return err == nil && rc.Flush() == nil
	}
	control := func(event, motivo string) bool {
		_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Second))
		_, err := fmt.Fprintf(w, "event: %s\ndata: {\"motivo\":%q}\n\n", event, motivo)
		return err == nil && rc.Flush() == nil
	}
	if from := lastEventID(r); from != "" {
		// The stream is trimmed (MAXLEN ~): if the client's position is gone, it must reload its data.
		if first, err := s.a.Redis.XRangeN(r.Context(), s.a.Stream(), "-", "+", 1).Result(); err == nil && len(first) == 1 && after(first[0].ID, from) {
			if !control("resync", "historial_recortado") {
				return
			}
		} else if msgs, err := s.a.Redis.XRangeN(r.Context(), s.a.Stream(), from, "+", maxReplay+1).Result(); err == nil {
			lastSent = from
			truncated := len(msgs) > maxReplay
			if truncated {
				msgs = msgs[:maxReplay]
			}
			for _, m := range msgs {
				if m.ID == from {
					continue
				}
				if e, ok := decode(m); ok && !write(&msg{id: m.ID, ev: e}) {
					return
				}
				lastSent = m.ID
			}
			if !send() || rc.Flush() != nil {
				return
			}
			if truncated && !control("resync", "demasiados_eventos") {
				return
			}
		}
	}
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	end := time.NewTimer(time.Until(deadline))
	defer end.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-end.C:
			control(endEvent, "fin_de_conexion")
			return
		case <-c.wake:
			ms, dead := c.take()
			if dead {
				return // too far behind: the client reconnects and resumes with Last-Event-ID
			}
			for _, m := range ms {
				if m != nil {
					write(m)
				}
			}
			if !send() {
				return
			}
		case <-ping.C:
			_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil || rc.Flush() != nil {
				return
			}
		}
	}
}

func lastEventID(r *http.Request) string {
	id := r.Header.Get("Last-Event-ID")
	if id == "" {
		id = r.URL.Query().Get("desde")
	}
	if _, _, ok := parseID(id); !ok {
		return ""
	}
	return id
}

func parseID(id string) (uint64, uint64, bool) {
	ms, seq, ok := strings.Cut(id, "-")
	a, e1 := strconv.ParseUint(ms, 10, 64)
	b, e2 := strconv.ParseUint(seq, 10, 64)
	return a, b, ok && e1 == nil && e2 == nil
}

// after reports whether stream id a is newer than b.
func after(a, b string) bool {
	am, as, _ := parseID(a)
	bm, bs, _ := parseID(b)
	return am > bm || (am == bm && as > bs)
}

func writeErr(w http.ResponseWriter, err error) {
	var p *problem.Error
	if errors.As(err, &p) {
		problem.Write(w, p)
		return
	}
	problem.Write(w, problem.New(http.StatusBadGateway, "SERVICIO_NO_DISPONIBLE", "No se pudo abrir el canal en tiempo real."))
}
