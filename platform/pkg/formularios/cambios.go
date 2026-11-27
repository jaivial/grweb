package formularios

import "fmt"

// RompeRespuestas dice qué cambio de un esquema que ya tiene respuestas las dejaría sin sentido: un campo que
// desaparece, un campo que cambia de tipo, o una opción que desaparece de un campo de elección. Las respuestas se guardan
// por id de campo y de opción: si cambian, los datos quedan huérfanos y las estadísticas y el CSV dejan de contarlos.
// Añadir campos u opciones y editar textos sí se permite. Devuelve «» si el cambio es seguro, o un mensaje en español
// que nombra el campo.
func RompeRespuestas(anterior, nueva Esquema) string {
	actuales := make(map[string]Campo, len(nueva.Campos))
	for _, c := range nueva.Campos {
		actuales[c.ID] = c
	}
	const sugerencia = " El formulario ya tiene respuestas: cierra este formulario y duplícalo para cambiar sus campos."
	for _, viejo := range anterior.Campos {
		etiqueta := viejo.Etiqueta
		if etiqueta == "" {
			etiqueta = viejo.ID
		}
		nuevo, ok := actuales[viejo.ID]
		switch {
		case !ok:
			return fmt.Sprintf("No puedes quitar el campo «%s».%s", etiqueta, sugerencia)
		case nuevo.Tipo != viejo.Tipo:
			return fmt.Sprintf("No puedes cambiar el tipo del campo «%s».%s", etiqueta, sugerencia)
		case conOpciones[viejo.Tipo]:
			presentes := make(map[string]bool, len(nuevo.Opciones))
			for _, o := range nuevo.Opciones {
				presentes[o.ID] = true
			}
			for _, o := range viejo.Opciones {
				if !presentes[o.ID] {
					return fmt.Sprintf("No puedes quitar una opción del campo «%s».%s", etiqueta, sugerencia)
				}
			}
		}
	}
	return ""
}
