// Command carga-chat is the load and concurrency test of the chat (§12 del contrato). It opens N WebSockets and
// M SSE clients against the gateway or directly against the chat service, sends messages at a fixed rate with
// fan tokens signed locally (fanauth + the dev INTERNAL_TOKEN_SECRET) and measures end-to-end latency
// (sender → another client) with p50/p95/p99/max, lost and duplicated messages, dropped connections and throughput.
//
// It is a tool binary, not a service. Example:
//
//	carga-chat -base http://127.0.0.1:8080 -slug gr-cup-2026 -ws 2000 -sse 200 -rate 300 -dur 60s \
//	  -secret "<INTERNAL_TOKEN_SECRET de dev>" -out docs/carga/2026-11-08.md
//
// OJO (documentación del contrato): el gateway limita 600 peticiones/min por IP (RATE_LIMIT_IP_MIN); para pasar
// por el gateway súbelo o lanza la prueba directamente contra el servicio chat. Los límites por fan (1 msg/2 s,
// ráfaga 5, modo lento) se respetan: cada conexión lleva un fan distinto, así que la prueba mide el sistema, no
// el limitador (usa -rate por debajo de -ws: un fan no puede sostener más de ~0,5 msg/s).
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/fanauth"
)

type opciones struct {
	base   string
	slug   string
	cid    string
	ws     int
	sse    int
	rest   int
	rate   float64
	dur    time.Duration
	secret string
	out    string
}

// resultados aggregates the measurements (guarded by mu).
type resultados struct {
	mu         sync.Mutex
	latencias  []time.Duration
	enviados   int
	rechazados int                            // frames `sistema` del servidor (límite por fan, sala inactiva…)
	recibidos  int                            // cids únicos vistos por algún cliente
	duplicados int                            // repeticiones del mismo cid dentro del MISMO cliente (con N clientes cada mensaje llega N veces)
	fallidas   int                            // connections that never opened
	cortadas   int                            // connections opened but dropped before the end
	vistos     map[string]map[string]struct{} // cliente → cids ya recibidos
	globales   map[string]struct{}            // cids vistos por cualquier cliente
	inicio     time.Time                      // mensajes anteriores (replays de runs previos) no cuentan
}

// frame is the part of a server frame the measurement needs.
type frame struct {
	T     string `json:"t"`
	Texto string `json:"texto"`
	ID    string `json:"id"`
	Cid   string `json:"cid"`
}

func main() {
	var c opciones
	flag.StringVar(&c.base, "base", "http://127.0.0.1:18300", "URL base del gateway o del servicio chat")
	flag.StringVar(&c.slug, "slug", "", "slug de la competición (obligatorio, salvo que se pase -cid)")
	flag.StringVar(&c.cid, "cid", "", "id de la competición (alternativa al slug cuando se apunta directo al servicio chat)")
	flag.IntVar(&c.ws, "ws", 2000, "clientes WebSocket (envían y miden)")
	flag.IntVar(&c.sse, "sse", 0, "clientes SSE (solo miden)")
	flag.IntVar(&c.rest, "rest", 0, "de los N primeros clientes WS, cuántos envían por REST POST (0 = todos por WS)")
	flag.Float64Var(&c.rate, "rate", 100, "mensajes por segundo en total (0 = solo conexiones)")
	flag.DurationVar(&c.dur, "dur", 60*time.Second, "duración de la fase de envío")
	flag.StringVar(&c.secret, "secret", "", "INTERNAL_TOKEN_SECRET de dev para firmar los tokens de fan (obligatorio)")
	flag.StringVar(&c.out, "out", "", "fichero Markdown del informe (por defecto docs/carga/<fecha>.md)")
	flag.Parse()

	if (c.slug == "" && c.cid == "") || c.secret == "" {
		fmt.Fprintln(os.Stderr, "faltan -slug (o -cid) o -secret")
		flag.Usage()
		os.Exit(2)
	}
	if !strings.HasPrefix(c.base, "http") {
		c.base = "http://" + c.base
	}
	c.base = strings.TrimRight(c.base, "/")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	r := &resultados{vistos: map[string]map[string]struct{}{}, globales: map[string]struct{}{}, inicio: time.Now()}

	// la competición se obtiene de la API pública (su id va firmado dentro de cada token de fan)
	cid, err := compID(ctx, c.base, c.slug, c.cid)
	if err != nil {
		fatal("no se pudo obtener la competición", err)
	}
	key := fanauth.Key(c.secret)

	fmt.Fprintf(os.Stderr, "chat carga: %s (cid %s) · %d ws + %d sse · %.0f msg/s · %s\n", nombreComp(c), cid, c.ws, c.sse, c.rate, c.dur)

	wsClientes, err := lanzarWS(ctx, r, c, cid, key)
	if err != nil {
		fatal("abriendo clientes ws", err)
	}
	sseClientes, err := lanzarSSE(ctx, r, c, cid, key)
	if err != nil {
		fatal("abriendo clientes sse", err)
	}
	time.Sleep(2 * time.Second) // let the connections settle before the send phase

	inicio := time.Now()
	if c.rate > 0 {
		enviarRitmo(ctx, wsClientes, r, c, inicio)
		time.Sleep(c.dur)
	}
	fin := time.Now()

	// grace period: what is still travelling counts as received
	time.Sleep(3 * time.Second)
	for _, cl := range wsClientes {
		cl.cerrar()
	}
	for _, cl := range sseClientes {
		cl.cerrar()
	}
	cancel()
	r.imprimir(inicio, fin, c)
}

