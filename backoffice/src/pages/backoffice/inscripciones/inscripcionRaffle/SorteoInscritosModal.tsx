/**
 * SorteoInscritosModal — the main raffle modal
 *
 * Layout (single scroll, no nested modals):
 * - Header: "Sorteo de inscritos" + close X
 * - Top section: <Roulette> (height ~360px)
 * - Middle section: <WinnersCard> (staggered reveal)
 * - Bottom section: <RaffleConfigAccordion> (default closed)
 * - Footer: "Sortear" + "Cerrar" buttons
 *
 * Behavior on Sortear:
 * 1. Set isSpinning=true
 * 2. Call drawFn(competicionId, config) — default: api.drawRaffleInscripciones (FER)
 * 3. Set winners, fallbackReason
 * 4. If fallbackReason, show toast
 * 5. Set isSpinning=false after animation completes
 *
 * On Cerrar: raffleResetAtom + close.
 *
 * The store is taken as a prop (default: ferRaffleStore) so the modal
 * is testable with a fresh Jotai store from the test side.
 *
 * The draw function is also a prop. GR Cup passes `api.drawRaffleAtletas`
 * (different backend route, unwrapped response). FER uses the default.
 */

import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import toast from 'react-hot-toast';
import { Modal } from '../../../../components/ui';
import { api } from '../../../../utils/api';
import { ferRaffleStore } from '../../../../stores/inscripcionRaffleStore';
import { grCupRaffleStore } from '../../../../stores/athleteRaffleStore';
import type { RaffleStore } from '../../../../stores/raffleStoreFactory';
import { Roulette } from './Roulette';
import { WinnersCard } from './WinnersCard';
import { RaffleConfigAccordion } from './RaffleConfigAccordion';
import { useRaffleAnimation } from './useRaffleAnimation';
import { wheelSegmentFor } from './helpers';
import { RAFFLE_WHEEL_HEIGHT, FALLBACK_REASON_MESSAGES } from './constants';
import type { DrawFn, SorteoInscritosModalProps } from './types';

export function SorteoInscritosModal({
  competicionId,
  competicionKind = 'fer',
  poolSize,
  store,
  drawFn,
}: SorteoInscritosModalProps & { store?: RaffleStore }): JSX.Element {
  const activeStore = useMemo<RaffleStore>(
    () => store ?? (competicionKind === 'fer' ? ferRaffleStore : grCupRaffleStore),
    [store, competicionKind]
  );

  // Default drawFn: FER Inscripcion endpoint. The backend wraps the
  // result in { success, data, message } so we unwrap .data here.
  // GR Cup passes its own drawFn which returns RaffleResult directly.
  const activeDrawFn = useMemo<DrawFn>(
    () =>
      drawFn ??
      (async (cid, body) => {
        const res = await api.drawRaffleInscripciones(cid, body);
        return res.data ?? { winners: [] };
      }),
    [drawFn]
  );

  const isOpen = useAtomValue(activeStore.raffleModalOpenAtom);
  const setOpen = useSetAtom(activeStore.raffleModalOpenAtom);
  const [winners, setWinners] = useAtom(activeStore.raffleWinnersAtom);
  const [isSpinning, setIsSpinning] = useAtom(activeStore.raffleIsSpinningAtom);
  const [fallbackReason, setFallbackReason] = useAtom(
    activeStore.raffleFallbackReasonAtom
  );
  const [config] = useAtom(activeStore.raffleCoercedConfigAtom);
  const reset = useSetAtom(activeStore.raffleResetAtom);

  const animation = useRaffleAnimation(winners, {
    spinDurationMs: 4000,
    revealDelayMs: 250,
  });

  const wheelData = useMemo(
    () => winners.map((w) => wheelSegmentFor(w)),
    [winners]
  );

  const hasWinners = winners.length > 0;
  const hasFallback = fallbackReason !== null;

  const handleClose = useCallback(() => {
    reset();
  }, [reset]);

  const handleSortear = useCallback(async () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setFallbackReason(null);
    setWinners([]);
    animation.reset();

    try {
      const result = await activeDrawFn(competicionId, {
        filterCriteria: config.filterCriteria,
        numWinners: config.numWinners,
        equityMode: config.equityMode,
      });
      if (result?.winners) {
        setWinners(result.winners);
      }
      if (result?.fallbackReason) {
        const msg =
          FALLBACK_REASON_MESSAGES[result.fallbackReason] ||
          'Sorteo completado con aviso';
        setFallbackReason(result.fallbackReason);
        toast(msg, { icon: '⚠️', duration: 4000 });
      }
      // Kick off the animation: the wheel will spin, then the
      // staggered reveal will surface winners one by one.
      animation.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al sortear';
      toast.error(message);
      setIsSpinning(false);
    }
  }, [
    isSpinning,
    competicionId,
    config,
    setIsSpinning,
    setFallbackReason,
    setWinners,
    animation,
    activeDrawFn,
  ]);

  const handleWheelFinish = useCallback(() => {
    setIsSpinning(false);
  }, [setIsSpinning]);

  // Allow consumers to wire a "setOpen" externally if they want.
  void setOpen;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Sorteo de inscritos"
      size="xl"
    >
      <div
        className="flex flex-col gap-6"
        data-ui="sorteo-modal-body"
        data-testid="sorteo-inscritos-modal"
        data-competicion-kind={competicionKind}
      >
        {/* Roulette — fixed height, no overflow */}
        <div
          className="rounded-2xl bg-white/5 border border-white/10 p-3"
          data-ui="sorteo-modal-roulette"
          data-testid="sorteo-modal-roulette"
        >
          {hasWinners ? (
            <Roulette
              data={wheelData}
              mustStartSpinning={isSpinning}
              onFinishSpinning={handleWheelFinish}
              dataTestid="sorteo-modal-roulette-wheel"
              height={RAFFLE_WHEEL_HEIGHT}
            />
          ) : (
            <div
              className="flex items-center justify-center w-full text-white/50 text-sm"
              style={{ height: `${RAFFLE_WHEEL_HEIGHT}px` }}
              data-ui="sorteo-modal-roulette-empty"
              data-testid="sorteo-modal-roulette-empty"
            >
              Pulsa Sortear para girar la ruleta
            </div>
          )}
        </div>

        {/* Winners — staggered reveal */}
        <div
          className="max-h-72 overflow-y-auto"
          data-ui="sorteo-modal-winners"
          data-testid="sorteo-modal-winners"
        >
          <WinnersCard
            winners={winners}
            revealAtIndex={animation.currentRevealIndex}
          />
        </div>

        {/* Fallback notice */}
        {hasFallback && (
          <div
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-200 text-sm"
            data-ui="sorteo-modal-fallback"
            data-testid="sorteo-modal-fallback"
            role="status"
          >
            {FALLBACK_REASON_MESSAGES[fallbackReason as string] ||
              'Sorteo completado con aviso'}
          </div>
        )}

        {/* Config accordion */}
        <div data-ui="sorteo-modal-config" data-testid="sorteo-modal-config">
          <RaffleConfigAccordion store={activeStore} poolSize={poolSize} />
        </div>

        {/* Footer actions */}
        <div
          className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-white/10"
          data-ui="sorteo-modal-footer"
          data-testid="sorteo-modal-footer"
        >
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-white/80 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            data-ui="sorteo-modal-close-btn"
            data-testid="sorteo-modal-close-btn"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleSortear}
            disabled={isSpinning}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-slate-900 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-ui="sorteo-modal-submit-btn"
            data-testid="sorteo-modal-submit-btn"
          >
            {isSpinning ? 'Sorteando…' : 'Sortear'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default SorteoInscritosModal;
