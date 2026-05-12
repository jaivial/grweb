import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Car, Bus, Train } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { TRANSPORT_OPTIONS, UBICACION_SECTION_IDS } from '../constants';
import type { TransportIcon } from '../types';

const ICON_MAP: Record<TransportIcon, typeof Car> = {
  car: Car,
  bus: Bus,
  train: Train,
} as const;

export function TransportSection() {
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
      id={UBICACION_SECTION_IDS.transport}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="ubicacion-transport-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="ubicacion-transport-container"
      >
        {/* Section header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="text-center mb-10 sm:mb-14"
          data-ui="ubicacion-transport-header"
        >
          <motion.h2
            variants={itemVariants}
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="ubicacion-transport-title"
          >
            Cómo{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="ubicacion-transport-title-highlight">
              llegar
            </span>
          </motion.h2>
          <motion.div
            variants={itemVariants}
            className="w-20 h-1 mx-auto rounded-full mb-6"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="ubicacion-transport-divider"
            aria-hidden="true"
          />
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg max-w-xl mx-auto leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="ubicacion-transport-subtitle"
          >
            Diferentes opciones de transporte para que no te pierdas el evento
          </motion.p>
        </motion.div>

        {/* Transport cards */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6"
          data-ui="ubicacion-transport-grid"
        >
          {TRANSPORT_OPTIONS.map((option, i) => {
            const Icon = ICON_MAP[option.icon];
            return (
              <motion.div
                key={`transport-${i}`}
                variants={itemVariants}
                className="rounded-2xl p-6 sm:p-8 transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: FER_COLORS.bgDark,
                  border: `1px solid ${FER_COLORS.accent}15`,
                }}
                data-ui={`ubicacion-transport-card-${i}`}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${FER_COLORS.accent}15` }}
                  data-ui={`ubicacion-transport-card-icon-bg-${i}`}
                >
                  <Icon
                    size={24}
                    style={{ color: FER_COLORS.accent }}
                    data-ui={`ubicacion-transport-card-icon-${i}`}
                  />
                </div>
                <h3
                  className="text-lg sm:text-xl font-semibold mb-3"
                  style={{ color: FER_COLORS.text }}
                  data-ui={`ubicacion-transport-card-title-${i}`}
                >
                  {option.title}
                </h3>
                <p
                  className="text-sm sm:text-base mb-3 leading-relaxed"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui={`ubicacion-transport-card-desc-${i}`}
                >
                  {option.description}
                </p>
                <p
                  className="text-xs sm:text-sm leading-relaxed"
                  style={{ color: FER_COLORS.accent }}
                  data-ui={`ubicacion-transport-card-detail-${i}`}
                >
                  {option.detail}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
