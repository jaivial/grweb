import { memo, useMemo } from 'react';
import { StaticMedal } from '@components/medals';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { PrizeHeading } from './PrizeHeading';
import { ABSOLUTE_MEDAL, ABSOLUTE_WINNER, MEDAL_ASSETS, MEDAL_GOLD_COLOR, PRIZES_COPY, type AbsoluteWinner } from './medals.config';

const COPY = PRIZES_COPY.absolute;
const EMPTY = '\u2014';
const DESKTOP_QUERY = '(min-width: 768px)';

const formatNumber = (value: number | undefined, decimals: number) =>
  value === undefined ? EMPTY : value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

interface Stat {
  id: string;
  label: string;
  unit: string;
  value: string;
  highlight?: boolean;
}

function buildStats(winner: AbsoluteWinner | null): Stat[] {
  return [
    { id: 'total', label: 'Total', unit: 'kg', value: formatNumber(winner?.totalKg, 1) },
    { id: 'gl-points', label: 'GL Points', unit: 'GL', value: formatNumber(winner?.glPoints, 2), highlight: true },
    { id: 'bodyweight', label: 'Peso corporal', unit: 'kg', value: formatNumber(winner?.bodyweightKg, 1) },
  ];
}

/** Block C · «Ganador absoluto · GL Points»: static gold medal + best athlete by IPF GoodLift points. */
export const AbsoluteWinnerCard = memo(function AbsoluteWinnerCard() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const medal = isDesktop ? ABSOLUTE_MEDAL.desktop : ABSOLUTE_MEDAL.mobile;
  const winner = ABSOLUTE_WINNER;
  const stats = useMemo(() => buildStats(winner), [winner]);
  const detail = winner ? `${winner.club} · ${winner.category}` : COPY.detailPlaceholder;

  return (
    <div className="mt-24 sm:mt-28" data-ui="absolute-winner">
      <PrizeHeading id="absolute-winner-title" eyebrow={COPY.eyebrow} title={COPY.title} titleAccent={COPY.titleAccent} dataUi="absolute-winner-heading" />
      <article
        className="group relative mx-auto mt-10 grid max-w-[1200px] overflow-hidden rounded-3xl border xl:min-h-[480px] xl:grid-cols-[440px_1fr] xl:rounded-[32px]"
        style={{ borderColor: `${MEDAL_GOLD_COLOR}4d`, background: 'linear-gradient(135deg, #141414 0%, #1a1512 55%, #0a0a0a 100%)' }}
        aria-labelledby="absolute-winner-name"
        data-ui="absolute-winner-card"
      >
        <div className="relative flex justify-center pb-4 xl:pb-0" data-ui="absolute-winner-medal-area" aria-hidden>
          <div
            className="absolute left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-60 blur-3xl transition-opacity duration-200 group-hover:opacity-90"
            style={{ top: medal.ribbonLength, background: `radial-gradient(circle, ${MEDAL_GOLD_COLOR}59 0%, transparent 70%)` }}
            data-ui="absolute-winner-halo"
          />
          <StaticMedal
            src={MEDAL_ASSETS.gold.image}
            ribbonSrc={MEDAL_ASSETS.gold.ribbon}
            width={medal.width}
            ribbonLength={medal.ribbonLength}
            ribbonWidth={medal.ribbonWidth}
            ribbonSpreadTop={medal.ribbonSpreadTop}
            ribbonSpreadBottom={medal.ribbonSpreadBottom}
            className="relative"
            dataUi="absolute-winner-medal"
          />
        </div>

        <div className="relative px-5 pb-6 text-center xl:py-12 xl:pl-0 xl:pr-12 xl:text-left" data-ui="absolute-winner-content">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ borderColor: `${MEDAL_GOLD_COLOR}66`, color: MEDAL_GOLD_COLOR }}
            data-ui="absolute-winner-badge"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: MEDAL_GOLD_COLOR }} data-ui="absolute-winner-badge-dot" aria-hidden />
            {COPY.badge}
          </p>
          <h3 id="absolute-winner-name" className="mt-4 font-contrail text-3xl uppercase text-white xl:text-5xl" data-ui="absolute-winner-name">
            {winner?.name ?? COPY.namePlaceholder}
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
                  {stat.label}
                </dt>
                <dd className="mt-1 font-contrail leading-none" data-ui={`absolute-winner-stat-${stat.id}-value`}>
                  <span className="text-2xl xl:text-4xl" style={{ color: stat.highlight ? MEDAL_GOLD_COLOR : '#ffffff' }} data-ui={`absolute-winner-stat-${stat.id}-number`}>
                    {stat.value}
                  </span>
                  <span className="ml-1 text-xs text-white/50" data-ui={`absolute-winner-stat-${stat.id}-unit`}>{stat.unit}</span>
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
    </div>
  );
});
