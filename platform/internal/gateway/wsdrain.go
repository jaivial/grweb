package gateway

import (
	"context"
	"encoding/binary"
	"errors"
	"io"
	"math/rand/v2"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// drenajeWS: on SIGTERM each proxied WS gets a 1012 close at a random moment of this window (ST1-R3-2), like
// chat does, so a scale-down of the gateway never cuts the room with 1006 nor reconnects everyone at once.
// ST1-R4-2: 8 s, not 2 s: the upstream keeps delivering while the window runs (unlike a draining chat pod, whose
// room reader has stopped, so chat keeps its 2 s), and 1000 WS over 2 s were 500 reconnects/s (p99 661 ms);
// over 8 s they are 125/s. preStop 5 s + 8 s + 1 s margin stays well inside terminationGracePeriodSeconds 30.
const drenajeWS = 8 * time.Second

var (
	wsActivos atomic.Int64
	wsDrenar  = make(chan struct{})
	wsDrenarU sync.Once
)

// cierre1012 is an unmasked server close frame: FIN+close, length 2, code 1012 (service restart).
var cierre1012 = []byte{0x88, 0x02, 0x03, 0xF4}

// errDrenando: a draining gateway opens no new WS (it would be cut within 8 s); the 502 makes the client retry
// on a live replica right away (ST1-R5-2).
var errDrenando = errors.New("gateway draining: WS upgrade refused")

// porUpgrade sends WS upgrades through a fast-fail transport and everything else through the normal one.
type porUpgrade struct{ http, ws, sse http.RoundTripper }

func (p porUpgrade) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.Header.Get("Upgrade") == "" {
		if p.sse != nil && esSSE(r) {
			return p.sse.RoundTrip(r)
		}
		return p.http.RoundTrip(r)
	}
	select {
	case <-wsDrenar:
		return nil, errDrenando
	default:
	}
	return p.ws.RoundTrip(r)
}

// wsBack wraps the upstream side of a hijacked WS (res.Body of the 101). It follows the server→client frame
// boundaries so that, once draining, it can end the stream with a close 1012 between two frames, never inside one.
type wsBack struct {
	io.ReadWriteCloser
	cab     []byte // pending bytes of the current frame header
	resto   uint64 // payload bytes left of the current frame
	drenado chan struct{}
	final   []byte
	fin     bool
}

func (b *wsBack) Read(p []byte) (int, error) {
	if b.fin {
		if len(b.final) == 0 {
			return 0, io.EOF
		}
		n := copy(p, b.final)
		b.final = b.final[n:]
		return n, nil
	}
	if b.resto == 0 && len(b.cab) == 0 {
		select {
		case <-b.drenado:
			b.fin, b.final = true, cierre1012
			return b.Read(p)
		default:
		}
	}
	if b.resto > 0 && uint64(len(p)) > b.resto && b.drenando() {
		// Only while draining stop at the frame end so the 1012 lands at a boundary; in steady state a read
		// takes whole batches of frames (ST1-R4-3: no extra syscall per frame on the hot path).
		p = p[:b.resto]
	}
	n, err := b.ReadWriteCloser.Read(p)
	b.seguir(p[:n])
	if err != nil && b.resto == 0 && len(b.cab) == 0 {
		select {
		case <-b.drenado: // the drain closed the idle upstream: end with the 1012 instead of the error
			b.fin, b.final = true, cierre1012
			return n, nil
		default:
		}
	}
	return n, err
}

// drenando reports whether the drain of this WS has started.
func (b *wsBack) drenando() bool {
	select {
	case <-b.drenado:
		return true
	default:
		return false
	}
}

// seguir advances the frame parser over bytes already forwarded.
func (b *wsBack) seguir(p []byte) {
	for len(p) > 0 {
		if b.resto > 0 {
			k := min(uint64(len(p)), b.resto)
			b.resto -= k
			p = p[k:]
			continue
		}
		b.cab = append(b.cab, p[0])
		p = p[1:]
		if len(b.cab) < 2 {
			continue
		}
		need := 2
		switch b.cab[1] & 0x7F {
		case 126:
			need = 4
		case 127:
			need = 10
		}
		if b.cab[1]&0x80 != 0 {
			need += 4
		}
		if len(b.cab) < need {
			continue
		}
		switch l := b.cab[1] & 0x7F; l {
		case 126:
			b.resto = uint64(binary.BigEndian.Uint16(b.cab[2:4]))
		case 127:
			b.resto = binary.BigEndian.Uint64(b.cab[2:10])
		default:
			b.resto = uint64(l)
		}
		b.cab = b.cab[:0]
	}
}

// envolverWS is called from ModifyResponse: only a 101 to a WS carries a ReadWriteCloser body.
func envolverWS(res *http.Response) {
	rwc, ok := res.Body.(io.ReadWriteCloser)
	if res.StatusCode != http.StatusSwitchingProtocols || !ok {
		return
	}
	d, hecho := make(chan struct{}), make(chan struct{})
	wsActivos.Add(1)
	go func() {
		select {
		case <-wsDrenar:
		case <-hecho: // closed normally: no goroutine left behind per WS
			return
		}
		time.Sleep(rand.N(drenajeWS))
		close(d)
		// An idle socket sits in Read: closing the upstream unblocks it, then Read emits the 1012.
		_ = rwc.Close()
	}()
	res.Body = &wsBack{ReadWriteCloser: &cerrarUnaVez{ReadWriteCloser: rwc, hecho: hecho}, drenado: d}
}

type cerrarUnaVez struct {
	io.ReadWriteCloser
	hecho chan struct{}
	once  sync.Once
}

func (c *cerrarUnaVez) Close() error {
	c.once.Do(func() { wsActivos.Add(-1); close(c.hecho) })
	return c.ReadWriteCloser.Close()
}

// drenarWS (app worker): after SIGTERM, start the drain and keep the process alive until the WS are gone.
func drenarWS(ctx context.Context) {
	<-ctx.Done()
	wsDrenarU.Do(func() { close(wsDrenar) })
	fin := time.Now().Add(drenajeWS + time.Second)
	for wsActivos.Load() > 0 && time.Now().Before(fin) {
		time.Sleep(50 * time.Millisecond)
	}
}
