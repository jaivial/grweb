import { memo, useMemo } from 'react';
import { PrizeHeading } from './PrizeHeading';
import { TrophyViewer } from './TrophyViewer';
import { ABSOLUTE_WINNERS, MEDAL_GOLD_COLOR, PRIZES_COPY } from './medals.config';

const COPY = PRIZES_COPY.absolute;

/** Block C · «Ganadores absolutos · GL points»: two cards (Masculino / Femenino) with a rotating 3D trophy. No results shown. */
export const AbsoluteWinnerCard = memo(function AbsoluteWinnerCard() {
  const cards = useMemo(() => ABSOLUTE_WINNERS, []);

  return (
    <div className="mt-24 sm:mt-28 3xl:mt-[120px]" data-ui="absolute-winner">
      <PrizeHeading id="absolute-winner-title" index="04" eyebrow={COPY.eyebrow} title={COPY.title} titleAccent={COPY.titleAccent} lead={COPY.lead} dataUi="absolute-winner-heading" />
      {/* Figma 199:330: 2 columns 588 + 24 + 588, 40 px under the header. */}
      <div className="mx-auto mt-10 grid max-w-[1200px] grid-cols-1 gap-6 md:grid-cols-2" data-ui="absolute-winner-cards">
        {cards.map((card) => (
          <article
            key={card.id}
            className="group relative overflow-hidden rounded-3xl border xl:rounded-[32px]"
            style={{
              borderColor: `${MEDAL_GOLD_COLOR}59`,
              background: `radial-gradient(ellipse 62% 42% at 55% 64%, ${MEDAL_GOLD_COLOR}38 0%, transparent 100%), #221d1f`,
            }}
            aria-labelledby={`absolute-winner-${card.id}-label`}
            data-ui={`absolute-winner-card-${card.id}`}
          >
            <div className="h-[300px] px-4 pt-6 sm:h-[380px] xl:h-[440px] xl:pt-10" data-ui={`absolute-winner-${card.id}-trophy-area`}>
              <TrophyViewer alt={card.trophyAlt} dataUi={`absolute-winner-${card.id}-trophy`} />
            </div>
            <div className="flex flex-col items-center p-6 text-center sm:p-10" data-ui={`absolute-winner-${card.id}-content`}>
              <p className="text-base text-[#D4AF37] sm:text-lg" data-ui={`absolute-winner-${card.id}-title`}>{card.title}</p>
              <h3 id={`absolute-winner-${card.id}-label`} className="mt-2 font-contrail text-4xl uppercase tracking-[0.05em] text-white xl:text-5xl" data-ui={`absolute-winner-${card.id}-label-text`}>
                {card.label}
              </h3>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
});
