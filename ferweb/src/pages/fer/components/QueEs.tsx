import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Dumbbell, Star, Heart } from 'lucide-react';
import { FER_COLORS, CLUB_PHOTOS } from '../constants';
import { useCdnImage } from '@hooks/useCdnImage';

const HIGHLIGHTS = [
  { icon: Trophy, text: 'Jueces certificados FEDDF' },
  { icon: Dumbbell, text: '3 intentos por levantamiento' },
  { icon: Star, text: 'Ambiente de competición real' },
  { icon: Heart, text: 'Spotters profesionales' },
  { icon: Trophy, text: 'Competir contra gente de tu nivel' },
] as const;

export function QueEs() {
  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.12, delayChildren: 0.2 },
      },
    }),
    []
  );

  const itemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, x: -30 },
      visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    }),
    []
  );

  const imageVariants = useMemo(
    () => ({
      hidden: { opacity: 0, x: 50 },
      visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id="fer-que-es"
      className="py-20 sm:py-28 px-4"
      data-ui="fer-que-es-section"
    >
      <div className="max-w-6xl mx-auto" data-ui="fer-que-es-container">
        <div
          className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center"
          data-ui="fer-que-es-grid"
        >
          {/* Text content */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            data-ui="fer-que-es-text"
          >
            <motion.h2
              variants={itemVariants}
              className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-6 leading-tight"
              style={{ color: FER_COLORS.text }}
              data-ui="fer-que-es-title"
            >
              ¿Qué es el{' '}
              <span style={{ color: FER_COLORS.accent }} data-ui="fer-que-es-title-highlight">
                FER CUP
              </span>
              ?
            </motion.h2>
            <motion.p
              variants={itemVariants}
              className="text-base sm:text-lg mb-8 leading-relaxed"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="fer-que-es-description"
            >
              Un evento diseñado para que vivas la experiencia de una competición real de
              powerlifting en un ambiente acogedor y profesional. Organizado por GR Strength,
              tu club de confianza en Valencia.
            </motion.p>

            <motion.ul
              variants={containerVariants}
              className="space-y-4"
              data-ui="fer-que-es-highlights"
            >
              {HIGHLIGHTS.map((item, i) => (
                <motion.li
                  key={i}
                  variants={itemVariants}
                  className="flex items-center gap-4 group"
                  data-ui="fer-que-es-highlight-item"
                >
                  <div
                    className="p-3 rounded-xl flex-shrink-0 transition-colors group-hover:bg-opacity-30"
                    style={{ backgroundColor: `${FER_COLORS.accent}15` }}
                    data-ui="fer-que-es-highlight-icon-bg"
                  >
                    <item.icon size={20} style={{ color: FER_COLORS.accent }} data-ui="fer-que-es-highlight-icon" />
                  </div>
                  <span
                    className="text-base sm:text-lg font-medium"
                    style={{ color: FER_COLORS.text }}
                    data-ui="fer-que-es-highlight-text"
                  >
                    {item.text}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          {/* Image */}
          <motion.div
            variants={imageVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="relative"
            data-ui="fer-que-es-image-wrapper"
          >
            <div
              className="aspect-video rounded-2xl overflow-hidden relative"
              style={{
                border: `1px solid ${FER_COLORS.accent}20`,
              }}
              data-ui="fer-que-es-image"
            >
              <QueEsImage />
            </div>
            {/* Glow behind */}
            <div
              className="absolute -inset-4 rounded-3xl opacity-25 -z-10"
              style={{
                background: `linear-gradient(135deg, ${FER_COLORS.accent} 0%, transparent 50%)`,
                filter: 'blur(30px)',
              }}
              data-ui="fer-que-es-image-glow"
              aria-hidden="true"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function QueEsImage() {
  const resolvedSrc = useCdnImage(CLUB_PHOTOS.hero.main);
  return (
    <motion.img
      src={resolvedSrc}
      alt="Entrenamiento en el club FER"
      className="w-full h-full object-cover"
      loading="lazy"
      decoding="async"
      initial={{ scale: 1.1 }}
      whileInView={{ scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      data-ui="fer-que-es-img"
    />
  );
}
