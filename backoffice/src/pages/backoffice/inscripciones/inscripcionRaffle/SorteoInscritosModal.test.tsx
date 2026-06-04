import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { Toaster } from 'react-hot-toast';
import { SorteoInscritosModal } from './SorteoInscritosModal';
import {
  createRaffleStore,
  DEFAULT_RAFFLE_CONFIG,
} from '../../../../stores/raffleStoreFactory';
import { api } from '../../../../utils/api';
import type { RaffleWinner } from '../../../../utils/api';

// Mock the api
vi.mock('../../../../utils/api', () => ({
  api: {
    drawRaffleInscripciones: vi.fn(),
  },
}));

// Mock react-custom-roulette
vi.mock('react-custom-roulette', () => ({
  Wheel: (props: { mustStartSpinning: boolean; data: Array<{ option: string }> }) => (
    <div
      data-testid="roulette-wheel"
      data-must-start-spinning={String(props.mustStartSpinning)}
      data-options={props.data.map((d) => d.option).join('|')}
    />
  ),
}));

// Stub RAF so useRaffleAnimation.start() does not actually run
beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as number);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

const sampleInscripcion: RaffleWinner = {
  id: 1,
  nombre: 'Ada Lovelace',
  email: 'ada@example.com',
  totalPagado: 50,
};

