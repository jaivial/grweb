import type { ArchivoConfig, Campo, Datos, Errores, Tema, TipoCampo } from './formulario-api';
import type { Val } from './formulario-textos';

const BLOQUES: readonly TipoCampo[] = ['titulo', 'parrafo', 'imagen', 'separador'];
const GRUPOS: readonly TipoCampo[] = ['opcion_unica', 'casillas', 'seleccion_multiple', 'si_no', 'deslizador', 'escala', 'valoracion', 'archivo'];
const TEXTO_LIBRE: readonly TipoCampo[] = ['texto_corto', 'texto_largo', 'email', 'telefono', 'fecha'];
const ELECCION: readonly TipoCampo[] = ['opcion_unica', 'desplegable', 'si_no', 'deslizador', 'casillas', 'seleccion_multiple'];

export const esBloque = (t: TipoCampo): boolean => BLOQUES.includes(t);
/** Campos de varias opciones o valores: van dentro de un `fieldset` con `legend`. */
export const esGrupo = (t: TipoCampo): boolean => GRUPOS.includes(t);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Espejo de `reTelefono` en platform/pkg/formularios/respuesta.go (misma clase de caracteres y longitud). */
const TELEFONO = /^\+?[0-9 ().-]{6,30}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Espejo de `maxTexto` en platform/pkg/formularios/respuesta.go: límite de los textos sin `validacion.maxLargo`. */
const MAX_TEXTO: Partial<Record<TipoCampo, number>> = { texto_corto: 200, texto_largo: 5000, email: 254, telefono: 30 };

/** Longitud máxima efectiva de un campo de texto: la del esquema o, si no la fija, la del backend. Null = sin límite. */
export function maxLargoDe(c: Campo): number | null {
  return c.validacion?.maxLargo ?? MAX_TEXTO[c.tipo] ?? null;
}

/** Sin respuesta para el tipo del campo (un `false` o un `0` sí son respuestas). */
function vacio(c: Campo, v: unknown): boolean {
  switch (c.tipo) {
    case 'casilla': return v !== true;
    case 'si_no': return typeof v !== 'boolean';
    case 'numero':
    case 'escala':
    case 'valoracion': return typeof v !== 'number' || !Number.isFinite(v);
    case 'casillas':
    case 'seleccion_multiple':
    case 'archivo': return !Array.isArray(v) || v.length === 0;
    case 'opcion_unica':
    case 'desplegable':
    case 'deslizador': return typeof v !== 'string' || v === '';
    default: return typeof v !== 'string' || v.trim() === '';
  }
}

function mensajeVacio(c: Campo, m: Val): string {
  if (c.tipo === 'casilla') return m.marca;
  if (c.tipo === 'archivo') return m.sube;
  if (ELECCION.includes(c.tipo)) return m.elige;
  return m.obligatorio;
}

function textoValido(c: Campo, s: string, m: Val): string | null {
  const v = c.validacion;
  // Se cuentan puntos de código (como utf8.RuneCountInString en el backend), no unidades UTF-16.
  const largo = [...s].length;
  if (v?.minLargo != null && largo < v.minLargo) return m.minLargo(v.minLargo);
  const max = maxLargoDe(c);
  if (max != null && largo > max) return m.maxLargo(max);
  if (v?.patron) {
    try {
      if (!new RegExp(v.patron).test(s)) return m.patron;
    } catch {
      // Patrón mal formado en el esquema: no bloquea al atleta.
    }
  }
  return null;
}

