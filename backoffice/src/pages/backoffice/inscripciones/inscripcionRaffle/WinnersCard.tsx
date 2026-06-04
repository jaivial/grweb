/**
 * WinnersCard — staggered reveal of raffle winners
 *
 * Renders an empty state when there are no winners, otherwise a
 * vertical stack of cards that fade in one at a time. The reveal
 * is driven by the parent via the `revealAtIndex` prop (from
 * useRaffleAnimation).
 */

import { useMemo } from 'react';
import type { JSX } from 'react';
import type { RaffleWinner } from '../../../../utils/api';
import { buildRevealStyle, formatEuro, winnerDisplayName, winnerMetaLine } from './helpers';

export interface WinnersCardProps {
  winners: RaffleWinner[];
  revealAtIndex?: number;
  dataTestid?: string;
}

export function WinnersCard({
  winners,
  revealAtIndex = -1,
  dataTestid = 'raffle-winners-card',
}: WinnersCardProps): JSX.Element {
  const isEmpty = useMemo(() => winners.length === 0, [winners.length]);

  if (isEmpty) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 px-4 text-center"
        data-ui="winners-empty"
        data-testid={`${dataTestid}-empty`}
      >
        <div
          className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3"
          data-ui="winners-empty-icon"
          aria-hidden="true"
        >
          <svg
            className="w-7 h-7 text-white/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3
          className="text-base font-medium text-white/80"
          data-ui="winners-empty-title"
        >
          Aún no hay ganadores
        </h3>
        <p
          className="text-sm text-white/50 mt-1 max-w-xs"
          data-ui="winners-empty-description"
        >
          Pulsa Sortear para obtener los ganadores del sorteo.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-ui="winners-list"
      data-testid={dataTestid}
    >
      {winners.map((winner, i) => {
        const style = buildRevealStyle(i, revealAtIndex);
        const name = winnerDisplayName(winner);
        const meta = winnerMetaLine(winner);
        const total = (winner as RaffleWinner & { totalPagado?: number }).totalPagado;
        const isRevealed = i <= revealAtIndex;
        return (
          <div
            key={winner.id ?? `${name}-${i}`}
            className="flex items-center gap-3 p-3 sm:p-4 bg-white/5 border border-white/10 rounded-xl transition-opacity duration-300"
            style={style}
            aria-hidden={!isRevealed}
            data-ui="winner-item"
            data-testid={`${dataTestid}-item-${i}`}
            data-revealed={String(isRevealed)}
          >
            <span
              className="w-9 h-9 shrink-0 rounded-full bg-yellow-400/20 text-yellow-300 font-bold text-sm flex items-center justify-center"
              data-ui="winner-position"
            >
              #{i + 1}
            </span>
            <div className="flex-1 min-w-0" data-ui="winner-body">
              <div
                className="text-sm sm:text-base font-medium text-white truncate"
                data-ui="winner-name"
              >
                {name}
              </div>
              {meta && (
                <div
                  className="text-xs text-white/50 truncate"
                  data-ui="winner-meta"
                >
                  {meta}
                </div>
              )}
            </div>
            <div
              className="text-sm font-semibold text-emerald-300/90 shrink-0"
              data-ui="winner-total"
            >
              {formatEuro(total)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WinnersCard;
