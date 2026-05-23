import { useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import type { JSX } from 'react';
import { Accordion, CustomSelector, Button } from '../../../../components/ui';
import {
  ferInscripcionesSearchQueryAtom,
  ferInscripcionesPagoConfirmadoFilterAtom,
  ferInscripcionesExperienciaFilterAtom,
  ferInscripcionesPageAtom,
  ferClearInscripcionesFiltersAtom,
} from '../../../../stores/ferInscripcionesStore';

const FER_EXPERIENCIA_OPTIONS = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
];

const FER_PAGO_OPTIONS = [
  { value: 'true', label: 'Pagado' },
  { value: 'false', label: 'Pendiente' },
];

export function FerFiltersAccordion(): JSX.Element {
  const [search, setSearch] = useState('');
  const [pagoConfirmado, setPagoConfirmado] = useState<string | null>(null);
  const [experiencia, setExperiencia] = useState<string | null>(null);

  const [, setSearchQuery] = useAtom(ferInscripcionesSearchQueryAtom);
  const [, setPagoFilter] = useAtom(ferInscripcionesPagoConfirmadoFilterAtom);
  const [, setExperienciaFilter] = useAtom(ferInscripcionesExperienciaFilterAtom);
  const [, setPage] = useAtom(ferInscripcionesPageAtom);
  const [, clearFilters] = useAtom(ferClearInscripcionesFiltersAtom);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setSearchQuery(value);
    setPage(1);
  }, [setSearchQuery, setPage]);

  const handlePagoChange = useCallback((value: string | null) => {
    setPagoConfirmado(value);
    setPagoFilter(value === 'true' ? true : value === 'false' ? false : undefined);
    setPage(1);
  }, [setPagoFilter, setPage]);

  const handleExperienciaChange = useCallback((value: string | null) => {
    setExperiencia(value);
    setExperienciaFilter(value ?? undefined);
    setPage(1);
  }, [setExperienciaFilter, setPage]);

  const handleClear = useCallback(() => {
    setSearch('');
    setPagoConfirmado(null);
    setExperiencia(null);
    clearFilters();
  }, [clearFilters]);

  return (
    <Accordion title="Filtros" defaultOpen={false}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-ui="fer-filters-grid">
        <div data-ui="fer-search-filter">
          <label className="block text-sm text-white/60 mb-1.5" data-ui="fer-search-label">Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Nombre o email..."
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
            data-ui="fer-search-input"
          />
        </div>

        <CustomSelector
          label="Estado de pago"
          options={FER_PAGO_OPTIONS}
          value={pagoConfirmado}
          onChange={handlePagoChange}
          placeholder="Todos"
          allowClear
        />

        <CustomSelector
          label="Experiencia"
          options={FER_EXPERIENCIA_OPTIONS}
          value={experiencia}
          onChange={handleExperienciaChange}
          placeholder="Todas"
          allowClear
        />

        <div className="flex items-end gap-3" data-ui="fer-clear-filters">
          <Button variant="ghost" onClick={handleClear} className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10">Limpiar</Button>
        </div>
      </div>
    </Accordion>
  );
}
