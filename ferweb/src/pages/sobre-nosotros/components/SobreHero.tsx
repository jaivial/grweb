import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { CLUB_PHOTOS } from '../../fer/constants/clubPhotos';
import { SOBRE_SECTION_IDS } from '../constants';

export function SobreHero() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const heroImageSrc = useCdnImage(CLUB_PHOTOS.atmosphere[1]);

  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15, delayChildren: 0.2 },
      },
    }),
    []
  );

  const itemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id={SOBRE_SECTION_IDS.hero}
      className="relative overflow-hidden"
      data-ui="sobre-hero-section"
    >
      {/* Background */}
      <div
        className="absolute inset-0"
        data-ui="sobre-hero-bg"
        aria-hidden="true"
      >
        <img
          src={heroImageSrc}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
          data-ui="sobre-hero-bg-img"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${FER_COLORS.bgDark}cc 0%, ${FER_COLORS.bgDark}88 40%, ${FER_COLORS.bgDark} 100%)`,
          }}
          data-ui="sobre-hero-overlay"
        />
      </div>

      {/* Content */}
      <div
        className="relative z-10 max-w-4xl mx-auto px-4 pt-32 sm:pt-40 pb-20 sm:pb-28 text-center"
        data-ui="sobre-hero-content"
      >
        <motion.div
          variants={containerVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          data-ui="sobre-hero-inner"
        >
          {/* Badge */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{
              backgroundColor: `${FER_COLORS.accent}15`,
              border: `1px solid ${FER_COLORS.accent}25`,
            }}
            data-ui="sobre-hero-badge"
          >
            <Users
              size={16}
              style={{ color: FER_COLORS.accent }}
              data-ui="sobre-hero-badge-icon"
            />
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: FER_COLORS.accent }}
              data-ui="sobre-hero-badge-text"
            >
              NUESTRA HISTORIA
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-black mb-6 leading-tight"
            data-ui="sobre-hero-title"
          >
            <span
              style={{ color: FER_COLORS.text }}
              data-ui="sobre-hero-title-sobre"
            >
              Sobre{' '}
            </span>
            <span
              style={{ color: FER_COLORS.glow }}
              data-ui="sobre-hero-title-nosotros"
            >
              Nosotros
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="sobre-hero-subtitle"
          >
            Conoce la historia, los valores y las personas detrás de GR Strength.
            Más que un club, somos una familia unida por la pasión por el powerlifting.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
