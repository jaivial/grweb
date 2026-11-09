import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { HangingMedals, type EntrancePhase, type HangingMedalSpec } from '@components/medals';
import { useMatchingEntry } from '@hooks/useMediaQuery';
import { PrizeHeading } from './PrizeHeading';
import { SteelClip } from './SteelRail';
import {
  ABSOLUTE_CARD,
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
// Wide layout classes use the literal `min-[1280px]:` variant (= ABSOLUTE_WIDE_QUERY; Tailwind
// only generates class names it can read verbatim in the source).
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
      className={`inline-flex items-center gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] min-[1280px]:text-[13px]`}
      style={{ color: stat.highlight ? 'rgba(212, 175, 55, 0.75)' : 'rgba(255, 255, 255, 0.45)' }}
      data-ui={`absolute-winner-stat-${stat.id}-pending`}
    >
      {/* Dashed «empty slot» ring, wide layout only. */}
      <svg className={`hidden min-[1280px]:inline-block`} width="8" height="8" viewBox="0 0 8 8" aria-hidden data-ui={`absolute-winner-stat-${stat.id}-pending-ring`}>
        <circle cx="4" cy="4" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" data-ui={`absolute-winner-stat-${stat.id}-pending-ring-circle`} />
      </svg>
      {COPY.valuePending}
    </span>
  );
}

export interface AbsoluteWinnerCardProps {
  entry: AbsoluteWinnerEntry;
  /** Position in the block: the drop of card n waits n × staggerMs where the layout staggers cards. */
  index: number;
}

/**
 * One absolute winner (by IPF GoodLift points): gold medal hanging in 3D at the top centre (its
 * own view of the shared canvas, clipped to the card's medal zone) from a steel clip on the
 * card's top edge, then badge, name, club · category and the three figures. Reusable for N
 * winners; pending / decided state from its own entry. The frame must not stack (no z-index):
 * the clip sits above the canvas, the card in z-20.
 */
