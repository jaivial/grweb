import { motion } from 'framer-motion';
import { FER_COLORS, MODALIDAD_VALUES, MODALIDAD_LABELS, MODALIDAD_DESCRIPTIONS, MODALIDAD_LIFTS } from '../constants';

export function ModalidadesHomeSection(): JSX.Element {
  return (
    <section
      className="relative overflow-hidden px-4 py-20 sm:py-28"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="modalidades-home-section"
    >
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${FER_COLORS.text} 1px, transparent 1px)`,
          backgroundSize: '34px 34px',
        }}
        data-ui="modalidades-home-grid"
        aria-hidden="true"
      />
      <div className="relative z-10 max-w-6xl mx-auto" data-ui="modalidades-home-container">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mb-10 sm:mb-14"
          data-ui="modalidades-home-header"
        >
          <p
            className="text-xs sm:text-sm font-bold uppercase tracking-[0.32em] mb-3"
            style={{ color: FER_COLORS.gold }}
            data-ui="modalidades-home-kicker"
          >
            Nuevas modalidades
          </p>
          <h2
            className="text-3xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight"
            style={{ color: FER_COLORS.text }}
            data-ui="modalidades-home-title"
          >
            Elige cuanta plataforma quieres pisar
          </h2>
          <p
            className="mt-5 text-base sm:text-lg leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="modalidades-home-subtitle"
          >
            Puedes competir en powerlifting completo o reservar tu plaza para una prueba individual: press de banca o peso muerto.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5" data-ui="modalidades-home-cards">
          {MODALIDAD_VALUES.map((modalidad, index) => (
            <motion.article
              key={modalidad}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: index * 0.08, duration: 0.45 }}
              className="relative min-h-[230px] rounded-3xl border p-6 overflow-hidden"
              style={{
                background: `linear-gradient(145deg, ${FER_COLORS.bgCard}, ${FER_COLORS.bgDark})`,
                borderColor: `${FER_COLORS.accent}24`,
              }}
              data-ui={`modalidades-home-card-${modalidad}`}
            >
              <div
                className="absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl"
                style={{ backgroundColor: `${FER_COLORS.accent}20` }}
                data-ui={`modalidades-home-card-glow-${modalidad}`}
                aria-hidden="true"
              />
              <p
                className="relative z-10 text-xs font-bold uppercase tracking-[0.25em] mb-4"
                style={{ color: FER_COLORS.gold }}
                data-ui={`modalidades-home-card-lifts-${modalidad}`}
              >
                {MODALIDAD_LIFTS[modalidad]}
              </p>
              <h3
                className="relative z-10 text-2xl font-display font-black mb-3"
                style={{ color: FER_COLORS.text }}
                data-ui={`modalidades-home-card-title-${modalidad}`}
              >
                {MODALIDAD_LABELS[modalidad]}
              </h3>
              <p
                className="relative z-10 text-sm leading-relaxed"
                style={{ color: FER_COLORS.textMuted }}
                data-ui={`modalidades-home-card-desc-${modalidad}`}
              >
                {MODALIDAD_DESCRIPTIONS[modalidad]}
              </p>
            </motion.article>
          ))}
        </div>

        <motion.a
          href="/modalidades"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ delay: 0.18, duration: 0.4 }}
          className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-sm font-bold uppercase tracking-[0.18em] transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
          data-ui="modalidades-home-link"
        >
          Ver modalidades
        </motion.a>
      </div>
    </section>
  );
}

export default ModalidadesHomeSection;
