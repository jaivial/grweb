import { useState, useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import type { SelectOption } from '../../../../components/ui/CustomSelector/CustomSelector';
import { Accordion, CustomSelector, Button } from '../../../../components/ui';
import { athletesSearchQueryAtom, athletesSexFilterAtom, athletesWeightCategoryFilterAtom, athletesStatusFilterAtom, athletesClubFilterAtom, athletesPageAtom, clearAthletesFiltersAtom } from '../../../../stores/athletesStore';
import { WOMEN_CATEGORIES, MEN_CATEGORIES, ALL_CATEGORIES } from '../../../../constants/categories';

const STATUS_OPTIONS: SelectOption<string>[] = [
  { value: 'Inscrito', label: 'Inscrito' },
  { value: 'Paid', label: 'Pagado' },
  { value: 'PendingPayment', label: 'Pendiente pago' },
  { value: 'Disqualified', label: 'Descalificado' },
  { value: 'MissingDocumentation', label: 'Falta documentación' },
];

const SEX_OPTIONS: SelectOption<string>[] = [
  { value: 'Male', label: 'Hombre' },
  { value: 'Female', label: 'Mujer' },
];

interface InscripcionesFiltersAccordionProps {
  clubs: string[];
}

export function InscripcionesFiltersAccordion({ clubs }: InscripcionesFiltersAccordionProps) {
  const [search, setSearch] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [weightCategory, setWeightCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [club, setClub] = useState<string | null>(null);

  const [, setSearchQuery] = useAtom(athletesSearchQueryAtom);
  const [, setSexFilter] = useAtom(athletesSexFilterAtom);
  const [, setWeightCategoryFilter] = useAtom(athletesWeightCategoryFilterAtom);
  const [, setStatusFilter] = useAtom(athletesStatusFilterAtom);
  const [, setClubFilter] = useAtom(athletesClubFilterAtom);
  const [, setPage] = useAtom(athletesPageAtom);
  const [, clearFilters] = useAtom(clearAthletesFiltersAtom);

  const categoryOptions = useMemo<SelectOption<string>[]>(() => {
    if (sex === 'Female') {
      return WOMEN_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
    } else if (sex === 'Male') {
      return MEN_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
    }
    return ALL_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
  }, [sex]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setSearchQuery(value);
    setPage(1);
  }, [setSearchQuery, setPage]);

  const handleSexChange = useCallback((value: string | null) => {
    setSex(value);
    setSexFilter(value);
    setPage(1);
  }, [setSexFilter, setPage]);

  const handleWeightCategoryChange = useCallback((value: string | null) => {
    setWeightCategory(value);
    setWeightCategoryFilter(value);
    setPage(1);
  }, [setWeightCategoryFilter, setPage]);

  const handleStatusChange = useCallback((value: string | null) => {
    setStatus(value);
    setStatusFilter(value);
    setPage(1);
  }, [setStatusFilter, setPage]);

  const handleClubChange = useCallback((value: string | null) => {
    setClub(value);
    setClubFilter(value);
    setPage(1);
  }, [setClubFilter, setPage]);

  const handleClear = useCallback(() => {
    setSearch('');
    setSex(null);
    setWeightCategory(null);
    setStatus(null);
    setClub(null);
    clearFilters();
  }, [clearFilters]);

  return (
    <Accordion title="Filtros" defaultOpen={false}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-ui="inscripciones-filters-grid">
        <div data-ui="inscripciones-filter-search">
          <label className="block text-sm text-white/60 mb-1.5" data-ui="inscripciones-filter-search-label">Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Nombre o email..."
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
            data-ui="inscripciones-filter-search-input"
          />
        </div>

        <div data-ui="inscripciones-filter-sex">
          <CustomSelector
            label="Sexo"
            options={SEX_OPTIONS}
            value={sex}
            onChange={handleSexChange}
            placeholder="Todos"
            allowClear
          />
        </div>

        <div data-ui="inscripciones-filter-category">
          <CustomSelector
            label="Categoría"
            options={categoryOptions}
            value={weightCategory}
            onChange={handleWeightCategoryChange}
            placeholder="Todas"
            allowClear
          />
        </div>

        <div data-ui="inscripciones-filter-status">
          <CustomSelector
            label="Estado"
            options={STATUS_OPTIONS}
            value={status}
            onChange={handleStatusChange}
            placeholder="Todos"
            allowClear
          />
        </div>

        <div data-ui="inscripciones-filter-club">
          <CustomSelector
            label="Club"
            options={clubs.map(c => ({ value: c, label: c }))}
            value={club}
            onChange={handleClubChange}
            placeholder="Todos"
            allowClear
          />
        </div>

        <div className="flex items-end gap-3" data-ui="inscripciones-filter-clear">
          <Button variant="ghost" onClick={handleClear} className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10" data-ui="inscripciones-filter-clear-btn">Limpiar</Button>
        </div>
      </div>
    </Accordion>
  );
}

export default InscripcionesFiltersAccordion;
