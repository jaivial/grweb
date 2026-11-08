package chat

import (
	"encoding/json"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestHubClienteLento verifies the fanout contract without Redis: a client that stops draining its channel is
// disconnected (buffer full → closed channel) and a fresh subscription keeps working (§4).
func TestHubClienteLento(t *testing.T) {
	s := &sala{subs: map[chan item]struct{}{}, id: salaID{"c", "d"}}
	lento := s.sub()
	if n := s.nsubs(); n != 1 {
		t.Fatalf("suscriptores = %d, esperaba 1", n)
	}

	// llenar el canal del cliente lento sin leerlo: subBuffer mensajes caben, la siguiente lo desconecta
	for range subBuffer {
		s.publicar(item{T: "msg", Texto: "lleno"})
	}
	s.publicar(item{T: "msg", Texto: "gota final"})

	// el búfer sigue teniendo los subBuffer mensajes pendientes (close no borra lo encolado)
	for range subBuffer {
		it, ok := <-lento
		if !ok {
			t.Fatal("el canal se cerró antes de drenar los mensajes pendientes")
		}
		if it.Texto != "lleno" {
			t.Errorf("texto = %q", it.Texto)
		}
	}
	// y tras el drenaje, el cierre
	if _, ok := <-lento; ok {
		t.Fatal("el canal lento debería estar cerrado")
	}
	if n := s.nsubs(); n != 0 {
		t.Errorf("tras el drop, suscriptores = %d, esperaba 0", n)
	}

	// la sala sigue viva: un cliente nuevo recibe los mensajes siguientes
	sano := s.sub()
	s.publicar(item{T: "msg", Texto: "recibido"})
	select {
	case it, ok := <-sano:
		if !ok {
			t.Fatal("canal cerrado sin motivo")
		}
		if it.Texto != "recibido" {
			t.Errorf("texto = %q", it.Texto)
		}
	case <-time.After(time.Second):
		t.Fatal("el cliente sano no recibió el mensaje")
	}
	s.unsub(sano)
	if n := s.nsubs(); n != 0 {
		t.Errorf("suscriptores = %d, esperaba 0", n)
	}
}

// TestHubDosClientesUnLento: el lento no castiga al que sí drena.
func TestHubDosClientesUnLento(t *testing.T) {
	s := &sala{subs: map[chan item]struct{}{}, id: salaID{"c", "d"}}
	sano := s.sub()
	lento := s.sub()

	var recibidos atomic.Int64
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, ok := <-sano; !ok {
				return
			}
			recibidos.Add(1)
		}
	}()

	for range subBuffer + 10 { // más de la capacidad: solo el lento se desconecta
		s.publicar(item{T: "msg", Texto: "lluvia"})
	}
	// drenar el búfer del lento hasta ver su cierre
	for {
		if _, ok := <-lento; !ok {
			break
		}
	}
	s.unsub(sano)
	<-done
	if recibidos.Load() == 0 {
		t.Error("el cliente sano no recibió ningún mensaje")
	}
	if n := s.nsubs(); n != 0 {
		t.Errorf("suscriptores = %d, esperaba 0", n)
	}
}

// TestItemCodifica verifies the wire format of a room item (JSON with the fields the clients read).
func TestItemCodifica(t *testing.T) {
	it := item{T: "msg", ID: "1-1", Texto: "hola", Alias: "laura", FanID: "f", Ts: 1700000000000, Cid: "cid-1"}
	b, err := json.Marshal(it)
	if err != nil {
		t.Fatal(err)
	}
	var deNuevo item
	if err := json.Unmarshal(b, &deNuevo); err != nil {
		t.Fatal(err)
	}
	if deNuevo.T != "msg" || deNuevo.Texto != "hola" || deNuevo.Alias != "laura" || deNuevo.Cid != "cid-1" {
		t.Errorf("ida y vuelta: %+v", deNuevo)
	}
	// los campos vacíos no viajan (frames compactos en la ruta caliente)
	s := string(b)
	if strings.Contains(s, `"texto":""`) {
		t.Errorf("campos vacíos en el frame: %s", s)
	}
}

// TestHubConcurrencia hammers publicar/sub/unsub from several goroutines (go test -race).
func TestHubConcurrencia(t *testing.T) {
	s := &sala{subs: map[chan item]struct{}{}, id: salaID{"c", "d"}}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 200 {
				ch := s.sub()
				go func() {
					for {
						if _, ok := <-ch; !ok {
							return
						}
					}
				}()
				s.publicar(item{T: "msg"})
				s.unsub(ch)
			}
		}()
	}
	wg.Wait()
	time.Sleep(50 * time.Millisecond)
	if n := s.nsubs(); n != 0 {
		t.Errorf("tras la tormenta, suscriptores = %d, esperaba 0", n)
	}
}
