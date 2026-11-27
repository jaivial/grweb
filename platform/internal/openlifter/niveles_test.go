package openlifter

import (
	"reflect"
	"testing"
)

func TestNivelesDias(t *testing.T) {
	for _, c := range []struct {
		nombre string
		niv    niveles
		nivel  string
		dias   []int
		dia    int
	}{
		{"un nivel en dos días", niveles{1: "aep2", 2: "aep2"}, "aep2", []int{1, 2}, 1},
		{"un nivel por día (el primero)", niveles{1: "aep2", 2: "aep3"}, "aep2", []int{1}, 1},
		{"un nivel por día (el segundo)", niveles{1: "aep2", 2: "aep3"}, "aep3", []int{2}, 2},
		{"nivel que no está en el meet", niveles{1: "aep2", 2: "aep2"}, "aep3", nil, 0},
		{"meet sin niveles", niveles{}, "aep2", nil, 0},
	} {
		if ds := c.niv.dias(c.nivel); !reflect.DeepEqual(ds, c.dias) {
			t.Errorf("%s: dias(%q) = %v, quiero %v", c.nombre, c.nivel, ds, c.dias)
		}
		// el día es el más bajo con ese nivel, aunque el mapa se recorra en otro orden
		if d := c.niv.dia(c.nivel); d != c.dia {
			t.Errorf("%s: dia(%q) = %d, quiero %d", c.nombre, c.nivel, d, c.dia)
		}
	}
}

func TestNivelesTodos(t *testing.T) {
	for _, c := range []struct {
		nombre string
		niv    niveles
		mesa   string
		quiero []string
	}{
		{"un nivel en dos días, una vez", niveles{2: "aep2", 1: "aep2"}, "aep2 · AEP 2 - GR STRENGTH CUP II · 2026-12-18", []string{"aep2"}},
		{"un nivel por día, en orden de día", niveles{2: "aep3", 1: "aep2"}, "otra mesa", []string{"aep2", "aep3"}},
		{"mesa de un nivel", niveles{}, "aep3 · AEP 3 - GR STRENGTH CUP II · 2026-12-20", []string{"aep3"}},
		{"mesa sin nivel", niveles{}, "otra mesa", nil},
	} {
		if lvls := c.niv.todos(c.mesa); !reflect.DeepEqual(lvls, c.quiero) {
			t.Errorf("%s: todos(%q) = %v, quiero %v", c.nombre, c.mesa, lvls, c.quiero)
		}
	}
}
