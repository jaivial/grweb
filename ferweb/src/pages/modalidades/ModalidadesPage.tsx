import { motion } from 'framer-motion';
import { Head } from '../../components/Head';
import { FerFooter } from '../fer/components/FerFooter';
import {
  FER_COLORS,
  MODALIDAD_VALUES,
  MODALIDAD_LABELS,
  MODALIDAD_DESCRIPTIONS,
  MODALIDAD_LIFTS,
} from '../fer/constants';
import {
  MEDIA_ALFONSO_FERNANDEZ_IMAGES,
  MEDIA_FERNANDO_RIPOLL_IMAGES,
  MEDIA_FOTOS_AEP_2_IMAGES,
} from '../fer/constants/mediaCdnUrls';

const MODALIDAD_IMAGES = {
  completa: MEDIA_FOTOS_AEP_2_IMAGES[0],
  solo_banca: MEDIA_ALFONSO_FERNANDEZ_IMAGES[1],
  solo_peso_muerto: MEDIA_FERNANDO_RIPOLL_IMAGES[4],
} as const;

const MODALIDAD_NOTES = {
  completa: ['9 intentos totales', 'Ranking de powerlifting completo', 'La experiencia FER CUP de principio a fin'],
  solo_banca: ['3 intentos en banca', 'Mesa, jueces y spotters oficiales', 'Perfecta para especialistas de press'],
  solo_peso_muerto: ['3 intentos en peso muerto', 'Turno directo para tirar fuerte', 'Pensada para cerrar el día con ruido'],
} as const;

export function ModalidadesPage(): JSX.Element {
  return (
    <>
      <Head
        title="Modalidades | FER CUP"
        description="Elige entre competición completa, solo press de banca o solo peso muerto para FER CUP II."
        canonicalUrl="https://fercup.com/modalidades"
      />
      <div
        className="min-h-screen flex flex-col overflow-hidden"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="modalidades-page"
      >
        <main className="flex-1" data-ui="modalidades-main">
          <section className="relative px-4 pt-28 pb-16 sm:pt-36 sm:pb-24" data-ui="modalidades-hero">
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, ${FER_COLORS.text} 1px, transparent 0)`,
                backgroundSize: '38px 38px',
              }}
              data-ui="modalidades-hero-grid"
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7 }}
              className="absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-3xl"
              style={{ backgroundColor: `${FER_COLORS.accent}16` }}
              data-ui="modalidades-hero-glow"
              aria-hidden="true"
            />
            <div className="relative z-10 max-w-6xl mx-auto" data-ui="modalidades-hero-container">
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="text-xs sm:text-sm font-bold uppercase tracking-[0.35em] text-center mb-5"
                style={{ color: FER_COLORS.gold }}
                data-ui="modalidades-hero-kicker"
              >
                Tres formas de competir
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.55 }}
                className="text-4xl sm:text-6xl lg:text-7xl font-display font-black tracking-tight text-center max-w-4xl mx-auto"
                style={{ color: FER_COLORS.text }}
                data-ui="modalidades-hero-title"
              >
                Compite en todo o domina una sola barra
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.5 }}
                className="mt-6 text-base sm:text-xl leading-relaxed text-center max-w-3xl mx-auto"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="modalidades-hero-subtitle"
              >
                FER CUP II abre plaza para powerlifting completo, especialistas de press de banca y especialistas de peso muerto. Mismo escenario, misma energía, objetivos distintos.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.5 }}
                className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
                data-ui="modalidades-hero-actions"
              >
                <a
                  href="/inscripcion"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full px-7 text-sm font-bold uppercase tracking-[0.18em] transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
                  data-ui="modalidades-hero-inscripcion-link"
                >
                  Elegir modalidad
                </a>
                <a
                  href="/horarios"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border px-7 text-sm font-bold uppercase tracking-[0.18em] transition-colors hover:bg-white/5"
                  style={{ borderColor: `${FER_COLORS.accent}40`, color: FER_COLORS.textMuted }}
                  data-ui="modalidades-hero-horarios-link"
                >
                  Ver horarios
                </a>
              </motion.div>
            </div>
          </section>

          <section className="px-4 pb-20 sm:pb-28" data-ui="modalidades-cards-section">
            <div className="max-w-6xl mx-auto space-y-6" data-ui="modalidades-cards-container">
              {MODALIDAD_VALUES.map((modalidad, index) => (
                <motion.article
                  key={modalidad}
                  initial={{ opacity: 0, y: 34 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ delay: index * 0.08, duration: 0.5 }}
                  className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-0 overflow-hidden rounded-[2rem] border"
                  style={{
                    background: `linear-gradient(145deg, ${FER_COLORS.bgCard}, ${FER_COLORS.bgDark})`,
                    borderColor: `${FER_COLORS.accent}24`,
                  }}
                  data-ui={`modalidades-card-${modalidad}`}
                >
                  <div className="relative min-h-[280px] lg:min-h-[420px] overflow-hidden" data-ui={`modalidades-card-image-wrap-${modalidad}`}>
                    <img
                      src={MODALIDAD_IMAGES[modalidad]}
                      alt={MODALIDAD_LABELS[modalidad]}
                      className="h-full w-full object-cover"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      data-ui={`modalidades-card-image-${modalidad}`}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(90deg, transparent, ${FER_COLORS.bgDark}d9)` }}
                      data-ui={`modalidades-card-image-fade-${modalidad}`}
                      aria-hidden="true"
                    />
                    <p
                      className="absolute left-5 top-5 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] backdrop-blur-md"
                      style={{ borderColor: `${FER_COLORS.glow}30`, color: FER_COLORS.text, backgroundColor: `${FER_COLORS.bgDark}99` }}
                      data-ui={`modalidades-card-badge-${modalidad}`}
                    >
                      Modalidad {index + 1}
                    </p>
                  </div>
                  <div className="relative p-6 sm:p-8 lg:p-10 flex flex-col justify-center" data-ui={`modalidades-card-content-${modalidad}`}>
                    <p
                      className="text-xs font-bold uppercase tracking-[0.28em] mb-4"
                      style={{ color: FER_COLORS.gold }}
                      data-ui={`modalidades-card-lifts-${modalidad}`}
                    >
                      {MODALIDAD_LIFTS[modalidad]}
                    </p>
                    <h2
                      className="text-3xl sm:text-4xl lg:text-5xl font-display font-black tracking-tight mb-4"
                      style={{ color: FER_COLORS.text }}
                      data-ui={`modalidades-card-title-${modalidad}`}
                    >
                      {MODALIDAD_LABELS[modalidad]}
                    </h2>
                    <p
                      className="text-base sm:text-lg leading-relaxed mb-6"
                      style={{ color: FER_COLORS.textMuted }}
                      data-ui={`modalidades-card-desc-${modalidad}`}
                    >
                      {MODALIDAD_DESCRIPTIONS[modalidad]}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-ui={`modalidades-card-notes-${modalidad}`}>
                      {MODALIDAD_NOTES[modalidad].map((note) => (
                        <div
                          key={note}
                          className="rounded-2xl border p-4"
                          style={{ backgroundColor: `${FER_COLORS.accent}0f`, borderColor: `${FER_COLORS.accent}1f` }}
                          data-ui={`modalidades-card-note-${modalidad}-${note.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        >
                          <p
                            className="text-sm font-semibold leading-snug"
                            style={{ color: FER_COLORS.text }}
                            data-ui={`modalidades-card-note-text-${modalidad}-${note.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                          >
                            {note}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>
        </main>
        <FerFooter />
      </div>
    </>
  );
}

export default ModalidadesPage;
