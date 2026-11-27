// Package formularios es el contrato compartido de «Formularios» (platform/docs/FORMULARIOS.md): el esquema que edita
// el backoffice, su validación, las respuestas, el porcentaje, el HTML del email y el token del enlace personal.
// Lo usan athletes (CRUD, envíos, respuestas y web pública) y ai (asistente).
package formularios

import (
	"crypto/rand"
	"strings"
	"time"
)

// Esquema es el contenido de un formulario (columna jsonb «esquema»).
type Esquema struct {
	Ajustes Ajustes `json:"ajustes"`
	Campos  []Campo `json:"campos"`
}

// Ajustes son los textos generales y el tema visual del formulario.
type Ajustes struct {
	Titulo         string     `json:"titulo"`
	Descripcion    string     `json:"descripcion"`
	BotonEnviar    string     `json:"botonEnviar"`
	MensajeGracias string     `json:"mensajeGracias"`
	PermiteEditar  bool       `json:"permiteEditar"`
	CierreAt       *time.Time `json:"cierreAt"`
	Tema           Tema       `json:"tema"`
}

// Tema es la apariencia del formulario (web y email).
type Tema struct {
	Acento     string `json:"acento"`
	Fondo      string `json:"fondo"`
	Superficie string `json:"superficie"`
	Texto      string `json:"texto"`
	Radio      int    `json:"radio"`
	Fuente     string `json:"fuente"`
	Densidad   string `json:"densidad"`
}

// Campo es un elemento del formulario: pregunta, texto decorativo, imagen o separador.
type Campo struct {
	ID          string      `json:"id"`
	Tipo        string      `json:"tipo"`
	Etiqueta    string      `json:"etiqueta"`
	Ayuda       string      `json:"ayuda"`
	Obligatorio bool        `json:"obligatorio"`
	Placeholder string      `json:"placeholder"`
	Ancho       string      `json:"ancho"`
	Opciones    []Opcion    `json:"opciones"`
	Min         *float64    `json:"min"`
	Max         *float64    `json:"max"`
	Paso        *float64    `json:"paso"`
	MinEtiqueta string      `json:"minEtiqueta"`
	MaxEtiqueta string      `json:"maxEtiqueta"`
	Validacion  Validacion  `json:"validacion"`
	Archivo     *ArchivoCfg `json:"archivo"`
	Estilo      Estilo      `json:"estilo"`
	Imagen      string      `json:"imagen"`
	Alt         string      `json:"alt"`
}

// Opcion es una opción de los campos de elección.
type Opcion struct {
	ID    string `json:"id"`
	Texto string `json:"texto"`
}

// Validacion son las reglas de texto (solo texto_corto y texto_largo).
type Validacion struct {
	MinLargo *int   `json:"minLargo"`
	MaxLargo *int   `json:"maxLargo"`
	Patron   string `json:"patron"`
}

// ArchivoCfg son los límites de un campo de subida de archivos.
type ArchivoCfg struct {
	Tipos       []string `json:"tipos"`
	MaxMb       int      `json:"maxMb"`
	MaxArchivos int      `json:"maxArchivos"`
}

// Estilo es el formato visual de un campo.
type Estilo struct {
	Alinear string `json:"alinear"`
	Tamano  string `json:"tamano"`
	Color   string `json:"color"`
	Negrita bool   `json:"negrita"`
	Fondo   string `json:"fondo"`
	Borde   bool   `json:"borde"`
}

// Tipos de campo (§2 de FORMULARIOS.md).
const (
	TipoTitulo            = "titulo"
	TipoParrafo           = "parrafo"
	TipoImagen            = "imagen"
	TipoSeparador         = "separador"
	TipoTextoCorto        = "texto_corto"
	TipoTextoLargo        = "texto_largo"
	TipoEmail             = "email"
	TipoTelefono          = "telefono"
	TipoNumero            = "numero"
	TipoFecha             = "fecha"
	TipoOpcionUnica       = "opcion_unica"
	TipoDesplegable       = "desplegable"
	TipoCasillas          = "casillas"
	TipoSeleccionMultiple = "seleccion_multiple"
	TipoCasilla           = "casilla"
	TipoSiNo              = "si_no"
	TipoDeslizador        = "deslizador"
	TipoEscala            = "escala"
	TipoValoracion        = "valoracion"
	TipoArchivo           = "archivo"
)

// Tipos es el conjunto de los tipos de campo válidos.
var Tipos = map[string]bool{
	TipoTitulo: true, TipoParrafo: true, TipoImagen: true, TipoSeparador: true,
	TipoTextoCorto: true, TipoTextoLargo: true, TipoEmail: true, TipoTelefono: true, TipoNumero: true, TipoFecha: true,
	TipoOpcionUnica: true, TipoDesplegable: true, TipoCasillas: true, TipoSeleccionMultiple: true, TipoCasilla: true,
	TipoSiNo: true, TipoDeslizador: true, TipoEscala: true, TipoValoracion: true, TipoArchivo: true,
}

