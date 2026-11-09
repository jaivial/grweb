// e2e-ws.go: cliente WebSocket mínimo para las pruebas e2e del directo social (se llama desde
// e2e-directo-social.sh con `go run scripts/e2e-ws.go`). Se conecta a la sala del chat, imprime cada frame
// recibido (una línea JSON) y, si se pide, envía mensajes con la cadencia dada.
//
//	go run scripts/e2e-ws.go -url ws://127.0.0.1:18300/api/competiciones/grcup/chat/ws \
//		-fan <token grcup_fan> -seg 30 -n 10 -pausa 2200ms -texto "vamos atleta"
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

func main() {
	var (
		url   = flag.String("url", "", "URL WebSocket de la sala (obligatoria)")
		fan   = flag.String("fan", "", "token de fan (cabecera X-GrCup-Fan y cookie grcup_fan)")
		seg   = flag.Int("seg", 30, "segundos que se queda leyendo")
		n     = flag.Int("n", 0, "mensajes a enviar (0 = solo leer)")
		pausa = flag.Duration("pausa", 2200*time.Millisecond, "pausa entre mensajes (el límite es 1 cada 2 s)")
		texto = flag.String("texto", "hola desde el e2e", "texto de los mensajes (≥3 caracteres sin espacios para contar)")
		desde = flag.String("desde", "", "id del stream desde el que reanudar (el servidor hace el replay)")
	)
	flag.Parse()
	if *url == "" {
		fmt.Fprintln(os.Stderr, "falta -url")
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*seg)*time.Second)
	defer cancel()

	hdr := http.Header{}
	if *fan != "" {
		hdr.Set("X-GrCup-Fan", *fan)
		hdr.Set("Cookie", "grcup_fan="+*fan)
	}
	u := *url
	if *desde != "" {
		u += "?desde=" + *desde
	}
	ws, _, err := websocket.Dial(ctx, u, &websocket.DialOptions{HTTPHeader: hdr})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ws dial: %v\n", err)
		os.Exit(1)
	}
	defer ws.Close(websocket.StatusNormalClosure, "")

	// lector: una línea por frame (el guion de bash hace el recuento con grep)
	lecturas := make(chan string, 4096)
	go func() {
		for {
			t, r, err := ws.Reader(ctx)
			if err != nil {
				close(lecturas)
				return
			}
			if t != websocket.MessageText {
				continue
			}
			b, err := io.ReadAll(r)
			if err != nil {
				close(lecturas)
				return
			}
			lecturas <- string(b)
		}
	}()

	enviados := 0
	// el servidor cierra un WS que lleva 90 s sin hablar (CHAT_WS_IDLE_SEG): el lector que solo escucha
	// manda un ping cada 30 s para que no lo desconecten.
	var wmu sync.Mutex
	escribir := func(b []byte) error {
		wmu.Lock()
		defer wmu.Unlock()
		w, err := ws.Writer(ctx, websocket.MessageText)
		if err != nil {
			return err
		}
		if _, err := w.Write(b); err != nil {
			return err
		}
		return w.Close()
	}
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				msg, _ := json.Marshal(map[string]any{"t": "ping"})
				_ = escribir(msg)
			}
		}
	}()
	for i := 0; i < *n; i++ {
		// respetar el ritmo: 1 mensaje cada 2 s con ráfaga de 5
		if i > 0 {
			time.Sleep(*pausa)
		}
		textoMsg := *texto
		if *n > 1 {
			textoMsg = fmt.Sprintf("%s nº%d", *texto, i+1) // varía el texto: dos mensajes iguales seguidos no cuentan para los hitos
		}
		msg, _ := json.Marshal(map[string]any{
			"t": "msg", "texto": textoMsg, "cid": uuid.NewString(),
		})
		if err := escribir(msg); err != nil {
			fmt.Fprintf(os.Stderr, "ws send: %v\n", err)
			break
		}
		enviados++
	}

	// drena lo recibido: con envío deja 3 s de gracia tras el último mensaje, sin envío hasta el plazo
	deadline := time.Now().Add(time.Duration(*seg) * time.Second)
	if enviados > 0 {
		gracia := time.Now().Add(3 * time.Second)
		if gracia.Before(deadline) {
			deadline = gracia
		}
	}
	for {
		select {
		case f, ok := <-lecturas:
			if !ok {
				fmt.Fprintln(os.Stderr, "ws cerrado por el servidor")
				fmt.Println("WS_CERRADO")
				return
			}
			fmt.Println(f)
			os.Stdout.Sync()
		case <-time.After(time.Until(deadline)):
			fmt.Fprintf(os.Stderr, "ws fin: enviados=%d\n", enviados)
			return
		}
	}
}
