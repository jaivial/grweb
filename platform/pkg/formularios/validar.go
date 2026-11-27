package formularios

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	reColor    = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
	reCampoID  = regexp.MustCompile(`^c_[a-z0-9]{6,10}$`)
	reOpcionID = regexp.MustCompile(`^o_[a-z0-9]{1,10}$`)
	reMime     = regexp.MustCompile(`^[a-z]+/([a-z0-9.+-]+|\*)$`)
)

// ErrEsquema lista los problemas de un esquema, en español, para devolverlos al editor.
type ErrEsquema struct {
	Problemas []string
}

func (e *ErrEsquema) Error() string {
	return "El formulario no es válido: " + strings.Join(e.Problemas, "; ")
}

// Validar comprueba todos los límites de §2 (ids, longitudes, colores, enums, rangos, archivos). Devuelve *ErrEsquema
// con todos los problemas, o nil. Conviene llamar a Normalizar antes.
func Validar(e Esquema) error {
	v := &validador{}
	v.ajustes(e.Ajustes)
	if n := len(e.Campos); n < 1 || n > 80 {
		v.add("el formulario debe tener entre 1 y 80 campos (tiene %d)", n)
	}
	ids := map[string]bool{}
	for i, c := range e.Campos {
		v.campo(i, c, ids)
	}
	if len(v.p) > 0 {
		return &ErrEsquema{Problemas: v.p}
	}
	return nil
}

type validador struct {
	p []string
}

func (v *validador) add(format string, a ...any) {
	v.p = append(v.p, fmt.Sprintf(format, a...))
}

func (v *validador) ajustes(a Ajustes) {
	if t := strings.TrimSpace(a.Titulo); t == "" {
		v.add("el título del formulario es obligatorio")
	} else if utf8.RuneCountInString(t) > 300 {
		v.add("el título no puede tener más de 300 caracteres")
	}
	if utf8.RuneCountInString(a.Descripcion) > 2000 {
		v.add("la descripción no puede tener más de 2000 caracteres")
	}
	if strings.TrimSpace(a.BotonEnviar) == "" {
		v.add("el texto del botón de enviar es obligatorio")
	}
	t := a.Tema
	colores := []struct{ nombre, valor string }{{"acento", t.Acento}, {"fondo", t.Fondo}, {"superficie", t.Superficie}, {"texto", t.Texto}}
	for _, c := range colores {
		if c.valor != "" && !reColor.MatchString(c.valor) {
			v.add("el color del tema «%s» debe tener formato #RRGGBB", c.nombre)
		}
	}
	if t.Radio < 0 || t.Radio > 24 {
		v.add("el radio del tema debe estar entre 0 y 24")
	}
	if !enumOK(t.Fuente, "sistema", "serif", "mono") {
		v.add("la fuente del tema no es válida")
	}
	if !enumOK(t.Densidad, "compacta", "normal", "amplia") {
		v.add("la densidad del tema no es válida")
	}
}

func (v *validador) campo(i int, c Campo, ids map[string]bool) {
	nom := nombreCampo(i, c)
	switch {
	case !reCampoID.MatchString(c.ID):
		v.add("%s: el id «%s» no tiene el formato c_ seguido de 6 a 10 caracteres [a-z0-9]", nom, c.ID)
	case ids[c.ID]:
		v.add("%s: el id «%s» está repetido", nom, c.ID)
	}
	ids[c.ID] = true
	if !Tipos[c.Tipo] {
		v.add("%s: el tipo «%s» no es válido", nom, c.Tipo)
		return
	}
	if !enumOK(c.Ancho, "completo", "mitad") {
		v.add("%s: el ancho debe ser completo o mitad", nom)
	}
	if c.Tipo != TipoSeparador && strings.TrimSpace(c.Etiqueta) == "" {
		v.add("%s: falta la etiqueta", nom)
	}
	if utf8.RuneCountInString(c.Etiqueta) > 300 {
		v.add("%s: la etiqueta no puede tener más de 300 caracteres", nom)
	}
	if utf8.RuneCountInString(c.Ayuda) > 500 {
		v.add("%s: la ayuda no puede tener más de 500 caracteres", nom)
	}
	v.estilo(nom, c.Estilo)

	if conOpciones[c.Tipo] {
		v.opciones(nom, c.Opciones)
	}
	switch c.Tipo {
	case TipoCasillas, TipoSeleccionMultiple:
		v.cuentas(nom, c)
	case TipoNumero:
		v.rangoNumero(nom, c)
	case TipoEscala:
		v.escala(nom, c)
	case TipoValoracion:
		if m, ok := entero(c.Max, DefaultValoracion); !ok || m < 3 || m > 10 {
			v.add("%s: la valoración debe tener entre 3 y 10 estrellas", nom)
		}
	case TipoImagen:
		if !strings.HasPrefix(c.Imagen, "https://") || len(c.Imagen) > 2000 {
			v.add("%s: la imagen debe ser una URL https", nom)
		}
		if utf8.RuneCountInString(c.Alt) > 300 {
			v.add("%s: el texto alternativo no puede tener más de 300 caracteres", nom)
		}
	case TipoArchivo:
		v.archivo(nom, c.Archivo)
	case TipoTextoCorto, TipoTextoLargo, TipoEmail, TipoTelefono, TipoFecha:
		v.textos(nom, c.Validacion)
	}
}

func (v *validador) estilo(nom string, s Estilo) {
	if !enumOK(s.Alinear, "izquierda", "centro", "derecha") {
		v.add("%s: la alineación no es válida", nom)
	}
	if !enumOK(s.Tamano, "s", "m", "l") {
		v.add("%s: el tamaño no es válido", nom)
	}
	if s.Color != "" && !reColor.MatchString(s.Color) {
		v.add("%s: el color «color» debe tener formato #RRGGBB", nom)
	}
	if s.Fondo != "" && !reColor.MatchString(s.Fondo) {
		v.add("%s: el color «fondo» debe tener formato #RRGGBB", nom)
	}
}

