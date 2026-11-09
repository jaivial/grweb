import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { HangingMedals, type EntrancePhase, type HangingMedalSpec } from '@components/medals';
import { useMatchingEntry } from '@hooks/useMediaQuery';
import { PrizeHeading } from './PrizeHeading';
import { SteelClip } from './SteelRail';
import {
  ABSOLUTE_CARD,
  ABSOLUTE_CARDS_GAP,
  ABSOLUTE_LAYOUTS,
  ABSOLUTE_PHYSICS,
  ABSOLUTE_SEX,
  ABSOLUTE_STATS,
  MEDAL_ASSETS,
  MEDAL_ENTRANCE,
  MEDAL_GOLD_COLOR,
  PRIZES_COPY,
  formatWeightClass,
  type AbsoluteWinnerEntry,
} from './medals.config';

const COPY = PRIZES_COPY.absolute;
/** Halo of the medal: normal opacity, opacity on hover, fade-in with the drop (from 62 % of it). */
const HALO = { opacity: 0.6, hoverOpacity: 0.9, fadeMs: 300, fadeFrom: 0.62 } as const;

const formatNumber = (value: number, decimals: number) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

interface StatView {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  highlight: boolean;
  /** Formatted number, or null while pending. */
  value: string | null;
}

function buildStats(entry: AbsoluteWinnerEntry): StatView[] {
  return ABSOLUTE_STATS.map((stat) => {
    const raw = entry.status === 'decided' ? entry[stat.field] : undefined;
    return { ...stat, value: raw === undefined ? null : formatNumber(raw, stat.decimals) };
  });
}

/** «Pendiente» with the same height as a number, so publishing the results does not move the card. */
function PendingValue({ stat }: { stat: StatView }) {
  return (
    <span
      className="inline-flex items-center gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] xl:text-[13px]"
      style={{ color: stat.highlight ? 'rgba(212, 175, 55, 0.75)' : 'rgba(255, 255, 255, 0.45)' }}
      data-ui={`absolute-winner-stat-${stat.id}-pending`}
    >
      {/* Dashed «empty slot» ring, wide screens only. */}
      <svg className="hidden xl:inline-block" width="8" height="8" viewBox="0 0 8 8" aria-hidden data-ui={`absolute-winner-stat-${stat.id}-pending-ring`}>
        <circle cx="4" cy="4" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" data-ui={`absolute-winner-stat-${stat.id}-pending-ring-circle`} />
      </svg>
      {COPY.valuePending}
    </span>
  );
}

export interface AbsoluteWinnerCardProps {
  entry: AbsoluteWinnerEntry;
}

/**
 * One absolute winner (by IPF GoodLift points): a gold medal hanging in 3D (its own view of the
 * shared canvas) from a steel clip on the card's top edge + the athlete. Reusable for N winners
 * (one per sex); pre-event (`status: 'pending'`) and post-event states from its entry.
 * The card frame must not stack (no z-index): the clip sits above the canvas, the card in z-20.
 */
