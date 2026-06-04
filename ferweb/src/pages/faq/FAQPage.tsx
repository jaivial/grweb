import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { FER_COLORS } from '../fer/constants';
import { Head } from '../../components/Head';
import { FaqSection } from '../fer/components/FaqSection';
import { FerFooter } from '../fer/components/FerFooter';

export function FAQPage() {
  const heroVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: 'easeOut' },
      },
    }),
    []
  );

  const breadcrumbVariants = useMemo(
    () => ({
      hidden: { opacity: 0, x: -12 },
      visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.4, ease: 'easeOut', delay: 0.1 },
      },
    }),
    []
  );

  return (
    <>
      <Head
        title="FAQ | FER CUP"
        description="Resuelve las preguntas más frecuentes sobre la FER CUP, sus modalidades, horarios, pesaje y participación."
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="faq-page"
      >
        <header
          className="relative overflow-hidden"
          style={{
            backgroundColor: FER_COLORS.bgDark,
            borderBottom: `1px solid ${FER_COLORS.accent}15`,
          }}
          data-ui="faq-page-header"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 100%, ${FER_COLORS.gold}08 0%, transparent 60%)`,
            }}
            aria-hidden="true"
            data-ui="faq-page-header-glow"
          />

          <div
            className="max-w-6xl mx-auto px-4 pt-6 pb-4 relative z-10"
            data-ui="faq-page-header-content"
          >
            <motion.nav
              variants={breadcrumbVariants}
              initial="hidden"
              animate="visible"
              className="mb-4"
              data-ui="faq-page-breadcrumb"
            >
              <a
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium group"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="faq-page-back-link"
              >
                <ArrowLeft
                  size={16}
                  className="transition-transform duration-200 group-hover:-translate-x-1"
                  data-ui="faq-page-back-icon"
                />
                <span data-ui="faq-page-back-text">Volver al inicio</span>
              </a>
            </motion.nav>

            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-3"
              data-ui="faq-page-title-row"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${FER_COLORS.gold}10`,
                  border: `1px solid ${FER_COLORS.gold}20`,
                  boxShadow: `0 0 20px ${FER_COLORS.gold}10`,
                }}
                data-ui="faq-page-title-icon-bg"
              >
                <HelpCircle
                  size={20}
                  style={{ color: FER_COLORS.gold }}
                  data-ui="faq-page-title-icon"
                />
              </div>
              <div data-ui="faq-page-title-text-group">
                <h1
                  className="text-2xl sm:text-3xl font-display font-bold"
                  style={{ color: FER_COLORS.text }}
                  data-ui="faq-page-title"
                >
                  Preguntas{' '}
                  <span style={{ color: FER_COLORS.gold }} data-ui="faq-page-title-highlight">
                    frecuentes
                  </span>
                </h1>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui="faq-page-subtitle"
                >
                  FER CUP
                </p>
              </div>
            </motion.div>
          </div>
        </header>

        <main className="flex-1" data-ui="faq-page-main">
          <FaqSection showHeader={false} />
        </main>

        <FerFooter />
      </div>
    </>
  );
}

export default FAQPage;
