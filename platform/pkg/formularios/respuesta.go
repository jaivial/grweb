package formularios

import (
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	reEmail    = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	reTelefono = regexp.MustCompile(`^\+?[0-9 ().-]{6,30}$`)
)

// Longitudes máximas de los campos de texto cuando el campo no fija validacion.maxLargo (salvaguarda).
var maxTexto = map[string]int{TipoTextoCorto: 200, TipoTextoLargo: 5000, TipoEmail: 254, TipoTelefono: 30, TipoFecha: 10}

// ValidarRespuesta comprueba las respuestas contra el esquema (§2). Devuelve solo los valores válidos (limpios) y un
// error por campo (errores, clave = id del campo). Las claves desconocidas se descartan; los valores vacíos no cuentan
// como respuesta. Con completa=true además exige los obligatorios y los mínimos (minLargo, mínimo de opciones).
// Los archivos se validan en forma (url https, nombre, tamaño, tipo); que la url sea del propio destinatario lo
// comprueba quien llama.
func ValidarRespuesta(e Esquema, datos map[string]any, completa bool) (map[string]any, map[string]string) {
	limpios := map[string]any{}
	errores := map[string]string{}
	for _, c := range e.Campos {
		if !AdmiteRespuesta(c.Tipo) {
			continue
		}
		v := datos[c.ID]
		if !respondido(c, v) {
			if completa && c.Obligatorio {
				errores[c.ID] = "Este campo es obligatorio."
			}
			continue
		}
		limpio, msg := valorValido(c, v)
		if msg == "" && completa {
			msg = minimo(c, limpio)
		}
		if msg != "" {
			errores[c.ID] = msg
			continue
		}
		limpios[c.ID] = limpio
	}
	return limpios, errores
}

// Porcentaje es los campos que admiten respuesta y tienen una, sobre el total de esos campos (redondeado). Un formulario
// sin campos que responder vale 100.
func Porcentaje(e Esquema, datos map[string]any) int {
	total, con := 0, 0
	for _, c := range e.Campos {
		if !AdmiteRespuesta(c.Tipo) {
			continue
		}
		total++
		if respondido(c, datos[c.ID]) {
			con++
		}
	}
	if total == 0 {
		return 100
	}
	return (con*100 + total/2) / total
}

// LeerFormEmail convierte el POST urlencoded del formulario incrustado en el email (nombres f_<campoId>) en datos. Solo
// trae las claves con un valor enviado: quien llama las mezcla sobre lo ya guardado, así que un email nunca borra una
// respuesta que no vuelve a traer. Las casillas y los si/no se incluyen solo si llegan; una lista, si llega al menos un
// valor; los numéricos se leen como número (si no lo son, queda el texto para que ValidarRespuesta lo rechace). Los
// archivos no llegan por email.
func LeerFormEmail(e Esquema, v url.Values) map[string]any {
	datos := map[string]any{}
	for _, c := range e.Campos {
		if !AdmiteRespuesta(c.Tipo) || c.Tipo == TipoArchivo {
			continue
		}
		vals := v["f_"+c.ID]
		if len(vals) == 0 {
			continue
		}
		switch c.Tipo {
		case TipoCasilla:
			datos[c.ID] = vals[0] == "on"
		case TipoSiNo:
			switch vals[0] {
			case "si":
				datos[c.ID] = true
			case "no":
				datos[c.ID] = false
			case "":
			default:
				datos[c.ID] = vals[0]
			}
		case TipoCasillas, TipoSeleccionMultiple:
			lista := []any{}
			for _, x := range vals {
				if x != "" {
					lista = append(lista, x)
				}
			}
			if len(lista) > 0 {
				datos[c.ID] = lista
			}
		case TipoNumero, TipoEscala, TipoValoracion:
			txt := strings.TrimSpace(vals[0])
			if txt == "" {
				continue
			}
			if f, err := strconv.ParseFloat(txt, 64); err == nil {
				datos[c.ID] = f
			} else {
				datos[c.ID] = vals[0]
			}
		default:
			if strings.TrimSpace(vals[0]) != "" {
				datos[c.ID] = vals[0]
			}
		}
	}
	return datos
}

// respondido dice si el valor cuenta como respuesta: texto no vacío, número, lista no vacía, archivos, o un boolean
// (en la casilla solo cuenta el «sí»; en si_no también el «no»).
func respondido(c Campo, v any) bool {
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x) != ""
	case bool:
		return c.Tipo != TipoCasilla || x
	case float64, float32, int, int64:
		return true
	case []any:
		return len(x) > 0
	case []string:
		return len(x) > 0
	case []map[string]any:
		return len(x) > 0
	}
	return false
}

// valorValido comprueba el tipo y el rango de un valor respondido y devuelve su forma limpia, o el mensaje de error.
func valorValido(c Campo, v any) (any, string) {
	if textuales[c.Tipo] {
		return textoValido(c, v)
	}
	switch c.Tipo {
	case TipoNumero, TipoEscala, TipoValoracion:
		return numeroValido(c, v)
	case TipoOpcionUnica, TipoDesplegable, TipoDeslizador:
		s, ok := v.(string)
		if !ok || !tieneOpcion(c, s) {
			return nil, "Elige una opción válida."
		}
		return s, ""
	case TipoCasillas, TipoSeleccionMultiple:
		return listaValida(c, v)
	case TipoCasilla, TipoSiNo:
		b, ok := v.(bool)
		if !ok {
			return nil, "Respuesta no válida."
		}
		return b, ""
	case TipoArchivo:
		return archivosValidos(c, v)
	}
	return nil, "Respuesta no válida."
}