// ---- fans (tokens firmados en local; cada cliente un fan distinto para no chocar con los límites por fan) ----

func fanToken(key []byte, cid string, n int) string {
	f, _ := uuid.NewV7()
	tok, err := fanauth.Sign(key, fanauth.Fan{
		ID: f, CompetitionID: uuid.MustParse(cid), Tipo: fanauth.TipoPublico,
		Alias: fmt.Sprintf("carga%04d", n), Ver: 0, Exp: time.Now().Add(2 * time.Hour).Unix(),
	})
	if err != nil {
		fatal("firmando token de fan", err)
	}
	return tok
}

func compID(ctx context.Context, base, slug, cidFlag string) (string, error) {
	// contra el servicio chat directamente no existe GET /api/competiciones/{slug} (lo sirve competition a través
	// del gateway): en ese caso se pasa el id con -cid
	if cidFlag != "" {
		if _, err := uuid.Parse(cidFlag); err != nil {
			return "", fmt.Errorf("-cid tiene que ser un UUID: %w", err)
		}
		return cidFlag, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/competiciones/"+slug, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: %s", slug, resp.Status)
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		return "", err
	}
	if _, err := uuid.Parse(out.ID); err != nil {
		return "", errors.New("la respuesta no trae un id de competición")
	}
	return out.ID, nil
}

func nombreComp(c opciones) string {
	if c.slug != "" {
		return c.slug
	}
	return c.cid
}

func fatal(msg string, err error) {
	fmt.Fprintf(os.Stderr, "carga-chat: %s: %v\n", msg, err)
	os.Exit(1)
}

// ---- clientes WebSocket (leen y envían) ----

type clienteWS struct {
	n       int
	url     string // ws://…/chat/ws
	restURL string // http://…/chat/mensajes (para -rest)
	tok     string
	ctx     context.Context
	mu      sync.Mutex
	conn    *websocket.Conn
	viva    bool
	r       *resultados
}

func (c *clienteWS) nombre() string { return fmt.Sprintf("ws-%04d", c.n) }

func (c *clienteWS) iniciar() error {
	wsURL := strings.Replace(strings.Replace(c.url, "https://", "wss://", 1), "http://", "ws://", 1)
	conn, _, err := websocket.Dial(c.ctx, wsURL, &websocket.DialOptions{HTTPHeader: http.Header{"X-GrCup-Fan": []string{c.tok}}})
	if err != nil {
		c.r.mu.Lock()
		c.r.fallidas++
		c.r.mu.Unlock()
		return err
	}
	c.mu.Lock()
	c.conn, c.viva = conn, true
	c.mu.Unlock()
	go c.leer(conn)
	return nil
}

