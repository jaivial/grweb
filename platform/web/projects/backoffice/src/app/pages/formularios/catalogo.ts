import type { GrIconName } from '@grcup/ui';
import type { Alinear, Ancho, Campo, Opcion, TipoCampo } from './api';

/** Id generator with the contract formats: `c_` + 8 [a-z0-9] for fields, `o_` + 8 for options (contract §2). */
export function nuevoId(prefijo: 'c_' | 'o_'): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += abc[b % abc.length];
  return prefijo + s;
}

export interface TipoInfo {
  tipo: TipoCampo;
  label: string;
  icon: GrIconName;
  /** Answer-bearing field: counts in the % completas and in the statistics. */
  respondible: boolean;
  /** Has `opciones` (the editor shows the options list). */
  conOpciones: boolean;
  /** Shows the min / max / paso block. */
  conRango: boolean;
  /** Shows the placeholder input. */
  conPlaceholder: boolean;
  /** Shows the validation block (length, pattern). */
  conValidacion: boolean;
  /** Only in the web: an email must not carry it (solo web). */
  soloWeb: boolean;
  /** Decorative: no answer, no required toggle. */
  decorativo: boolean;
}

/** The 20 element types of the contract (§2), grouped as the palette shows them. */
export const GRUPOS_ELEMENTOS: { grupo: string; tipos: TipoInfo[] }[] = [
  {
    grupo: 'Diseño',
    tipos: [
      { tipo: 'titulo', label: 'Título', icon: 'heading', respondible: false, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: true },
      { tipo: 'parrafo', label: 'Párrafo', icon: 'type', respondible: false, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: true },
      { tipo: 'imagen', label: 'Imagen', icon: 'image', respondible: false, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: true },
      { tipo: 'separador', label: 'Separador', icon: 'minus', respondible: false, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: true },
    ],
  },
  {
    grupo: 'Texto',
    tipos: [
      { tipo: 'texto_corto', label: 'Texto corto', icon: 'pencil', respondible: true, conOpciones: false, conRango: false, conPlaceholder: true, conValidacion: true, soloWeb: false, decorativo: false },
      { tipo: 'texto_largo', label: 'Texto largo', icon: 'file-text', respondible: true, conOpciones: false, conRango: false, conPlaceholder: true, conValidacion: true, soloWeb: false, decorativo: false },
      { tipo: 'email', label: 'Email', icon: 'mail', respondible: true, conOpciones: false, conRango: false, conPlaceholder: true, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'telefono', label: 'Teléfono', icon: 'smartphone', respondible: true, conOpciones: false, conRango: false, conPlaceholder: true, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'numero', label: 'Número', icon: 'sliders', respondible: true, conOpciones: false, conRango: true, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'fecha', label: 'Fecha', icon: 'calendar', respondible: true, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
    ],
  },
  {
    grupo: 'Opciones',
    tipos: [
      { tipo: 'opcion_unica', label: 'Opción única', icon: 'pointer', respondible: true, conOpciones: true, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'desplegable', label: 'Desplegable', icon: 'chevrons-up-down', respondible: true, conOpciones: true, conRango: false, conPlaceholder: true, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'casillas', label: 'Casillas', icon: 'square', respondible: true, conOpciones: true, conRango: true, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'seleccion_multiple', label: 'Selección múltiple', icon: 'list', respondible: true, conOpciones: true, conRango: true, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'casilla', label: 'Casilla de aceptación', icon: 'check', respondible: true, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'si_no', label: 'Sí / No', icon: 'check-check', respondible: true, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
    ],
  },
  {
    grupo: 'Escalas',
    tipos: [
      { tipo: 'deslizador', label: 'Deslizador', icon: 'arrow-left-right', respondible: true, conOpciones: true, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'escala', label: 'Escala numérica', icon: 'gauge', respondible: true, conOpciones: false, conRango: true, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
      { tipo: 'valoracion', label: 'Valoración con estrellas', icon: 'star', respondible: true, conOpciones: false, conRango: true, conPlaceholder: false, conValidacion: false, soloWeb: false, decorativo: false },
    ],
  },
  {
    grupo: 'Archivo',
    tipos: [
      { tipo: 'archivo', label: 'Subida de archivo', icon: 'upload', respondible: true, conOpciones: false, conRango: false, conPlaceholder: false, conValidacion: false, soloWeb: true, decorativo: false },
    ],
  },
];

export const TIPOS: TipoInfo[] = GRUPOS_ELEMENTOS.flatMap((g) => g.tipos);
const INFO = new Map(TIPOS.map((t) => [t.tipo, t]));
export function infoTipo(tipo: TipoCampo): TipoInfo {
  return INFO.get(tipo) ?? TIPOS[0];
}

const ESTILO_BASE = { alinear: 'izquierda' as Alinear, tamano: 'm' as const, color: '', negrita: false, fondo: '', borde: false };

/** Campo con valores por defecto del tipo (contract §2); los ids los pone quien llama. */
export function campoNuevo(tipo: TipoCampo, id: string = nuevoId('c_')): Campo {
  const base: Campo = {
    id, tipo, etiqueta: '', ayuda: '', obligatorio: false, placeholder: '', ancho: 'completo', opciones: [],
    min: null, max: null, paso: null, minEtiqueta: '', maxEtiqueta: '',
    validacion: { minLargo: null, maxLargo: null, patron: '' }, archivo: null,
    estilo: { ...ESTILO_BASE }, imagen: '', alt: '',
  };
  switch (tipo) {
    case 'titulo': return { ...base, etiqueta: 'Nueva sección', estilo: { ...base.estilo, tamano: 'l', negrita: true } };
    case 'parrafo': return { ...base, etiqueta: 'Escribe aquí el texto. Usa **negrita** para lo importante.' };
    case 'texto_corto': return { ...base, etiqueta: 'Pregunta de texto' };
    case 'texto_largo': return { ...base, etiqueta: 'Pregunta de texto largo' };
    case 'email': return { ...base, etiqueta: 'Correo electrónico', placeholder: 'nombre@ejemplo.com' };
    case 'telefono': return { ...base, etiqueta: 'Teléfono', placeholder: '+34 600 000 000' };
    case 'numero': return { ...base, etiqueta: 'Número' };
    case 'fecha': return { ...base, etiqueta: 'Fecha' };
    case 'opcion_unica': return { ...base, etiqueta: 'Elige una opción', opciones: opcionesIniciales(2) };
    case 'desplegable': return { ...base, etiqueta: 'Elige en la lista', placeholder: 'Selecciona', opciones: opcionesIniciales(3) };
    case 'casillas': return { ...base, etiqueta: 'Marca las que correspondan', opciones: opcionesIniciales(3) };
    case 'seleccion_multiple': return { ...base, etiqueta: 'Elige varias', opciones: opcionesIniciales(3) };
    case 'casilla': return { ...base, etiqueta: 'Acepto las condiciones' };
    case 'si_no': return { ...base, etiqueta: '¿Te interesa?' };
    case 'deslizador': return { ...base, etiqueta: 'Del 1 al 5', minEtiqueta: 'Poco', maxEtiqueta: 'Mucho', opciones: opcionesIniciales(5, ['1', '2', '3', '4', '5']) };
    case 'escala': return { ...base, etiqueta: '¿Cómo lo valoras?', min: 0, max: 10, paso: 1, minEtiqueta: 'Nada', maxEtiqueta: 'Mucho' };
    case 'valoracion': return { ...base, etiqueta: 'Valoración', max: 5 };
    case 'imagen': return { ...base, imagen: '', alt: '' };
    case 'separador': return base;
    case 'archivo': return { ...base, etiqueta: 'Sube un documento', archivo: { tipos: ['image/*', 'application/pdf'], maxMb: 10, maxArchivos: 1 } };
  }
}

/** Options with fresh ids: texts «Opción 1…N» unless given. */
export function opcionesIniciales(n: number, textos?: string[]): Opcion[] {
  return Array.from({ length: n }, (_, i) => ({ id: nuevoId('o_'), texto: textos?.[i] ?? `Opción ${i + 1}` }));
}

/** Deep copy of a field with new ids for the field and its options (duplicate, paste). */
export function clonarCampo(c: Campo): Campo {
  const copia = structuredClone(c);
  copia.id = nuevoId('c_');
  copia.opciones = copia.opciones.map((o) => ({ ...o, id: nuevoId('o_') }));
  return copia;
}

export const ALINEACIONES: { v: Alinear; l: string; icon: GrIconName }[] = [
  { v: 'izquierda', l: 'Izquierda', icon: 'align-start' },
  { v: 'centro', l: 'Centro', icon: 'align-center' },
  { v: 'derecha', l: 'Derecha', icon: 'align-end' },
];
export const ANCHOS: { v: Ancho; l: string }[] = [
  { v: 'completo', l: 'Completo' },
  { v: 'mitad', l: 'Mitad' },
];

export const ESTADOS_FORMULARIO: Record<'borrador' | 'activo' | 'cerrado', { l: string; tone: 'neutral' | 'success' | 'danger' }> = {
  borrador: { l: 'Borrador', tone: 'neutral' },
  activo: { l: 'Activo', tone: 'success' },
  cerrado: { l: 'Cerrado', tone: 'danger' },
};

export const TEMA_FUENTES: Record<'sistema' | 'serif' | 'mono', { l: string; css: string }> = {
  sistema: { l: 'Sistema', css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  serif: { l: 'Serif', css: 'ui-serif, Georgia, "Times New Roman", serif' },
  mono: { l: 'Mono', css: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' },
};
export const DENSIDADES: Record<'compacta' | 'normal' | 'amplia', { l: string; gap: number; pad: number }> = {
  compacta: { l: 'Compacta', gap: 12, pad: 8 },
  normal: { l: 'Normal', gap: 18, pad: 12 },
  amplia: { l: 'Amplia', gap: 26, pad: 16 },
};

/** Variables admitted in the email and WhatsApp texts (contract §3). */
export const VARIABLES_TEXTO = '{{nombre}} {{competicion}} {{formulario}}';
