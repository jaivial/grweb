import { useMemo, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { FER_COLORS } from '../constants';

const DISCIPLINES = [
  { text: 'SENTADILLA', color: FER_COLORS.accent, glow: FER_COLORS.silver, iconUrl: 'https://jaimedigitalstudio.b-cdn.net/fer/media/icons/squat.webp' },
  { text: 'PRESS DE BANCA', color: FER_COLORS.purple, glow: FER_COLORS.glow, iconUrl: 'https://jaimedigitalstudio.b-cdn.net/fer/media/icons/benchpress.webp' },
  { text: 'PESO MUERTO', color: FER_COLORS.gold, glow: FER_COLORS.shimmer, iconUrl: 'https://jaimedigitalstudio.b-cdn.net/fer/media/icons/deadlift.webp' },
] as const;

export function DisciplinasSection(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const titleOpacity = useTransform(scrollYProgress, [0.04, 0.12, 0.55, 0.70], [0, 1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0.04, 0.12], [50, 0]);
  const titleScale = useTransform(scrollYProgress, [0.04, 0.12, 0.55, 0.70], [0.85, 1, 1, 0.92]);

  const underlineScaleX = useTransform(scrollYProgress, [0.08, 0.18], [0, 1]);
  const underlineOpacity = useTransform(scrollYProgress, [0.08, 0.12, 0.55, 0.70], [0, 1, 1, 0]);

  const subtitleOpacity = useTransform(scrollYProgress, [0.60, 0.72, 0.88, 0.96], [0, 1, 1, 0]);
  const subtitleScale = useTransform(scrollYProgress, [0.60, 0.72], [0.92, 1]);

  const cornerAccentOpacity = useTransform(scrollYProgress, [0.06, 0.14, 0.55, 0.70], [0, 1, 1, 0]);

  const disciplineOpacity = useMemo(
    () =>
      DISCIPLINES.map((_, i) => {
        const enterStart = 0.16 + i * 0.06;
        const peakStart = enterStart + 0.04;
        const exitEnd = 0.60 + i * 0.03;
        return { enterStart, peakStart, exitEnd };
      }),
    []
  );

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen sm:min-h-[110vh] overflow-hidden"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="disciplinas-section"
    >
      <div
        className="sticky top-0 min-h-screen flex flex-col items-center justify-center px-4 py-16 sm:py-20"
        data-ui="disciplinas-viewport"
      >
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, ${FER_COLORS.text} 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
          aria-hidden="true"
          data-ui="disciplinas-grid"
        />

        <motion.div
          className="absolute w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${FER_COLORS.accent}12 0%, transparent 65%)`,
            opacity: titleOpacity,
            scale: titleScale,
          }}
          aria-hidden="true"
          data-ui="disciplinas-glow-outer"
        />

        <motion.div
          className="absolute w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${FER_COLORS.purple}18 0%, transparent 60%)`,
            opacity: titleOpacity,
            scale: titleScale,
          }}
          aria-hidden="true"
          data-ui="disciplinas-glow-inner"
        />

        <AnimatePresence>
          <motion.div
            style={{ opacity: cornerAccentOpacity, borderColor: `${FER_COLORS.gold}66` }}
            className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 rounded-tl-xl"
            aria-hidden="true"
            data-ui="disciplinas-corner-tl"
          />
        </AnimatePresence>

        <AnimatePresence>
          <motion.div
            style={{ opacity: cornerAccentOpacity, borderColor: `${FER_COLORS.gold}66` }}
            className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 rounded-br-xl"
            aria-hidden="true"
            data-ui="disciplinas-corner-br"
          />
        </AnimatePresence>

        <motion.h2
          style={{ opacity: titleOpacity, y: titleY, scale: titleScale }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-black text-center relative z-10 tracking-tight"
          data-ui="disciplinas-title"
        >
          <span style={{ color: FER_COLORS.text }} data-ui="disciplinas-title-3">
            3
          </span>
          <span className="text-shimmer" style={{ color: FER_COLORS.gold }} data-ui="disciplinas-title-pruebas">
            {' '}PRUEBAS
          </span>
        </motion.h2>

        <motion.div
          style={{ opacity: underlineOpacity, scaleX: underlineScaleX }}
          className="w-40 sm:w-52 h-1 rounded-full mt-6 mb-10 sm:mb-14 origin-center relative z-10"
          data-ui="disciplinas-underline"
          aria-hidden="true"
        >
          <div
            className="w-full h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${FER_COLORS.gold}, ${FER_COLORS.accent})` }}
            data-ui="disciplinas-underline-inner"
          />
        </motion.div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-10 lg:gap-20 relative z-10 w-full max-w-5xl mx-auto px-4">
          {DISCIPLINES.map((disc, i) => (
            <DisciplineCard
              key={`discipline-${i}`}
              text={disc.text}
              color={disc.color}
              glowColor={disc.glow}
              iconUrl={disc.iconUrl}
              scrollProgress={scrollYProgress}
              enterStart={disciplineOpacity[i].enterStart}
              peakStart={disciplineOpacity[i].peakStart}
              exitEnd={disciplineOpacity[i].exitEnd}
              direction={i === 0 ? -1 : i === 2 ? 1 : 0}
            />
          ))}
        </div>

        <motion.div
          style={{ opacity: subtitleOpacity, scale: subtitleScale }}
          className="mt-12 sm:mt-16 text-center relative z-10"
          data-ui="disciplinas-subtitle"
        >
          <p
            className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="disciplinas-subtitle-text"
          >
            UNA SOLA{' '}
            <span style={{ color: FER_COLORS.gold }} data-ui="disciplinas-subtitle-highlight">
              PLATAFORMA
            </span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}

