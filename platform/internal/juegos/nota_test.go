package juegos

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func intentos(resultados ...string) []MarcadorIntento {
	out := make([]MarcadorIntento, len(resultados))
	for i, r := range resultados {
		out[i] = MarcadorIntento{N: i + 1, Peso: 100, Resultado: r}
	}
	return out
}

// The three examples approved with the design (BIZ-143): good 9,8 · average with nulls 4,5 · bomb-out 0,0.
func TestCalcularNota(t *testing.T) {
	p := puntosPorDefecto()
	total := 500.0
	v, n := "valido", "nulo"
	casos := []struct {
		nombre string
		ma     MarcadorAtleta
		ex     notaExtras
		nota   float64
		tiene  bool
	}{
		{"bueno: 9/9, 1.ª, récord de competición y total", MarcadorAtleta{
			Intentos:        map[string][]MarcadorIntento{"sq": intentos(v, v, v), "bp": intentos(v, v, v), "dl": intentos(v, v, v)},
			PuestoCategoria: 1, Total: &total, Terminado: true,
		}, notaExtras{RecordPersonal: true, RecordCompeticion: true}, 9.8, true}, // 5 + 3 + (0,5 + 1,0 + 0,3); el récord sustituye al PR
		{"medio: 6 válidos, 3 nulos (uno por movimiento), 3.º y total", MarcadorAtleta{
			Intentos:        map[string][]MarcadorIntento{"sq": intentos(v, v, n), "bp": intentos(v, n, v), "dl": intentos(n, v, v)},
			PuestoCategoria: 3, Total: &total, Terminado: true,
		}, notaExtras{}, 4.53, true}, // 3,33 + 1,8 + 0,3 − 0,9
		{"blanqueo: 3 nulos en peso muerto anulan todo", MarcadorAtleta{
			Intentos:        map[string][]MarcadorIntento{"sq": intentos(v, v, v), "bp": intentos(v, v, n), "dl": intentos(n, n, n)},
			PuestoCategoria: 5, Blanqueo: map[string]bool{"dl": true}, Terminado: true,
		}, notaExtras{RecordPersonal: true}, 0, true},
		{"sin intentos juzgados no hay nota", MarcadorAtleta{
			Intentos: map[string][]MarcadorIntento{"sq": intentos("pendiente")},
		}, notaExtras{}, 0, false},
		{"solo nulos: acotada a 0", MarcadorAtleta{
			Intentos: map[string][]MarcadorIntento{"sq": intentos(n, n)},
		}, notaExtras{}, 0, true},
		{"retirada: intentos y nulos, sin puesto ni total", MarcadorAtleta{
			Intentos: map[string][]MarcadorIntento{"sq": intentos(v, v, v), "bp": intentos(v, n, "renuncia")},
		}, notaExtras{}, 1.92, true}, // 5 × 4/9 − 0,3
		{"récord personal sin récord de competición", MarcadorAtleta{
			Intentos:        map[string][]MarcadorIntento{"sq": intentos(v, v, v), "bp": intentos(v, v, v), "dl": intentos(v, v, v)},
			PuestoCategoria: 2, Total: &total, Terminado: true,
		}, notaExtras{RecordPersonal: true}, 8.8, true}, // 5 + 2,4 + (0,5 + 0,6 + 0,3)
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			got := calcularNota(p, &c.ma, c.ex)
			if got.Nota != c.nota || got.TieneNota != c.tiene {
				t.Fatalf("nota = %v (tiene %v); quería %v (tiene %v). Desglose: %+v", got.Nota, got.TieneNota, c.nota, c.tiene, got.Desglose)
			}
			if got.Nota < 0 || got.Nota > 10 {
				t.Fatalf("nota fuera de 0–10: %v", got.Nota)
			}
		})
	}
	// The bonus (C) never passes 2,0 whatever the configured weights say.
	p.Pleno, p.RecordCompeticion, p.Total = 1.5, 1.5, 1.5
	ma := casos[0].ma
	ma.PuestoCategoria = 0
	if got := calcularNota(p, &ma, notaExtras{RecordCompeticion: true}); got.Nota != 7 {
		t.Fatalf("nota con bonus desbordado = %v; quería 7 (5 + tope 2)", got.Nota)
	}
}

