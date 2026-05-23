import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Award, Shield, Users, CheckCircle } from 'lucide-react';
import { FER_COLORS, CLUB_PHOTOS, HERO_CAMISETA_BG, FER_QUE_INCLUYE_JUECES_IMAGE, FER_QUE_INCLUYE_SPOTTERS_IMAGE } from '../constants';
import { useCdnImage } from '@hooks/useCdnImage';

const CARDS = [
  { icon: Trophy, title: 'Trofeos', desc: 'TOP 3 ABSOLUTOS PREMIADOS', bg: CLUB_PHOTOS.gallery[3] },
  { icon: Award, title: 'Handling', desc: 'NO ESTARÁS SOLO EN TARIMA', bg: HERO_CAMISETA_BG },
  { icon: Shield, title: 'Jueces', desc: 'Jueces internacionales profesionales con certificación oficial.', bg: FER_QUE_INCLUYE_JUECES_IMAGE },
  { icon: Users, title: 'Spotters', desc: 'Spotters profesionales en plataforma', bg: FER_QUE_INCLUYE_SPOTTERS_IMAGE },
] as const;

const MERCH_ITEMS = [
  'Zona de calentamiento equipada.',
  'Nos encargaremos de la gestión.',
  'Merchandising del club limitado y rebajado.',
] as const;

function CardBgImage({ src }: { src: string }) {
  const resolvedSrc = useCdnImage(src);
  return (
    <motion.img
      src={resolvedSrc}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      style={{ objectPosition: 'center 25%' }}
      loading="lazy"
      decoding="async"
      initial={{ opacity: 0, scale: 1.1 }}
      whileInView={{ opacity: 0.1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      data-ui="fer-que-incluye-card-bg-img"
    />
  );
}

export function QueIncluye() {
  const sectionVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 40 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
    }),
    []
  );

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 25, scale: 0.95 },
      visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { delay: 0.15 + i * 0.1, duration: 0.5, ease: [0.25, 0.25, 0.25, 0.75] },
      }),
    }),
    []
  );

  return (
    <section
      id="fer-que-incluye"
      className="py-20 sm:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="fer-que-incluye-section"
    >
      <div className="max-w-6xl mx-auto" data-ui="fer-que-incluye-container">
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-14 sm:mb-16"
          data-ui="fer-que-incluye-header"
        >
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="fer-que-incluye-title"
          >
            &iquest;Qu&eacute;{' '}
            <span style={{ color: FER_COLORS.gold }} data-ui="fer-que-incluye-title-highlight">
              incluye
            </span>
            ?
          </h2>
          <p
            className="text-base sm:text-lg"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="fer-que-incluye-subtitle"
          >
            Todo lo necesario para que te centres en darlo todo
          </p>
        </motion.div>

        <div
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
          data-ui="fer-que-incluye-cards"
        >
          {CARDS.map((item, i) => (
            <motion.div
              key={i}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="relative p-6 sm:p-7 rounded-2xl transition-shadow duration-300 hover:shadow-lg overflow-hidden"
              style={{
                backgroundColor: FER_COLORS.bgDark,
                border: `1px solid ${FER_COLORS.accent}20`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
              data-ui="fer-que-incluye-card"
            >
              {item.bg && <CardBgImage src={item.bg} />}
              <div className="relative z-10" data-ui={`fer-que-incluye-card-content-${i}`}>
                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-4 sm:mb-5"
                  style={{ backgroundColor: `${FER_COLORS.accent}15` }}
                  data-ui="fer-que-incluye-card-icon-bg"
                >
                  <item.icon size={26} style={{ color: FER_COLORS.accent }} data-ui="fer-que-incluye-card-icon" />
                </div>
                <h3
                  className="text-lg sm:text-xl font-display font-bold mb-2"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-que-incluye-card-title"
                >
                  {item.title}
                </h3>
                <p
                  className="text-sm sm:text-base leading-relaxed"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui="fer-que-incluye-card-desc"
                >
                  {item.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-10 sm:mt-12 p-6 sm:p-8 rounded-2xl"
          style={{
            backgroundColor: FER_COLORS.bgDark,
            border: `1px solid ${FER_COLORS.gold}20`,
          }}
          data-ui="fer-que-incluye-merch"
        >
          <h4
            className="text-lg sm:text-xl font-bold"
            style={{ color: FER_COLORS.gold }}
            data-ui="fer-que-incluye-merch-title"
          >
            Podrás disfrutar:
          </h4>
          <ul className="space-y-3 mt-4" data-ui="fer-que-incluye-merch-list">
            {MERCH_ITEMS.map((item, i) => (
              <li key={i} className="flex items-center gap-3" data-ui="fer-que-incluye-merch-item">
                <CheckCircle size={18} style={{ color: FER_COLORS.green }} data-ui="fer-que-incluye-merch-check" />
                <span style={{ color: FER_COLORS.text }} data-ui="fer-que-incluye-merch-text">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
