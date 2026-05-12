import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Mail, ArrowRight } from 'lucide-react';
import { FER_COLORS, FER_EVENT } from '../../fer/constants';
import { CONTACT_CARDS, VENUE_INFO, UBICACION_SECTION_IDS } from '../constants';

export function ContactSection() {
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
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id={UBICACION_SECTION_IDS.contact}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="ubicacion-contact-section"
    >
      <div
        className="max-w-4xl mx-auto text-center"
        data-ui="ubicacion-contact-container"
      >
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          data-ui="ubicacion-contact-header"
        >
          <motion.h2
            variants={itemVariants}
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="ubicacion-contact-title"
          >
            ¿Tienes{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="ubicacion-contact-title-highlight">
              dudas
            </span>
            ?
          </motion.h2>
          <motion.div
            variants={itemVariants}
            className="w-20 h-1 mx-auto rounded-full mb-6"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="ubicacion-contact-divider"
            aria-hidden="true"
          />
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg max-w-lg mx-auto mb-10 leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="ubicacion-contact-subtitle"
          >
            Contacta con nosotros y te resolveremos cualquier pregunta sobre el evento o cómo llegar.
          </motion.p>
        </motion.div>

        {/* Contact cards */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={containerVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
          data-ui="ubicacion-contact-cards"
        >
          {CONTACT_CARDS.map((card, i) => (
            <motion.a
              key={`contact-${i}`}
              href={card.href}
              target={card.href.startsWith('http') ? '_blank' : undefined}
              rel={card.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              variants={itemVariants}
              className="flex items-center gap-3 px-6 py-4 rounded-xl transition-all duration-200 hover:scale-[1.03]"
              style={{
                backgroundColor: FER_COLORS.bgDark,
                border: `1px solid ${FER_COLORS.accent}20`,
              }}
              data-ui={`ubicacion-contact-card-${i}`}
            >
              {i === 0 ? (
                <Camera size={20} style={{ color: FER_COLORS.accent }} data-ui={`ubicacion-contact-card-icon-${i}`} />
              ) : (
                <Mail size={20} style={{ color: FER_COLORS.accent }} data-ui={`ubicacion-contact-card-icon-${i}`} />
              )}
              <div data-ui={`ubicacion-contact-card-info-${i}`}>
                <p
                  className="text-xs uppercase tracking-wider font-medium"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui={`ubicacion-contact-card-label-${i}`}
                >
                  {card.label}
                </p>
                <p
                  className="text-sm sm:text-base font-semibold"
                  style={{ color: FER_COLORS.text }}
                  data-ui={`ubicacion-contact-card-value-${i}`}
                >
                  {card.value}
                </p>
              </div>
              <ArrowRight
                size={16}
                style={{ color: FER_COLORS.textMuted }}
                data-ui={`ubicacion-contact-card-arrow-${i}`}
              />
            </motion.a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