interface DisciplineCardProps {
  text: string;
  color: string;
  glowColor: string;
  iconUrl: string;
  scrollProgress: ReturnType<typeof useTransform<number, number>>;
  enterStart: number;
  peakStart: number;
  exitEnd: number;
  direction: -1 | 0 | 1;
}

function DisciplineCard({
  text,
  color,
  glowColor,
  iconUrl,
  scrollProgress,
  enterStart,
  peakStart,
  exitEnd,
  direction,
}: DisciplineCardProps) {
  const opacity = useTransform(
    scrollProgress,
    [enterStart, peakStart, exitEnd - 0.04, exitEnd],
    [0, 1, 1, 0]
  );

  const xBase = direction * 100;
  const x = useTransform(scrollProgress, [enterStart, peakStart], [xBase, 0]);

  const scale = useTransform(scrollProgress, [enterStart, peakStart, exitEnd], [0.75, 1.06, 0.96]);

  const cardX = useTransform(scrollProgress, [enterStart, peakStart], [direction * 80, 0]);

  return (
    <motion.div
      style={{ opacity, x: cardX, scale }}
      className="flex flex-col items-center"
      data-ui={`discipline-card-${text}`}
    >
      <motion.div
        whileHover={{ scale: 1.08, transition: { duration: 0.25, ease: 'easeOut' } }}
        className="flex flex-col items-center gap-3 sm:gap-4 cursor-pointer"
        data-ui={`discipline-inner-${text}`}
      >
        <div
          className="p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl backdrop-blur-sm border transition-all duration-300"
          style={{
            backgroundColor: `${color}18`,
            borderColor: `${color}50`,
            boxShadow: `0 0 50px ${glowColor}35, inset 0 0 25px ${glowColor}12`,
          }}
          data-ui={`discipline-icon-wrapper-${text}`}
        >
          <img
            src={iconUrl}
            alt={text}
            className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-24 lg:h-24 object-contain"
            style={{ filter: `drop-shadow(0 0 14px ${glowColor})` }}
            loading="lazy"
            data-ui={`discipline-icon-${text}`}
          />
        </div>
        <h3
          className="text-lg sm:text-xl md:text-2xl lg:text-4xl font-display font-black tracking-wider text-center"
          style={{ color, textShadow: `0 0 25px ${glowColor}55` }}
          data-ui={`discipline-text-${text}`}
        >
          {text}
        </h3>
      </motion.div>
    </motion.div>
  );
}

export default DisciplinasSection;
