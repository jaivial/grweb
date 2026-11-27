import type { ArchivoRespuesta, Campo } from './api';
import { infoTipo } from './catalogo';

/** How one answer is shown in the detail: plain text, a list, stars, files, or nothing («Sin responder»). */
export interface ValorRespuesta {
  kind: 'vacio' | 'texto' | 'lista' | 'estrellas' | 'archivos';
  texto?: string;
  largo?: boolean;
  items?: string[];
  valor?: number;
  max?: number;
  archivos?: ArchivoRespuesta[];
}

const VACIO: ValorRespuesta = { kind: 'vacio' };
const SI_NO = (v: boolean): ValorRespuesta => ({ kind: 'texto', texto: v ? 'Sí' : 'No' });

/** Decorative fields carry no answer and are left out of the detail. */
export function admiteRespuesta(c: Campo): boolean {
  return infoTipo(c.tipo).respondible;
}

/** Label of a field in the detail: its question, or the name of its type when empty. */
export function etiquetaCampo(c: Campo): string {
  return c.etiqueta.trim() || infoTipo(c.tipo).label;
}

/** Turns the stored answer of one field into what the detail shows (option ids become their texts). */
export function valorRespuesta(c: Campo, datos: Record<string, unknown>, archivos: ArchivoRespuesta[]): ValorRespuesta {
  const v = datos[c.id];
  const textoOpcion = (id: unknown) => c.opciones.find((o) => o.id === id)?.texto ?? 'Opción no disponible';
  switch (c.tipo) {
    case 'archivo': {
      const lista = archivos.filter((a) => a.campoId === c.id);
      return lista.length ? { kind: 'archivos', archivos: lista } : VACIO;
    }
    case 'casillas':
    case 'seleccion_multiple': {
      const ids = Array.isArray(v) ? v : [];
      return ids.length ? { kind: 'lista', items: ids.map(textoOpcion) } : VACIO;
    }
    case 'opcion_unica':
    case 'desplegable':
    case 'deslizador':
      return v === undefined || v === null || v === '' ? VACIO : { kind: 'texto', texto: textoOpcion(v) };
    case 'casilla':
    case 'si_no':
      return typeof v === 'boolean' ? SI_NO(v) : VACIO;
    case 'valoracion':
      return typeof v === 'number' ? { kind: 'estrellas', valor: v, max: c.max ?? 5 } : VACIO;
    case 'numero':
    case 'escala':
      return typeof v === 'number' ? { kind: 'texto', texto: v.toLocaleString('es-ES') } : VACIO;
    default:
      return typeof v === 'string' && v.trim() ? { kind: 'texto', texto: v, largo: c.tipo === 'texto_largo' } : VACIO;
  }
}
