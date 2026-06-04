import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { useInscripciones } from './useInscripciones';
import * as apiModule from '../../../../utils/api';
import {
  ferInscripcionesSexoFilterAtom,
  ferInscripcionesCategoriaPesoFilterAtom,
  ferInscripcionesQuiereHandlerFilterAtom,
  ferInscripcionesQuierePeakProgramFilterAtom,
  ferInscripcionesParticipacionConfirmadaFilterAtom,
  ferInscripcionesHasCouponFilterAtom,
} from '../../../../stores/ferInscripcionesStore';

const COMP_ID = 99;

describe('useInscripciones — Phase 1 filter integration', () => {
  let store: ReturnType<typeof createStore>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let statsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store = createStore();
    fetchSpy = vi.spyOn(apiModule.api, 'getAdminInscripciones').mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 },
    });
    statsSpy = vi.spyOn(apiModule.api, 'getAdminInscripcionStats').mockResolvedValue({
      success: true,
      data: { total: 0, pagados: 0, pendientes: 0, upsells: 0, checkins: 0, porExperiencia: {}, conEntrenador: 0, sinEntrenador: 0 },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('calls api.getAdminInscripciones with all 6 new filter keys when atoms are set', async () => {
    store.set(ferInscripcionesSexoFilterAtom, 'masculino');
    store.set(ferInscripcionesCategoriaPesoFilterAtom, '-83kg');
    store.set(ferInscripcionesQuiereHandlerFilterAtom, true);
    store.set(ferInscripcionesQuierePeakProgramFilterAtom, false);
    store.set(ferInscripcionesParticipacionConfirmadaFilterAtom, true);
    store.set(ferInscripcionesHasCouponFilterAtom, false);

    const { result } = renderHook(() => useInscripciones(COMP_ID), { wrapper });

    await act(async () => {
      await result.current.fetchInscripciones();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const params = fetchSpy.mock.calls[0][1];
    expect(params).toMatchObject({
      sexo: 'masculino',
      categoriaPeso: '-83kg',
      quiereHandler: true,
      quierePeakProgram: false,
      participacionConfirmada: true,
      hasCoupon: false,
    });
  });

  it('calls api.getAdminInscripciones with null for the 6 new filter keys when atoms are unset', async () => {
    const { result } = renderHook(() => useInscripciones(COMP_ID), { wrapper });

    await act(async () => {
      await result.current.fetchInscripciones();
    });

    const params = fetchSpy.mock.calls[0][1];
    expect(params).toMatchObject({
      sexo: null,
      categoriaPeso: null,
      quiereHandler: null,
      quierePeakProgram: null,
      participacionConfirmada: null,
      hasCoupon: null,
    });
  });

  it('refreshFirstPage reloads page 1 and stats', async () => {
    const { result } = renderHook(() => useInscripciones(COMP_ID), { wrapper });

    await act(async () => {
      await result.current.refreshFirstPage();
    });

    expect(fetchSpy).toHaveBeenCalledWith(COMP_ID, expect.objectContaining({ page: 1, pageSize: 15 }));
    expect(statsSpy).toHaveBeenCalledWith(COMP_ID);
  });
});
