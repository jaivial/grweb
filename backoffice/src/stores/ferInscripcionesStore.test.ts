import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import {
  ferInscripcionesSexoFilterAtom,
  ferInscripcionesCategoriaPesoFilterAtom,
  ferInscripcionesQuiereHandlerFilterAtom,
  ferInscripcionesQuierePeakProgramFilterAtom,
  ferInscripcionesParticipacionConfirmadaFilterAtom,
  ferInscripcionesHasCouponFilterAtom,
  ferHasActiveFiltersAtom,
  ferClearInscripcionesFiltersAtom,
} from './ferInscripcionesStore';

describe('ferInscripcionesStore — Phase 1 filters', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('all 6 new atoms start at null', () => {
    expect(store.get(ferInscripcionesSexoFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesCategoriaPesoFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesQuiereHandlerFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesQuierePeakProgramFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesParticipacionConfirmadaFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesHasCouponFilterAtom)).toBeNull();
  });

  it('roundtrips a value for sexo', () => {
    store.set(ferInscripcionesSexoFilterAtom, 'masculino');
    expect(store.get(ferInscripcionesSexoFilterAtom)).toBe('masculino');
  });

  it('roundtrips a value for categoriaPeso', () => {
    store.set(ferInscripcionesCategoriaPesoFilterAtom, '-83kg');
    expect(store.get(ferInscripcionesCategoriaPesoFilterAtom)).toBe('-83kg');
  });

  it('roundtrips a boolean for quiereHandler', () => {
    store.set(ferInscripcionesQuiereHandlerFilterAtom, true);
    expect(store.get(ferInscripcionesQuiereHandlerFilterAtom)).toBe(true);
    store.set(ferInscripcionesQuiereHandlerFilterAtom, false);
    expect(store.get(ferInscripcionesQuiereHandlerFilterAtom)).toBe(false);
  });

  it('roundtrips a boolean for quierePeakProgram', () => {
    store.set(ferInscripcionesQuierePeakProgramFilterAtom, true);
    expect(store.get(ferInscripcionesQuierePeakProgramFilterAtom)).toBe(true);
  });

  it('roundtrips a boolean for participacionConfirmada', () => {
    store.set(ferInscripcionesParticipacionConfirmadaFilterAtom, false);
    expect(store.get(ferInscripcionesParticipacionConfirmadaFilterAtom)).toBe(false);
  });

  it('roundtrips a boolean for hasCoupon', () => {
    store.set(ferInscripcionesHasCouponFilterAtom, true);
    expect(store.get(ferInscripcionesHasCouponFilterAtom)).toBe(true);
  });

  it('ferHasActiveFiltersAtom stays false when all 6 new atoms are null', () => {
    // First, ensure no legacy filters are set (we only check the 6 new ones)
    expect(store.get(ferHasActiveFiltersAtom)).toBe(false);
  });

  it('ferHasActiveFiltersAtom flips to true when any of the 6 new atoms is non-null', () => {
    store.set(ferInscripcionesSexoFilterAtom, 'femenino');
    expect(store.get(ferHasActiveFiltersAtom)).toBe(true);
  });

  it('ferHasActiveFiltersAtom flips to true when quiereHandler is set to true', () => {
    store.set(ferInscripcionesQuiereHandlerFilterAtom, true);
    expect(store.get(ferHasActiveFiltersAtom)).toBe(true);
  });

  it('ferClearInscripcionesFiltersAtom resets all 6 new atoms to null', () => {
    store.set(ferInscripcionesSexoFilterAtom, 'masculino');
    store.set(ferInscripcionesCategoriaPesoFilterAtom, '-74kg');
    store.set(ferInscripcionesQuiereHandlerFilterAtom, true);
    store.set(ferInscripcionesQuierePeakProgramFilterAtom, false);
    store.set(ferInscripcionesParticipacionConfirmadaFilterAtom, true);
    store.set(ferInscripcionesHasCouponFilterAtom, false);

    store.set(ferClearInscripcionesFiltersAtom);

    expect(store.get(ferInscripcionesSexoFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesCategoriaPesoFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesQuiereHandlerFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesQuierePeakProgramFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesParticipacionConfirmadaFilterAtom)).toBeNull();
    expect(store.get(ferInscripcionesHasCouponFilterAtom)).toBeNull();
    expect(store.get(ferHasActiveFiltersAtom)).toBe(false);
  });
});
