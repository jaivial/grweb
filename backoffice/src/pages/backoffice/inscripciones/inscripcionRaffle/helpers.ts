/**
 * Sorteo Inscritos Raffle — helpers (pure functions only)
 */

import type { RaffleWinner } from '../../../../utils/api';

/**
 * Format a number as EUR currency. The codebase uses es-ES locale.
 */
export function formatEuro(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Build the short display label for a winner.
 */
export function winnerDisplayName(winner: RaffleWinner): string {
  return winner.nombre || '—';
}

/**
 * Build the club/category secondary line for a winner.
 */
export function winnerMetaLine(winner: RaffleWinner): string {
  const parts: string[] = [];
  const w = winner as RaffleWinner & {
    club?: string;
    categoria?: string;
    categoriaPeso?: string;
  };
  if (w.club) parts.push(w.club);
  const cat = w.categoria ?? w.categoriaPeso;
  if (cat) parts.push(cat);
  return parts.join(' · ');
}

/**
 * Build the staggered reveal style for a given index.
 */
export function buildRevealStyle(
  index: number,
  revealAtIndex: number,
  stepMs = 100
): { transitionDelay: string; opacity: number } {
  return {
    transitionDelay: `${index * stepMs}ms`,
    opacity: index <= revealAtIndex ? 1 : 0.2,
  };
}

/**
 * Build a stable "segment label" for the wheel from a winner list.
 * Truncates long names so segments stay readable.
 */
export function wheelSegmentFor(winner: RaffleWinner, maxLen = 14): { option: string } {
  const name = winnerDisplayName(winner);
  return {
    option: name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name,
  };
}
