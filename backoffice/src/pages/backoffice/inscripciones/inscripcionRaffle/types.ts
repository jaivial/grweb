/**
 * Sorteo Inscritos Raffle — internal types
 *
 * Re-exports the shared RaffleConfig + RaffleWinner shapes from the store
 * factory, and adds component-local types (animation options, etc.).
 */

import type { RaffleWinner } from '../../../../utils/api';
import type {
  RaffleConfig,
  RaffleFilterCriteria,
  RaffleEquityMode,
} from '../../../../stores/raffleStoreFactory';

export type { RaffleConfig, RaffleWinner, RaffleFilterCriteria, RaffleEquityMode };

export interface UseRaffleAnimationOptions {
  /** Delay between reveals during the staggered reveal phase. Default 250ms. */
  revealDelayMs?: number;
  /** Duration of the wheel spin phase. Default 4000ms. */
  spinDurationMs?: number;
}

export interface UseRaffleAnimationResult {
  isSpinning: boolean;
  currentRevealIndex: number;
  start: () => void;
  stop: () => void;
  revealAt: (i: number) => void;
  reset: () => void;
}

export interface SorteoInscritosButtonProps {
  /** 'fer' uses Inscripcion store; 'grCup' uses Athlete store. */
  competicionKind?: 'fer' | 'grCup';
  className?: string;
  label?: string;
  disabled?: boolean;
}

export interface SorteoInscritosModalProps {
  competicionId: number;
  competicionKind?: 'fer' | 'grCup';
  /** Optional size of the eligible pool — controls Counter max. */
  poolSize?: number;
}