// leer consumes the server frames; the load messages carry their send time in the text («carga <ns> <cid>»).
func (c *clienteWS) leer(conn *websocket.Conn) {
	for {
		_, data, err := conn.Read(c.ctx)
		if err != nil {
			c.mu.Lock()
			viva := c.viva
			c.viva = false
			c.mu.Unlock()
			if viva && c.ctx.Err() == nil {
				c.r.mu.Lock()
				c.r.cortadas++
				c.r.mu.Unlock()
			}
			return
		}
		var fr frame
		if json.Unmarshal(data, &fr) != nil {
			continue
		}
		if fr.T == "sistema" {
			c.r.mu.Lock()
			c.r.rechazados++ // el servidor rechazó un envío (límite por fan, sala inactiva…)
			c.r.mu.Unlock()
			continue
		}
		if fr.T != "msg" {
			continue
		}
		c.r.registrar(c.nombre(), fr)
	}
}

func (c *clienteWS) enviar(texto, cid string) error {
	c.mu.Lock()
	conn, viva := c.conn, c.viva
	c.mu.Unlock()
	if conn == nil || !viva {
		return errors.New("conexión cerrada")
	}
	b, _ := json.Marshal(map[string]string{"t": "msg", "texto": texto, "cid": cid})
	return conn.Write(c.ctx, websocket.MessageText, b)
}

func (c *clienteWS) cerrar() {
	c.mu.Lock()
	c.viva = false
	conn := c.conn
	c.conn = nil
	c.mu.Unlock()
	if conn != nil {
		_ = conn.Close(websocket.StatusNormalClosure, "fin")
	}
}

func lanzarWS(ctx context.Context, r *resultados, c opciones, cid string, key []byte) ([]*clienteWS, error) {
	url := c.base + "/api/competiciones/" + c.slug + "/chat/ws"
	out := make([]*clienteWS, 0, c.ws)
	for i := range c.ws {
		cl := &clienteWS{n: i, url: url, restURL: c.base + "/api/competiciones/" + c.slug + "/chat/mensajes", tok: fanToken(key, cid, i+1), ctx: ctx, r: r}
		if err := cl.iniciar(); err != nil {
			if i == 0 { // the very first failure means the endpoint is not reachable: abort
				return nil, err
			}
			fmt.Fprintf(os.Stderr, "%s: %v\n", cl.nombre(), err)
			continue
		}
		out = append(out, cl)
	}
	return out, nil
}

// ---- clientes SSE (solo miden: el envío va por WS o REST) ----

type clienteSSE struct {
	n    int
	url  string
	tok  string
	mu   sync.Mutex
	resp *http.Response
	viva bool
	r    *resultados
}

func (c *clienteSSE) nombre() string { return fmt.Sprintf("sse-%04d", c.n) }

func (c *clienteSSE) iniciar(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("X-GrCup-Fan", c.tok)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.r.mu.Lock()
		c.r.fallidas++
		c.r.mu.Unlock()
		return err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		c.r.mu.Lock()
		c.r.fallidas++
		c.r.mu.Unlock()
		return fmt.Errorf("sse: %s", resp.Status)
	}
	c.mu.Lock()
	c.resp, c.viva = resp, true
	c.mu.Unlock()
	go c.leer(ctx, resp.Body)
	return nil
}

func (c *clienteSSE) leer(ctx context.Context, body io.Reader) {
	sc := bufio.NewScanner(body)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		linea := sc.Text()
		if !strings.HasPrefix(linea, "data: ") {
			continue
		}
		var fr frame
		if json.Unmarshal([]byte(linea[len("data: "):]), &fr) != nil || fr.T != "msg" {
			continue
		}
		c.r.registrar(c.nombre(), fr)
	}
	c.mu.Lock()
	viva := c.viva
	c.viva = false
	c.mu.Unlock()
	if viva && ctx.Err() == nil {
		c.r.mu.Lock()
		c.r.cortadas++
		c.r.mu.Unlock()
	}
}

