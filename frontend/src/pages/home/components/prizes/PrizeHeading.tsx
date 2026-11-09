import { memo } from 'react';

export interface PrizeHeadingProps {
  id?: string;
  eyebrow: string;
  title: string;
  titleAccent: string;
  lead?: string;
  dataUi: string;
}

/** Eyebrow + Contrail One title with a crimson accent, shared by the three premios blocks. */
export const PrizeHeading = memo(function PrizeHeading({ id, eyebrow, title, titleAccent, lead, dataUi }: PrizeHeadingProps) {
  return (
    <header className="text-center" data-ui={dataUi}>
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm" data-ui={`${dataUi}-eyebrow`}>
        {eyebrow}
      </p>
      <h2
        id={id}
        className="font-contrail text-2xl uppercase tracking-[0.02em] text-white sm:text-3xl xl:text-4xl 3xl:text-5xl"
        style={{ textShadow: '0 0 20px rgba(0, 0, 0, 0.8)' }}
        data-ui={`${dataUi}-title`}
      >
        {title}{' '}
        <span className="text-red-accent" style={{ textShadow: '0 0 24px rgba(220, 20, 60, 0.35)' }} data-ui={`${dataUi}-title-accent`}>
          {titleAccent}
        </span>
      </h2>
      <div
        className="mx-auto mt-4 h-px w-24"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)' }}
        data-ui={`${dataUi}-underline`}
        aria-hidden
      />
      {lead && (
        <p className="mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg" data-ui={`${dataUi}-lead`}>
          {lead}
        </p>
      )}
    </header>
  );
});