// The grade of a lineup is the average of its 5 athletes; provisional while somebody has not lifted yet.
func TestNotaAlineacion(t *testing.T) {
	con := func(v float64) notaAtleta { return notaAtleta{Nota: v, TieneNota: true} }
	sin := notaAtleta{}
	casos := []struct {
		nombre  string
		notas   []notaAtleta
		huecos  int
		final   bool
		media   float64
		conNota int
	}{
		{"cinco con nota", []notaAtleta{con(9.8), con(4.5), con(0), con(6), con(7.2)}, 0, false, 5.5, 5},
		{"provisional: dos sin competir no cuentan", []notaAtleta{con(8), con(6), con(7), sin, sin}, 0, false, 7, 3},
		{"final: quien no compitió (DNS) cuenta 0", []notaAtleta{con(8), con(6), con(7), sin, sin}, 0, true, 4.2, 3},
		{"hueco vacío cuenta 0 también en provisional", []notaAtleta{con(8), con(6)}, 3, false, 2.8, 2},
		{"alineación vacía", nil, 5, true, 0, 0},
		{"nadie ha competido", []notaAtleta{sin, sin, sin, sin, sin}, 0, false, 0, 0},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			media, conNota := notaAlineacion(c.notas, c.huecos, c.final)
			if media != c.media || conNota != c.conNota {
				t.Fatalf("media = %v (%d con nota); quería %v (%d)", media, conNota, c.media, c.conNota)
			}
		})
	}
}

// Seats of a room: floor(athletes ÷ 5), between 2 and 10; under 10 athletes no room can be created.
func TestPlazasSala(t *testing.T) {
	casos := map[int]struct {
		plazas int
		ok     bool
	}{0: {0, false}, 9: {1, false}, 10: {2, true}, 14: {2, true}, 42: {8, true}, 50: {10, true}, 120: {10, true}}
	for atletas, c := range casos {
		if p, ok := plazasSala(atletas, 5); p != c.plazas || ok != c.ok {
			t.Fatalf("plazasSala(%d) = (%d, %v); quería (%d, %v)", atletas, p, ok, c.plazas, c.ok)
		}
	}
}

// Clausulazos close when the last session of the day starts; without a published schedule they stay blocked. The
// first session starts the rooms.
func TestHorario(t *testing.T) {
	base := time.Date(2026, 11, 14, 9, 0, 0, 0, time.UTC)
	snap := []snapDia{{Fecha: "2026-11-14", Flights: []struct {
		Inicio time.Time `json:"inicio"`
	}{{Inicio: base.Add(3 * time.Hour)}, {Inicio: base}, {Inicio: base.Add(8 * time.Hour)}}}, {Fecha: "2026-11-15"}}
	h := horarioDeSnapshot(snap, "2026-11-14")
	if !h.OK || !h.Inicio.Equal(base) || !h.UltimaSesion.Equal(base.Add(8*time.Hour)) {
		t.Fatalf("horario = %+v", h)
	}
	if c := h.clausulazo(base.Add(8*time.Hour - time.Second)); !c.Abierto || c.Cierre == nil || c.problema() != nil {
		t.Fatalf("un segundo antes de la última sesión debía estar abierto: %+v", c)
	}
	if c := h.clausulazo(base.Add(8 * time.Hour)); c.Abierto || c.Motivo != "ultima_sesion" || codigoDe(t, c.problema()) != "CLAUSULAZO_CERRADO" {
		t.Fatalf("al empezar la última sesión debía cerrarse: %+v", c)
	}
	for _, dia := range []string{"2026-11-15", "2026-11-16"} { // a day without flights, a day that is not in the schedule
		if c := horarioDeSnapshot(snap, dia).clausulazo(base); c.Abierto || c.Motivo != "sin_horario" || c.Cierre != nil {
			t.Fatalf("sin horario (%s) debía estar bloqueado: %+v", dia, c)
		}
	}
	j := jornada{ID: uuid.Must(uuid.NewV7()), Estado: "abierta"}
	if h.empezado(j, base.Add(-time.Second)) || !h.empezado(j, base) {
		t.Fatal("la jornada empieza con la primera sesión")
	}
	if (horarioDia{}).empezado(j, base) {
		t.Fatal("sin horario la jornada no empieza sola")
	}
	j.Estado = "en_juego"
	if !(horarioDia{}).empezado(j, base) {
		t.Fatal("una jornada en_juego ya ha empezado aunque no haya horario")
	}
}

func TestNombreSala(t *testing.T) {
	if n, err := validarNombreSala("  Los   Cuervos de Gonzalo "); err != nil || n != "Los Cuervos de Gonzalo" {
		t.Fatalf("nombre limpio = %q, %v", n, err)
	}
	if normalizarNombre("Ñú  ÁRBOL") != "ñu arbol" {
		t.Fatalf("normalizarNombre = %q", normalizarNombre("Ñú  ÁRBOL"))
	}
	for _, malo := range []string{"ab", "una sala con un nombre demasiado largo x", "sala <script>", "los p.u.t.o.s amos", "Admin oficial"} {
		if _, err := validarNombreSala(malo); codigoDe(t, err) != "NOMBRE_NO_VALIDO" {
			t.Fatalf("validarNombreSala(%q) = %v; quería NOMBRE_NO_VALIDO", malo, err)
		}
	}
}
