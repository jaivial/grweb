package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

var errTooLarge = problem.New(http.StatusRequestEntityTooLarge, "DEMASIADO_GRANDE", "El cuerpo de la petición es demasiado grande.")

// BodyReadTimeout bounds the time to receive a request body (set per request by MaxBodyFor).
const BodyReadTimeout = 2 * time.Minute

// rcvBuf caps the kernel receive buffer of every accepted connection. Without it Linux autotunes each socket up
// to tcp_rmem max (16 MiB on the nodes) and a flood of big unread bodies fills them with memory charged to the
// pod's cgroup (crm OOMKilled at 256Mi with only ~15 MB of Go heap). 256 KiB still moves >100 MB/s in-cluster.
const rcvBuf = 256 << 10

// Listen opens the TCP listener of the service with the receive buffer capped (set before listen, so accepted
// sockets inherit it and the window scale matches).
func Listen(ctx context.Context, addr string) (net.Listener, error) {
	lc := net.ListenConfig{Control: func(_, _ string, c syscall.RawConn) error {
		var serr error
		if err := c.Control(func(fd uintptr) { serr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_RCVBUF, rcvBuf) }); err != nil {
			return err
		}
		return serr
	}}
	return lc.Listen(ctx, "tcp", addr)
}

// tooLarge answers 413 to a request whose declared body exceeds the limit and resets the connection.
// net/http would instead half-close and keep the socket 500 ms without reading it: under a flood of big
// bodies thousands of sockets pile up with full receive buffers (kernel memory charged to the pod) and
// the container is OOMKilled. The RST frees the unread body at once (draining it instead, even for 1 s,
// measured 585 MB under the same flood).
func tooLarge(w http.ResponseWriter) { TooLarge(w) }

// TooLarge writes the 413 problem and resets the connection (exported for the gateway's proxy errors).
func TooLarge(w http.ResponseWriter) {
	markStatus(w, http.StatusRequestEntityTooLarge)
	conn, buf, err := http.NewResponseController(w).Hijack()
	if err != nil { // HTTP/2 or a writer without Hijack: plain 413
		problem.Write(w, errTooLarge)
		return
	}
	defer conn.Close()
	body, _ := json.Marshal(errTooLarge)
	h := w.Header().Clone()
	h.Set("Content-Type", "application/problem+json")
	h.Set("Content-Length", fmt.Sprint(len(body)))
	h.Set("Connection", "close")
	var b bytes.Buffer
	b.WriteString("HTTP/1.1 413 Request Entity Too Large\r\n")
	_ = h.Write(&b)
	b.WriteString("\r\n")
	b.Write(body)
	_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_, _ = buf.Writer.Write(b.Bytes())
	_ = buf.Writer.Flush()
	if tc, ok := conn.(*net.TCPConn); ok {
		_ = tc.SetLinger(0)
	}
}

// markStatus lets the Logger record the status of a hijacked response.
func markStatus(w http.ResponseWriter, code int) {
	for w != nil {
		if sw, ok := w.(*statusWriter); ok {
			sw.status = code
			return
		}
		u, ok := w.(interface{ Unwrap() http.ResponseWriter })
		if !ok {
			return
		}
		w = u.Unwrap()
	}
}
