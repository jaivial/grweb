import { useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import type { JSX } from 'react';
import { Accordion, CustomSelector, Button } from '../../../../components/ui';
import {
  ferInscripcionesSearchQueryAtom,
  ferInscripcionesPagoConfirmadoFilterAtom,
  ferInscripcionesExperienciaFilterAtom,
  ferInscripcionesModalidadFilterAtom,
  ferInscripcionesPaymentMethodFilterAtom,
  ferInscripcionesPageAtom,
  ferClearInscripcionesFiltersAtom,
} from '../../../../stores/ferInscripcionesStore';

const FER_EXPERIENCIA_OPTIONS = [
  { value: 'rookie', label: 'Rookie' },
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
];

const FER_MODALIDAD_OPTIONS = [
  { value: 'completa', label: 'Competición completa' },
  { value: 'solo_banca', label: 'Solo banca' },
  { value: 'solo_peso_muerto', label: 'Solo peso muerto' },
];

const FER_PAGO_OPTIONS = [
  { value: 'true', label: 'Pagado' },
  { value: 'false', label: 'Pendiente' },
];

const FER_PAYMENT_METHOD_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'stripe', label: 'Stripe' },
];

export function FerFiltersAccordion(): JSX.Element {
  const [search, setSearch] = useState('');
  const [pagoConfirmado, setPagoConfirmado] = useState<string | null>(null);
  const [experiencia, setExperiencia] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  const [, setSearchQuery] = useAtom(ferInscripcionesSearchQueryAtom);
  const [, setPagoFilter] = useAtom(ferInscripcionesPagoConfirmadoFilterAtom);
  const [, setExperienciaFilter] = useAtom(ferInscripcionesExperienciaFilterAtom);
  const [, setModalidadFilter] = useAtom(ferInscripcionesModalidadFilterAtom);
  const [, setPaymentMethodFilter] = useAtom(ferInscripcionesPaymentMethodFilterAtom);
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

  const handleModalidadChange = useCallback((value: string | null) => {
    setModalidad(value);
    setModalidadFilter(value ?? undefined);
    setPage(1);
  }, [setModalidadFilter, setPage]);

  const handlePaymentMethodChange = useCallback((value: string | null) => {
    setPaymentMethod(value);
    setPaymentMethodFilter(value ?? undefined);
    setPage(1);
  }, [setPaymentMethodFilter, setPage]);

  const handleClear = useCallback(() => {
    setSearch('');
    setPagoConfirmado(null);
    setExperiencia(null);
    setModalidad(null);
    setPaymentMethod(null);
    clearFilters();
  }, [clearFilters]);

  return (
    <Accordion title="Filtros" defaultOpen={false}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" data-ui="fer-filters-grid">
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

        <CustomSelector
          label="Modalidad"
          options={FER_MODALIDAD_OPTIONS}
          value={modalidad}
          onChange={handleModalidadChange}
          placeholder="Todas"
          allowClear
        />

        <CustomSelector
          label="Método de pago"
          options={FER_PAYMENT_METHOD_OPTIONS}
          value={paymentMethod}
          onChange={handlePaymentMethodChange}
          placeholder="Todos"
          allowClear
        />

        <div className="flex items-end gap-3" data-ui="fer-clear-filters">
          <Button variant="ghost" onClick={handleClear} className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10">Limpiar</Button>
        </div>
      </div>
    </Accordion>
  );
}