/** Error de un valor concreto según su campo, o null. Los bloques decorativos nunca tienen error. */
export function validarCampo(c: Campo, v: unknown, m: Val): string | null {
  if (esBloque(c.tipo)) return null;
  if (vacio(c, v)) return c.obligatorio ? mensajeVacio(c, m) : null;
  if (TEXTO_LIBRE.includes(c.tipo) || c.tipo === 'texto_largo') {
    const s = String(v).trim();
    if (c.tipo === 'email' && !EMAIL.test(s)) return m.email;
    if (c.tipo === 'telefono' && !TELEFONO.test(s)) return m.telefono;
    if (c.tipo === 'fecha' && (!FECHA.test(s) || Number.isNaN(Date.parse(s)))) return m.fecha;
    return textoValido(c, s, m);
  }
  if (c.tipo === 'numero') {
    const n = Number(v);
    if (c.min != null && c.max != null && (n < c.min || n > c.max)) return m.rango(c.min, c.max);
    if (c.min != null && n < c.min) return m.minimo(c.min);
    if (c.max != null && n > c.max) return m.maximo(c.max);
    return null;
  }
  if (c.tipo === 'casillas' || c.tipo === 'seleccion_multiple') {
    const k = (v as unknown[]).length;
    if (c.min != null && k < c.min) return m.minOpciones(c.min);
    if (c.max != null && k > c.max) return m.maxOpciones(c.max);
    return null;
  }
  if (c.tipo === 'archivo') {
    const max = c.archivo?.maxArchivos ?? 1;
    return (v as unknown[]).length > max ? m.maxArchivos(max) : null;
  }
  return null;
}

/** Todos los errores del formulario, por id de campo. */
export function validarTodo(campos: readonly Campo[], datos: Datos, m: Val): Errores {
  const errores: Errores = {};
  for (const c of campos) {
    const e = validarCampo(c, datos[c.id], m);
    if (e) errores[c.id] = e;
  }
  return errores;
}

const escapar = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texto del organizador → HTML seguro: escapa todo y solo admite **negrita** y saltos de línea. */
export function textoRico(s: string | null | undefined): string {
  return escapar(s ?? '').replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/\r?\n/g, '<br>');
}

const HEX = /^#[0-9a-f]{6}$/i;
const color = (c: string | undefined, por: string): string => (c && HEX.test(c) ? c : por);

const FUENTES: Record<Tema['fuente'], string> = {
  sistema: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};
const GAPS: Record<Tema['densidad'], string> = { compacta: '0.75rem', normal: '1.25rem', amplia: '1.75rem' };

/** Variables CSS del tema (`--f-*`) para el atributo `style` del formulario. Valores fuera de rango usan el valor por defecto. */
export function estiloTema(t: Partial<Tema> | undefined): string {
  const radio = Math.min(24, Math.max(0, Number(t?.radio ?? 10)));
  return [
    `--f-acento:${color(t?.acento, '#c42b3e')}`,
    `--f-fondo:${color(t?.fondo, '#ffffff')}`,
    `--f-superficie:${color(t?.superficie, '#f6f6f7')}`,
    `--f-texto:${color(t?.texto, '#111111')}`,
    `--f-radio:${radio}px`,
    `--f-fuente:${FUENTES[t?.fuente ?? 'sistema'] ?? FUENTES.sistema}`,
    `--f-gap:${GAPS[t?.densidad ?? 'normal'] ?? GAPS.normal}`,
  ].join(';');
}

const coincide = (f: File, tipo: string): boolean => {
  if (tipo.startsWith('.')) return f.name.toLowerCase().endsWith(tipo.toLowerCase());
  if (tipo.endsWith('/*')) return f.type.startsWith(tipo.slice(0, -1));
  return f.type === tipo;
};

/** Motivo por el que el archivo no vale para el campo, o null si vale. */
export function errorArchivo(f: File, cfg: ArchivoConfig | null): 'tipo' | 'tamano' | null {
  if (!cfg) return null;
  if (cfg.tipos?.length && !cfg.tipos.some((t) => coincide(f, t))) return 'tipo';
  if (f.size > cfg.maxMb * 1024 * 1024) return 'tamano';
  return null;
}

/** Tipos admitidos en texto legible («imágenes, PDF»). */
export function tiposLegibles(tipos: readonly string[], imagenes: string): string {
  return tipos
    .map((t) => (t.startsWith('image/') ? imagenes : t === 'application/pdf' || t === '.pdf' ? 'PDF' : t))
    .filter((t, i, a) => a.indexOf(t) === i)
    .join(', ');
}

/** Tamaño de un archivo: KB por debajo de 1 MB, MB por encima. */
export function tamano(bytes: number, locale = 'es-ES'): string {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale) + ' KB';
  return (bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 }) + ' MB';
}
