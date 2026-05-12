import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Flame, Shield, Heart } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { CORE_VALUES, SOBRE_SECTION_IDS } from '../constants';
import type { ValueIcon } from '../types';

const ICON_MAP: Record<ValueIcon, typeof Users> = {
  users: Users,
  flame: Flame,
  shield: Shield,
  heart: Heart,
} as const;

export function ValuesSection() {
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
        transition: { staggerChildren: 0.1, delayChildren: 0.15 },
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
      id={SOBRE_SECTION_IDS.values}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="sobre-values-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="sobre-values-container"
      >
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="text-center mb-12 sm:mb-16"
          data-ui="sobre-values-header"
        >
          <motion.h2
            variants={itemVariants}
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="sobre-values-title"
          >
            Nuestros{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="sobre-values-title-highlight">
              valores
            </span>
          </motion.h2>
          <motion.div
            variants={itemVariants}
            className="w-20 h-1 mx-auto rounded-full"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="sobre-values-divider"
            aria-hidden="true"
          />
        </motion.div>

        {/* Value cards */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={containerVariants}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6"
          data-ui="sobre-values-grid"
        >
          {CORE_VALUES.map((value, i) => {
            const Icon = ICON_MAP[value.icon];
            return (
              <motion.div
                key={`value-${i}`}
                variants={itemVariants}
                className="rounded-2xl p-6 sm:p-8 transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: FER_COLORS.bgCard,
                  border: `1px solid ${FER_COLORS.accent}12`,
                }}
                data-ui={`sobre-values-card-${i}`}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${FER_COLORS.accent}15` }}
                  data-ui={`sobre-values-card-icon-bg-${i}`}
                >
                  <Icon
                    size={24}
                    style={{ color: FER_COLORS.accent }}
                    data-ui={`sobre-values-card-icon-${i}`}
                  />
                </div>
                <h3
                  className="text-lg sm:text-xl font-semibold mb-3"
                  style={{ color: FER_COLORS.text }}
                  data-ui={`sobre-values-card-title-${i}`}
                >
                  {value.title}
                </h3>
                <p
                  className="text-sm sm:text-base leading-relaxed"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui={`sobre-values-card-desc-${i}`}
                >
                  {value.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
