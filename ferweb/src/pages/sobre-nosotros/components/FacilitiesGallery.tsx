import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { CLUB_PHOTOS } from '../../fer/constants/clubPhotos';
import { SOBRE_SECTION_IDS } from '../constants';

const FACILITY_PHOTOS = [
  CLUB_PHOTOS.gallery[0],
  CLUB_PHOTOS.gallery[2],
  CLUB_PHOTOS.gallery[4],
  CLUB_PHOTOS.gallery[6],
  CLUB_PHOTOS.gallery[7],
  CLUB_PHOTOS.gallery[8],
] as const;

export function FacilitiesGallery() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
      },
    }),
    []
  );

  const itemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, scale: 0.92 },
      visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id={SOBRE_SECTION_IDS.facilities}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="sobre-facilities-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="sobre-facilities-container"
      >
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="text-center mb-12 sm:mb-16"
          data-ui="sobre-facilities-header"
        >
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-3 mb-4"
            data-ui="sobre-facilities-label"
          >
            <Building2
              size={22}
              style={{ color: FER_COLORS.accent }}
              data-ui="sobre-facilities-label-icon"
            />
            <span
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: FER_COLORS.accent }}
              data-ui="sobre-facilities-label-text"
            >
              Instalaciones
            </span>
          </motion.div>
          <motion.h2
            variants={itemVariants}
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="sobre-facilities-title"
          >
            El{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="sobre-facilities-title-highlight">
              GRS Club
            </span>
          </motion.h2>
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg max-w-xl mx-auto leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="sobre-facilities-subtitle"
          >
            Un espacio diseñado para el rendimiento. Equipamiento profesional, plataformas
            reglamentarias y todo lo que necesitas para competir al máximo nivel.
          </motion.p>
        </motion.div>

        {/* Gallery grid */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={containerVariants}
          className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4"
          data-ui="sobre-facilities-grid"
        >
          {FACILITY_PHOTOS.map((src, i) => (
            <FacilityPhoto key={`facility-${i}`} src={src} index={i} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FacilityPhoto({ src, index }: { src: string; index: number }) {
  const resolvedSrc = useCdnImage(src);

  const variants = useMemo(
    () => ({
      hidden: { opacity: 0, scale: 0.92 },
      visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
    }),
    []
  );

  // First item spans 2 columns on md
  const spanClass = index === 0 ? 'md:col-span-2 md:row-span-2' : '';

  return (
    <motion.div
      variants={variants}
      className={`rounded-xl overflow-hidden relative group ${spanClass}`}
      style={{ border: `1px solid ${FER_COLORS.accent}10` }}
      data-ui={`sobre-facilities-photo-${index}`}
    >
      <img
        src={resolvedSrc}
        alt={`Instalaciones GRS Club ${index + 1}`}
        className="w-full h-full object-cover aspect-square transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        decoding="async"
        data-ui={`sobre-facilities-photo-img-${index}`}
      />
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          background: `linear-gradient(180deg, transparent 50%, ${FER_COLORS.bgDark}90 100%)`,
        }}
        data-ui={`sobre-facilities-photo-overlay-${index}`}
        aria-hidden="true"
      />
    </motion.div>
  );
}
