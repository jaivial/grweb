import type { GrTone } from '@grcup/ui';
import type { EstadoSolicitud, TipoMatch } from './solicitudes-api';

/** The 18 fields of the public form, in the order of the review panel. */
export const CAMPOS: { clave: string; etiqueta: string }[] = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'apellidos', etiqueta: 'Apellidos' },
  { clave: 'email', etiqueta: 'Email' },
  { clave: 'telefono', etiqueta: 'Teléfono móvil' },
  { clave: 'sexo', etiqueta: 'Sexo' },
  { clave: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento' },
  { clave: 'licencia', etiqueta: 'Licencia AEP' },
  { clave: 'club', etiqueta: 'Club' },
  { clave: 'ciudad', etiqueta: 'Ciudad' },
  { clave: 'entrenador', etiqueta: 'Entrenador/a' },
  { clave: 'prueba', etiqueta: 'Competición' },
  { clave: 'frase', etiqueta: 'Frase del perfil' },
  { clave: 'bio', etiqueta: 'Sobre ti' },
  { clave: 'instagram', etiqueta: 'Instagram' },
  { clave: 'historial', etiqueta: 'Historial' },
  { clave: 'marcaSQ', etiqueta: 'Marca SQ' },
  { clave: 'marcaBP', etiqueta: 'Marca BP' },
  { clave: 'marcaDL', etiqueta: 'Marca DL' },
];

/** The 5 consent boxes of the public form, with the legal text each one proves. */
export const CONSENTIMIENTOS: { clave: string; texto: string; etiqueta: string }[] = [
  { clave: 'terminos', texto: 'Acepto los términos de uso y el reglamento', etiqueta: 'Términos y reglamento' },
  { clave: 'privacidad', texto: 'He leído la política de privacidad y acepto el tratamiento de mis datos', etiqueta: 'Política de privacidad' },
  { clave: 'imagen', texto: 'Autorizo publicar mi nombre, datos deportivos y foto', etiqueta: 'Consentimiento de datos e imagen' },
  { clave: 'novedades', texto: 'Quiero recibir novedades de la GR Cup por email', etiqueta: 'Novedades por email' },
  { clave: 'whatsapp', texto: 'Quiero recibir avisos de mi alta y de la competición por WhatsApp', etiqueta: 'Avisos por WhatsApp' },
];

/** Text and tone of the match badge of a row. */
export const MATCH: Record<TipoMatch, string> = { licencia: 'Licencia', email: 'Email', nombre: 'Sugerida', manual: 'Enlazado', '': 'Sin coincidencia' };
export const MATCH_TONE: Record<TipoMatch, GrTone> = { licencia: 'success', email: 'info', nombre: 'warning', manual: 'info', '': 'neutral' };

/** The 18 fields of the form, with the value declared by the athlete and the difference with the linked athlete. */
export interface FilaCampo {
  clave: string;
  etiqueta: string;
  nuevo: string;
  actual: string;
  tipo: 'igual' | 'distinto' | 'nuevo';
  l: string;
  tone: GrTone;
}
export interface FilaConsentimiento {
  clave: string;
  texto: string;
  aceptado: boolean;
  prueba: string;
}

export const matchTxt = (m: TipoMatch) => MATCH[m];
export const matchTone = (m: TipoMatch) => MATCH_TONE[m];

export function nombreCompleto(s: { nombre: string; apellidos: string }): string {
  return [s.nombre, s.apellidos].filter(Boolean).join(' ');
}

/** Status badge of a request (an unauthorised minor wins over the stored status). */
export function estadoDe(s: { estado: EstadoSolicitud; esMenor: boolean; autorizacion: boolean }): { l: string; tone: GrTone } {
  if (s.esMenor && !s.autorizacion) return { l: 'Menor · sin autorización', tone: 'warning' };
  if (s.estado === 'revision') return { l: 'En revisión', tone: 'warning' };
  if (s.estado === 'aprobada') return { l: 'Aprobada', tone: 'success' };
  if (s.estado === 'rechazada') return { l: 'Rechazada', tone: 'danger' };
  return { l: 'Nueva', tone: 'danger' };
}