func (c *clienteSSE) cerrar() {
	c.mu.Lock()
	c.viva = false
	resp := c.resp
	c.resp = nil
	c.mu.Unlock()
	if resp != nil {
		resp.Body.Close()
	}
}

func lanzarSSE(ctx context.Context, r *resultados, c opciones, cid string, key []byte) ([]*clienteSSE, error) {
	url := c.base + "/api/competiciones/" + c.slug + "/chat/stream"
	out := make([]*clienteSSE, 0, c.sse)
	for i := range c.sse {
		cl := &clienteSSE{n: i, url: url, tok: fanToken(key, cid, c.ws+i+1), r: r}
		if err := cl.iniciar(ctx); err != nil {
			if i == 0 {
				return nil, err
			}
			fmt.Fprintf(os.Stderr, "%s: %v\n", cl.nombre(), err)
			continue
		}
		out = append(out, cl)
	}
	return out, nil
}

// enviarRitmo sends at a global fixed rate, round-robin over the WS clients. Each message embeds its send
// timestamp (unixnano) and a unique cid: receivers compute the latency and detect losses and duplicates.
func enviarRitmo(ctx context.Context, clientes []*clienteWS, r *resultados, c opciones, inicio time.Time) {
	if len(clientes) == 0 {
		fmt.Fprintln(os.Stderr, "sin clientes ws vivos: la fase de envío necesita -ws > 0")
		return
	}
	paso := time.Duration(float64(time.Second) / c.rate)
	if paso <= 0 {
		paso = time.Millisecond
	}
	tic := time.NewTicker(paso)
	defer tic.Stop()
	var seq int
	idx := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-tic.C:
			if time.Since(inicio) >= c.dur {
				return
			}
			seq++
			cidMsg := uuid.Must(uuid.NewV7()).String()
			texto := fmt.Sprintf("carga %d %s", time.Now().UnixNano(), cidMsg)
			ok := false
			if c.rest > 0 && seq%(len(clientes)/c.rest+1) == 0 {
				// envío por REST POST con el token de fan de un cliente (mismo filtro y límites)
				cl := clientes[idx%len(clientes)]
				idx++
				ok = enviarRest(cl, texto, cidMsg)
			} else {
				// try up to len(clientes) connections: dead ones are skipped
				for intento := 0; intento < len(clientes) && !ok; intento++ {
					cl := clientes[idx%len(clientes)]
					idx++
					if err := cl.enviar(texto, cidMsg); err == nil {
						ok = true
					}
				}
			}
			if ok {
				r.mu.Lock()
				r.enviados++
				r.mu.Unlock()
			}
		}
	}
}