export const AbsoluteWinnerCard = memo(function AbsoluteWinnerCard({ entry }: AbsoluteWinnerCardProps) {
  const layout = useMatchingEntry(ABSOLUTE_LAYOUTS);
  const card = ABSOLUTE_CARD[layout.id];
  const bandRef = useRef<HTMLDivElement>(null);
  const sex = ABSOLUTE_SEX[entry.sex];
  const key = entry.sex.toLowerCase();
  const decided = entry.status === 'decided';
  const stats = useMemo(() => buildStats(entry), [entry]);
  const detail = decided ? `${entry.club ?? ''} · ${sex.category} ${formatWeightClass(entry.category ?? '')} kg` : COPY.detailPending;
  const nameId = `absolute-winner-name-${key}`;

  const medals = useMemo<HangingMedalSpec[]>(
    () => [{ id: `absolute-gold-${key}`, label: sex.medalLabel, phase: 0.2, entryOrder: 0, assets: MEDAL_ASSETS.gold }],
    [key, sex.medalLabel],
  );
  const anchorX = card.bandWidth ? card.bandWidth * layout.anchorsPct[0] : `${layout.anchorsPct[0] * 100}%`;

  // Halo: hidden until the medal drops in, fades in from 62 % of the drop; brighter on hover.
  const [entrance, setEntrance] = useState<{ phase: EntrancePhase; durationMs: number }>({ phase: 'off', durationMs: 0 });
  const [hovered, setHovered] = useState(false);
  const handleEntrance = useCallback((phase: EntrancePhase, info: { durationMs: number }) => setEntrance({ phase, durationMs: info.durationMs }), []);
  const handleHover = useCallback((id: string | null) => setHovered(id !== null), []);
  const haloStyle = useMemo<CSSProperties>(
    () => ({
      top: layout.ribbonLength,
      background: `radial-gradient(circle, ${MEDAL_GOLD_COLOR}59 0%, transparent 70%)`,
      opacity: entrance.phase === 'waiting' ? 0 : hovered ? HALO.hoverOpacity : HALO.opacity,
      transition: `opacity ${HALO.fadeMs}ms ease-out`,
      transitionDelay: entrance.phase === 'playing' ? `${Math.round(entrance.durationMs * HALO.fadeFrom)}ms` : '0ms',
    }),
    [layout.ribbonLength, entrance, hovered],
  );

  return (
    <div className="relative mx-auto max-w-[1200px]" data-ui={`absolute-winner-frame-${key}`} data-sex={entry.sex}>
      <article
        className="relative z-20 grid overflow-hidden rounded-3xl border xl:rounded-[32px] min-[1280px]:min-h-[480px] min-[1280px]:grid-cols-[440px_1fr]"
        style={{ borderColor: `${MEDAL_GOLD_COLOR}4d`, background: 'linear-gradient(135deg, #141414 0%, #1a1512 55%, #0a0a0a 100%)' }}
        aria-labelledby={nameId}
        data-ui="absolute-winner-card"
        data-sex={entry.sex}
        data-status={entry.status}
      >
        <div className="relative" style={{ height: card.zoneHeight ?? undefined }} data-ui="absolute-winner-medal-area" aria-hidden>
          <div className="absolute left-1/2 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl" style={haloStyle} data-ui="absolute-winner-halo" />
        </div>

        <div className="relative px-5 pb-6 text-center min-[1280px]:py-12 min-[1280px]:pl-0 min-[1280px]:pr-12 min-[1280px]:text-left" data-ui="absolute-winner-content">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ borderColor: `${MEDAL_GOLD_COLOR}66`, color: MEDAL_GOLD_COLOR }}
            data-ui="absolute-winner-badge"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: MEDAL_GOLD_COLOR }} data-ui="absolute-winner-badge-dot" aria-hidden />
            {sex.badge}
          </p>
          <h3
            id={nameId}
            className={`mt-4 font-contrail text-3xl uppercase xl:text-5xl ${decided ? 'text-white' : 'text-white/50'}`}
            data-ui="absolute-winner-name"
          >
            {decided ? entry.name : COPY.namePending}
          </h3>
          <p className="mt-2 text-sm text-white/60 xl:text-base" data-ui="absolute-winner-detail">{detail}</p>

          <dl className="mt-6 grid grid-cols-3 gap-2 xl:gap-4" data-ui="absolute-winner-stats">
            {stats.map((stat) => (
              <div
                key={stat.id}
                className="rounded-2xl border px-3 py-3 xl:px-5 xl:py-4"
                style={stat.highlight ? { borderColor: `${MEDAL_GOLD_COLOR}80`, background: 'rgba(212, 175, 55, 0.06)' } : { borderColor: 'transparent', background: 'rgba(255, 255, 255, 0.05)' }}
                data-ui={`absolute-winner-stat-${stat.id}`}
              >
                <dt className="text-[10px] uppercase tracking-[0.12em] text-white/60 xl:text-xs" data-ui={`absolute-winner-stat-${stat.id}-label`}>
                  <span className="xl:hidden" data-ui={`absolute-winner-stat-${stat.id}-label-short`}>{stat.shortLabel}</span>
                  <span className="hidden xl:inline" data-ui={`absolute-winner-stat-${stat.id}-label-full`}>{stat.label}</span>
                </dt>
                {/* Fixed height = the number's (30 / 41 px) in both states. */}
                <dd className="mt-1 flex h-[30px] items-center justify-center xl:h-[41px] min-[1280px]:justify-start" data-ui={`absolute-winner-stat-${stat.id}-value`}>
                  {stat.value === null ? (
                    <PendingValue stat={stat} />
                  ) : (
                    <span className="font-contrail leading-none" data-ui={`absolute-winner-stat-${stat.id}-figure`}>
                      <span className="text-2xl xl:text-4xl" style={{ color: stat.highlight ? MEDAL_GOLD_COLOR : '#ffffff' }} data-ui={`absolute-winner-stat-${stat.id}-number`}>
                        {stat.value}
                      </span>
                      <span className="ml-1 hidden font-sans text-sm font-semibold text-white/50 xl:inline" data-ui={`absolute-winner-stat-${stat.id}-unit`}>{stat.unit}</span>
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 border-t border-white/10 pt-5 text-left" data-ui="absolute-winner-explainer">
            <p className="text-sm font-semibold text-white" data-ui="absolute-winner-explainer-title">{COPY.explainerTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/70 xl:text-base" data-ui="absolute-winner-explainer-text">{COPY.explainer}</p>
          </div>
        </div>
      </article>

      {/* 3D band of the medal (a view of the shared canvas) from the card's top edge. */}
      <div ref={bandRef} className="pointer-events-none absolute left-0 top-0" style={{ width: card.bandWidth ?? '100%', height: layout.canvasHeight }} data-ui="absolute-winner-band">
        <HangingMedals
          id={`absolute-${key}`}
          medals={medals}
          layouts={ABSOLUTE_LAYOUTS}
          physics={ABSOLUTE_PHYSICS}
          containerRef={bandRef}
          entrance={MEDAL_ENTRANCE}
          onMedalHover={handleHover}
          onEntranceChange={handleEntrance}
        />
      </div>
      <SteelClip width={card.pin.width} height={card.pin.height} radius={card.pin.radius} centerX={anchorX} dataUi="absolute-winner-clip" />
    </div>
  );
});

/**
 * Block C · «Ganador absoluto · GL Points»: one AbsoluteWinnerCard per entry of
 * ABSOLUTE_WINNERS (male and female winners, each with its prize). PROVISIONAL layout: cards
 * stacked with the one-card geometry until the Figma layout of the two cards is approved.
 */
export const AbsoluteWinners = memo(function AbsoluteWinners({ winners }: { winners: readonly AbsoluteWinnerEntry[] }) {
  return (
    <div className="mt-24 sm:mt-28" data-ui="absolute-winner">
      <PrizeHeading id="absolute-winner-title" eyebrow={COPY.eyebrow} title={COPY.title} titleAccent={COPY.titleAccent} dataUi="absolute-winner-heading" />
      <div className="mt-10 flex flex-col" style={{ gap: ABSOLUTE_CARDS_GAP }} data-ui="absolute-winner-list">
        {winners.map((entry) => (
          <AbsoluteWinnerCard key={entry.sex} entry={entry} />
        ))}
      </div>
    </div>
  );
});
