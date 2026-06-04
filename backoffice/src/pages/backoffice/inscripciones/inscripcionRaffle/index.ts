/**
 * inscripcionRaffle/ — barrel export
 *
 * Public surface of the Sorteo Inscritos modal infrastructure.
 * Phase 3 (Inscripciones pages) will import from here.
 */

export { SorteoInscritosButton } from './SorteoInscritosButton';
export { SorteoInscritosModal } from './SorteoInscritosModal';
export { RaffleConfigAccordion } from './RaffleConfigAccordion';
export { WinnersCard } from './WinnersCard';
export { Roulette } from './Roulette';
export { useRaffleAnimation } from './useRaffleAnimation';

export type {
  SorteoInscritosButtonProps,
  SorteoInscritosModalProps,
  UseRaffleAnimationOptions,
  UseRaffleAnimationResult,
  RaffleConfig,
  RaffleWinner,
  RaffleFilterCriteria,
  RaffleEquityMode,
  DrawFn,
} from './types';
