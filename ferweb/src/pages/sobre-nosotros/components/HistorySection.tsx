import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { CLUB_PHOTOS } from '../../fer/constants/clubPhotos';
import { HISTORY_TEXT, SOBRE_SECTION_IDS } from '../constants';

const HISTORY_PHOTOS = [
  CLUB_PHOTOS.gallery[3],
  CLUB_PHOTOS.gallery[5],
  CLUB_PHOTOS.action[6],
] as const;

export function HistorySection() {
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
        transition: { staggerChildren: 0.12, delayChildren: 0.15 },
      },
    }),
    []
  );

  const itemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 25 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id={SOBRE_SECTION_IDS.history}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="sobre-history-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="sobre-history-container"
      >
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="text-center mb-12 sm:mb-16"
          data-ui="sobre-history-header"
        >
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-3 mb-4"
            data-ui="sobre-history-label"
          >
            <BookOpen
              size={22}
              style={{ color: FER_COLORS.accent }}
              data-ui="sobre-history-label-icon"
            />
            <span
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: FER_COLORS.accent }}
              data-ui="sobre-history-label-text"
            >
              Nuestra Historia
            </span>
          </motion.div>
          <motion.h2
            variants={itemVariants}
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold"
            style={{ color: FER_COLORS.text }}
            data-ui="sobre-history-title"
          >
            De un sueño a una{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="sobre-history-title-highlight">
              comunidad
            </span>
          </motion.h2>
        </motion.div>

        {/* Timeline with photos */}
        <div
          className="space-y-12 sm:space-y-16"
          data-ui="sobre-history-timeline"
        >
          {HISTORY_TEXT.map((paragraph, i) => (
            <HistoryBlock
              key={`history-${i}`}
              paragraph={paragraph}
              photoSrc={HISTORY_PHOTOS[i]}
              index={i}
              prefersReducedMotion={prefersReducedMotion}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HistoryBlock({
  paragraph,
  photoSrc,
  index,
  prefersReducedMotion,
}: {
  paragraph: string;
  photoSrc: string;
  index: number;
  prefersReducedMotion: boolean;
}) {
  const resolvedSrc = useCdnImage(photoSrc);
  const isReversed = index % 2 === 1;

  const blockVariants = useMemo(
    () => ({
      hidden: { opacity: 0, x: isReversed ? 30 : -30 },
      visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.6, ease: 'easeOut' },
      },
    }),
    [isReversed]
  );

  return (
    <motion.div
      initial={prefersReducedMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={blockVariants}
      className={`grid md:grid-cols-5 gap-6 lg:gap-10 items-center ${
        isReversed ? 'md:direction-rtl' : ''
      }`}
      data-ui={`sobre-history-block-${index}`}
    >
      {/* Image */}
      <div
        className={`md:col-span-2 rounded-xl overflow-hidden ${isReversed ? 'md:order-2' : ''}`}
        style={{ border: `1px solid ${FER_COLORS.accent}12` }}
        data-ui={`sobre-history-photo-${index}`}
      >
        <img
          src={resolvedSrc}
          alt={`Historia de FER - Parte ${index + 1}`}
          className="w-full aspect-[3/2] object-cover"
          loading="lazy"
          decoding="async"
          data-ui={`sobre-history-photo-img-${index}`}
        />
      </div>

      {/* Text */}
      <div
        className={`md:col-span-3 ${isReversed ? 'md:order-1 md:text-right' : ''}`}
        data-ui={`sobre-history-text-${index}`}
      >
        <div
          className="flex items-center gap-3 mb-3"
          style={{ justifyContent: isReversed ? 'flex-end' : 'flex-start' }}
          data-ui={`sobre-history-number-${index}`}
        >
          <span
            className="text-4xl font-display font-black"
            style={{ color: `${FER_COLORS.accent}30` }}
            data-ui={`sobre-history-number-text-${index}`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        <p
          className="text-base sm:text-lg leading-relaxed"
          style={{ color: FER_COLORS.textMuted }}
          data-ui={`sobre-history-paragraph-${index}`}
        >
          {paragraph}
        </p>
      </div>
    </motion.div>
  );
}
