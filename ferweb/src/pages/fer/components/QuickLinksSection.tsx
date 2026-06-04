import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  House,
  PenLine,
  Layers,
  Calendar,
  MapPin,
  Image,
  BookOpen,
  Users,
  HelpCircle,
} from 'lucide-react';
import { FER_COLORS, NAV_LINKS } from '../constants';

/* ── Icon name → Lucide component map ── */

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  House,
  PenLine,
  Layers,
  Calendar,
  MapPin,
  Image,
  BookOpen,
  Users,
  HelpCircle,
};

/* ── Card accent palette cycled by index ── */

const CARD_ACCENTS = [
  FER_COLORS.accent,
  FER_COLORS.gold,
  FER_COLORS.purple,
  FER_COLORS.accent,
  FER_COLORS.silver,
  FER_COLORS.gold,
  FER_COLORS.purple,
  FER_COLORS.accent,
] as const;

export function QuickLinksSection() {
  const [, navigate] = useLocation();

  const sectionVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.15 },
      },
    }),
    []
  );

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 24 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.45, ease: 'easeOut' },
      },
    }),
    []
  );

  const cardClass = useMemo(
    () =>
      'group relative w-full aspect-square flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 cursor-pointer hover:-translate-y-1 sm:p-5',
    []
  );

  return (
    <section
      className="relative py-20 sm:py-28 px-4 overflow-hidden"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="fer-quicklinks-section"
    >
      {/* Dot grid texture */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${FER_COLORS.text} 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
        data-ui="fer-quicklinks-grid"
      />

      {/* Subtle radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse, ${FER_COLORS.accent}08 0%, transparent 65%)`,
        }}
        aria-hidden="true"
        data-ui="fer-quicklinks-glow"
      />

      <div
        className="max-w-6xl mx-auto relative z-10"
        data-ui="fer-quicklinks-container"
      >
        {/* ── Header ── */}
        <div className="text-center mb-12 sm:mb-16" data-ui="fer-quicklinks-header">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-tight"
            style={{ color: FER_COLORS.text }}
            data-ui="fer-quicklinks-title"
          >
            Acceso{' '}
            <span
              className="text-shimmer"
              style={{ color: FER_COLORS.gold }}
              data-ui="fer-quicklinks-title-highlight"
            >
              Rápido
            </span>
          </h2>
          <div
            className="w-24 h-1 rounded-full mx-auto mt-4 mb-4"
            style={{
              background: `linear-gradient(90deg, ${FER_COLORS.gold}, ${FER_COLORS.accent})`,
            }}
            data-ui="fer-quicklinks-underline"
            aria-hidden="true"
          />
          <p
            className="text-base sm:text-lg max-w-xl mx-auto"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="fer-quicklinks-subtitle"
          >
            Explora todo lo que FER CUP II tiene para ti
          </p>
        </div>

        {/* ── Cards (flexbox layout) ── */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          data-ui="fer-quicklinks-cards"
        >
          {NAV_LINKS.map((link, index) => {
            const accentColor = CARD_ACCENTS[index % CARD_ACCENTS.length];
            const IconComponent = ICON_MAP[link.icon];
            const pathSlug = link.path.replace(/\//g, '').replace(/-/g, '-') || 'home';

            return (
              <motion.button
                key={link.path}
                variants={cardVariants}
                onClick={() => navigate(link.path)}
                className={cardClass}
                style={{
                  backgroundColor: FER_COLORS.bgCard,
                  borderColor: `${FER_COLORS.accent}15`,
                }}
                data-ui={`fer-quicklink-card-${pathSlug}`}
              >
                <div
                  className="absolute top-0 left-4 right-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ backgroundColor: accentColor }}
                  aria-hidden="true"
                  data-ui={`fer-quicklink-card-bar-${pathSlug}`}
                />

                <div
                  className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
                  data-ui={`fer-quicklink-card-copy-${pathSlug}`}
                >
                  <div
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-colors duration-300"
                    style={{
                      backgroundColor: `${accentColor}15`,
                      color: accentColor,
                    }}
                    data-ui={`fer-quicklink-card-icon-${pathSlug}`}
                  >
                    {IconComponent && <IconComponent size={20} />}
                  </div>

                  <div className="w-full" data-ui={`fer-quicklink-card-text-${pathSlug}`}>
                    <h3
                      className="text-sm font-semibold leading-tight sm:text-base transition-colors duration-300"
                      style={{ color: FER_COLORS.text }}
                      data-ui={`fer-quicklink-card-label-${pathSlug}`}
                    >
                      {link.label}
                    </h3>

                    <p
                      className="mt-1 text-[11px] leading-snug sm:text-sm"
                      style={{
                        color: FER_COLORS.textMuted,
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 3,
                        overflow: 'hidden',
                      }}
                      data-ui={`fer-quicklink-card-desc-${pathSlug}`}
                    >
                      {link.description}
                    </p>
                  </div>
                </div>

                <span
                  className="inline-flex items-center gap-1 text-xs font-medium opacity-0 transition-all duration-300 translate-y-1 group-hover:translate-y-0 group-hover:opacity-100"
                  style={{ color: accentColor }}
                  aria-hidden="true"
                  data-ui={`fer-quicklink-card-arrow-${pathSlug}`}
                >
                  Ir &rarr;
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export default QuickLinksSection;
