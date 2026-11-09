package chat

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/redisx"
)

// item is one entry of a room stream and one frame sent to WS/SSE clients. `id` (the Redis stream id) is filled
// by the room reader before fanout; clients resume with it (SSE Last-Event-ID, WS ?desde=).
type item struct {
	T              string `json:"t"` // msg | donacion | banner | borrado | sistema | hito | estado
	ID             string `json:"id,omitempty"`
	MensajeID      string `json:"mensajeId,omitempty"` // id of the deleted message (frame «borrado»)
	Texto          string `json:"texto,omitempty"`
	Alias          string `json:"alias,omitempty"`
	FanID          string `json:"fanId,omitempty"`  // real UUID: never leaves the service (see publica)
	FanKey         string `json:"fanKey,omitempty"` // public pseudonym of the fan (HMAC of its UUID)
	Atleta         bool   `json:"atleta,omitempty"`
	Ts             int64  `json:"ts,omitempty"`  // unix millis of the send
	Cid            string `json:"cid,omitempty"` // client message id (dedupe)
	Conectados     int64  `json:"conectados,omitempty"`
	Mensajes       int64  `json:"mensajes,omitempty"` // hito N
	BannerID       string `json:"bannerId,omitempty"`
	Patrocinador   string `json:"patrocinador,omitempty"`
	ImagenUrl      string `json:"imagenUrl,omitempty"`
	ImagenMovilUrl string `json:"imagenMovilUrl,omitempty"`
	ClicUrl        string `json:"clicUrl,omitempty"`
	Tier           string `json:"tier,omitempty"`
	Importe        int64  `json:"importe,omitempty"` // céntimos
	Coins          int64  `json:"coins,omitempty"`
	Dia            string `json:"dia,omitempty"`
	Motivo         string `json:"motivo,omitempty"`
}

// frame is an item with its JSON already encoded. The room encodes each message ONCE and shares the bytes with
// every local client: with thousands of connections, encoding the same message per client was the hot spot of
// the fanout (the CPU of a pod grew with (clients × messages)).
type frame struct {
	it   item
	json []byte
}

// publica is the public view of an item: the UUID of the fan is replaced by its pseudonym (a short HMAC with
// the key of the service), so an anonymous client cannot correlate the messages of a room with the account of
// the fans (the moderation of the backoffice keeps seeing the UUID).
func (it item) publica(hash func(string) string) item {
	if it.FanID != "" {
		it.FanKey = hash(it.FanID)
		it.FanID = ""
	}
	return it
}

// nuevaFrame encodes the item once (the bytes are shared by every subscriber).
func nuevaFrame(it item) frame {
	b, err := json.Marshal(it)
	if err != nil {
		return frame{it: it}
	}
	return frame{it: it, json: b}
}

// subBuffer is the per-client channel buffer. A client that does not drain it in time is disconnected (code 1008)
// and reconnects with its last id: a slow client never blocks the rest of the room.
const subBuffer = 64

// idleSala removes a room without subscribers after this long (its reader goroutine exits).
const idleSala = 2 * time.Minute

// salaID identifies a room: competition + day (Europe/Madrid).
type salaID struct{ cid, dia string }

func (s salaID) stream(k redisx.Keys) string { return k.Of("chat", "sala", s.cid, s.dia) }
func (s salaID) String() string              { return s.cid + ":" + s.dia }

// sala is one active room on this pod: a single XREAD BLOCK reader and the local subscribers.
type sala struct {
	id     salaID
	nombre string // redis stream key
	hub    *hub

	mu     sync.Mutex
	subs   map[chan frame]struct{}
	lastID string // reader position ("$" until the first entry arrives)
	last   time.Time
	parado bool
}

func (s *sala) viva() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.subs) > 0 || time.Since(s.last) < idleSala
}

func (s *sala) nsubs() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.subs)
}

// hub keeps the rooms active on this pod.
type hub struct {
	a *app.App

	mu    sync.Mutex
	salas map[salaID]*sala

	// claveFan derives the public pseudonym of a fan (HMAC with the key of the service): the UUID of the fan
	// never travels to the clients.
	claveFan []byte

	// streams lists every room stream this pod has ever seen: the persistence group keeps its own position, so
	// dropping a stream from XREADGROUP would leave its entries unread until the room wakes up again.
	streamsMu sync.Mutex
	streams   map[string]struct{}
}

