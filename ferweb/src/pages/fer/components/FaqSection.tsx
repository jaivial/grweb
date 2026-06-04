import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { FER_COLORS } from '../constants';
import { FAQ_ITEMS } from '../constants/faq';
import { FaqAccordion } from './FaqAccordion';

interface FaqSectionProps {
  showHeader?: boolean;
}

export function FaqSection({ showHeader = true }: FaqSectionProps) {
  const sectionVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 24 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { staggerChildren: 0.08, delayChildren: 0.05 },
      },
    }),
    []
  );

  const headerVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 14 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      className="relative py-20 sm:py-28 px-4 overflow-hidden"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="fer-faq-section"
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${FER_COLORS.text} 1px, transparent 0)`,
          backgroundSize: '34px 34px',
        }}
        aria-hidden="true"
        data-ui="fer-faq-grid"
      />

      <div
        className="absolute left-1/2 top-0 h-[360px] w-[680px] -translate-x-1/2 pointer-events-none"
        style={{ background: `radial-gradient(ellipse, ${FER_COLORS.gold}0d 0%, transparent 68%)` }}
        aria-hidden="true"
        data-ui="fer-faq-glow"
      />

      <motion.div
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="max-w-4xl mx-auto relative z-10"
        data-ui="fer-faq-container"
      >
        {showHeader && (
          <motion.div
            variants={headerVariants}
            className="text-center mb-10 sm:mb-12"
            data-ui="fer-faq-header"
          >
            <div
              className="inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 mb-5"
              style={{
                borderColor: `${FER_COLORS.accent}20`,
                backgroundColor: `${FER_COLORS.bgCard}cc`,
              }}
              data-ui="fer-faq-kicker"
            >
              <HelpCircle size={16} style={{ color: FER_COLORS.gold }} data-ui="fer-faq-kicker-icon" />
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="fer-faq-kicker-text"
              >
                FAQ
              </span>
            </div>

            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-tight"
              style={{ color: FER_COLORS.text }}
              data-ui="fer-faq-title"
            >
              Preguntas{' '}
              <span style={{ color: FER_COLORS.gold }} data-ui="fer-faq-title-highlight">
                frecuentes
              </span>
            </h2>

            <p
              className="mt-4 text-base sm:text-lg max-w-2xl mx-auto"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="fer-faq-subtitle"
            >
              Resolvemos las dudas más comunes para que llegues a la FER CUP con todo claro.
            </p>
          </motion.div>
        )}

        <motion.div variants={headerVariants} data-ui="fer-faq-accordion-wrap">
          <FaqAccordion items={FAQ_ITEMS} />
        </motion.div>
      </motion.div>
    </section>
  );
}

export default FaqSection;
