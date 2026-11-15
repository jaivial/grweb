package patrocinio

import (
	"testing"

	"github.com/google/uuid"
)

func ids(n int) []uuid.UUID {
	out := make([]uuid.UUID, n)
	for i := range out {
		out[i] = uuid.Must(uuid.NewV7())
	}
	return out
}

// tica runs one tic: refreshes today's appearances, calls Elegir, records the appearance and returns the chosen
// id with the state to use next.
func tica(banners []BannerSel, estado Estado, apariciones map[uuid.UUID]int) (uuid.UUID, Estado) {
	for i := range banners {
		banners[i].Apariciones = apariciones[banners[i].ID]
	}
	id, nuevo := Elegir(banners, estado)
	apariciones[id]++
	return id, nuevo
}

// TestElegirPendientes: everyone out at least once before repeating (bronze included), tier and orden first.
func TestElegirPendientes(t *testing.T) {
	u := ids(6)
	banners := []BannerSel{
		{ID: u[0], Tier: "oro", Orden: 2, Peso: 3},
		{ID: u[1], Tier: "oro", Orden: 1, Peso: 3},
		{ID: u[2], Tier: "oro", Orden: 3, Peso: 3},
		{ID: u[3], Tier: "plata", Orden: 1, Peso: 2},
		{ID: u[4], Tier: "plata", Orden: 2, Peso: 2},
		{ID: u[5], Tier: "bronce", Orden: 1, Peso: 1},
	}
	estado := Estado{}
	apariciones := map[uuid.UUID]int{}
	salieron := map[uuid.UUID]bool{}
	orden := []uuid.UUID{}
	for i := 0; i < 6; i++ {
		id, st := tica(banners, estado, apariciones)
		estado = st
		if id == uuid.Nil {
			t.Fatalf("tic %d: nada elegido", i)
		}
		if salieron[id] {
			t.Fatalf("tic %d: %v repite antes de que salgan todos", i, id)
		}
		salieron[id] = true
		orden = append(orden, id)
	}
	// Order of the first round: oro by orden, plata by orden, bronce.
	want := []uuid.UUID{u[1], u[0], u[2], u[3], u[4], u[5]}
	for i := range want {
		if orden[i] != want[i] {
			t.Fatalf("tic %d: %v, quería %v", i, orden[i], want[i])
		}
	}
	if len(salieron) != 6 {
		t.Fatalf("quería 6 distintos, hubo %d", len(salieron))
	}
	// After the first full round the tier weights rule: 600 tics of 3 oro × 3 + 2 plata × 2 + 1 bronce (total 14)
	// come out 9:4:1 by tier (385.7 : 171.4 : 42.9).
	cuenta := map[string]int{}
	for i := 0; i < 600; i++ {
		id, st := tica(banners, estado, apariciones)
		estado = st
		for _, b := range banners {
			if b.ID == id {
				cuenta[b.Tier]++
			}
		}
	}
	if d := cuenta["oro"] - 386; d < -3 || d > 3 {
		t.Fatalf("oro: %d apariciones de 600, quería 386±3 (9/14)", cuenta["oro"])
	}
	if d := cuenta["plata"] - 171; d < -3 || d > 3 {
		t.Fatalf("plata: %d apariciones de 600, quería 171±3 (4/14)", cuenta["plata"])
	}
	if d := cuenta["bronce"] - 43; d < -3 || d > 3 {
		t.Fatalf("bronce: %d apariciones de 600, quería 43±3 (1/14)", cuenta["bronce"])
	}
}

// TestElegirProporciones: after the initial round, 600 tics of one banner per tier with pesos 3:2:1 come out
// 300:200:100 (±1).
func TestElegirProporciones(t *testing.T) {
	u := ids(3)
	banners := []BannerSel{
		{ID: u[0], Tier: "oro", Peso: 3},
		{ID: u[1], Tier: "plata", Peso: 2},
		{ID: u[2], Tier: "bronce", Peso: 1},
	}
	estado := Estado{}
	apariciones := map[uuid.UUID]int{}
	// Ronda inicial: everyone once (pendientes, by tier).
	for i := 0; i < 3; i++ {
		id, st := tica(banners, estado, apariciones)
		estado = st
		if id == uuid.Nil || apariciones[id] != 1 {
			t.Fatalf("ronda inicial tic %d: elegido %v, apariciones %d", i, id, apariciones[id])
		}
	}
	cuenta := map[uuid.UUID]int{}
	for i := 0; i < 600; i++ {
		id, st := tica(banners, estado, apariciones)
		estado = st
		if id == uuid.Nil {
			t.Fatalf("tic %d: nada elegido", i)
		}
		cuenta[id]++
	}
	const tol = 1
	if d := cuenta[u[0]] - 300; d < -tol || d > tol {
		t.Fatalf("oro: %d apariciones de 600, quería 300±1", cuenta[u[0]])
	}
	if d := cuenta[u[1]] - 200; d < -tol || d > tol {
		t.Fatalf("plata: %d apariciones de 600, quería 200±1", cuenta[u[1]])
	}
	if d := cuenta[u[2]] - 100; d < -tol || d > tol {
		t.Fatalf("bronce: %d apariciones de 600, quería 100±1", cuenta[u[2]])
	}
}

// TestElegirVacioYEstado: nothing to show or weights at zero must not invent a banner, and the returned state
// drops banners that are no longer candidates.
func TestElegirVacioYEstado(t *testing.T) {
	if id, estado := Elegir(nil, Estado{}); id != uuid.Nil || len(estado) != 0 {
		t.Fatalf("sin banners: %v / %v", id, estado)
	}
	u := ids(2)
	banners := []BannerSel{{ID: u[0], Tier: "oro", Peso: 0, Apariciones: 1}, {ID: u[1], Tier: "plata", Peso: 0, Apariciones: 1}}
	if id, _ := Elegir(banners, Estado{}); id != uuid.Nil {
		t.Fatalf("con todos los pesos a 0 no debe elegir: %v", id)
	}
	// A banner that disappears loses its state.
	viejo := Estado{u[0]: 3, u[1]: 2, uuid.Must(uuid.NewV7()): 9}
	_, nuevo := Elegir([]BannerSel{{ID: u[0], Tier: "oro", Peso: 3, Apariciones: 1}}, viejo)
	if len(nuevo) != 1 || nuevo[u[0]] != 3 {
		t.Fatalf("estado podado: %v", nuevo)
	}
}
