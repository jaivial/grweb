import { atom } from 'jotai';
import type { Inscripcion, InscripcionStats } from '../types/api';

// Inscripciones list state
export const ferInscripcionesAtom = atom<Inscripcion[]>([]);
export const ferInscripcionesLoadingAtom = atom(false);
export const ferInscripcionesErrorAtom = atom<string | null>(null);

// Pagination
export const ferInscripcionesPageAtom = atom(1);
export const ferInscripcionesPageSizeAtom = atom(15);
export const ferInscripcionesTotalCountAtom = atom(0);

// Stats for KPIs
export const ferInscripcionesStatsAtom = atom<InscripcionStats>({
  total: 0,
  pagados: 0,
  pendientes: 0,
  upsells: 0,
  checkins: 0,
  revenue: 0,
  cashRevenue: 0,
  stripeRevenue: 0,
  porExperiencia: {},
  conEntrenador: 0,
  sinEntrenador: 0,
});

// Filters
export const ferInscripcionesSearchQueryAtom = atom<string>('');
export const ferInscripcionesPagoConfirmadoFilterAtom = atom<boolean | undefined>(undefined);
export const ferInscripcionesExperienciaFilterAtom = atom<string | undefined>(undefined);
export const ferInscripcionesModalidadFilterAtom = atom<string | undefined>(undefined);
export const ferInscripcionesPaymentMethodFilterAtom = atom<string | undefined>(undefined);

// Derived atom for total pages
export const ferInscripcionesTotalPagesAtom = atom((get) =>
  Math.ceil(get(ferInscripcionesTotalCountAtom) / get(ferInscripcionesPageSizeAtom))
);

// Active filters check
export const ferHasActiveFiltersAtom = atom((get) => {
  return (
    get(ferInscripcionesSearchQueryAtom) !== '' ||
    get(ferInscripcionesPagoConfirmadoFilterAtom) !== undefined ||
    get(ferInscripcionesExperienciaFilterAtom) !== undefined ||
    get(ferInscripcionesModalidadFilterAtom) !== undefined ||
    get(ferInscripcionesPaymentMethodFilterAtom) !== undefined
  );
});

// Clear filters atom (writable derived atom)
export const ferClearInscripcionesFiltersAtom = atom(
  null,
  (_get, set) => {
    set(ferInscripcionesSearchQueryAtom, '');
    set(ferInscripcionesPagoConfirmadoFilterAtom, undefined);
    set(ferInscripcionesExperienciaFilterAtom, undefined);
    set(ferInscripcionesModalidadFilterAtom, undefined);
    set(ferInscripcionesPaymentMethodFilterAtom, undefined);
  }
);
