import { atom } from 'jotai';
import type { Competicion, LandingConfig, EventoConfig } from '../types/api';

// Competicion data atoms
export const competicionesAtom = atom<Competicion[]>([]);
export const currentCompeticionDataAtom = atom<Competicion | null>(null);
export const landingConfigAtom = atom<LandingConfig | null>((get) => {
  const competicion = get(currentCompeticionDataAtom);
  return competicion?.landingConfig ?? null;
});
export const eventoConfigAtom = atom<EventoConfig | null>((get) => {
  const competicion = get(currentCompeticionDataAtom);
  return competicion?.eventoConfig ?? null;
});

// Loading states
export const isLoadingCompeticionesAtom = atom<boolean>(false);

// Plazas disponibles
export const plazasDisponiblesAtom = atom<number | null>((get) => {
  const competicion = get(currentCompeticionDataAtom);
  return competicion?.plazasDisponibles ?? null;
});

// Aforo
export const aforoMaximoAtom = atom<number>((get) => {
  const eventoConfig = get(eventoConfigAtom);
  return eventoConfig?.aforMaximo ?? 100;
});

// Inscripcion abierta
export const inscripcionAbiertaAtom = atom<boolean>((get) => {
  const eventoConfig = get(eventoConfigAtom);
  return eventoConfig?.inscripcionAbierta ?? true;
});

// Precios
export const precioBaseAtom = atom<number>((get) => {
  const eventoConfig = get(eventoConfigAtom);
  return eventoConfig?.precioBase ?? 35;
});
export const precioUpsellAtom = atom<number>((get) => {
  const eventoConfig = get(eventoConfigAtom);
  return eventoConfig?.precioUpsell ?? 60;
});
