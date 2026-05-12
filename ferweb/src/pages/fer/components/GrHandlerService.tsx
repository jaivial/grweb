import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { FER_COLORS } from '../constants';

export function GrHandlerService() {
  const sectionVariants = useMemo(
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
    <section
      id="gr-handler-service"
      className="py-20 sm:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="gr-handler-service"
    >
      <div className="max-w-4xl mx-auto text-center" data-ui="gr-handler-service-container">
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          data-ui="gr-handler-service-content"
        >
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 sm:mb-8"
            style={{ backgroundColor: `${FER_COLORS.accent}15` }}
            data-ui="gr-handler-service-icon-container"
          >
            <Users
              size={32}
              style={{ color: FER_COLORS.accent }}
              data-ui="gr-handler-service-icon"
            />
          </div>

          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="gr-handler-service-title"
          >
            Servicio de Handlers{' '}
            <span style={{ color: FER_COLORS.gold }} data-ui="gr-handler-service-title-highlight">
              GRStrength
            </span>
          </h2>

          <p
            className="text-base sm:text-lg max-w-xl mx-auto"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="gr-handler-service-description"
          >
            Mas informacion disponible proximamente.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
