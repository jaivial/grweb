import { useMemo, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useCdnImage } from '@hooks/useCdnImage';
import { FER_COLORS, CLUB_PHOTOS } from '../constants';

const GRID_PHOTOS = [
  CLUB_PHOTOS.gallery[0],
  CLUB_PHOTOS.gallery[1],
  CLUB_PHOTOS.gallery[2],
  CLUB_PHOTOS.gallery[3],
  CLUB_PHOTOS.action[0],
  CLUB_PHOTOS.action[5],
] as const;

const VALUES = ['ENTRENAMIENTO', 'COMPA\u00d1ERISMO', 'SUPERACI\u00d3N'] as const;

function GridPhoto({
  src,
  scrollProgress,
  index,
}: {
  src: string;
  scrollProgress: ReturnType<typeof useTransform<number, number>>;
  index: number;
}) {
  const resolvedSrc = useCdnImage(src);

  const enterStart = 0.06 + index * 0.04;
  const peakStart = enterStart + 0.06;
  const exitEnd = 0.78 + index * 0.02;

  const opacity = useTransform(
    scrollProgress,
    [enterStart, peakStart, exitEnd - 0.05, exitEnd],
    [0, 0.9, 0.9, 0]
  );

  const directions = [
    { x: -140, y: -80, rot: -6 },
    { x: 140, y: -60, rot: 4 },
    { x: -100, y: 80, rot: 3 },
    { x: 120, y: 90, rot: -5 },
    { x: -160, y: 20, rot: -3 },
    { x: 160, y: 10, rot: 6 },
  ];
  const dir = directions[index % 6];

  const x = useTransform(scrollProgress, [enterStart, peakStart], [dir.x, 0]);
  const y = useTransform(scrollProgress, [enterStart, peakStart], [dir.y, 0]);
  const rotate = useTransform(scrollProgress, [enterStart, peakStart], [dir.rot, 0]);
  const scale = useTransform(scrollProgress, [enterStart, peakStart, exitEnd], [0.6, 1, 0.95]);

  return (
    <motion.div
      style={{ opacity, x, y, rotate, scale }}
      className="aspect-[3/4] rounded-xl overflow-hidden shadow-xl"
      data-ui={`club-grid-photo-${index}`}
    >
      <img
        src={resolvedSrc}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        data-ui={`club-grid-img-${index}`}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${FER_COLORS.bgDark}80 0%, transparent 50%)`,
        }}
        aria-hidden="true"
        data-ui={`club-grid-overlay-${index}`}
      />
    </motion.div>
  );
}

export function ElClubSection(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const titleOpacity = useTransform(scrollYProgress, [0.02, 0.10, 0.55, 0.70], [0, 1, 1, 0]);
  const titleScale = useTransform(scrollYProgress, [0.02, 0.10], [0.85, 1]);
  const titleY = useTransform(scrollYProgress, [0.02, 0.10], [50, 0]);

  const valuesEnter = useTransform(scrollYProgress, [0.50, 0.60, 0.88, 0.98], [0, 1, 1, 0]);
  const valuesScale = useTransform(scrollYProgress, [0.50, 0.60], [0.9, 1]);

  const underlineScaleX = useTransform(scrollYProgress, [0.10, 0.20], [0, 1]);
  const underlineOpacity = useTransform(scrollYProgress, [0.10, 0.16, 0.55, 0.70], [0, 1, 1, 0]);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ minHeight: '100vh', backgroundColor: FER_COLORS.bgDark }}
      data-ui="el-club-section"
    >
      <div
        className="sticky top-0 h-screen flex flex-col items-center justify-center px-4"
        data-ui="el-club-viewport"
      >
        <div
          className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${FER_COLORS.gold}08 0%, transparent 70%)`,
          }}
          aria-hidden="true"
          data-ui="el-club-bg-glow"
        />

        <motion.h2
          style={{ opacity: titleOpacity, scale: titleScale, y: titleY }}
          className="text-4xl sm:text-5xl lg:text-7xl font-display font-black relative z-10"
          data-ui="el-club-title"
        >
          <span style={{ color: FER_COLORS.gold }} data-ui="el-club-title-grs">
            GRS
          </span>
          <span style={{ color: FER_COLORS.text }} data-ui="el-club-title-club">
            {' '}CLUB
          </span>
        </motion.h2>

        <motion.div
          style={{ opacity: underlineOpacity, scaleX: underlineScaleX }}
          className="w-56 h-1 rounded-full mt-5 mb-10 origin-center relative z-10"
          data-ui="el-club-underline"
          aria-hidden="true"
        >
          <div
            className="w-full h-full rounded-full"
            style={{ backgroundColor: FER_COLORS.gold }}
            data-ui="el-club-underline-inner"
          />
        </motion.div>

        <div
          className="grid grid-cols-3 gap-3 sm:gap-4 lg:gap-5 max-w-3xl w-full relative z-10"
          data-ui="el-club-grid"
        >
          {GRID_PHOTOS.map((src, i) => (
            <GridPhoto
              key={`club-photo-${i}`}
              src={src}
              scrollProgress={scrollYProgress}
              index={i}
            />
          ))}
        </div>

        <motion.div
          style={{ opacity: valuesEnter, scale: valuesScale }}
          className="mt-10 text-center relative z-10"
          data-ui="el-club-values"
        >
          <p
            className="text-base sm:text-lg lg:text-xl font-semibold tracking-widest"
            data-ui="el-club-values-text"
          >
            {VALUES.map((val, i) => (
              <span key={`value-${i}`} data-ui={`el-club-value-${i}`}>
                <span style={{ color: i === 1 ? FER_COLORS.accent : i === 2 ? FER_COLORS.gold : FER_COLORS.textMuted }}>
                  {val}
                </span>
                {i < VALUES.length - 1 && (
                  <span style={{ color: FER_COLORS.textMuted, margin: '0 0.5rem' }} data-ui={`el-club-dot-${i}`}>
                    {' \u00b7 '}
                  </span>
                )}
              </span>
            ))}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default ElClubSection;