// enviarRest sends one message through POST …/chat/mensajes with the fan token of a WS client.
func enviarRest(cl *clienteWS, texto, cid string) bool {
	b, _ := json.Marshal(map[string]string{"texto": texto, "cid": cid})
	req, err := http.NewRequestWithContext(cl.ctx, http.MethodPost, cl.restURL, bytes.NewReader(b))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GrCup-Fan", cl.tok)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// registrar computes the end-to-end latency of one received load message (sender → this client). Duplicates are
// counted per client: with N clients every message legitimately arrives N times.
func (r *resultados) registrar(cliente string, fr frame) {
	if !strings.HasPrefix(fr.Texto, "carga ") {
		return
	}
	partes := strings.Fields(fr.Texto)
	if len(partes) < 3 {
		return
	}
	enviadoNs, err := parseNs(partes[1])
	if err != nil {
		return
	}
	if enviadoNs < r.inicio.UnixNano() {
		return // mensaje de un run anterior (el replay inicial de SSE los entrega como contexto)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.vistos[cliente] == nil {
		r.vistos[cliente] = map[string]struct{}{}
	}
	if _, dup := r.vistos[cliente][fr.Cid]; dup {
		r.duplicados++
		return
	}
	r.vistos[cliente][fr.Cid] = struct{}{}
	if _, global := r.globales[fr.Cid]; !global {
		r.globales[fr.Cid] = struct{}{}
		r.recibidos++
		r.latencias = append(r.latencias, time.Duration(time.Now().UnixNano()-enviadoNs))
	}
}

func parseNs(s string) (int64, error) {
	var n int64
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil {
		return 0, err
	}
	return n, nil
}

// ---- informe ----

func (r *resultados) imprimir(inicio, fin time.Time, c opciones) {
	r.mu.Lock()
	lat := append([]time.Duration(nil), r.latencias...)
	enviados, rechazados, recibidos, duplicados := r.enviados, r.rechazados, r.recibidos, r.duplicados
	fallidas, cortadas := r.fallidas, r.cortadas
	r.mu.Unlock()

	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	pct := func(p float64) time.Duration {
		if len(lat) == 0 {
			return 0
		}
		i := int(float64(len(lat)) * p)
		if i >= len(lat) {
			i = len(lat) - 1
		}
		return lat[i]
	}
	max := time.Duration(0)
	if len(lat) > 0 {
		max = lat[len(lat)-1]
	}
	media := time.Duration(0)
	if len(lat) > 0 {
		var suma time.Duration
		for _, l := range lat {
			suma += l
		}
		media = suma / time.Duration(len(lat))
	}
	perdidos := enviados - recibidos - rechazados
	if perdidos < 0 {
		perdidos = 0
	}
	segundos := fin.Sub(inicio).Seconds()
	throughput := 0.0
	if segundos > 0 {
		throughput = float64(recibidos) / segundos
	}

	fecha := time.Now().Format("2006-01-02")
	out := c.out
	if out == "" {
		out = "docs/carga/" + fecha + ".md"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Prueba de carga del chat (%s)\n\n", fecha)
	fmt.Fprintf(&b, "| Parámetro | Valor |\n|---|---|\n")
	fmt.Fprintf(&b, "| Base | `%s` |\n| Competición | `%s` |\n| Clientes WS | %d |\n| Clientes SSE | %d |\n| Ritmo | %.0f msg/s |\n| Duración | %s |\n\n", c.base, nombreComp(c), c.ws, c.sse, c.rate, c.dur)
	fmt.Fprintf(&b, "| Métrica | Valor |\n|---|---|\n")
	fmt.Fprintf(&b, "| Mensajes enviados | %d |\n| Rechazados por límites | %d |\n| Mensajes recibidos | %d |\n| Perdidos | %d |\n| Duplicados (por cliente) | %d |\n", enviados, rechazados, recibidos, perdidos, duplicados)
	fmt.Fprintf(&b, "| Latencia media | %s |\n| Latencia p50 | %s |\n| Latencia p95 | %s |\n| Latencia p99 | %s |\n| Latencia máxima | %s |\n", media, pct(0.50), pct(0.95), pct(0.99), max)
	fmt.Fprintf(&b, "| Conexiones fallidas | %d |\n| Conexiones cortadas | %d |\n| Throughput (recibidos/s) | %.1f |\n\n", fallidas, cortadas, throughput)
	fmt.Fprintf(&b, "_El gateway limita 600 peticiones/min por IP (`RATE_LIMIT_IP_MIN`): esta prueba se lanza directamente "+
		"contra el servicio chat (o con el límite subido y `-cid` para el id de competición). Los límites por fan se respetan: "+
		"cada conexión usa un fan distinto (1 mensaje cada 2 s sostenidos, ráfaga de 5), así que `-rate` sostenido debe ser "+
		"≈0,5 × `-ws`; lo que supera ese ritmo aparece como «rechazados por límites», no como «perdidos»._\n")

	informe := b.String()
	fmt.Print(informe)
	if err := os.MkdirAll(dirDe(out), 0o755); err == nil {
		if err := os.WriteFile(out, []byte(informe), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "no se pudo escribir %s: %v\n", out, err)
		} else {
			fmt.Fprintf(os.Stderr, "informe escrito en %s\n", out)
		}
	}
}

func dirDe(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return "."
	}
	return p[:i]
}
