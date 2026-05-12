import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { CLUB_PHOTOS } from '../../fer/constants/clubPhotos';
import { UBICACION_SECTION_IDS } from '../constants';

export function UbicacionHero() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const heroImageSrc = useCdnImage(CLUB_PHOTOS.atmosphere[0]);

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
      id={UBICACION_SECTION_IDS.hero}
      className="relative overflow-hidden"
      data-ui="ubicacion-hero-section"
    >
      {/* Background image */}
      <div
        className="absolute inset-0"
        data-ui="ubicacion-hero-bg"
        aria-hidden="true"
      >
        <img
          src={heroImageSrc}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
          data-ui="ubicacion-hero-bg-img"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${FER_COLORS.bgDark}cc 0%, ${FER_COLORS.bgDark}88 40%, ${FER_COLORS.bgDark} 100%)`,
          }}
          data-ui="ubicacion-hero-overlay"
        />
      </div>

      {/* Content */}
      <div
        className="relative z-10 max-w-4xl mx-auto px-4 pt-32 sm:pt-40 pb-20 sm:pb-28 text-center"
        data-ui="ubicacion-hero-content"
      >
        <motion.div
          variants={containerVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          data-ui="ubicacion-hero-inner"
        >
          {/* Badge */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{
              backgroundColor: `${FER_COLORS.accent}15`,
              border: `1px solid ${FER_COLORS.accent}25`,
            }}
            data-ui="ubicacion-hero-badge"
          >
            <MapPin
              size={16}
              style={{ color: FER_COLORS.accent }}
              data-ui="ubicacion-hero-badge-icon"
            />
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: FER_COLORS.accent }}
              data-ui="ubicacion-hero-badge-text"
            >
              ALMUSSAFES, VALENCIA
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-black mb-6 leading-tight"
            data-ui="ubicacion-hero-title"
          >
            <span
              style={{ color: FER_COLORS.text }}
              data-ui="ubicacion-hero-title-text"
            >
              Cómo{' '}
            </span>
            <span
              style={{ color: FER_COLORS.glow }}
              data-ui="ubicacion-hero-title-highlight"
            >
              llegar
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="ubicacion-hero-subtitle"
          >
            Encuentra el GRS Club en Valencia, a solo 25 minutos de Valencia.
            Un espacio diseñado para el rendimiento y la comunidad.
          </motion.p>

          {/* CTA */}
          <motion.div
            variants={itemVariants}
            data-ui="ubicacion-hero-cta"
          >
            <a
              href={UBICACION_SECTION_IDS.map.replace('ubicacion-map', '#ubicacion-map')}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-base transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: FER_COLORS.accent,
                color: FER_COLORS.bgDark,
                boxShadow: `0 0 30px ${FER_COLORS.accent}40`,
              }}
              data-ui="ubicacion-hero-cta-button"
            >
              <Navigation
                size={20}
                data-ui="ubicacion-hero-cta-icon"
              />
              <span data-ui="ubicacion-hero-cta-text">
                VER MAPA
              </span>
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
