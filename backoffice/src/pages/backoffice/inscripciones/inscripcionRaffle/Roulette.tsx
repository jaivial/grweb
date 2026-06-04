/**
 * Roulette — custom name cycler for the raffle reveal.
 *
 * Replaces the wheel library with a focus stage that cycles through all
 * eligible names, accelerates to a peak, then eases into the final winner.
 * A confetti burst fires on completion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { Confetti } from '../../qr-reader/components/Confetti';
import { RAFFLE_WHEEL_HEIGHT } from './constants';

export interface RouletteCandidate {
  id?: number;
  label: string;
}

export interface RouletteProps {
  candidates: RouletteCandidate[];
  mustStartSpinning: boolean;
  onFinishSpinning: () => void;
  selectedLabel?: string;
  dataTestid?: string;
  height?: number;
}

const DEFAULT_LABEL = 'Pulsa Sortear para empezar';
const PREPARING_LABEL = 'Preparando sorteo...';

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function Roulette({
  candidates,
  mustStartSpinning,
  onFinishSpinning,
  selectedLabel,
  dataTestid = 'raffle-roulette',
  height = RAFFLE_WHEEL_HEIGHT,
}: RouletteProps): JSX.Element {
  const animationFrameRef = useRef<number | null>(null);
  const confettiTimerRef = useRef<number | null>(null);
  const spinStartRef = useRef<number | null>(null);
  const spinDurationRef = useRef(0);
  const targetStepsRef = useRef(0);

  const [displayLabel, setDisplayLabel] = useState(() => selectedLabel ?? candidates[0]?.label ?? DEFAULT_LABEL);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'spinning' | 'settled'>('idle');
  const [progress, setProgress] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const candidateLabels = useMemo(() => candidates.map((candidate) => candidate.label), [candidates]);
  const candidateKey = useMemo(() => candidateLabels.join('\u0001'), [candidateLabels]);

  const finishSpin = useCallback((finalLabel: string) => {
    animationFrameRef.current = null;
    spinStartRef.current = null;
    setPhase('settled');
    setProgress(1);
    setDisplayLabel(finalLabel);
    setShowConfetti(true);

    if (confettiTimerRef.current !== null) {
      window.clearTimeout(confettiTimerRef.current);
    }
    confettiTimerRef.current = window.setTimeout(() => {
      setShowConfetti(false);
      confettiTimerRef.current = null;
    }, 2400);

    onFinishSpinning();
  }, [onFinishSpinning]);

  useEffect(() => {
    if (!mustStartSpinning) return;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (confettiTimerRef.current !== null) {
      window.clearTimeout(confettiTimerRef.current);
      confettiTimerRef.current = null;
    }

    setPhase('preparing');
    setProgress(0);
    setDisplayLabel(PREPARING_LABEL);
    setShowConfetti(false);
  }, [mustStartSpinning]);

  useEffect(() => {
    if (!mustStartSpinning || candidateLabels.length === 0) return;

    const targetLabel = selectedLabel ?? candidateLabels[candidateLabels.length - 1] ?? candidateLabels[0] ?? DEFAULT_LABEL;
    const targetIndex = Math.max(0, candidateLabels.indexOf(targetLabel));
    const rounds = Math.max(4, Math.min(10, Math.ceil(candidateLabels.length / 4) + 3));
    const totalSteps = rounds * candidateLabels.length + targetIndex;
    const durationMs = Math.min(7000, Math.max(2800, 1800 + candidateLabels.length * 22));

    spinDurationRef.current = durationMs;
    targetStepsRef.current = totalSteps;
    spinStartRef.current = null;
    setPhase('spinning');

    const tick = (now: number) => {
      if (spinStartRef.current === null) spinStartRef.current = now;

      const elapsed = now - spinStartRef.current;
      const rawProgress = Math.min(1, elapsed / spinDurationRef.current);
      const easedProgress = easeInOutCubic(rawProgress);
      const traveled = Math.min(
        targetStepsRef.current,
        Math.floor(easedProgress * targetStepsRef.current)
      );
      const nextLabel = candidateLabels[traveled % candidateLabels.length] ?? targetLabel;

      setProgress(rawProgress);
      setDisplayLabel(nextLabel);

      if (rawProgress >= 1) {
        finishSpin(targetLabel);
        return;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [mustStartSpinning, candidateKey, selectedLabel, candidateLabels, finishSpin]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (confettiTimerRef.current !== null) {
        window.clearTimeout(confettiTimerRef.current);
      }
    };
  }, []);

  const speedGlow = Math.sin(Math.PI * progress);
  const subtitle = phase === 'settled'
    ? 'Ganador seleccionado'
    : phase === 'spinning'
      ? progress < 0.25
        ? 'Acelerando'
        : progress > 0.75
          ? 'Frenando'
          : 'A pleno ritmo'
      : 'Listo para sortear';

  const stageStyle: CSSProperties = {
    height: `${height}px`,
  };

  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden rounded-3xl border border-amber-300/15 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.16),_transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]"
      data-ui="roulette-wrapper"
      data-testid={dataTestid}
      style={stageStyle}
    >
      <div
        className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.07),transparent)] opacity-20"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-10 top-6 h-24 rounded-full bg-amber-300/12 blur-3xl transition-opacity duration-300"
        style={{ opacity: 0.35 + speedGlow * 0.6 }}
        aria-hidden="true"
      />
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-4 px-5 text-center sm:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70 backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full ${phase === 'settled' ? 'bg-emerald-400' : 'bg-amber-300'} shadow-[0_0_18px_rgba(251,191,36,0.55)]`} />
          {subtitle}
        </div>

        <div className="w-full rounded-[2rem] border border-white/10 bg-slate-950/80 px-5 py-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-8 sm:py-8">
          <div className="text-[11px] uppercase tracking-[0.35em] text-white/40">Nombre en foco</div>
          <div
            className={`mt-3 break-words text-3xl font-black leading-tight tracking-tight text-white transition-all duration-200 sm:text-5xl ${phase === 'spinning' ? 'scale-[1.03]' : ''}`}
            style={{
              transform: `translateY(${phase === 'spinning' ? 1 - speedGlow : 0}px) scale(${1 + speedGlow * 0.04})`,
              filter: `blur(${phase === 'spinning' ? speedGlow * 0.45 : 0}px)`,
              textShadow: `0 0 ${18 + speedGlow * 16}px rgba(251, 191, 36, ${0.12 + speedGlow * 0.2})`,
            }}
            data-ui="roulette-current-label"
          >
            {displayLabel}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
            <span>{candidateLabels.length} inscritos en juego</span>
          </div>

          <div className="mt-6 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-white transition-[width] duration-100"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
              data-ui="roulette-progress-bar"
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-[10px] uppercase tracking-[0.3em] text-white/35">
            <span>Acelera</span>
            <span className="text-center">Baraja</span>
            <span className="text-right">Frena</span>
          </div>

          <p className="mt-5 text-sm text-white/55">
            Los nombres pasan por la pantalla con ritmo creciente y se detienen en el seleccionado.
          </p>
        </div>
      </div>

      {showConfetti && (
        <div data-testid="raffle-roulette-confetti" data-ui="raffle-roulette-confetti">
          <Confetti active />
        </div>
      )}
    </div>
  );
}

export default Roulette;
