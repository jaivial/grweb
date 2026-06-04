import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { BackofficeHome } from './Home';
import * as apiModule from '../../utils/api';
import { currentCompeticionIdAtom, userAtom, isCurrentFerAtom } from '../../stores/auth.atoms';

vi.mock('../../hooks/useSignalR', () => ({
  useSignalR: () => undefined,
}));

vi.mock('../../stores/participants', () => ({
  participantCount: { value: 0 },
}));

const mockGetStatistics = vi.fn();
const mockGetAdminInscripcionStats = vi.fn();

beforeEach(() => {
  vi.spyOn(apiModule.api, 'getStatistics').mockImplementation(mockGetStatistics);
  vi.spyOn(apiModule.api, 'getAdminInscripcionStats').mockImplementation(mockGetAdminInscripcionStats);
  mockGetStatistics.mockReset();
  mockGetAdminInscripcionStats.mockReset();
});

function renderWithStore(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <BackofficeHome />
    </Provider>
  );
}

describe('BackofficeHome — revenue KPI', () => {
  it('uses getStatistics totalRevenue when GR Cup (isCurrentFer=false)', async () => {
    const store = createStore();
    store.set(userAtom, {
      id: 1,
      nombre: 'admin',
      email: 'a@b.com',
      isRoot: true,
      isSuperadmin: false,
      competiciones: [{ id: 5, nombre: 'GR Cup', slug: 'grcup', role: 'admin', tipo: 'grcup' }],
    } as any);
    store.set(currentCompeticionIdAtom, 5);

    mockGetStatistics.mockResolvedValue({
      totalParticipants: 10,
      totalTickets: 50,
      totalRevenue: 25,
      cashRevenue: 10,
      stripeRevenue: 15,
      bankRevenue: 0,
    });
    mockGetAdminInscripcionStats.mockResolvedValue({
      success: true,
      data: { revenue: 999, cashRevenue: 0, stripeRevenue: 0, count: 0, paidCount: 0 },
    });

    const { getByTestId } = renderWithStore(store);

    await waitFor(() => {
      // GR Cup shows 25.00 €
      expect(getByTestId('kpi-revenue')).toHaveTextContent('25.00 €');
    });
  });

  it('uses getAdminInscripcionStats revenue when FER (isCurrentFer=true)', async () => {
    const store = createStore();
    store.set(userAtom, {
      id: 1,
      nombre: 'admin',
      email: 'a@b.com',
      isRoot: true,
      isSuperadmin: false,
      competiciones: [{ id: 7, nombre: 'FER Powerlifting Day', slug: 'fer', role: 'admin', tipo: 'fer' }],
    } as any);
    store.set(currentCompeticionIdAtom, 7);

    mockGetStatistics.mockResolvedValue({
      totalParticipants: 10,
      totalTickets: 50,
      totalRevenue: 999,
      cashRevenue: 0,
      stripeRevenue: 999,
      bankRevenue: 0,
    });
    mockGetAdminInscripcionStats.mockResolvedValue({
      success: true,
      data: { revenue: 1234.5, cashRevenue: 0, stripeRevenue: 1234.5, count: 0, paidCount: 0 },
    });

    const { getByTestId } = renderWithStore(store);

    await waitFor(() => {
      expect(getByTestId('kpi-revenue')).toHaveTextContent('1234.50 €');
    });
  });

  it('re-fetches revenue when currentCompeticionIdAtom changes', async () => {
    const store = createStore();
    store.set(userAtom, {
      id: 1,
      nombre: 'admin',
      email: 'a@b.com',
      isRoot: true,
      isSuperadmin: false,
      competiciones: [
        { id: 1, nombre: 'A', slug: 'a', role: 'admin', tipo: 'fer' },
        { id: 2, nombre: 'B', slug: 'b', role: 'admin', tipo: 'fer' },
      ],
    } as any);
    store.set(currentCompeticionIdAtom, 1);

    mockGetStatistics.mockResolvedValue({
      totalParticipants: 0, totalTickets: 0, totalRevenue: 0,
      cashRevenue: 0, stripeRevenue: 0, bankRevenue: 0,
    });
    mockGetAdminInscripcionStats.mockResolvedValue({
      success: true,
      data: { revenue: 100, cashRevenue: 0, stripeRevenue: 100, count: 0, paidCount: 0 },
    });

    const { rerender, getByTestId } = render(
      <Provider store={store}>
        <BackofficeHome />
      </Provider>
    );

    await waitFor(() => {
      expect(getByTestId('kpi-revenue')).toHaveTextContent('100.00 €');
    });

    // Change competicionId → re-fetch expected
    mockGetAdminInscripcionStats.mockResolvedValue({
      success: true,
      data: { revenue: 555, cashRevenue: 0, stripeRevenue: 555, count: 0, paidCount: 0 },
    });
    store.set(currentCompeticionIdAtom, 2);

    rerender(
      <Provider store={store}>
        <BackofficeHome />
      </Provider>
    );

    await waitFor(() => {
      expect(getByTestId('kpi-revenue')).toHaveTextContent('555.00 €');
    });
  });
});
