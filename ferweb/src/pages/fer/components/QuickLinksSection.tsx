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
      'group relative w-full sm:flex-[1_1_240px] sm:min-w-[240px] sm:max-w-[320px] p-5 rounded-2xl text-left transition-all duration-300 cursor-pointer border hover:-translate-y-1',
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
          className="flex flex-wrap justify-center gap-4 sm:gap-5"
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
                {/* Hover accent top bar */}
                <div
                  className="absolute top-0 left-4 right-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ backgroundColor: accentColor }}
                  aria-hidden="true"
                  data-ui={`fer-quicklink-card-bar-${pathSlug}`}
                />

                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300"
                  style={{
                    backgroundColor: `${accentColor}15`,
                    color: accentColor,
                  }}
                  data-ui={`fer-quicklink-card-icon-${pathSlug}`}
                >
                  {IconComponent && <IconComponent size={20} />}
                </div>

                {/* Label */}
                <h3
                  className="text-base font-semibold mb-1 transition-colors duration-300"
                  style={{ color: FER_COLORS.text }}
                  data-ui={`fer-quicklink-card-label-${pathSlug}`}
                >
                  {link.label}
                </h3>

                {/* Description */}
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui={`fer-quicklink-card-desc-${pathSlug}`}
                >
                  {link.description}
                </p>

                {/* Arrow indicator (appears on hover) */}
                <span
                  className="inline-block mt-3 text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-1 group-hover:translate-x-0"
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
