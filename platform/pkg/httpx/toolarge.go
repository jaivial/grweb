package httpx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

var errTooLarge = problem.New(http.StatusRequestEntityTooLarge, "DEMASIADO_GRANDE", "El cuerpo de la petición es demasiado grande.")

// BodyReadTimeout bounds the time to receive a request body (set per request by MaxBodyFor).
const BodyReadTimeout = 2 * time.Minute

// tooLarge answers 413 to a request whose declared body exceeds the limit and resets the connection.
// net/http would instead half-close and keep the socket 500 ms without reading it: under a flood of big
// bodies thousands of sockets pile up with full receive buffers (kernel memory charged to the pod) and
// the container is OOMKilled. The RST frees the unread body at once.
func tooLarge(w http.ResponseWriter) {
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
