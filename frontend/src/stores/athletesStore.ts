import { signal, computed } from '@preact/signals-react';
import type { Athlete, AthleteStats } from '../types/athlete';

// Athletes list state
export const athletes = signal<Athlete[]>([]);
export const athletesLoading = signal(false);
export const athletesError = signal<string | null>(null);

// Pagination
export const athletesPage = signal(1);
export const athletesPageSize = signal(15);
export const athletesTotalCount = signal(0);
export const athletesTotalPages = computed(() => 
  Math.ceil(athletesTotalCount.value / athletesPageSize.value)
);

// Stats for KPIs
export const athletesStats = signal<AthleteStats>({
  total: 0,
  paid: 0,
  pending: 0,
  disqualified: 0,
  missingDocumentation: 0,
});

// Filters
export const athletesSearchQuery = signal('');
export const athletesSexFilter = signal<string | null>(null);
export const athletesWeightCategoryFilter = signal<string | null>(null);
export const athletesStatusFilter = signal<string | null>(null);
export const athletesClubFilter = signal('');

// Active filters check
export const hasActiveFilters = computed(() => {
  return (
    athletesSearchQuery.value !== '' ||
    athletesSexFilter.value !== null ||
    athletesWeightCategoryFilter.value !== null ||
    athletesStatusFilter.value !== null ||
    athletesClubFilter.value !== ''
  );
});

// Selected athlete for editing
export const selectedAthlete = signal<Athlete | null>(null);

// Actions
export function setAthletes(data: {
  athletes: Athlete[];
  totalCount: number;
  stats: AthleteStats;
}) {
  athletes.value = data.athletes;
  athletesTotalCount.value = data.totalCount;
  athletesStats.value = data.stats;
}

export function setAthletesLoading(loading: boolean) {
  athletesLoading.value = loading;
}

export function setAthletesError(error: string | null) {
  athletesError.value = error;
}

export function setAthletesPage(page: number) {
  athletesPage.value = page;
}

export function clearAthletesFilters() {
  athletesSearchQuery.value = '';
  athletesSexFilter.value = null;
  athletesWeightCategoryFilter.value = null;
  athletesStatusFilter.value = null;
  athletesClubFilter.value = '';
}

export function setSelectedAthlete(athlete: Athlete | null) {
  selectedAthlete.value = athlete;
}

export function addAthlete(athlete: Athlete) {
  athletes.value = [athlete, ...athletes.value];
  athletesTotalCount.value += 1;
}

export function updateAthlete(updated: Athlete) {
  athletes.value = athletes.value.map(a => a.id === updated.id ? updated : a);
}

export function removeAthlete(id: number) {
  athletes.value = athletes.value.filter(a => a.id !== id);
  athletesTotalCount.value = Math.max(0, athletesTotalCount.value - 1);
}
