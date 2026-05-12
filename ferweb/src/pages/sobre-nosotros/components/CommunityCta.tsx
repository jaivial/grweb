import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Users } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS, FER_EVENT } from '../../fer/constants';
import { SOBRE_SECTION_IDS } from '../constants';

export function CommunityCta() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const sectionVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
    }),
    []
  );

  const handleInscribete = useCallback(() => {
    navigate('/inscripcion');
  }, [navigate]);

  return (
    <section
      id={SOBRE_SECTION_IDS.cta}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="sobre-cta-section"
    >
      <motion.div
        initial={prefersReducedMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
        className="max-w-3xl mx-auto text-center"
        data-ui="sobre-cta-container"
      >
        <div
          className="rounded-2xl p-8 sm:p-12 md:p-16 relative overflow-hidden"
          style={{
            backgroundColor: `${FER_COLORS.accent}08`,
            border: `1px solid ${FER_COLORS.accent}20`,
          }}
          data-ui="sobre-cta-card"
        >
          {/* Glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, ${FER_COLORS.accent}06 0%, transparent 70%)`,
            }}
            data-ui="sobre-cta-glow"
            aria-hidden="true"
          />

          <div
            className="relative z-10"
            data-ui="sobre-cta-content"
          >
            <Users
              size={40}
              style={{ color: FER_COLORS.accent }}
              className="mx-auto mb-6"
              data-ui="sobre-cta-icon"
            />
            <h2
              className="text-2xl sm:text-3xl md:text-4xl font-display font-bold mb-4"
              style={{ color: FER_COLORS.text }}
              data-ui="sobre-cta-title"
            >
              Únete a la{' '}
              <span style={{ color: FER_COLORS.glow }} data-ui="sobre-cta-title-highlight">
                comunidad
              </span>
            </h2>
            <p
              className="text-base sm:text-lg mb-8 leading-relaxed max-w-lg mx-auto"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="sobre-cta-description"
            >
              No importa tu nivel. Si tienes ganas de superarte y disfrutar del powerlifting
              en buena compañía, te esperamos en el {FER_EVENT.name}.
            </p>
            <button
              onClick={handleInscribete}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-base transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: FER_COLORS.accent,
                color: FER_COLORS.bgDark,
                boxShadow: `0 0 30px ${FER_COLORS.accent}30`,
              }}
              data-ui="sobre-cta-button"
            >
              <span data-ui="sobre-cta-button-text">
                INSCRIBIRME AHORA
              </span>
              <ArrowRight size={20} data-ui="sobre-cta-button-icon" />
            </button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
