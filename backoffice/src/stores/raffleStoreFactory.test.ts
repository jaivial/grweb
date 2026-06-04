import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import { createRaffleStore, DEFAULT_RAFFLE_CONFIG } from './raffleStoreFactory';

describe('createRaffleStore — Phase 2 store factory', () => {
  let store: ReturnType<typeof createStore>;
  let raffle: ReturnType<typeof createRaffleStore>;

  beforeEach(() => {
    store = createStore();
    raffle = createRaffleStore();
  });

  describe('defaults', () => {
    it('raffleModalOpenAtom defaults to false', () => {
      expect(store.get(raffle.raffleModalOpenAtom)).toBe(false);
    });

    it('raffleConfigAtom defaults to all / 1 / none', () => {
      expect(store.get(raffle.raffleConfigAtom)).toEqual(DEFAULT_RAFFLE_CONFIG);
    });

    it('raffleWinnersAtom defaults to []', () => {
      expect(store.get(raffle.raffleWinnersAtom)).toEqual([]);
    });

    it('raffleIsSpinningAtom defaults to false', () => {
      expect(store.get(raffle.raffleIsSpinningAtom)).toBe(false);
    });

    it('raffleFallbackReasonAtom defaults to null', () => {
      expect(store.get(raffle.raffleFallbackReasonAtom)).toBeNull();
    });

    it('raffleIsEquityAvailableAtom defaults to false (numWinners=1)', () => {
      expect(store.get(raffle.raffleIsEquityAvailableAtom)).toBe(false);
    });
  });

  describe('setters', () => {
    it('opens and closes the modal', () => {
      store.set(raffle.raffleModalOpenAtom, true);
      expect(store.get(raffle.raffleModalOpenAtom)).toBe(true);
      store.set(raffle.raffleModalOpenAtom, false);
      expect(store.get(raffle.raffleModalOpenAtom)).toBe(false);
    });

    it('updates the config wholesale', () => {
      store.set(raffle.raffleConfigAtom, {
        filterCriteria: 'onlyPaid',
        numWinners: 5,
        equityMode: 'sex',
      });
      expect(store.get(raffle.raffleConfigAtom)).toEqual({
        filterCriteria: 'onlyPaid',
        numWinners: 5,
        equityMode: 'sex',
      });
    });

    it('stores winners', () => {
      const winners = [
        { id: 1, nombre: 'Ada', email: 'ada@example.com' },
        { id: 2, nombre: 'Linus', email: 'linus@example.com' },
      ];
      store.set(raffle.raffleWinnersAtom, winners);
      expect(store.get(raffle.raffleWinnersAtom)).toEqual(winners);
    });

    it('sets isSpinning', () => {
      store.set(raffle.raffleIsSpinningAtom, true);
      expect(store.get(raffle.raffleIsSpinningAtom)).toBe(true);
    });

    it('sets fallbackReason', () => {
      store.set(raffle.raffleFallbackReasonAtom, 'insufficient_pool_for_equity');
      expect(store.get(raffle.raffleFallbackReasonAtom)).toBe('insufficient_pool_for_equity');
    });
  });

  describe('equity gating', () => {
    it('raffleIsEquityAvailableAtom becomes true at numWinners=2', () => {
      store.set(raffle.raffleConfigAtom, { ...DEFAULT_RAFFLE_CONFIG, numWinners: 2 });
      expect(store.get(raffle.raffleIsEquityAvailableAtom)).toBe(true);
    });

    it('raffleIsEquityAvailableAtom stays false at numWinners=1', () => {
      store.set(raffle.raffleConfigAtom, { ...DEFAULT_RAFFLE_CONFIG, numWinners: 1 });
      expect(store.get(raffle.raffleIsEquityAvailableAtom)).toBe(false);
    });

    it('raffleCoercedConfigAtom returns equityMode="none" when numWinners=1', () => {
      store.set(raffle.raffleConfigAtom, {
        filterCriteria: 'all',
        numWinners: 1,
        equityMode: 'sex',
      });
      expect(store.get(raffle.raffleCoercedConfigAtom).equityMode).toBe('none');
    });

    it('raffleCoercedConfigAtom preserves equityMode="sex" when numWinners>=2', () => {
      store.set(raffle.raffleConfigAtom, {
        filterCriteria: 'all',
        numWinners: 4,
        equityMode: 'sex',
      });
      expect(store.get(raffle.raffleCoercedConfigAtom).equityMode).toBe('sex');
    });

    it('raffleCoercedConfigAtom write coerces equityMode when numWinners<2', () => {
      store.set(
        raffle.raffleCoercedConfigAtom,
        { filterCriteria: 'all', numWinners: 1, equityMode: 'sex' }
      );
      expect(store.get(raffle.raffleConfigAtom).equityMode).toBe('none');
    });
  });

  describe('reset', () => {
    it('raffleResetAtom clears winners, fallback, spinning, and closes modal', () => {
      store.set(raffle.raffleModalOpenAtom, true);
      store.set(raffle.raffleWinnersAtom, [
        { id: 1, nombre: 'Ada', email: 'ada@example.com' },
      ]);
      store.set(raffle.raffleIsSpinningAtom, true);
      store.set(raffle.raffleFallbackReasonAtom, 'insufficient_pool_for_equity');
      store.set(raffle.raffleConfigAtom, {
        filterCriteria: 'onlyPaidNoCoupon',
        numWinners: 7,
        equityMode: 'sex',
      });

      store.set(raffle.raffleResetAtom);

      expect(store.get(raffle.raffleModalOpenAtom)).toBe(false);
      expect(store.get(raffle.raffleWinnersAtom)).toEqual([]);
      expect(store.get(raffle.raffleIsSpinningAtom)).toBe(false);
      expect(store.get(raffle.raffleFallbackReasonAtom)).toBeNull();
      expect(store.get(raffle.raffleConfigAtom)).toEqual(DEFAULT_RAFFLE_CONFIG);
    });
  });

  describe('isolation', () => {
    it('two factory calls produce fully independent state', () => {
      const other = createRaffleStore();
      const otherStore = createStore();

      store.set(raffle.raffleModalOpenAtom, true);
      otherStore.set(other.raffleModalOpenAtom, false);

      expect(store.get(raffle.raffleModalOpenAtom)).toBe(true);
      expect(otherStore.get(other.raffleModalOpenAtom)).toBe(false);
    });
  });
});
