import { memo, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { useAtom } from 'jotai';
import { HangingMedals, type HangingMedalSpec } from '@components/medals';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { weightClassTabAtom } from '../../atoms/prizes';
import { PrizeHeading } from './PrizeHeading';
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

type Group = (typeof WEIGHT_CLASS_GROUPS)[number];

/** The weight classes of one sex as plain text chips. */
const WeightClassList = memo(function WeightClassList({ group, columns }: { group: Group; columns?: boolean }) {
  return (
    <ul className={columns ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'} data-ui={`weight-class-${group.id}-list`}>
      {group.classes.map((weightClass) => (
        <li
          key={weightClass}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center font-contrail text-sm uppercase tracking-[0.02em] text-white/85 sm:text-base"
          data-ui={`weight-class-${group.id}-${weightClass}`}
        >
          {formatWeightClass(weightClass)} kg
        </li>
      ))}
    </ul>
  );
});

const groupTitleClass = 'font-contrail text-xl uppercase tracking-[0.05em] text-white sm:text-2xl';

/** ≥ 768 px: Hombres | Mujeres side by side. */
const WeightClassColumns = memo(function WeightClassColumns() {
  return (
    <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-12" data-ui="weight-class-columns">
      {WEIGHT_CLASS_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`weight-class-${group.id}-title`} data-ui={`weight-class-group-${group.id}`}>
          <h3 id={`weight-class-${group.id}-title`} className={`mb-4 ${groupTitleClass}`} data-ui={`weight-class-group-${group.id}-title`}>
            {group.label}
          </h3>
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
  const medals = useMemo<HangingMedalSpec[]>(
    () => PODIUM_MEDALS.map((medal) => ({ id: medal.id, label: medal.label, phase: medal.phase, assets: MEDAL_ASSETS[medal.metal] })),
    [],
  );

  return (
    // padding-top = PODIUM_LAYOUTS[].canvasHeight + 8 (192 / 280 / 368).
    <div ref={blockRef} className="relative mt-16 pt-[192px] sm:mt-20 sm:pt-[280px] 3xl:pt-[368px]" data-ui="weight-class-prizes">
      <HangingMedals medals={medals} layouts={PODIUM_LAYOUTS} physics={MEDAL_PHYSICS} collisions={PODIUM_COLLISIONS} containerRef={blockRef} />
      <PrizeHeading eyebrow={COPY.eyebrow} title={COPY.title} titleAccent={COPY.titleAccent} lead={COPY.lead} dataUi="weight-class-heading" />
      {showColumns ? <WeightClassColumns /> : <WeightClassTabs />}
    </div>
  );
});
