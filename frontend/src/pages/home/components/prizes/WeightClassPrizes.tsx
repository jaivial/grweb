import { memo, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { useAtom } from 'jotai';
import { HangingMedals, type HangingMedalSpec } from '@components/medals';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { weightClassTabAtom } from '../../atoms/prizes';
import { PrizeHeading } from './PrizeHeading';
import { SmokeCloud } from './SmokeCloud';
import {
  MEDAL_ASSETS,
  MEDAL_PHYSICS,
  PODIUM_COLLISIONS,
  PODIUM_LAYOUTS,
  PODIUM_MEDALS,
  PRIZES_COPY,
  WEIGHT_CLASS_GROUPS,
  formatWeightClass,
  type WeightClassSex,
} from './medals.config';

const COPY = PRIZES_COPY.weightClasses;
/** Two columns (Hombres | Mujeres) from here; tabs above a two-column chip list below. */
const COLUMNS_QUERY = '(min-width: 768px)';
const TABLET_QUERY = '(min-width: 480px)';
const DESKTOP_QUERY = '(min-width: 1024px)';
/** Cloud layer height (Figma 400 on desktop), CSS px. */
const CLOUD_HEIGHT = { desktop: 400, tablet: 300, mobile: 220 } as const;

type Group = (typeof WEIGHT_CLASS_GROUPS)[number];

/** The weight classes of one sex as plain text chips. */
const WeightClassList = memo(function WeightClassList({ group, columns }: { group: Group; columns?: boolean }) {
  return (
    <ul className="grid grid-cols-3 gap-2" data-ui={`weight-class-${group.id}-list`}>
      {group.classes.map((weightClass) => (
        <li
          key={weightClass}
          className="rounded-lg border border-[#2e2729] bg-[#221d1f] px-2 py-3 text-center font-contrail text-base uppercase tracking-[0.02em] text-white sm:px-3 sm:text-lg"
          data-ui={`weight-class-${group.id}-${weightClass}`}
        >
          {formatWeightClass(weightClass)}KG
        </li>
      ))}
    </ul>
  );
});

const groupTitleClass = 'font-contrail text-2xl uppercase tracking-[0.02em] text-white';

/** ≥ 768 px: Hombres | Mujeres side by side. */
const WeightClassColumns = memo(function WeightClassColumns() {
  return (
    <div className="mx-auto mt-10 grid max-w-[824px] grid-cols-2 gap-6" data-ui="weight-class-columns">
      {WEIGHT_CLASS_GROUPS.map((group) => (
        <section key={group.id} className="rounded-[20px] border border-[#2e2729] bg-[#221d1f]/85 p-7" aria-labelledby={`weight-class-${group.id}-title`} data-ui={`weight-class-group-${group.id}`}>
          <div className="mb-4 flex items-center justify-between" data-ui={`weight-class-group-${group.id}-head`}>
            <h3 id={`weight-class-${group.id}-title`} className={groupTitleClass} data-ui={`weight-class-group-${group.id}-title`}>
              {group.label}
            </h3>
            <span className="text-xs font-medium uppercase tracking-[0.04em] text-[#6b7280]" data-ui={`weight-class-group-${group.id}-count`}>{group.classes.length} categorías</span>
          </div>
          <WeightClassList group={group} />
        </section>
      ))}
    </div>
  );
});

/** < 768 px: Hombres/Mujeres tabs (ARIA tablist, ←/→) above a two-column chip list. */
const WeightClassTabs = memo(function WeightClassTabs() {
  const [active, setActive] = useAtom(weightClassTabAtom);
  const tabRefs = useRef<Partial<Record<WeightClassSex, HTMLButtonElement | null>>>({});
  const activeGroup = useMemo(() => WEIGHT_CLASS_GROUPS.find((group) => group.id === active) ?? WEIGHT_CLASS_GROUPS[0], [active]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = WEIGHT_CLASS_GROUPS.findIndex((group) => group.id === active);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = WEIGHT_CLASS_GROUPS[(index + step + WEIGHT_CLASS_GROUPS.length) % WEIGHT_CLASS_GROUPS.length].id;
    setActive(next);
    tabRefs.current[next]?.focus();
  }, [active, setActive]);

  return (
    <div className="mt-8" data-ui="weight-class-tabs">
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-white/[0.08] bg-dark-surface/80 p-1"
        role="tablist"
        aria-label="Categorías de peso por sexo"
        onKeyDown={handleKeyDown}
        data-ui="weight-class-tablist"
      >
        {WEIGHT_CLASS_GROUPS.map((group) => {
          const selected = group.id === active;
          return (
            <button
              key={group.id}
              ref={(node) => { tabRefs.current[group.id] = node; }}
              id={`weight-class-tab-${group.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="weight-class-tabpanel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(group.id)}
              className={`min-h-[44px] rounded-full px-4 font-contrail text-base uppercase tracking-[0.04em] transition-colors ${selected ? 'bg-red-accent text-white shadow-[0_4px_16px_rgba(220,20,60,0.35)]' : 'text-white/60 hover:text-white'}`}
              data-ui={`weight-class-tab-${group.id}`}
            >
              {group.label}
              <span className={`ml-1.5 text-xs ${selected ? 'text-white/80' : 'text-white/40'}`} data-ui={`weight-class-tab-${group.id}-count`}>
                {group.classes.length}
              </span>
            </button>
          );
        })}
      </div>
      <div id="weight-class-tabpanel" role="tabpanel" aria-labelledby={`weight-class-tab-${activeGroup.id}`} data-ui="weight-class-tabpanel">
        <WeightClassList group={activeGroup} columns />
      </div>
    </div>
  );
});

/**
 * Block B · «Premio por categoría de peso»: the podium (silver · gold · bronze) hangs in the
 * block's padding-top, then the heading and the weight classes as text. Its canvas has its own
 * IntersectionObserver and physics world, separate from block A.
 */
export const WeightClassPrizes = memo(function WeightClassPrizes() {
  const blockRef = useRef<HTMLDivElement>(null);
  const showColumns = useMediaQuery(COLUMNS_QUERY);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  const cloudHeight = isDesktop ? CLOUD_HEIGHT.desktop : isTablet ? CLOUD_HEIGHT.tablet : CLOUD_HEIGHT.mobile;
  const medals = useMemo<HangingMedalSpec[]>(
    () => PODIUM_MEDALS.map((medal) => ({ id: medal.id, label: medal.label, phase: medal.phase, assets: MEDAL_ASSETS[medal.metal] })),
    [],
  );

  return (
    // padding-top = PODIUM_LAYOUTS[].canvasHeight + 8 (338 / 528 / 708). Figma: 120 px between blocks.
    <div ref={blockRef} className="relative mt-16 pt-[338px] sm:mt-20 sm:pt-[528px] 3xl:mt-[120px] 3xl:pt-[708px]" data-ui="weight-class-prizes">
      <HangingMedals medals={medals} layouts={PODIUM_LAYOUTS} physics={MEDAL_PHYSICS} collisions={PODIUM_COLLISIONS} containerRef={blockRef} />
      {/* Smoke above the ribbons (canvas z-30): they are born inside it. Figma: layer starts 30 px above the block. */}
      <SmokeCloud height={cloudHeight} className="top-[-30px] z-40" />
      <PrizeHeading index="03" eyebrow={COPY.eyebrow} title={COPY.title} titleAccent={COPY.titleAccent} lead={COPY.lead} dataUi="weight-class-heading" />
      {showColumns ? <WeightClassColumns /> : <WeightClassTabs />}
    </div>
  );
});