func (v *validador) opciones(nom string, ops []Opcion) {
	if len(ops) < 2 || len(ops) > 30 {
		v.add("%s: debe tener entre 2 y 30 opciones (tiene %d)", nom, len(ops))
	}
	vistos := map[string]bool{}
	for _, o := range ops {
		switch {
		case !reOpcionID.MatchString(o.ID):
			v.add("%s: el id de opción «%s» no tiene el formato o_ seguido de 1 a 10 caracteres [a-z0-9]", nom, o.ID)
		case vistos[o.ID]:
			v.add("%s: el id de opción «%s» está repetido", nom, o.ID)
		}
		vistos[o.ID] = true
		if t := strings.TrimSpace(o.Texto); t == "" || utf8.RuneCountInString(t) > 120 {
			v.add("%s: cada opción necesita un texto de 1 a 120 caracteres", nom)
		}
	}
}

// cuentas: mínimo y máximo de opciones marcadas (casillas y selección múltiple).
func (v *validador) cuentas(nom string, c Campo) {
	n := len(c.Opciones)
	mn, okMin := entero(c.Min, 0)
	mx, okMax := entero(c.Max, n)
	if !okMin || mn < 0 || mn > n {
		v.add("%s: el mínimo de opciones marcadas debe estar entre 0 y %d", nom, n)
	}
	if !okMax || mx < 1 || mx > n {
		v.add("%s: el máximo de opciones marcadas debe estar entre 1 y %d", nom, n)
	}
	if okMin && okMax && mn > mx {
		v.add("%s: el mínimo de opciones marcadas no puede superar al máximo", nom)
	}
}

func (v *validador) rangoNumero(nom string, c Campo) {
	for _, f := range []*float64{c.Min, c.Max, c.Paso} {
		if f != nil && (math.IsNaN(*f) || math.IsInf(*f, 0)) {
			v.add("%s: los límites deben ser números finitos", nom)
			return
		}
	}
	if c.Min != nil && c.Max != nil && *c.Min > *c.Max {
		v.add("%s: el mínimo no puede superar al máximo", nom)
	}
	if c.Paso != nil && *c.Paso <= 0 {
		v.add("%s: el paso debe ser mayor que 0", nom)
	}
}

func (v *validador) escala(nom string, c Campo) {
	mn, okMin := entero(c.Min, 0)
	mx, okMax := entero(c.Max, 10)
	if !okMin || mn < 0 || mn > 10 {
		v.add("%s: el valor mínimo de la escala debe estar entre 0 y 10", nom)
	}
	if !okMax || mx < 2 || mx > 10 {
		v.add("%s: el valor máximo de la escala debe estar entre 2 y 10", nom)
	}
	if okMin && okMax && mx <= mn {
		v.add("%s: el máximo de la escala debe ser mayor que el mínimo", nom)
	}
	if c.Paso != nil && (*c.Paso <= 0 || okMin && okMax && *c.Paso > float64(mx-mn)) {
		v.add("%s: el paso de la escala no es válido", nom)
	}
}

func (v *validador) archivo(nom string, a *ArchivoCfg) {
	if a == nil {
		v.add("%s: falta la configuración del archivo", nom)
		return
	}
	if len(a.Tipos) == 0 {
		v.add("%s: indica al menos un tipo de archivo", nom)
	}
	for _, t := range a.Tipos {
		if !reMime.MatchString(t) {
			v.add("%s: el tipo de archivo «%s» no es válido", nom, t)
		}
	}
	if a.MaxMb < 1 || a.MaxMb > 20 {
		v.add("%s: el tamaño máximo debe estar entre 1 y 20 MB", nom)
	}
	if a.MaxArchivos < 1 || a.MaxArchivos > 5 {
		v.add("%s: el número máximo de archivos debe estar entre 1 y 5", nom)
	}
}

func (v *validador) textos(nom string, val Validacion) {
	if val.MinLargo != nil && *val.MinLargo < 0 {
		v.add("%s: el largo mínimo no puede ser negativo", nom)
	}
	if val.MaxLargo != nil && *val.MaxLargo < 0 {
		v.add("%s: el largo máximo no puede ser negativo", nom)
	}
	if val.MinLargo != nil && val.MaxLargo != nil && *val.MinLargo > *val.MaxLargo {
		v.add("%s: el largo mínimo no puede superar al máximo", nom)
	}
	if val.Patron != "" {
		if len(val.Patron) > 200 {
			v.add("%s: el patrón no puede tener más de 200 caracteres", nom)
		} else if _, err := regexp.Compile(val.Patron); err != nil {
			v.add("%s: el patrón no es una expresión regular válida", nom)
		}
	}
}

// entero lee un límite entero: def si falta; ok=false si no es un entero finito.
func entero(f *float64, def int) (int, bool) {
	if f == nil {
		return def, true
	}
	if math.IsNaN(*f) || math.IsInf(*f, 0) || *f != math.Trunc(*f) {
		return 0, false
	}
	return int(*f), true
}

// enumOK acepta vacío (lo rellena Normalizar) o uno de los valores permitidos.
func enumOK(v string, permitidos ...string) bool {
	if v == "" {
		return true
	}
	for _, p := range permitidos {
		if v == p {
			return true
		}
	}
	return false
}

func nombreCampo(i int, c Campo) string {
	if t := strings.TrimSpace(c.Etiqueta); t != "" {
		return fmt.Sprintf("campo %d («%s»)", i+1, t)
	}
	return fmt.Sprintf("campo %d", i+1)
}
