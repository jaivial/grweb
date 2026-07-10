import type { EventoConfig } from '../../../types/api';

/**
 * Decides whether the public inscripciones form should be shown.
 * Source of truth is `eventoConfig.inscripcionesAbiertas` (backed by the
 * inscripcion_estado table). Defaults to open when the flag is absent so
 * existing events keep working until an admin closes them explicitly.
 */
export function areInscripcionesAbiertas(eventoConfig?: EventoConfig | null): boolean {
  return eventoConfig?.inscripcionesAbiertas !== false;
}

/**
 * Whether the competition is closed specifically because it is sold out.
 * Only meaningful when inscripciones are closed. Defaults to false.
 */
export function isSoldOut(eventoConfig?: EventoConfig | null): boolean {
  return eventoConfig?.soldOut === true;
}
