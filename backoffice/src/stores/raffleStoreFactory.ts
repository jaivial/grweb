/**
 * Raffle Store Factory
 *
 * Creates a complete Jotai-backed raffle store scoped to a particular
 * competicion variant (FER Inscripcion vs GR Cup Athlete). Each variant
 * shares the same shape but uses different ID sources and adapter functions.
 *
 * Atoms created per factory call:
 * - raffleModalOpenAtom (boolean, default false)
 * - raffleConfigAtom ({ filterCriteria, numWinners, equityMode })
 * - raffleWinnersAtom (array, default [])
 * - raffleIsSpinningAtom (boolean, default false)
 * - raffleFallbackReasonAtom (string | null, default null)
 * - raffleIsEquityAvailableAtom (derived: numWinners >= 2)
 * - raffleCoercedConfigAtom (derived write atom: equityMode -> "none" when N < 2)
 * - raffleResetAtom (writable derived: reset all transient state)
 *
 * Why a factory? FER and GR Cup components each need their own isolated
 * state instances (so opening the FER modal doesn't open the GR modal and
 * vice-versa). A factory is the canonical Jotai pattern for this.
 */

import { atom, type PrimitiveAtom, type WritableAtom, type Atom } from 'jotai';
import type { RaffleWinner } from '../utils/api';

export type RaffleFilterCriteria = 'all' | 'onlyPaid' | 'onlyPaidNoCoupon';
export type RaffleEquityMode = 'none' | 'sex';

export interface RaffleConfig {
  filterCriteria: RaffleFilterCriteria;
  numWinners: number;
  equityMode: RaffleEquityMode;
}

export const DEFAULT_RAFFLE_CONFIG: RaffleConfig = {
  filterCriteria: 'all',
  numWinners: 1,
  equityMode: 'none',
};

export interface RaffleStore {
  raffleModalOpenAtom: PrimitiveAtom<boolean>;
  raffleConfigAtom: PrimitiveAtom<RaffleConfig>;
  raffleWinnersAtom: PrimitiveAtom<RaffleWinner[]>;
  raffleIsSpinningAtom: PrimitiveAtom<boolean>;
  raffleFallbackReasonAtom: PrimitiveAtom<string | null>;
  raffleIsEquityAvailableAtom: Atom<boolean>;
  raffleCoercedConfigAtom: WritableAtom<RaffleConfig, [RaffleConfig], void>;
  raffleResetAtom: WritableAtom<null, [], void>;
}

export function createRaffleStore(): RaffleStore {
  const raffleModalOpenAtom = atom<boolean>(false);

  const raffleConfigAtom = atom<RaffleConfig>({ ...DEFAULT_RAFFLE_CONFIG });

  const raffleWinnersAtom = atom<RaffleWinner[]>([]);

  const raffleIsSpinningAtom = atom<boolean>(false);

  const raffleFallbackReasonAtom = atom<string | null>(null);

  // Derived: equity mode only meaningful when picking 2+ winners
  const raffleIsEquityAvailableAtom = atom<boolean>(
    (get) => get(raffleConfigAtom).numWinners >= 2
  );

  // Derived write atom: coerces equityMode to "none" when N < 2.
  // Use this to read the "effective" config that always satisfies the gating.
  const raffleCoercedConfigAtom = atom<RaffleConfig, [RaffleConfig], void>(
    (get) => {
      const config = get(raffleConfigAtom);
      return {
        ...config,
        equityMode: config.numWinners >= 2 ? config.equityMode : 'none',
      };
    },
    (get, set, next: RaffleConfig) => {
      const safe: RaffleConfig = {
        ...next,
        equityMode: next.numWinners >= 2 ? next.equityMode : 'none',
      };
      set(raffleConfigAtom, safe);
    }
  );

  const raffleResetAtom = atom<null, [], void>(null, (_get, set) => {
    set(raffleConfigAtom, { ...DEFAULT_RAFFLE_CONFIG });
    set(raffleWinnersAtom, []);
    set(raffleIsSpinningAtom, false);
    set(raffleFallbackReasonAtom, null);
    set(raffleModalOpenAtom, false);
  });

  return {
    raffleModalOpenAtom,
    raffleConfigAtom,
    raffleWinnersAtom,
    raffleIsSpinningAtom,
    raffleFallbackReasonAtom,
    raffleIsEquityAvailableAtom,
    raffleCoercedConfigAtom,
    raffleResetAtom,
  };
}