// respondibles son los tipos que reciben una respuesta (los decorativos no).
var respondibles = map[string]bool{
	TipoTextoCorto: true, TipoTextoLargo: true, TipoEmail: true, TipoTelefono: true, TipoNumero: true, TipoFecha: true,
	TipoOpcionUnica: true, TipoDesplegable: true, TipoCasillas: true, TipoSeleccionMultiple: true, TipoCasilla: true,
	TipoSiNo: true, TipoDeslizador: true, TipoEscala: true, TipoValoracion: true, TipoArchivo: true,
}

// conOpciones son los tipos que eligen entre Campo.Opciones.
var conOpciones = map[string]bool{
	TipoOpcionUnica: true, TipoDesplegable: true, TipoCasillas: true, TipoSeleccionMultiple: true, TipoDeslizador: true,
}

// textuales son los tipos cuya respuesta es un string.
var textuales = map[string]bool{
	TipoTextoCorto: true, TipoTextoLargo: true, TipoEmail: true, TipoTelefono: true, TipoFecha: true,
}

// Valores por defecto (Normalizar y CompilarEmailHTML usan los mismos).
const (
	DefaultAcento      = "#E4002B"
	DefaultFondo       = "#FFFFFF"
	DefaultSuperficie  = "#F6F6F7"
	DefaultTexto       = "#111111"
	DefaultRadio       = 10
	DefaultFuente      = "sistema"
	DefaultDensidad    = "normal"
	DefaultBoton       = "Enviar respuestas"
	DefaultGracias     = "¡Gracias! Hemos recibido tus respuestas."
	DefaultValoracion  = 5
	DefaultArchivoMb   = 10
	DefaultArchivosMax = 1
)

// DefaultArchivoTipos son los tipos de archivo admitidos si el campo no indica otros.
var DefaultArchivoTipos = []string{"image/*", "application/pdf"}

// DefaultTema devuelve el tema por defecto.
func DefaultTema() Tema {
	return Tema{Acento: DefaultAcento, Fondo: DefaultFondo, Superficie: DefaultSuperficie, Texto: DefaultTexto,
		Radio: DefaultRadio, Fuente: DefaultFuente, Densidad: DefaultDensidad}
}

// AdmiteRespuesta dice si el tipo recibe una respuesta del destinatario.
func AdmiteRespuesta(tipo string) bool { return respondibles[tipo] }

// SoloWeb dice si el formulario tiene algún campo de archivo: el email no puede llevarlo, así que solo lleva el enlace.
func SoloWeb(e Esquema) bool {
	for _, c := range e.Campos {
		if c.Tipo == TipoArchivo {
			return true
		}
	}
	return false
}

// Normalizar rellena los valores por defecto del esquema (tema, textos, escalas, archivos). Es idempotente.
func Normalizar(e *Esquema) {
	a := &e.Ajustes
	def := DefaultTema()
	t := &a.Tema
	t.Acento = textoO(t.Acento, def.Acento)
	t.Fondo = textoO(t.Fondo, def.Fondo)
	t.Superficie = textoO(t.Superficie, def.Superficie)
	t.Texto = textoO(t.Texto, def.Texto)
	t.Fuente = textoO(t.Fuente, def.Fuente)
	t.Densidad = textoO(t.Densidad, def.Densidad)
	a.BotonEnviar = textoO(a.BotonEnviar, DefaultBoton)
	a.MensajeGracias = textoO(a.MensajeGracias, DefaultGracias)

	for i := range e.Campos {
		c := &e.Campos[i]
		c.Ancho = textoO(c.Ancho, "completo")
		c.Estilo.Alinear = textoO(c.Estilo.Alinear, "izquierda")
		c.Estilo.Tamano = textoO(c.Estilo.Tamano, "m")
		switch c.Tipo {
		case TipoEscala:
			if c.Min == nil {
				c.Min = ptrF(0)
			}
			if c.Max == nil {
				c.Max = ptrF(10)
			}
			if c.Paso == nil {
				c.Paso = ptrF(1)
			}
		case TipoValoracion:
			if c.Max == nil {
				c.Max = ptrF(DefaultValoracion)
			}
		case TipoArchivo:
			if c.Archivo == nil {
				c.Archivo = &ArchivoCfg{}
			}
			if len(c.Archivo.Tipos) == 0 {
				c.Archivo.Tipos = append([]string(nil), DefaultArchivoTipos...)
			}
			if c.Archivo.MaxMb == 0 {
				c.Archivo.MaxMb = DefaultArchivoMb
			}
			if c.Archivo.MaxArchivos == 0 {
				c.Archivo.MaxArchivos = DefaultArchivosMax
			}
		default:
			c.Archivo = nil
		}
	}
}

// NuevoID genera un id de campo («c») u opción («o»): prefijo + "_" + 8 caracteres [a-z0-9]. El prefijo puede llevar
// o no el guion bajo final.
func NuevoID(prefijo string) string {
	const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789"
	prefijo = strings.TrimSuffix(prefijo, "_")
	out := make([]byte, 0, len(prefijo)+9)
	out = append(out, prefijo...)
	out = append(out, '_')
	b := make([]byte, 8)
	_, _ = rand.Read(b) // lectura de CSPRNG: no falla en Linux
	for _, x := range b {
		out = append(out, alfabeto[int(x)%len(alfabeto)])
	}
	return string(out)
}

func textoO(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func ptrF(f float64) *float64 { return &f }