func textoValido(c Campo, v any) (any, string) {
	s, ok := v.(string)
	if !ok {
		return nil, "Respuesta no válida."
	}
	s = strings.TrimSpace(s)
	max := maxTexto[c.Tipo]
	if c.Validacion.MaxLargo != nil {
		max = *c.Validacion.MaxLargo
	}
	if utf8.RuneCountInString(s) > max {
		return nil, fmt.Sprintf("Máximo %d caracteres.", max)
	}
	switch c.Tipo {
	case TipoEmail:
		if !reEmail.MatchString(s) {
			return nil, "Escribe un email válido."
		}
	case TipoTelefono:
		if !reTelefono.MatchString(s) {
			return nil, "Escribe un teléfono válido."
		}
	case TipoFecha:
		if _, err := time.Parse("2006-01-02", s); err != nil {
			return nil, "Fecha no válida (AAAA-MM-DD)."
		}
	case TipoTextoCorto, TipoTextoLargo:
		if c.Validacion.Patron != "" {
			re, err := regexp.Compile(c.Validacion.Patron)
			if err != nil {
				return nil, "Patrón no válido."
			}
			if !re.MatchString(s) {
				return nil, "Formato no válido."
			}
		}
	}
	return s, ""
}

func numeroValido(c Campo, v any) (any, string) {
	f, ok := numero(v)
	if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
		return nil, "Escribe un número."
	}
	switch c.Tipo {
	case TipoNumero:
		if c.Min != nil && f < *c.Min {
			return nil, fmt.Sprintf("El valor mínimo es %s.", fmtNum(*c.Min))
		}
		if c.Max != nil && f > *c.Max {
			return nil, fmt.Sprintf("El valor máximo es %s.", fmtNum(*c.Max))
		}
	case TipoEscala:
		mn, mx := valorF(c.Min, 0), valorF(c.Max, 10)
		if f != math.Trunc(f) || f < mn || f > mx {
			return nil, fmt.Sprintf("Elige un valor entre %s y %s.", fmtNum(mn), fmtNum(mx))
		}
	case TipoValoracion:
		mx := valorF(c.Max, DefaultValoracion)
		if f != math.Trunc(f) || f < 1 || f > mx {
			return nil, fmt.Sprintf("Elige entre 1 y %s estrellas.", fmtNum(mx))
		}
	}
	return f, ""
}

func listaValida(c Campo, v any) (any, string) {
	items, ok := listaTextos(v)
	if !ok {
		return nil, "Respuesta no válida."
	}
	vistos := map[string]bool{}
	for _, s := range items {
		if !tieneOpcion(c, s) {
			return nil, "Hay una opción no válida."
		}
		if vistos[s] {
			return nil, "Hay una opción repetida."
		}
		vistos[s] = true
	}
	if c.Max != nil && len(items) > int(*c.Max) {
		return nil, fmt.Sprintf("Marca como máximo %d opciones.", int(*c.Max))
	}
	return items, ""
}

func archivosValidos(c Campo, v any) (any, string) {
	lista, ok := v.([]any)
	if !ok {
		return nil, "Respuesta no válida."
	}
	max := DefaultArchivosMax
	if c.Archivo != nil && c.Archivo.MaxArchivos > 0 {
		max = c.Archivo.MaxArchivos
	}
	if len(lista) > max {
		return nil, fmt.Sprintf("Puedes subir como máximo %d archivo(s).", max)
	}
	out := make([]any, 0, len(lista))
	for _, it := range lista {
		m, ok := it.(map[string]any)
		if !ok {
			return nil, "Archivo no válido."
		}
		u, _ := m["url"].(string)
		nombre, _ := m["nombre"].(string)
		tipo, _ := m["tipo"].(string)
		tamano, _ := numero(m["tamano"])
		if !strings.HasPrefix(u, "https://") || len(u) > 2000 || utf8.RuneCountInString(nombre) > 255 || tamano < 0 {
			return nil, "Archivo no válido."
		}
		item := map[string]any{"url": u, "nombre": nombre, "tamano": tamano, "tipo": tipo}
		if id, ok := m["id"].(string); ok && id != "" {
			item["id"] = id
		}
		out = append(out, item)
	}
	return out, ""
}

// minimo: los mínimos que solo se exigen al completar (minLargo y mínimo de opciones marcadas).
func minimo(c Campo, v any) string {
	switch x := v.(type) {
	case string:
		if c.Validacion.MinLargo != nil && utf8.RuneCountInString(x) < *c.Validacion.MinLargo {
			return fmt.Sprintf("Escribe al menos %d caracteres.", *c.Validacion.MinLargo)
		}
	case []any:
		if c.Min != nil && len(x) < int(*c.Min) {
			return fmt.Sprintf("Marca al menos %d opciones.", int(*c.Min))
		}
	case []string:
		if c.Min != nil && len(x) < int(*c.Min) {
			return fmt.Sprintf("Marca al menos %d opciones.", int(*c.Min))
		}
	}
	return ""
}

func tieneOpcion(c Campo, id string) bool {
	for _, o := range c.Opciones {
		if o.ID == id {
			return true
		}
	}
	return false
}

// listaTextos acepta []string o []any de strings (lo que llega de JSON).
func listaTextos(v any) ([]string, bool) {
	switch x := v.(type) {
	case []string:
		return x, true
	case []any:
		out := make([]string, 0, len(x))
		for _, it := range x {
			s, ok := it.(string)
			if !ok {
				return nil, false
			}
			out = append(out, s)
		}
		return out, true
	}
	return nil, false
}

// numero lee un número de JSON (float64) o de Go (int, int64, float32).
func numero(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	}
	return 0, false
}

func valorF(f *float64, def float64) float64 {
	if f == nil {
		return def
	}
	return *f
}

func fmtNum(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }
