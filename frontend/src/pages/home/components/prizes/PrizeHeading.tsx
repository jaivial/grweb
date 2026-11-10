import { memo } from 'react';

export interface PrizeHeadingProps {
  id?: string;
  /** Section number shown before the eyebrow (Figma: 02 / 03 / 04). */
  index?: string;
  eyebrow: string;
  title: string;
  titleAccent: string;
  lead?: string;
  dataUi: string;
}

/** Eyebrow + Contrail One title with a crimson accent, shared by the three premios blocks. */
export const PrizeHeading = memo(function PrizeHeading({ id, index, eyebrow, title, titleAccent, lead, dataUi }: PrizeHeadingProps) {
  return (
    <header className="text-center" data-ui={dataUi}>
      <p className="mb-4 flex items-center justify-center gap-2.5" data-ui={`${dataUi}-eyebrow`}>
        {index && (
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#e6606b]" data-ui={`${dataUi}-eyebrow-index`}>{index}</span>
        )}
        {index && <span className="h-px w-7 bg-[#c42b3e]/60" data-ui={`${dataUi}-eyebrow-dash`} aria-hidden />}
        <span className="text-xs font-medium uppercase tracking-[0.04em] text-[#9ca3af]" data-ui={`${dataUi}-eyebrow-text`}>{eyebrow}</span>
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
