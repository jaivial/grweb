/**
 * Integration test: Sorteo Inscritos wired into the FER + GR Cup Inscripciones pages.
 *
 * FER scope: verify the Sorteo Inscritos button is rendered in the FER page
 * action bar, that clicking it flips the ferRaffleStore modal-open atom to
 * true (and unmounts on close). Deep interaction (Sortear -> api -> WinnersCard)
 * is already covered in SorteoInscritosModal.test.tsx; we re-assert a smoke
 * version here.
 *
 * GR Cup scope: GR Cup uses a separate backend route (athletes/raffle) and a
 * separate raffle store (grCupRaffleStore). The modal is wired with a custom
 * `drawFn={api.drawRaffleAtletas}` to decouple it from the FER endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { getDefaultStore, Provider } from 'jotai';
import { Toaster } from 'react-hot-toast';
import { FerInscripcionesPage } from '../../pages/backoffice/inscripciones/fer-components/FerInscripcionesPage';
import { GrCupInscripcionesPage } from '../../pages/backoffice/inscripciones/fer-components/GrCupInscripcionesPage';
import { ferRaffleStore } from '../../stores/inscripcionRaffleStore';
import { grCupRaffleStore } from '../../stores/athleteRaffleStore';
import { token } from '../../stores/auth';
import { api, type RaffleWinner } from '../../utils/api';
import {
  ferInscripcionesStatsAtom,
  ferInscripcionesLoadingAtom,
  ferInscripcionesErrorAtom,
  ferInscripcionesTotalCountAtom,
  ferInscripcionesPageAtom,
  ferInscripcionesAtom,
} from '../../stores/ferInscripcionesStore';
import {
  athletesAtom,
  athletesStatsAtom,
  athletesLoadingAtom,
  athletesErrorAtom,
  athletesPageAtom,
  athletesTotalCountAtom,
} from '../../stores/athletesStore';

vi.mock('../../utils/api', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    api: {
      ...((mod.api as Record<string, unknown>) ?? {}),
      getAdminInscripciones: vi.fn().mockResolvedValue({
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 },
      }),
      getAdminInscripcionStats: vi.fn().mockResolvedValue({
        success: true,
        data: { total: 0, pagados: 0, pendientes: 0, revenue: 0, cashRevenue: 0, stripeRevenue: 0 },
      }),
      drawRaffleInscripciones: vi.fn(),
      // GR Cup endpoint
      drawRaffleAtletas: vi.fn(),
      // GR Cup page-level dependencies
      getInscripcionPreparada: vi.fn().mockResolvedValue({
        dateTime: null,
        preparadas: false,
      }),
      getResponsableUrlInscripciones: vi.fn().mockResolvedValue({
        value: true,
        url: null,
        dateModified: null,
      }),
      getClubs: vi.fn().mockResolvedValue([]),
      getAthletes: vi.fn().mockResolvedValue({
        athletes: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0,
        stats: {
          total: 0,
          inscritos: 0,
          paid: 0,
          pending: 0,
          disqualified: 0,
          missingDocumentation: 0,
        },
      }),
    },
  };
});

vi.mock('react-custom-roulette', () => ({
  Wheel: (props: { mustStartSpinning: boolean; data: Array<{ option: string }> }) => (
    <div
      data-testid="roulette-wheel"
      data-must-start-spinning={String(props.mustStartSpinning)}
      data-options={props.data.map((d) => d.option).join('|')}
    />
  ),
}));

vi.mock('../../utils/pdfExport', () => ({
  exportPdf: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  // Stub RAF so useRaffleAnimation.start() does not actually run timers.
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as number);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  // Reset the global ferRaffleStore and grCupRaffleStore between tests so
  // modal state is fresh.
  getDefaultStore().set(ferRaffleStore.raffleResetAtom);
  getDefaultStore().set(grCupRaffleStore.raffleResetAtom);
  // Pre-seed the GR Cup athletes atoms so the page doesn't churn on mount.
  const ds = getDefaultStore();
  ds.set(athletesLoadingAtom, false);
  ds.set(athletesErrorAtom, null);
  ds.set(athletesAtom, []);
  ds.set(athletesStatsAtom, {
    total: 0,
    inscritos: 0,
    paid: 0,
    pending: 0,
    disqualified: 0,
    missingDocumentation: 0,
  });
  ds.set(athletesPageAtom, 1);
  ds.set(athletesTotalCountAtom, 0);
  // Set the auth token so useAthletes fetches in the GR Cup page actually run.
  token.value = 'authenticated';
});

afterEach(() => {
  vi.clearAllMocks();
  token.value = null;
});

const mockWinner1: RaffleWinner = {
  id: 101,
  nombre: 'Ada Lovelace',
  email: 'ada@example.com',
  totalPagado: 50,
  sexo: 'femenino',
};
const mockWinner2: RaffleWinner = {
  id: 102,
  nombre: 'Linus Torvalds',
  email: 'linus@example.com',
  totalPagado: 60,
  sexo: 'masculino',
};

const COMP_ID = 42;

function renderFerPage() {
  // Use the default Jotai store so that the global ferRaffleStore
  // atoms (modal-open, winners, etc.) are visible to the modal mounted
  // inside the page. Pre-seed the FER atoms via the default store too.
  const store = getDefaultStore();
  // Pre-seed the FER atoms so the page doesn't churn on mount.
  store.set(ferInscripcionesLoadingAtom, false);
  store.set(ferInscripcionesStatsAtom, {
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
  store.set(ferInscripcionesAtom, []);
  store.set(ferInscripcionesTotalCountAtom, 0);
  store.set(ferInscripcionesPageAtom, 1);
  store.set(ferInscripcionesErrorAtom, null);
  let result: ReturnType<typeof render> | undefined;
  act(() => {
    result = render(
      <Provider store={store}>
        <FerInscripcionesPage competicionId={COMP_ID} />
        <Toaster />
      </Provider>
    );
  });
  return { store, ...result! };
}

function renderGrCupPage() {
  const store = getDefaultStore();
  let result: ReturnType<typeof render> | undefined;
  act(() => {
    result = render(
      <Provider store={store}>
        <GrCupInscripcionesPage />
        <Toaster />
      </Provider>
    );
  });
  return { store, ...result! };
}

describe('Sorteo Inscritos — FER Inscripciones page integration', () => {
  it('renders the Sorteo button in the FER page action bar', () => {
    renderFerPage();
    const btn = screen.getByTestId('fer-sorteo-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Sorteo/);
  });

  it('clicking the Sorteo button opens the modal (gated by ferRaffleStore)', () => {
    renderFerPage();
    fireEvent.click(screen.getByTestId('fer-sorteo-button'));
    expect(screen.getByTestId('sorteo-inscritos-modal')).toBeInTheDocument();
  });

  it('Sortear triggers api.drawRaffleInscripciones with the current config', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockResolvedValue({
      success: true,
      data: { winners: [mockWinner1, mockWinner2] },
    });

    // Pre-configure the global ferRaffleStore directly. This bypasses
    // the user-facing counter/selector clicks (which are covered in
    // SorteoInscritosModal.test.tsx) and lets the integration test
    // focus on the page-level wiring.
    const defaultStore = getDefaultStore();
    defaultStore.set(ferRaffleStore.raffleModalOpenAtom, true);
    defaultStore.set(ferRaffleStore.raffleConfigAtom, {
      filterCriteria: 'onlyPaid',
      numWinners: 2,
      equityMode: 'sex',
    });

    renderFerPage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });

    expect(api.drawRaffleInscripciones).toHaveBeenCalledTimes(1);
    expect(api.drawRaffleInscripciones).toHaveBeenCalledWith(COMP_ID, {
      filterCriteria: 'onlyPaid',
      numWinners: 2,
      equityMode: 'sex',
    });

    await act(async () => {
      // Wait for winners to be rendered.
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Linus Torvalds')).toBeInTheDocument();
  });

  it('closing the modal unmounts the modal body (gated by ferRaffleStore atom)', () => {
    renderFerPage();
    fireEvent.click(screen.getByTestId('fer-sorteo-button'));
    expect(screen.getByTestId('sorteo-inscritos-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sorteo-modal-close-btn'));

    // The modal body should be gone — its content is rendered only
    // when the modal-open atom is true.
    expect(screen.queryByTestId('sorteo-inscritos-modal')).toBeNull();
  });

  it('uses data-competicion-kind="fer" on the modal', () => {
    renderFerPage();
    fireEvent.click(screen.getByTestId('fer-sorteo-button'));
    expect(
      screen.getByTestId('sorteo-inscritos-modal').getAttribute('data-competicion-kind')
    ).toBe('fer');
  });
});

describe('Sorteo Inscritos — GR Cup Inscripciones page integration', () => {
  it('renders the Sorteo button in the GR Cup page action bar', () => {
    renderGrCupPage();
    const btn = screen.getByTestId('grcup-sorteo-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Sorteo/);
  });

  it('clicking the Sorteo button opens the modal (gated by grCupRaffleStore)', () => {
    renderGrCupPage();
    fireEvent.click(screen.getByTestId('grcup-sorteo-button'));
    expect(screen.getByTestId('sorteo-inscritos-modal')).toBeInTheDocument();
  });

  it('uses data-competicion-kind="grCup" on the modal', () => {
    renderGrCupPage();
    fireEvent.click(screen.getByTestId('grcup-sorteo-button'));
    expect(
      screen.getByTestId('sorteo-inscritos-modal').getAttribute('data-competicion-kind')
    ).toBe('grCup');
  });

  it('Sortear calls api.drawRaffleAtletas (NOT drawRaffleInscripciones) and renders winners', async () => {
    // Mock the GR Cup endpoint to return 2 winners.
    vi.mocked(api.drawRaffleAtletas).mockResolvedValue({
      winners: [mockWinner1, mockWinner2],
    });

    // Pre-configure the global grCupRaffleStore directly. The page wires
    // competicionId={0} on the modal, so we expect the call to use 0.
    const defaultStore = getDefaultStore();
    defaultStore.set(grCupRaffleStore.raffleModalOpenAtom, true);
    defaultStore.set(grCupRaffleStore.raffleConfigAtom, {
      filterCriteria: 'all',
      numWinners: 2,
      equityMode: 'sex',
    });

    renderGrCupPage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });

    // The modal used the GR Cup endpoint, not the FER one.
    expect(api.drawRaffleAtletas).toHaveBeenCalledTimes(1);
    expect(api.drawRaffleAtletas).toHaveBeenCalledWith(0, {
      filterCriteria: 'all',
      numWinners: 2,
      equityMode: 'sex',
    });
    expect(api.drawRaffleInscripciones).not.toHaveBeenCalled();

    // Winners are surfaced in the WinnersCard.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Linus Torvalds')).toBeInTheDocument();
  });

  it('closing the modal unmounts the modal body (gated by grCupRaffleStore atom)', () => {
    renderGrCupPage();
    fireEvent.click(screen.getByTestId('grcup-sorteo-button'));
    expect(screen.getByTestId('sorteo-inscritos-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sorteo-modal-close-btn'));

    // The modal body should be gone — its content is rendered only
    // when the modal-open atom is true.
    expect(screen.queryByTestId('sorteo-inscritos-modal')).toBeNull();
  });
});
