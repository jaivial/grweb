/**
 * Sorteo Inscritos Raffle — constants
 *
 * All magic numbers and label maps for the raffle UI live here.
 */

import type { SelectOption } from '../../../../components/ui/CustomSelector/CustomSelector';
import type { RaffleFilterCriteria, RaffleEquityMode } from '../../../../stores/raffleStoreFactory';

export const FILTER_CRITERIA_OPTIONS: ReadonlyArray<SelectOption<RaffleFilterCriteria>> = [
  { value: 'all', label: 'Todos los atletas' },
  { value: 'onlyPaid', label: 'Solo pagados' },
  { value: 'onlyPaidNoCoupon', label: 'Solo pagados sin cupón' },
];

export const EQUITY_MODE_OPTIONS: ReadonlyArray<SelectOption<RaffleEquityMode>> = [
  { value: 'none', label: 'Sin igualdad' },
  { value: 'sex', label: 'Equidad por sexo' },
];

export const RAFFLE_TIMING = {
  spinDurationMs: 4000,
  revealDelayMs: 250,
} as const;

export const FALLBACK_REASON_MESSAGES: Record<string, string> = {
  insufficient_pool_for_equity: 'Pool insuficiente para equidad, sorteo aleatorio aplicado',
};

export const RAFFLE_WHEEL_HEIGHT = 360;
export const DEFAULT_POOL_SIZE_FALLBACK = 100;

/**
 * Compute the equity-aware summary string for a given N.
 * Example: N=4 -> "2 masculinos + 2 femeninos"
 */
export function formatEquityBreakdown(numWinners: number): string {
  const half = Math.floor(numWinners / 2);
  const remainder = numWinners - half * 2;
  const masc = half + remainder;
  const fem = half;
  return `${masc} masculino${masc === 1 ? '' : 's'} + ${fem} femenino${fem === 1 ? '' : 's'}`;
}
