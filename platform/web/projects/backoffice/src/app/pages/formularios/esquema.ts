import type { Campo, Tema } from './api';
import { DENSIDADES, TEMA_FUENTES } from './catalogo';

/** Pure operations on the field list (no Angular, no side effects): the store applies them to a copy. */

export function indiceDe(campos: Campo[], id: string | null): number {
  return id ? campos.findIndex((c) => c.id === id) : -1;
}

/** New list with `campo` inserted at `indice` (clamped to the list). */
export function insertar(campos: Campo[], campo: Campo, indice: number): Campo[] {
  const i = Math.max(0, Math.min(indice, campos.length));
  return [...campos.slice(0, i), campo, ...campos.slice(i)];
}

/** New list with the element at `from` moved to `to` (both clamped). */
export function mover(campos: Campo[], from: number, to: number): Campo[] {
  if (from < 0 || from >= campos.length) return campos;
  const t = Math.max(0, Math.min(to, campos.length - 1));
  if (t === from) return campos;
  const copia = [...campos];
  const [x] = copia.splice(from, 1);
  copia.splice(t, 0, x);
  return copia;
}

/** Changes one field by id with a pure transform (the rest of the list is shared). */
export function cambiar(campos: Campo[], id: string, fn: (c: Campo) => Campo): Campo[] {
  return campos.map((c) => (c.id === id ? fn(c) : c));
}

/** Derived flag of the contract (never saved): a form with any file field is web-only. */
export function esSoloWeb(campos: Campo[]): boolean {
  return campos.some((c) => c.tipo === 'archivo');
}

/** Form theme as CSS custom properties, used by the canvas and the web preview alike. */
export function temaVariables(t: Tema): Record<string, string> {
  const d = DENSIDADES[t.densidad] ?? DENSIDADES.normal;
  return {
    '--f-acento': t.acento,
    '--f-fondo': t.fondo,
    '--f-superficie': t.superficie,
    '--f-texto': t.texto,
    '--f-radio': `${t.radio}px`,
    '--f-fuente': (TEMA_FUENTES[t.fuente] ?? TEMA_FUENTES.sistema).css,
    '--f-gap': `${d.gap}px`,
    '--f-pad': `${d.pad}px`,
  };
}
