import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FER_COLORS, CLUB_PHOTOS } from '../constants';
import { useCdnImage } from '@hooks/useCdnImage';

const PARTICIPANTS = [
  { title: 'Afiliados del club GR Strength', desc: 'Precio especial…', bg: CLUB_PHOTOS.atmosphere[0] },
  { title: 'Socios del gimnasio FER', desc: 'Precio especial…', bg: CLUB_PHOTOS.atmosphere[1] },
  { title: 'Atletas externos a ambas entidades.', desc: 'Abierto a cualquier persona con ganas de competir', bg: CLUB_PHOTOS.atmosphere[2] },
  { title: 'Principiantes.', desc: 'Evento diseñado para tu primera experiencia competitiva', bg: CLUB_PHOTOS.atmosphere[3] },
  { title: 'Atletas sin entrenador.', desc: 'Te ayudamos con tu preparación si no tienes coach', bg: CLUB_PHOTOS.atmosphere[0] },
  { title: 'Atletas con experiencia.', desc: 'Para experimentados que quieran disfrutar de la tarima.', bg: CLUB_PHOTOS.atmosphere[1] },
] as const;

function CardBgImage({ src }: { src: string }) {
  const resolvedSrc = useCdnImage(src);
  return (
    <motion.img
      src={resolvedSrc}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      decoding="async"
      initial={{ opacity: 0, scale: 1.15 }}
      whileInView={{ opacity: 0.12, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      data-ui="fer-quien-puede-card-bg-img"
    />
  );
}

export function QuienPuede() {
  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.15 },
      },
    }),
    []
  );

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, scale: 0.9, y: 15 },
      visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
    }),
    []
  );

  const headerVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id="fer-quien-puede"
      className="py-20 sm:py-28 px-4"
      data-ui="fer-quien-puede-section"
    >
      <div className="max-w-4xl mx-auto" data-ui="fer-quien-puede-container">
        <motion.div
          variants={headerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-14 sm:mb-16"
          data-ui="fer-quien-puede-header"
        >
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-6"
            style={{ color: FER_COLORS.text }}
            data-ui="fer-quien-puede-title"
          >
            &iquest;Qui&eacute;n puede{' '}
            <span style={{ color: FER_COLORS.purple }} data-ui="fer-quien-puede-title-highlight">
              participar
            </span>
            ?
          </h2>
          <p
            className="text-lg sm:text-xl italic"
            style={{ color: FER_COLORS.gold }}
            data-ui="fer-quien-puede-motto"
          >
            No importa tu nivel. Importan tus ganas.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid sm:grid-cols-2 gap-5"
          data-ui="fer-quien-puede-cards"
        >
          {PARTICIPANTS.map((item, i) => (
            <motion.div
              key={i}
              variants={cardVariants}
              className="relative p-6 sm:p-7 rounded-2xl transition-shadow duration-300 hover:shadow-lg overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${FER_COLORS.bgCard} 0%, ${FER_COLORS.bgDark} 100%)`,
                border: `1px solid ${FER_COLORS.purple}20`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
              data-ui="fer-quien-puede-card"
            >
              <CardBgImage src={item.bg} />
              <div className="relative z-10" data-ui={`fer-quien-puede-card-content-${i}`}>
                <h3
                  className="text-lg sm:text-xl font-display font-bold mb-2"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-quien-puede-card-title"
                >
                  {item.title}
                </h3>
                <p
                  className="text-sm sm:text-base leading-relaxed"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui="fer-quien-puede-card-desc"
                >
                  {item.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