// hashFan returns the public pseudonym of a fan: the first bytes of the HMAC of its UUID with the key of the
// service. The same fan always gets the same pseudonym (the client compares it with the one the service gives
// it), but it cannot be turned back into the UUID.
func (h *hub) hashFan(id string) string {
	if h == nil || len(h.claveFan) == 0 || id == "" {
		return ""
	}
	m := hmac.New(sha256.New, h.claveFan)
	m.Write([]byte("grcup/chat/fan/v1:" + id))
	return hex.EncodeToString(m.Sum(nil))[:12]
}

func (h *hub) registrar(nombre string) {
	h.streamsMu.Lock()
	h.streams[nombre] = struct{}{}
	h.streamsMu.Unlock()
}

func (h *hub) nombresStreams() []string {
	h.streamsMu.Lock()
	defer h.streamsMu.Unlock()
	out := make([]string, 0, len(h.streams))
	for k := range h.streams {
		out = append(out, k)
	}
	return out
}

// abrir returns the room, starting its reader the first time it is needed on this pod.
func (h *hub) abrir(ctx context.Context, id salaID) *sala {
	h.mu.Lock()
	defer h.mu.Unlock()
	if sl, ok := h.salas[id]; ok {
		sl.mu.Lock()
		sl.last = time.Now()
		sl.mu.Unlock()
		return sl
	}
	sl := &sala{
		id:     id,
		nombre: id.stream(h.a.Keys),
		hub:    h,
		subs:   map[chan frame]struct{}{},
		lastID: "$",
		last:   time.Now(),
	}
	h.salas[id] = sl
	h.registrar(sl.nombre)
	go sl.leer(ctx)
	return sl
}

// gc stops the readers of idle rooms; a later connect starts a fresh reader from "$" (already published entries
// live in the stream history and in the persisted table).
func (h *hub) gc(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			h.mu.Lock()
			for id, sl := range h.salas {
				sl.mu.Lock()
				if len(sl.subs) == 0 && time.Since(sl.last) > idleSala {
					sl.parado = true
					delete(h.salas, id)
				}
				sl.mu.Unlock()
			}
			h.mu.Unlock()
		}
	}
}

func (s *sala) sub() chan frame {
	ch := make(chan frame, subBuffer)
	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.last = time.Now()
	s.mu.Unlock()
	return ch
}

func (s *sala) unsub(ch chan frame) {
	s.mu.Lock()
	if _, ok := s.subs[ch]; ok {
		delete(s.subs, ch)
		close(ch)
	}
	s.mu.Unlock()
}

// publicar fans the item out to the local subscribers. The JSON is encoded once (not once per client). A full
// buffer means a slow client: it is dropped (its connection ends with 1008 and it reconnects with its last id)
// instead of blocking the room.
func (s *sala) publicar(it item) {
	fr := nuevaFrame(it.publica(s.hub.hashFan))
	s.mu.Lock()
	var lentos []chan frame
	for ch := range s.subs {
		select {
		case ch <- fr:
		default:
			lentos = append(lentos, ch)
		}
	}
	for _, ch := range lentos {
		delete(s.subs, ch)
		close(ch)
	}
	s.mu.Unlock()
	lentasTotal.Add(int64(len(lentos)))
}

// leer is the single reader of the room on this pod (XREAD BLOCK): it takes each new entry and fans it out.
func (s *sala) leer(ctx context.Context) {
	for ctx.Err() == nil {
		s.mu.Lock()
		last, parado := s.lastID, s.parado
		s.mu.Unlock()
		if parado {
			return
		}
		res, err := s.hub.a.Redis.XRead(ctx, &redis.XReadArgs{Streams: []string{s.nombre, last}, Count: 200, Block: 5 * time.Second}).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) || ctx.Err() != nil {
				continue
			}
			s.hub.a.Log.Warn("chat xread", "sala", s.id.String(), "err", err)
			time.Sleep(time.Second)
			continue
		}
		for _, st := range res {
			for _, m := range st.Messages {
				s.mu.Lock()
				s.lastID = m.ID
				s.mu.Unlock()
				var it item
				raw, _ := m.Values["d"].(string)
				if json.Unmarshal([]byte(raw), &it) == nil && it.T != "" {
					it.ID = m.ID
					s.publicar(it)
				}
			}
		}
	}
}

// salasVivas lists the rooms worth reporting presence for.
func (h *hub) salasVivas() []*sala {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]*sala, 0, len(h.salas))
	for _, sl := range h.salas {
		if sl.viva() {
			out = append(out, sl)
		}
	}
	return out
}
