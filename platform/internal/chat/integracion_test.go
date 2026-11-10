package chat

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/redisx"
)

// redisDePrueba connects to REDIS_ADDR (the dev Redis) or skips: the integration tests are additive to the unit
// tests and the CI/local runs without Redis still pass (los pidió el cliente; el resto del proyecto no tiene tests).
func redisDePrueba(t *testing.T) (*redis.Client, redisx.Keys) {
	t.Helper()
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		t.Skip("REDIS_ADDR no está definido: se salta el test de integración con Redis")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rdb, err := redisx.Connect(ctx, redisx.Options{Addr: addr, Username: os.Getenv("REDIS_USERNAME"), Password: os.Getenv("REDIS_PASSWORD"), DB: atoi(os.Getenv("REDIS_DB"))})
	if err != nil {
		t.Skipf("redis no disponible en %s: %v", addr, err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, redisx.Keys("grcup:test:chat:")
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// publicarHasta adds the item to the stream until the local subscriber receives it (XREAD "$" only delivers
// entries added after the reader's first command, so the very first one can fall in front of it).
func publicarHasta(t *testing.T, rdb *redis.Client, nombre string, it item, ch chan frame) {
	t.Helper()
	for intento := 0; intento < 6; intento++ {
		b, err := json.Marshal(it)
		if err != nil {
			t.Fatal(err)
		}
		if err := rdb.XAdd(context.Background(), &redis.XAddArgs{Stream: nombre, Values: map[string]any{"d": string(b)}}).Err(); err != nil {
			t.Fatal(err)
		}
		select {
		case got, ok := <-ch:
			if !ok {
				t.Fatal("canal cerrado")
			}
			if got.it.Texto == it.Texto && got.it.ID != "" {
				return
			}
		case <-time.After(time.Second):
			// reintentar: el lector puede haber resuelto "$" antes de nuestra entrada
		}
	}
	t.Fatalf("el lector no repartió %q", it.Texto)
}

func TestIntegracionCubetaTokens(t *testing.T) {
	rdb, k := redisDePrueba(t)
	ctx := context.Background()
	clave := k.Of("chat", "rate", "cid-test", "fan-cubeta")
	_ = rdb.Del(ctx, clave).Err()
	t.Cleanup(func() { _ = rdb.Del(context.Background(), clave).Err() })

	// ráfaga de 5 permitida, la 6.ª no
	for range 5 {
		res, err := cubeta.Run(ctx, rdb, []string{clave}, time.Now().UnixMilli(), ratePorMs, rateCapacidad, rateCoste, rateTTL.Milliseconds()).Int64Slice()
		if err != nil || len(res) != 2 || res[0] != 1 {
			t.Fatalf("mensaje dentro de la ráfaga: res=%v err=%v", res, err)
		}
	}
	res, err := cubeta.Run(ctx, rdb, []string{clave}, time.Now().UnixMilli(), ratePorMs, rateCapacidad, rateCoste, rateTTL.Milliseconds()).Int64Slice()
	if err != nil || len(res) != 2 || res[0] != 0 {
		t.Fatalf("la 6.ª debería ir bloqueada: res=%v err=%v", res, err)
	}
	if res[1] <= 0 {
		t.Errorf("el retry debería ser positivo: %v", res)
	}
	// a 0,5 tokens/s, 1,5 s no reciclan un token completo
	time.Sleep(1500 * time.Millisecond)
	res, err = cubeta.Run(ctx, rdb, []string{clave}, time.Now().UnixMilli(), ratePorMs, rateCapacidad, rateCoste, rateTTL.Milliseconds()).Int64Slice()
	if err != nil {
		t.Fatal(err)
	}
	if res[0] != 0 {
		t.Errorf("a 1,5 s no debería haber reciclado un token completo: %v", res)
	}
}

func TestIntegracionDeduplicacion(t *testing.T) {
	rdb, k := redisDePrueba(t)
	ctx := context.Background()
	clave := k.Of("chat", "dedup", "cid-test", "2026-01-01", "msg-1")
	_ = rdb.Del(ctx, clave).Err()
	t.Cleanup(func() { _ = rdb.Del(context.Background(), clave).Err() })

	primera, err := rdb.SetNX(ctx, clave, 1, dedupTTL).Result()
	if err != nil || !primera {
		t.Fatalf("primera vez: %v %v", primera, err)
	}
	repetida, err := rdb.SetNX(ctx, clave, 1, dedupTTL).Result()
	if err != nil || repetida {
		t.Fatalf("repetida debería dar false: %v %v", repetida, err)
	}
}

func TestIntegracionSalaLector(t *testing.T) {
	rdb, k := redisDePrueba(t)
	ctx := context.Background()
	a := &app.App{Redis: rdb, Keys: k, Log: slog.Default()}
	h := &hub{a: a, salas: map[salaID]*sala{}, streams: map[string]struct{}{}}
	id := salaID{cid: "cid-test", dia: "2026-01-01"}
	nombre := id.stream(k)
	_ = rdb.Del(ctx, nombre).Err()
	t.Cleanup(func() { _ = rdb.Del(context.Background(), nombre).Err() })

	sl := h.abrir(ctx, id)
	ch := sl.sub()

	// publicar en el stream: el lector único de la sala la reparte a los canales locales
	publicarHasta(t, rdb, nombre, item{T: "msg", Texto: "en vivo", Alias: "laura"}, ch)

	// historial: XRANGE devuelve la entrada con su id para el replay de Last-Event-ID
	msgs, err := rdb.XRangeN(ctx, nombre, "-", "+", 10).Result()
	if err != nil || len(msgs) == 0 {
		t.Fatalf("XRANGE: %v (%d entradas)", err, len(msgs))
	}
	if !after(msgs[0].ID, "0-0") {
		t.Errorf("id=%q", msgs[0].ID)
	}
	var it item
	raw, _ := msgs[0].Values["d"].(string)
	if json.Unmarshal([]byte(raw), &it) != nil || it.Texto != "en vivo" {
		t.Errorf("entrada del stream: %q %q", raw, it.Texto)
	}
}

func TestIntegracionSalaLenta(t *testing.T) {
	rdb, k := redisDePrueba(t)
	ctx := context.Background()
	a := &app.App{Redis: rdb, Keys: k, Log: slog.Default()}
	h := &hub{a: a, salas: map[salaID]*sala{}, streams: map[string]struct{}{}}
	id := salaID{cid: "cid-test", dia: "2026-01-02"}
	nombre := id.stream(k)
	_ = rdb.Del(ctx, nombre).Err()
	t.Cleanup(func() { _ = rdb.Del(context.Background(), nombre).Err() })

	sl := h.abrir(ctx, id)
	sano := sl.sub()
	lento := sl.sub()

	// calentar el lector (su primer XREAD "$" puede dejar atrás entradas anteriores) con un canal desechable:
	// al volver, la entrada ya está pendiente también en sano y lento
	calent := sl.sub()
	publicarHasta(t, rdb, nombre, item{T: "msg", Texto: "arranque"}, calent)
	sl.unsub(calent)
	// vaciar ambos (el lector queda en posición y sin nada en vuelo)
	for len(sano) > 0 {
		<-sano
	}
	for len(lento) > 0 {
		<-lento
	}

	// saturar ambos canales: la riada llena los dos búferes exactamente
	porEntrada, _ := json.Marshal(item{T: "msg", Texto: "tormenta"})
	for range subBuffer {
		if err := rdb.XAdd(ctx, &redis.XAddArgs{Stream: nombre, Values: map[string]any{"d": string(porEntrada)}}).Err(); err != nil {
			t.Fatal(err)
		}
	}
	deadline := time.After(15 * time.Second)
	for len(lento) < subBuffer {
		select {
		case <-deadline:
			t.Fatalf("el lector no satura la sala: len(lento)=%d", len(lento))
		case <-time.After(20 * time.Millisecond):
		}
	}

	// vaciar solo el sano (en línea, sin carreras): quedan subBuffer huecos libres
	for len(sano) > 0 {
		<-sano
	}

	// la gota final: el lento (lleno) se desconecta; el sano la recibe sin enterarse
	gota, _ := json.Marshal(item{T: "msg", Texto: "gota final"})
	if err := rdb.XAdd(ctx, &redis.XAddArgs{Stream: nombre, Values: map[string]any{"d": string(gota)}}).Err(); err != nil {
		t.Fatal(err)
	}
	for cerrado := false; !cerrado; {
		select {
		case _, ok := <-lento:
			if !ok {
				cerrado = true
			}
		case <-deadline:
			t.Fatal("el cliente lento no fue desconectado")
		case <-time.After(5 * time.Second):
			t.Fatal("tiempo agotado esperando el cierre del lento")
		}
	}
	select {
	case it, ok := <-sano:
		if !ok {
			t.Fatal("el sano fue desconectado por culpa del lento")
		}
		if it.it.Texto != "gota final" {
			t.Errorf("el sano esperaba la gota final, recibió %q", it.it.Texto)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("el sano dejó de recibir")
	}
	sl.unsub(sano)
}

func TestIntegracionInyectar(t *testing.T) {
	rdb, k := redisDePrueba(t)
	ctx := context.Background()
	a := &app.App{Redis: rdb, Keys: k, Log: slog.Default()}
	h := &hub{a: a, salas: map[salaID]*sala{}, streams: map[string]struct{}{}}
	s := &Svc{a: a, ctxRaiz: ctx, pod: "test", hub: h}
	id := salaID{cid: "cid-test", dia: "2026-01-03"}
	nombre := id.stream(k)
	_ = rdb.Del(ctx, nombre).Err()
	t.Cleanup(func() { _ = rdb.Del(context.Background(), nombre).Err() })

	// abrir primero: el lector arranca en "$" y solo ve entradas posteriores
	sl := h.abrir(ctx, id)
	ch := sl.sub()
	if err := s.inyectar(ctx, id.cid, id.dia, item{T: "banner", BannerID: "b1", Patrocinador: "ACME"}); err != nil {
		t.Fatal(err)
	}
	publicarHasta(t, rdb, nombre, item{T: "banner", BannerID: "b1", Patrocinador: "ACME"}, ch)
}
