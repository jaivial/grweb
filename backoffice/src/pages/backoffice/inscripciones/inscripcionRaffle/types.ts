/**
 * Sorteo Inscritos Raffle — internal types
 *
 * Re-exports the shared RaffleConfig + RaffleWinner shapes from the store
 * factory, and adds component-local types (animation options, etc.).
 */

import type { RaffleRequest, RaffleResult, RaffleWinner } from '../../../../utils/api';
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

/**
 * Draw-fn contract for the modal: take a competicionId + raffle request
 * body and return the unwrapped RaffleResult. The default implementation
 * delegates to `api.drawRaffleInscripciones` (FER Inscripcion endpoint).
 * GR Cup wires in `api.drawRaffleAtletas` instead.
 */
export type DrawFn = (
  competicionId: number,
  body: RaffleRequest
) => Promise<RaffleResult>;

export interface SorteoInscritosModalProps {
  competicionId: number;
  competicionKind?: 'fer' | 'grCup';
  /** Optional size of the eligible pool — controls Counter max. */
  poolSize?: number;
  /**
   * Custom draw function. When provided, the modal uses it instead of the
   * built-in `api.drawRaffleInscripciones` call. Used by GR Cup to call
   * `api.drawRaffleAtletas` (different backend route).
   */
  drawFn?: DrawFn;
}

