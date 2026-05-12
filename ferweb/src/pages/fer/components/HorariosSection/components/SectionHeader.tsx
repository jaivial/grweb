import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { FER_COLORS } from '../../../constants';

export function SectionHeader() {
  const headerVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: 'easeOut' },
      },
    }),
    []
  );

  return (
    <motion.div
      variants={headerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      className="text-center mb-14 sm:mb-16 relative"
      data-ui="horarios-section-header"
    >
      <div
        className="flex items-center justify-center gap-3 mb-6"
        data-ui="horarios-section-header-icon-row"
      >
        <Calendar
          size={24}
          style={{ color: FER_COLORS.accent }}
          data-ui="horarios-section-header-icon"
        />
        <span
          className="text-sm font-semibold uppercase tracking-[0.3em]"
          style={{ color: FER_COLORS.textMuted }}
          data-ui="horarios-section-header-label"
        >
          Competici&oacute;n
        </span>
      </div>
      <h2
        className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
        style={{ color: FER_COLORS.text }}
        data-ui="horarios-section-title"
      >
        <span style={{ color: FER_COLORS.gold }} data-ui="horarios-section-title-highlight">
          Horarios
        </span>
      </h2>
      <p
        className="text-base sm:text-lg max-w-xl mx-auto"
        style={{ color: FER_COLORS.textMuted }}
        data-ui="horarios-section-subtitle"
      >
        Consulta los horarios de cada categor&iacute;a y planifica tu d&iacute;a de competici&oacute;n
      </p>
      <div
        className="h-1 rounded-full w-24 sm:w-32 mx-auto mt-6"
        style={{
          background: `linear-gradient(90deg, transparent, ${FER_COLORS.gold}, ${FER_COLORS.accent}, ${FER_COLORS.gold}, transparent)`,
        }}
        data-ui="horarios-section-underline"
      />
    </motion.div>
  );
}
