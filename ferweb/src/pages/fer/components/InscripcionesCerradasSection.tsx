import { motion } from 'framer-motion';
import { Lock, PartyPopper } from 'lucide-react';
import { FER_COLORS, FER_EVENT } from '../constants/constants';

const INSTAGRAM_HANDLE = '@grstrengthclub';
const INSTAGRAM_URL = 'https://www.instagram.com/grstrengthclub/';

interface InscripcionesCerradasSectionProps {
  soldOut?: boolean;
}

function InstagramLink() {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
      style={{ color: FER_COLORS.gold }}
      data-ui="inscripciones-cerradas-instagram"
    >
      {INSTAGRAM_HANDLE}
    </a>
  );
}

/**
 * Fallback shown in the home inscripciones section when the competition has
 * inscripciones closed (eventoConfig.inscripcionesAbiertas === false).
 * Replaces the inscripcion form. Shows a dedicated sold-out variant when
 * eventoConfig.soldOut === true.
 */
export function InscripcionesCerradasSection({ soldOut = false }: InscripcionesCerradasSectionProps) {
  const Icon = soldOut ? PartyPopper : Lock;

  return (
    <section
      className="py-20 sm:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="inscripciones-cerradas-section"
      data-soldout={soldOut ? 'true' : 'false'}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-lg mx-auto text-center"
        data-ui="inscripciones-cerradas-content"
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: `${FER_COLORS.gold}12` }}
          data-ui="inscripciones-cerradas-icon-bg"
        >
          <Icon size={36} style={{ color: FER_COLORS.gold }} data-ui="inscripciones-cerradas-icon" />
        </div>

        <h2
          className="text-3xl sm:text-4xl font-display font-bold mb-4"
          style={{ color: FER_COLORS.text }}
          data-ui="inscripciones-cerradas-title"
        >
          {soldOut ? '¡Sold out!' : 'Inscripciones cerradas'}
        </h2>

        <p
          className="text-base sm:text-lg leading-relaxed"
          style={{ color: FER_COLORS.textMuted }}
          data-ui="inscripciones-cerradas-description"
        >
          {soldOut ? (
            <>
              Gracias a todos por vuestro interés en participar. Estamos seguros que va a ser
              una locura de competición. Permaneced atentos a <InstagramLink /> para más noticias
              y próximas competiciones. ¡Muchas gracias a tod@s!
            </>
          ) : (
            <>
              Las inscripciones para el {FER_EVENT.name} están cerradas en este momento.
              Mantente atento a <InstagramLink /> para saber cuándo se abren de nuevo.
            </>
          )}
        </p>

        <div
          className="w-16 h-1 mx-auto mt-8 rounded-full"
          style={{ backgroundColor: FER_COLORS.accent }}
          data-ui="inscripciones-cerradas-divider"
        />
      </motion.div>
    </section>
  );
}

export default InscripcionesCerradasSection;