export const AbsoluteWinnerCard = memo(function AbsoluteWinnerCard({ entry, index }: AbsoluteWinnerCardProps) {
  const layout = useMatchingEntry(ABSOLUTE_LAYOUTS);
  const card = ABSOLUTE_CARD[layout.id];
  const bandRef = useRef<HTMLDivElement>(null);
  const sex = ABSOLUTE_SEX[entry.sex];
  const key = entry.sex.toLowerCase();
  const decided = entry.status === 'decided';
  const stats = useMemo(() => buildStats(entry), [entry]);
  const detail = decided ? `${entry.club ?? ''} · ${sex.category} ${formatWeightClass(entry.category ?? '')} kg` : COPY.detailPending;
  const nameId = `absolute-winner-name-${key}`;

  const entryOrder = card.staggerCards ? index : 0;
  const medals = useMemo<HangingMedalSpec[]>(
    () => [{ id: `absolute-gold-${key}`, label: sex.medalLabel, phase: 0.2 + index * 0.37, entryOrder, assets: MEDAL_ASSETS.gold }],
    [key, sex.medalLabel, index, entryOrder],
  );

  // Halo: hidden until the medal drops in, fades in from 62 % of the drop; brighter on hover.
  const [entrance, setEntrance] = useState<{ phase: EntrancePhase; durationMs: number }>({ phase: 'off', durationMs: 0 });
  const [hovered, setHovered] = useState(false);
  const handleEntrance = useCallback((phase: EntrancePhase, info: { durationMs: number }) => setEntrance({ phase, durationMs: info.durationMs }), []);
  const handleHover = useCallback((id: string | null) => setHovered(id !== null), []);
  const haloStyle = useMemo<CSSProperties>(
    () => ({
      width: card.haloSize,
      height: card.haloSize,
      top: layout.ribbonLength + layout.medalHeight / 2,
      background: `radial-gradient(circle, ${MEDAL_GOLD_COLOR}59 0%, transparent 70%)`,
      opacity: entrance.phase === 'waiting' ? 0 : hovered ? HALO.hoverOpacity : HALO.opacity,
      transition: `opacity ${HALO.fadeMs}ms ease-out`,
      transitionDelay: entrance.phase === 'playing' ? `${Math.round(entrance.durationMs * HALO.fadeFrom)}ms` : '0ms',
    }),
    [card.haloSize, layout.ribbonLength, layout.medalHeight, entrance, hovered],
  );
  const cardStyle = useMemo<CSSProperties>(
    () => ({
      minHeight: card.minHeight,
      borderRadius: card.radius,
      borderColor: `${MEDAL_GOLD_COLOR}59`,
      background: 'linear-gradient(160deg, #1a1714 0%, #15120f 55%, #0d0c0b 100%)',
    }),
    [card.minHeight, card.radius],
  );

  return (
    <div className="relative mx-auto w-full max-w-[350px] xl:max-w-none" data-ui={`absolute-winner-frame-${key}`} data-sex={entry.sex}>
      <article className="relative z-20 flex h-full flex-col overflow-hidden border" style={cardStyle} aria-labelledby={nameId} data-ui="absolute-winner-card" data-sex={entry.sex} data-status={entry.status}>
        <div className="relative shrink-0" style={{ height: layout.canvasHeight }} data-ui="absolute-winner-medal-area" aria-hidden>
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={haloStyle} data-ui="absolute-winner-halo" />
        </div>

        <div className={`relative flex flex-1 flex-col items-center px-4 pb-6 text-center min-[1280px]:px-10 min-[1280px]:pb-10`} data-ui="absolute-winner-content">
          <p
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] min-[1280px]:text-[11px] min-[1280px]:tracking-[0.15em]`}
            style={{ borderColor: `${MEDAL_GOLD_COLOR}66`, color: MEDAL_GOLD_COLOR }}
            data-ui="absolute-winner-badge"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: MEDAL_GOLD_COLOR }} data-ui="absolute-winner-badge-dot" aria-hidden />
            {sex.badge}
          </p>
          <h3
            id={nameId}
            className={`mt-3 font-contrail text-[30px] uppercase leading-tight min-[1280px]:mt-4 min-[1280px]:text-5xl ${decided ? 'text-white' : 'text-white/50'}`}
            data-ui="absolute-winner-name"
          >
            {decided ? entry.name : COPY.namePending}
          </h3>
          <p className={`mt-1 text-sm text-white/60 min-[1280px]:mt-2 min-[1280px]:text-base`} data-ui="absolute-winner-detail">{detail}</p>

          <dl className={`mt-5 grid w-full grid-cols-3 gap-2 min-[1280px]:mt-6 min-[1280px]:gap-3`} data-ui="absolute-winner-stats">
            {stats.map((stat) => (
              <div
                key={stat.id}
                className={`rounded-2xl border px-2 py-3 min-[1280px]:px-4 min-[1280px]:py-4 min-[1280px]:text-left`}
                style={stat.highlight ? { borderColor: `${MEDAL_GOLD_COLOR}80`, background: 'rgba(212, 175, 55, 0.06)' } : { borderColor: 'transparent', background: 'rgba(255, 255, 255, 0.05)' }}
                data-ui={`absolute-winner-stat-${stat.id}`}
              >
                <dt className={`text-[10px] uppercase tracking-[0.1em] text-white/60 min-[1280px]:text-xs`} data-ui={`absolute-winner-stat-${stat.id}-label`}>
                  <span className={`min-[1280px]:hidden`} data-ui={`absolute-winner-stat-${stat.id}-label-short`}>{stat.shortLabel}</span>
                  <span className={`hidden min-[1280px]:inline`} data-ui={`absolute-winner-stat-${stat.id}-label-full`}>{stat.label}</span>
                </dt>
                {/* Fixed height = the number's (30 / 41 px) in both states. */}
                <dd className={`mt-1 flex h-[30px] items-center justify-center min-[1280px]:h-[41px] min-[1280px]:justify-start`} data-ui={`absolute-winner-stat-${stat.id}-value`}>
                  {stat.value === null ? (
                    <PendingValue stat={stat} />
                  ) : (
                    <span className="font-contrail leading-none" data-ui={`absolute-winner-stat-${stat.id}-figure`}>
                      <span className={`text-2xl min-[1280px]:text-4xl`} style={{ color: stat.highlight ? MEDAL_GOLD_COLOR : '#ffffff' }} data-ui={`absolute-winner-stat-${stat.id}-number`}>
                        {stat.value}
                      </span>
                      <span className={`ml-1 hidden font-sans text-sm font-semibold text-white/50 min-[1280px]:inline`} data-ui={`absolute-winner-stat-${stat.id}-unit`}>{stat.unit}</span>
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </article>

      {/* 3D band of the medal (a view of the shared canvas): the card's medal zone, from its top edge. */}
      <div ref={bandRef} className="pointer-events-none absolute inset-x-0 top-0" style={{ height: layout.canvasHeight }} data-ui="absolute-winner-band">
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
      <SteelClip width={card.pin.width} height={card.pin.height} radius={card.pin.radius} centerX="50%" dataUi="absolute-winner-clip" />
    </div>
  );
});

/**
 * Block C · «Ganadores absolutos · GL Points»: one AbsoluteWinnerCard per entry (male first),
 * then the GL Points explainer once, centred under the cards. Figma page 80 (194:912, 194:945):
 * 2 columns 588 + 24 + 588 from 1280, 2 equal columns with gap 16 from 768, stacked 350 wide
 * with gap 16 below (no tabs: both results get the same hierarchy).
 */
export const AbsoluteWinners = memo(function AbsoluteWinners({ winners }: { winners: readonly AbsoluteWinnerEntry[] }) {
  return (
    <div className="mt-24 sm:mt-28" data-ui="absolute-winner">
      <PrizeHeading id="absolute-winner-title" eyebrow={COPY.eyebrow} title={COPY.title} titleAccent={COPY.titleAccent} lead={COPY.lead} dataUi="absolute-winner-heading" />
      <div className={`mx-auto mt-10 grid max-w-[1200px] grid-cols-1 gap-[16px] xl:grid-cols-2 min-[1280px]:gap-[24px]`} data-ui="absolute-winner-list">
        {winners.map((entry, index) => (
          <AbsoluteWinnerCard key={entry.sex} entry={entry} index={index} />
        ))}
      </div>
      <div className="mx-auto mt-10 max-w-[760px] text-center" data-ui="absolute-winner-explainer">
        <p className="text-sm font-semibold text-white" data-ui="absolute-winner-explainer-title">{COPY.explainerTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-white/70 xl:text-base" data-ui="absolute-winner-explainer-text">{COPY.explainer}</p>
      </div>
    </div>
  );
});