describe('SorteoInscritosModal', () => {
  let store: ReturnType<typeof createStore>;
  let raffle: ReturnType<typeof createRaffleStore>;

  beforeEach(() => {
    store = createStore();
    raffle = createRaffleStore();
    store.set(raffle.raffleModalOpenAtom, true);
  });

  const renderWithProvider = () =>
    render(
      <Provider store={store}>
        <SorteoInscritosModal
          competicionId={99}
          competicionKind="fer"
          store={raffle}
        />
        <Toaster />
      </Provider>
    );

  it('does not render anything when the modal is closed', () => {
    store.set(raffle.raffleResetAtom);
    render(
      <Provider store={store}>
        <SorteoInscritosModal
          competicionId={99}
          competicionKind="fer"
          store={raffle}
        />
      </Provider>
    );
    expect(screen.queryByTestId('sorteo-inscritos-modal')).toBeNull();
  });

  it('renders the modal body when open', () => {
    renderWithProvider();
    expect(screen.getByTestId('sorteo-inscritos-modal')).toBeInTheDocument();
    expect(screen.getByText('Sorteo de inscritos')).toBeInTheDocument();
  });

  it('renders the Sortear and Cerrar buttons', () => {
    renderWithProvider();
    expect(screen.getByTestId('sorteo-modal-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('sorteo-modal-close-btn')).toBeInTheDocument();
  });

  it('Sortear button is enabled when not spinning', () => {
    renderWithProvider();
    const btn = screen.getByTestId('sorteo-modal-submit-btn') as HTMLButtonElement;
    expect(btn).not.toBeDisabled();
  });

  it('Sortear button becomes disabled while spinning', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    renderWithProvider();
    fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    await waitFor(() => {
      expect(
        (screen.getByTestId('sorteo-modal-submit-btn') as HTMLButtonElement).disabled
      ).toBe(true);
    });
  });

  it('Sortear click calls api.drawRaffleInscripciones with the config', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockResolvedValue({
      success: true,
      data: { winners: [sampleInscripcion] },
    });
    store.set(raffle.raffleConfigAtom, {
      filterCriteria: 'onlyPaid',
      numWinners: 3,
      equityMode: 'sex',
    });
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });
    expect(api.drawRaffleInscripciones).toHaveBeenCalledWith(99, {
      filterCriteria: 'onlyPaid',
      numWinners: 3,
      equityMode: 'sex',
    });
  });

  it('Sortear success stores winners in the atom', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockResolvedValue({
      success: true,
      data: { winners: [sampleInscripcion] },
    });
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });
    expect(store.get(raffle.raffleWinnersAtom)).toHaveLength(1);
    expect(store.get(raffle.raffleWinnersAtom)[0].id).toBe(1);
  });

  it('Sortear fallback shows the banner with the pool insufficient message', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockResolvedValue({
      success: true,
      data: {
        winners: [sampleInscripcion],
        fallbackReason: 'insufficient_pool_for_equity',
      },
    });
    store.set(raffle.raffleConfigAtom, {
      filterCriteria: 'all',
      numWinners: 4,
      equityMode: 'sex',
    });
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sorteo-modal-fallback')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sorteo-modal-fallback').textContent).toMatch(
      /Pool insuficiente/
    );
  });

  it('Sortear error shows an error toast and re-enables the button', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockRejectedValue(new Error('Boom'));
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId('sorteo-modal-submit-btn') as HTMLButtonElement).disabled
      ).toBe(false);
    });
  });

  it('Cerrar button calls raffleResetAtom and clears state', () => {
    store.set(raffle.raffleWinnersAtom, [{ id: 1, nombre: 'Ada', email: 'a@a' }]);
    store.set(raffle.raffleIsSpinningAtom, true);
    store.set(raffle.raffleFallbackReasonAtom, 'insufficient_pool_for_equity');
    store.set(raffle.raffleConfigAtom, {
      filterCriteria: 'onlyPaidNoCoupon',
      numWinners: 5,
      equityMode: 'sex',
    });
    renderWithProvider();
    fireEvent.click(screen.getByTestId('sorteo-modal-close-btn'));
    expect(store.get(raffle.raffleModalOpenAtom)).toBe(false);
    expect(store.get(raffle.raffleWinnersAtom)).toEqual([]);
    expect(store.get(raffle.raffleIsSpinningAtom)).toBe(false);
    expect(store.get(raffle.raffleFallbackReasonAtom)).toBeNull();
    expect(store.get(raffle.raffleConfigAtom)).toEqual(DEFAULT_RAFFLE_CONFIG);
  });

  it('renders the empty state for the roulette when there are no winners', () => {
    renderWithProvider();
    expect(screen.getByTestId('sorteo-modal-roulette-empty')).toBeInTheDocument();
  });

  it('renders the roulette wheel once winners are present', async () => {
    vi.mocked(api.drawRaffleInscripciones).mockResolvedValue({
      success: true,
      data: { winners: [sampleInscripcion] },
    });
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sorteo-modal-roulette-wheel')).toBeInTheDocument();
    });
  });

  it('exposes competicionKind as a data attribute on the modal body', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosModal
          competicionId={99}
          competicionKind="grCup"
          store={raffle}
        />
      </Provider>
    );
    expect(
      screen.getByTestId('sorteo-inscritos-modal').getAttribute('data-competicion-kind')
    ).toBe('grCup');
  });

  it('uses a custom drawFn when provided (decouples from FER endpoint)', async () => {
    const customDrawFn = vi.fn().mockResolvedValue({
      winners: [sampleInscripcion],
      fallbackReason: undefined,
    });
    vi.mocked(api.drawRaffleInscripciones).mockClear();
    store.set(raffle.raffleConfigAtom, {
      filterCriteria: 'all',
      numWinners: 1,
      equityMode: 'none',
    });
    render(
      <Provider store={store}>
        <SorteoInscritosModal
          competicionId={99}
          competicionKind="fer"
          store={raffle}
          drawFn={customDrawFn}
        />
        <Toaster />
      </Provider>
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('sorteo-modal-submit-btn'));
    });
    expect(customDrawFn).toHaveBeenCalledTimes(1);
    expect(customDrawFn).toHaveBeenCalledWith(99, {
      filterCriteria: 'all',
      numWinners: 1,
      equityMode: 'none',
    });
    expect(api.drawRaffleInscripciones).not.toHaveBeenCalled();
    expect(store.get(raffle.raffleWinnersAtom)).toHaveLength(1);
  });
});
