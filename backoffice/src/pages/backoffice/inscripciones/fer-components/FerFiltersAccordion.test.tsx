import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { FerFiltersAccordion } from './FerFiltersAccordion';
import {
  ferInscripcionesSexoFilterAtom,
  ferInscripcionesCategoriaPesoFilterAtom,
  ferInscripcionesQuiereHandlerFilterAtom,
  ferInscripcionesQuierePeakProgramFilterAtom,
  ferInscripcionesParticipacionConfirmadaFilterAtom,
  ferInscripcionesHasCouponFilterAtom,
  ferClearInscripcionesFiltersAtom,
} from '../../../../stores/ferInscripcionesStore';

// CustomSelector renders to a portal in jsdom, fireEvent.click on options
function selectOption(testIdPrefix: string, optionIndex = 0) {
  // Find the trigger button inside the wrapper div with data-testid
  const wrapper = screen.getByTestId(testIdPrefix);
  const trigger = wrapper.querySelector('button') as HTMLElement;
  fireEvent.click(trigger);
  // Options are rendered in a portal
  const options = screen.getAllByRole('option');
  fireEvent.click(options[optionIndex]);
}

describe('FerFiltersAccordion — Phase 1 new selectors', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  const renderWithProvider = () =>
    render(
      <Provider store={store}>
        <FerFiltersAccordion />
      </Provider>
    );

  it('renders the 6 new selectors with correct data-testid', () => {
    renderWithProvider();
    expect(screen.getByTestId('fer-filter-sexo')).toBeInTheDocument();
    expect(screen.getByTestId('fer-filter-categoria-peso')).toBeInTheDocument();
    expect(screen.getByTestId('fer-filter-quiere-handler')).toBeInTheDocument();
    expect(screen.getByTestId('fer-filter-quiere-peak-program')).toBeInTheDocument();
    expect(screen.getByTestId('fer-filter-participacion-confirmada')).toBeInTheDocument();
    expect(screen.getByTestId('fer-filter-has-coupon')).toBeInTheDocument();
  });

  it('changing sexo writes to ferInscripcionesSexoFilterAtom', () => {
    renderWithProvider();
    selectOption('fer-filter-sexo', 0); // masculino
    expect(store.get(ferInscripcionesSexoFilterAtom)).toBe('masculino');
  });

  it('changing categoriaPeso writes to ferInscripcionesCategoriaPesoFilterAtom', () => {
    renderWithProvider();
    selectOption('fer-filter-categoria-peso', 0); // -47
    expect(store.get(ferInscripcionesCategoriaPesoFilterAtom)).toBe('-47');
  });

  it('changing quiereHandler to true writes boolean to atom', () => {
    renderWithProvider();
    selectOption('fer-filter-quiere-handler', 0); // Sí (true)
    expect(store.get(ferInscripcionesQuiereHandlerFilterAtom)).toBe(true);
  });

  it('changing quierePeakProgram to false writes boolean to atom', () => {
    renderWithProvider();
    selectOption('fer-filter-quiere-peak-program', 1); // No (false)
    expect(store.get(ferInscripcionesQuierePeakProgramFilterAtom)).toBe(false);
  });

  it('changing participacionConfirmada writes boolean to atom', () => {
    renderWithProvider();
    selectOption('fer-filter-participacion-confirmada', 0); // Confirmado (true)
    expect(store.get(ferInscripcionesParticipacionConfirmadaFilterAtom)).toBe(true);
  });

  it('changing hasCoupon writes boolean to atom', () => {
    renderWithProvider();
    selectOption('fer-filter-has-coupon', 0); // Con cupón (true)
    expect(store.get(ferInscripcionesHasCouponFilterAtom)).toBe(true);
  });

  it('Limpiar resets the 6 new atoms to null', () => {
    renderWithProvider();
    store.set(ferInscripcionesSexoFilterAtom, 'femenino');
    store.set(ferInscripcionesCategoriaPesoFilterAtom, '-83');
    store.set(ferInscripcionesQuiereHandlerFilterAtom, true);
    store.set(ferInscripcionesQuierePeakProgramFilterAtom, true);
    store.set(ferInscripcionesParticipacionConfirmadaFilterAtom, true);
    store.set(ferInscripcionesHasCouponFilterAtom, true);

    // Click the Limpiar button
    const clearBtn = screen.getByText('Limpiar');
    fireEvent.click(clearBtn);

    expect(store.get(ferInscripcionesSexoFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesCategoriaPesoFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesQuiereHandlerFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesQuierePeakProgramFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesParticipacionConfirmadaFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesHasCouponFilterAtom)).toBeNull();
  });
});
