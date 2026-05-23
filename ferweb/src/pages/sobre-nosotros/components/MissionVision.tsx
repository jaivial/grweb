import { type CSSProperties, useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Eye } from 'lucide-react';
import { FER_COLORS, FER_SOBRE_MISSION_IMAGE } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { CLUB_PHOTOS } from '../../fer/constants/clubPhotos';
import { MISSION_STATEMENT, VISION_STATEMENT, SOBRE_SECTION_IDS } from '../constants';

const missionImageClassName = 'w-full aspect-[4/3] object-cover';
const missionImageStyle: CSSProperties = { objectPosition: 'center center' };

const visionImageWrapperClassName = 'relative aspect-[4/3] rounded-2xl overflow-hidden md:order-2';
const visionImageClassName = 'absolute left-0 -top-[90px] h-[calc(100%+140px)] w-full object-cover';
const visionImageStyle: CSSProperties = { objectPosition: 'center top' };

export function MissionVision() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const missionImageSrc = useCdnImage(FER_SOBRE_MISSION_IMAGE);
  const visionImageSrc = useCdnImage(CLUB_PHOTOS.action[4]);

  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15, delayChildren: 0.1 },
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
      id={SOBRE_SECTION_IDS.mission}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="sobre-mission-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="sobre-mission-container"
      >
        {/* Mission */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="grid md:grid-cols-2 gap-8 lg:gap-14 items-center mb-16 sm:mb-24"
          data-ui="sobre-mission-grid"
        >
          {/* Image */}
          <motion.div
            variants={itemVariants}
            className="relative rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${FER_COLORS.accent}15` }}
            data-ui="sobre-mission-image-wrapper"
          >
            <img
              src={missionImageSrc}
              alt="Entrenamiento de powerlifting en FER"
              className={missionImageClassName}
              style={missionImageStyle}
              loading="lazy"
              decoding="async"
              data-ui="sobre-mission-image"
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${FER_COLORS.bgDark}40 0%, transparent 60%)`,
              }}
              data-ui="sobre-mission-image-overlay"
              aria-hidden="true"
            />
          </motion.div>

          {/* Text */}
          <motion.div variants={itemVariants} data-ui="sobre-mission-text">
            <div
              className="flex items-center gap-3 mb-4"
              data-ui="sobre-mission-label"
            >
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${FER_COLORS.accent}15` }}
                data-ui="sobre-mission-label-icon-bg"
              >
                <Target
                  size={20}
                  style={{ color: FER_COLORS.accent }}
                  data-ui="sobre-mission-label-icon"
                />
              </div>
              <span
                className="text-xs uppercase tracking-widest font-semibold"
                style={{ color: FER_COLORS.accent }}
                data-ui="sobre-mission-label-text"
              >
                {MISSION_STATEMENT.title}
              </span>
            </div>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="sobre-mission-description"
            >
              {MISSION_STATEMENT.text}
            </p>
          </motion.div>
        </motion.div>

        {/* Vision */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="grid md:grid-cols-2 gap-8 lg:gap-14 items-center"
          data-ui="sobre-vision-grid"
        >
          {/* Text (left on desktop) */}
          <motion.div
            variants={itemVariants}
            className="md:order-1"
            data-ui="sobre-vision-text"
          >
            <div
              className="flex items-center gap-3 mb-4"
              data-ui="sobre-vision-label"
            >
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${FER_COLORS.accent}15` }}
                data-ui="sobre-vision-label-icon-bg"
              >
                <Eye
                  size={20}
                  style={{ color: FER_COLORS.accent }}
                  data-ui="sobre-vision-label-icon"
                />
              </div>
              <span
                className="text-xs uppercase tracking-widest font-semibold"
                style={{ color: FER_COLORS.accent }}
                data-ui="sobre-vision-label-text"
              >
                {VISION_STATEMENT.title}
              </span>
            </div>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="sobre-vision-description"
            >
              {VISION_STATEMENT.text}
            </p>
          </motion.div>

          {/* Image */}
          <motion.div
            variants={itemVariants}
            className={visionImageWrapperClassName}
            style={{ border: `1px solid ${FER_COLORS.accent}15` }}
            data-ui="sobre-vision-image-wrapper"
          >
            <img
              src={visionImageSrc}
              alt="Atletas entrenando en el GRS Club"
              className={visionImageClassName}
              style={visionImageStyle}
              loading="lazy"
              decoding="async"
              data-ui="sobre-vision-image"
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(225deg, ${FER_COLORS.bgDark}40 0%, transparent 60%)`,
              }}
              data-ui="sobre-vision-image-overlay"
              aria-hidden="true"
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
