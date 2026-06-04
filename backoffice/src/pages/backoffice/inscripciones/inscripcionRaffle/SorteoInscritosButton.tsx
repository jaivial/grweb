/**
 * SorteoInscritosButton — top-right trigger to open the raffle modal
 *
 * Reads the appropriate modal-open atom (FER or GR Cup) and flips it
 * to true on click. Renders a button with the lucide-react Dices icon
 * and a "Sorteo" label. Stays presentational — no business logic.
 *
 * The `store` prop takes precedence over `competicionKind`. If a custom
 * store is passed (e.g. for testing with a fresh Jotai store), the
 * competicionKind is still used to set the data-competicion-kind
 * attribute but the store used is the one supplied.
 */

import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { useSetAtom } from 'jotai';
import { Dices } from 'lucide-react';
import { ferRaffleStore } from '../../../../stores/inscripcionRaffleStore';
import { grCupRaffleStore } from '../../../../stores/athleteRaffleStore';
import type { RaffleStore } from '../../../../stores/raffleStoreFactory';
import type { SorteoInscritosButtonProps } from './types';

export function SorteoInscritosButton({
  competicionKind = 'fer',
  className = '',
  label = 'Sorteo',
  disabled = false,
  store,
  dataTestid,
}: SorteoInscritosButtonProps & { store?: RaffleStore; dataTestid?: string }): JSX.Element {
  const activeStore = useMemo<RaffleStore>(
    () => store ?? (competicionKind === 'fer' ? ferRaffleStore : grCupRaffleStore),
    [store, competicionKind]
  );
  const setOpen = useSetAtom(activeStore.raffleModalOpenAtom);

  const handleClick = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [setOpen, disabled]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-2 px-4 py-2 min-h-[44px]',
        'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30',
        'rounded-xl font-medium text-sm',
        'hover:bg-yellow-400/30 hover:border-yellow-400/50',
        'focus:outline-none focus:ring-2 focus:ring-yellow-400/50',
        'active:bg-yellow-400/40',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-colors duration-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Abrir modal de sorteo"
      data-ui="sorteo-inscritos-button"
      data-testid={dataTestid ?? 'sorteo-inscritos-button'}
      data-competicion-kind={competicionKind}
    >
      <Dices className="w-4 h-4" aria-hidden="true" data-ui="sorteo-button-icon" />
      <span data-ui="sorteo-button-label">{label}</span>
    </button>
  );
}

export default SorteoInscritosButton;
