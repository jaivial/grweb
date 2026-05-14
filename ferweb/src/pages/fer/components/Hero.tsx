import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Calendar, MapPin, ChevronDown } from 'lucide-react';
import { FER_COLORS, FER_EVENT, HERO_BRAND_ICONS } from '../constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { HeroSlideshow } from './HeroSlideshow';

interface HeroProps {
  onCtaClick: () => void;
}

export function Hero({ onCtaClick }: HeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Resolve brand icon URLs via CDN hook
  const ferIconSrc = useCdnImage(HERO_BRAND_ICONS.ferIcon);
  const crossCollabSrc = useCdnImage(HERO_BRAND_ICONS.crossCollab);
  const mainLogoSrc = useCdnImage(HERO_BRAND_ICONS.mainLogo);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const contentOpacity = useTransform(scrollYProgress, [0, 0.5, 0.8], [1, 1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 0.8], [0, -80]);

  const handleInscripcionClick = useCallback(() => {
    onCtaClick();
  }, [onCtaClick]);

  const titleVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay: 0.3 + i * 0.15, ease: [0.25, 0.25, 0.25, 0.75] },
      }),
    }),
    []
  );

  const ctaGlow = useMemo(
    () => `0 0 40px ${FER_COLORS.accent}40, 0 0 80px ${FER_COLORS.accent}20`,
    []
  );

  return (
    <section
      ref={sectionRef}
      id="fer-hero"
      className="relative flex items-center justify-center px-4 overflow-hidden"
      style={{ height: '120vh' }}
      data-ui="fer-hero-section"
    >
      {/* Background: rotating image slideshow */}
      <HeroSlideshow prefersReducedMotion={prefersReducedMotion} />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        data-ui="fer-hero-gradient-overlay"
        aria-hidden="true"
        style={{
          background: `
            linear-gradient(180deg, ${FER_COLORS.bgDark}cc 0%, transparent 30%),
            linear-gradient(0deg, ${FER_COLORS.bgDark} 0%, transparent 40%),
            radial-gradient(ellipse at center, transparent 30%, ${FER_COLORS.bgDark}99 80%)
          `,
        }}
      />

      <motion.div
        className="sticky top-0 z-10 flex items-center justify-center w-full h-screen"
        style={{ opacity: contentOpacity, y: contentY }}
        data-ui="fer-hero-content-sticky"
      >
        <div
          className="text-center max-w-4xl mx-auto"
          data-ui="fer-hero-content"
        >
          {/* 3-image brand row */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            data-ui="fer-hero-brand-row"
          >
            <div
              className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6"
              data-ui="fer-hero-brand-row-inner"
            >
              <img
                src={ferIconSrc}
                alt="FER"
                className="h-40 w-auto object-contain"
                loading="lazy"
                data-ui="fer-hero-brand-fer-icon"
              />
              <img
                src={crossCollabSrc}
                alt="Cross Collab"
                className="h-12 md:h-16 w-auto object-contain opacity-80"
                loading="lazy"
                data-ui="fer-hero-brand-crosscollab"
              />
              <img
                src={mainLogoSrc}
                alt="FER Cup Logo"
                className="h-20 w-auto object-contain"
                loading="lazy"
                data-ui="fer-hero-brand-main-logo"
              />
            </div>
          </motion.div>

          <motion.p
            custom={0}
            variants={titleVariants}
            initial="hidden"
            animate="visible"
            className="text-sm uppercase tracking-[0.3em] mb-4 mt-8"
            style={{ color: FER_COLORS.gold }}
            data-ui="fer-hero-presenta"
          >
            GR STRENGTH presenta
          </motion.p>

          <motion.h1
            custom={1}
            variants={titleVariants}
            initial="hidden"
            animate="visible"
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-black mb-6 leading-none mx-8"
            style={{ color: FER_COLORS.text }}
            data-ui="fer-hero-title"
          >
            <span
              className="font-display text-shimmer"
              data-ui="fer-hero-title-gradient"
            >
              FER{' '}
            </span>
            <span
              className="text-[1.1em]"
              style={{ color: FER_COLORS.glow }}
              data-ui="fer-hero-title-day"
            >
              CUP II
            </span>
          </motion.h1>

          <motion.div
            custom={2}
            variants={titleVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap justify-center gap-4 mb-8"
            data-ui="fer-hero-info-chips"
          >
            <div
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border"
              style={{
                backgroundColor: `${FER_COLORS.bgCard}90`,
                borderColor: `${FER_COLORS.accent}25`,
              }}
              data-ui="fer-hero-chip-date"
            >
              <Calendar size={18} style={{ color: FER_COLORS.accent }} data-ui="fer-hero-chip-date-icon" />
              <span className="font-medium" style={{ color: FER_COLORS.text }} data-ui="fer-hero-chip-date-text">
                {FER_EVENT.date}
              </span>
            </div>
            <div
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border"
              style={{
                backgroundColor: `${FER_COLORS.bgCard}90`,
                borderColor: `${FER_COLORS.accent}25`,
              }}
              data-ui="fer-hero-chip-location"
            >
              <MapPin size={18} style={{ color: FER_COLORS.accent }} data-ui="fer-hero-chip-location-icon" />
              <span className="font-medium" style={{ color: FER_COLORS.text }} data-ui="fer-hero-chip-location-text">
                ALMUSSAFES
              </span>
            </div>
          </motion.div>

          <motion.p
            custom={3}
            variants={titleVariants}
            initial="hidden"
            animate="visible"
            className="text-lg sm:text-xl md:text-2xl mb-12 font-light"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="fer-hero-tagline"
          >
            Tu primera competici&oacute;n de Powerlifting
          </motion.p>

          <motion.div
            custom={4}
            variants={titleVariants}
            initial="hidden"
            animate="visible"
            data-ui="fer-hero-cta-wrapper"
          >
            <motion.button
              onClick={handleInscripcionClick}
              className="group relative px-10 sm:px-14 py-4 sm:py-5 text-base sm:text-lg font-bold rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
              style={{
                backgroundColor: FER_COLORS.accent,
                color: FER_COLORS.text,
                boxShadow: ctaGlow,
              }}
              data-ui="fer-hero-cta-button"
              whileTap={{ scale: 0.97 }}
              aria-label="Inscribirme"
            >
              <span className="relative z-10 tracking-wide" data-ui="fer-hero-cta-text">
                INSCRIBIRME
              </span>
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: FER_COLORS.glow }}
                data-ui="fer-hero-cta-hover"
                aria-hidden="true"
              />
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="mt-12 flex justify-center"
            data-ui="fer-hero-scroll-indicator"
            aria-hidden="true"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              data-ui="fer-hero-scroll-arrow"
            >
              <ChevronDown size={32} style={{ color: FER_COLORS.textMuted }} data-ui="fer-hero-scroll-icon" />
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
