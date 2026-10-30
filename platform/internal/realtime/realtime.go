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
	id string
	ev events.Event
}

// hub fans the stream out to the connected clients of this pod.
type hub struct {
	mu   sync.RWMutex
	subs map[chan msg]struct{}
}

func (h *hub) add() chan msg {
	ch := make(chan msg, 256)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *hub) remove(ch chan msg) {
	h.mu.Lock()
	if _, ok := h.subs[ch]; ok {
		delete(h.subs, ch)
		close(ch)
	}
	h.mu.Unlock()
}

func (h *hub) publish(m msg) {
	h.mu.RLock()
	var slow []chan msg
	for ch := range h.subs {
		select {
		case ch <- m:
		default:
			slow = append(slow, ch) // the client will reconnect with Last-Event-ID
		}
	}
	h.mu.RUnlock()
	for _, ch := range slow {
		h.remove(ch)
	}
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
	s := &Svc{hub: &hub{subs: map[chan msg]struct{}{}}, slugs: map[string]slugEntry{}, pub: map[string]int{}}
	return app.Service{Name: "realtime", Title: "GR Cup · realtime (SSE)", NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	s.max = int64(config.Int("SSE_MAX_CONEXIONES", 10000))
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "realtime", "competition", a.Cfg.InternalToken)
	s.pod, _ = os.Hostname()
	a.Go(s.reader)
	a.Go(s.contar)
	a.Mux.HandleFunc("GET /api/competiciones/{slug}/stream", s.public)
	a.Mux.HandleFunc("GET /api/admin/competiciones/{cid}/stream", s.admin)
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
			_ = s.a.Redis.Set(ctx, s.a.Keys.Of("rt", "conexiones", cid, s.pod), n, time.Minute).Err()
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
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
					s.hub.publish(msg{id: m.ID, ev: e})
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
	// Public connections are recycled every 30 min so they spread over the pods after scaling.
	s.stream(w, r, time.Now().Add(30*time.Minute), "reconectar", func(e events.Event) (any, bool) {
		if e.CompetitionID != cid || e.Audience != events.Public {
			return nil, false
		}
		return publicView(e), true
	})
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
	s.stream(w, r, deadline, "reautenticar", func(e events.Event) (any, bool) {
		if e.CompetitionID != cid {
			return nil, false
		}
		switch e.Audience {
		case events.Public:
			return adminView(e), true
		case events.Admin:
			if e.Permission == "" || p.Can(cid, e.Permission) {
				return adminView(e), true
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
func (s *Svc) stream(w http.ResponseWriter, r *http.Request, deadline time.Time, endEvent string, filter func(events.Event) (any, bool)) {
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
	ch := s.hub.add()
	defer s.hub.remove(ch)
	lastSent := ""
	send := func(id string, e events.Event) bool {
		if lastSent != "" && !after(id, lastSent) {
			return true
		}
		v, ok := filter(e)
		if !ok {
			return true
		}
		data, _ := json.Marshal(v)
		if _, err := fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", id, e.Type, data); err != nil {
			return false
		}
		lastSent = id
		return rc.Flush() == nil
	}
	control := func(event, motivo string) bool {
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
				if e, ok := decode(m); ok && !send(m.ID, e) {
					return
				}
				lastSent = m.ID
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
		case m, ok := <-ch:
			if !ok {
				return // too slow: the client reconnects and resumes
			}
			if !send(m.id, m.ev) {
				return
			}
		case <-ping.C:
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
