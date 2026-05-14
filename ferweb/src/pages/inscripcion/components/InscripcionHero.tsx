import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Tag, Users } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS, FER_EVENT } from '../../fer/constants/constants';

interface InscripcionHeroProps {
  plazasDisponibles: number;
  precioBase: number | undefined;
}

export function InscripcionHero({ plazasDisponibles, precioBase }: InscripcionHeroProps) {
  const [, navigate] = useLocation();

  const plazasBadgeStyle = useMemo(
    () => ({
      backgroundColor: plazasDisponibles > 20 ? `${FER_COLORS.green}15` : `${FER_COLORS.gold}15`,
      color: plazasDisponibles > 20 ? FER_COLORS.green : FER_COLORS.gold,
      borderColor: plazasDisponibles > 20 ? `${FER_COLORS.green}30` : `${FER_COLORS.gold}30`,
    }),
    [plazasDisponibles]
  );

  const plazasText = useMemo(
    () => `${plazasDisponibles} ${plazasDisponibles === 1 ? 'plaza' : 'plazas'} disponibles`,
    [plazasDisponibles]
  );

  const priceText = useMemo(
    () => (precioBase !== undefined ? `${precioBase} EUR` : undefined),
    [precioBase]
  );

  return (
    <section
      className="relative pt-24 pb-12 sm:pt-32 sm:pb-16 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="inscripcion-hero"
    >
      <div className="max-w-3xl mx-auto" data-ui="inscripcion-hero-container">
        {/* Back link */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate('/')}
          className="flex items-center gap-2 mb-8 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:opacity-80"
          style={{
            backgroundColor: `${FER_COLORS.accent}15`,
            color: FER_COLORS.accent,
            border: `1px solid ${FER_COLORS.accent}25`,
          }}
          data-ui="inscripcion-hero-back"
          aria-label="Volver al inicio"
        >
          <ArrowLeft size={16} data-ui="inscripcion-hero-back-icon" />
          <span data-ui="inscripcion-hero-back-text">Volver al inicio</span>
        </motion.button>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
          style={{ color: FER_COLORS.text }}
          data-ui="inscripcion-hero-title"
        >
          <span style={{ color: FER_COLORS.accent }} data-ui="inscripcion-hero-title-accent">
            Inscríbete
          </span>{' '}
          al FER CUP
        </motion.h1>

        {/* Event info */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center gap-4 sm:gap-6 mb-6"
          data-ui="inscripcion-hero-info"
        >
          <div
            className="flex items-center gap-2"
            data-ui="inscripcion-hero-date"
          >
            <Calendar size={16} style={{ color: FER_COLORS.accent }} data-ui="inscripcion-hero-date-icon" />
            <span
              className="text-sm sm:text-base font-medium"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="inscripcion-hero-date-text"
            >
              {FER_EVENT.date}
            </span>
          </div>

          <div
            className="flex items-center gap-2"
            data-ui="inscripcion-hero-location"
          >
            <MapPin size={16} style={{ color: FER_COLORS.accent }} data-ui="inscripcion-hero-location-icon" />
            <span
              className="text-sm sm:text-base font-medium"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="inscripcion-hero-location-text"
            >
              {FER_EVENT.location}
            </span>
          </div>

          {priceText && (
            <div
              className="flex items-center gap-2"
              data-ui="inscripcion-hero-price"
            >
              <Tag size={16} style={{ color: FER_COLORS.gold }} data-ui="inscripcion-hero-price-icon" />
              <span
                className="text-sm sm:text-base font-bold"
                style={{ color: FER_COLORS.gold }}
                data-ui="inscripcion-hero-price-text"
              >
                {priceText}
              </span>
            </div>
          )}
        </motion.div>

        {/* Plazas badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border"
          style={plazasBadgeStyle}
          data-ui="inscripcion-hero-plazas"
        >
          <Users size={16} data-ui="inscripcion-hero-plazas-icon" />
          <span data-ui="inscripcion-hero-plazas-text">{plazasText}</span>
        </motion.div>
      </div>
    </section>
  );
}
