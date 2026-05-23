import { atom } from 'jotai';
import type { Athlete, AthleteStats } from '../types/athlete';

// Athletes list state
export const athletesAtom = atom<Athlete[]>([]);
export const athletesLoadingAtom = atom(false);
export const athletesErrorAtom = atom<string | null>(null);

// Pagination
export const athletesPageAtom = atom(1);
export const athletesPageSizeAtom = atom(15);
export const athletesTotalCountAtom = atom(0);

// Stats for KPIs
export const athletesStatsAtom = atom<AthleteStats>({
  total: 0,
  inscritos: 0,
  paid: 0,
  pending: 0,
  disqualified: 0,
  missingDocumentation: 0,
});

// Filters
export const athletesSearchQueryAtom = atom<string | null>(null);
export const athletesSexFilterAtom = atom<string | null>(null);
export const athletesWeightCategoryFilterAtom = atom<string | null>(null);
export const athletesStatusFilterAtom = atom<string | null>(null);
export const athletesClubFilterAtom = atom<string | null>(null);

// Derived atom for total pages
export const athletesTotalPagesAtom = atom((get) =>
  Math.ceil(get(athletesTotalCountAtom) / get(athletesPageSizeAtom))
);

// Active filters check
export const hasActiveFiltersAtom = atom((get) => {
  return (
    get(athletesSearchQueryAtom) !== '' ||
    get(athletesSexFilterAtom) !== null ||
    get(athletesWeightCategoryFilterAtom) !== null ||
    get(athletesStatusFilterAtom) !== null ||
    get(athletesClubFilterAtom) !== ''
  );
});

// Clear filters atom (writable derived atom)
export const clearAthletesFiltersAtom = atom(
  null,
  (get, set) => {
    set(athletesSearchQueryAtom, null);
    set(athletesSexFilterAtom, null);
    set(athletesWeightCategoryFilterAtom, null);
    set(athletesStatusFilterAtom, null);
    set(athletesClubFilterAtom, null);
  }
);

// Selected athlete for editing
export const selectedAthleteAtom = atom<Athlete | null>(null);
