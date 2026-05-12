import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MapPin, ExternalLink } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { VENUE_INFO, UBICACION_SECTION_IDS } from '../constants';

export function MapSection() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const mapEmbedUrl = useMemo(
    () =>
      `https://www.openstreetmap.org/export/embed.html?bbox=${VENUE_INFO.coordinates.lng - 0.01}%2C${VENUE_INFO.coordinates.lat - 0.008}%2C${VENUE_INFO.coordinates.lng + 0.01}%2C${VENUE_INFO.coordinates.lat + 0.008}&layer=mapnik&marker=${VENUE_INFO.coordinates.lat}%2C${VENUE_INFO.coordinates.lng}`,
    []
  );

  const sectionVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 40 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: 'easeOut' },
      },
    }),
    []
  );

  const handleOpenMaps = useCallback(() => {
    window.open(VENUE_INFO.googleMapsUrl, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <section
      id={UBICACION_SECTION_IDS.map}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="ubicacion-map-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="ubicacion-map-container"
      >
        {/* Section header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={sectionVariants}
          className="text-center mb-10 sm:mb-14"
          data-ui="ubicacion-map-header"
        >
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="ubicacion-map-title"
          >
            Encuéntranos en el{' '}
            <span
              style={{ color: FER_COLORS.glow }}
              data-ui="ubicacion-map-title-highlight"
            >
              mapa
            </span>
          </h2>
          <div
            className="w-20 h-1 mx-auto rounded-full mb-6"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="ubicacion-map-divider"
            aria-hidden="true"
          />
          <p
            className="text-base sm:text-lg max-w-xl mx-auto leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="ubicacion-map-description"
          >
            {VENUE_INFO.fullName} — {VENUE_INFO.address}
          </p>
        </motion.div>

        {/* Map embed */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={sectionVariants}
          className="rounded-2xl overflow-hidden relative"
          style={{ border: `1px solid ${FER_COLORS.accent}20` }}
          data-ui="ubicacion-map-wrapper"
        >
          <div
            className="aspect-[16/9] sm:aspect-[21/9] w-full"
            data-ui="ubicacion-map-frame-container"
          >
            <iframe
              src={mapEmbedUrl}
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
              title="Mapa de ubicación del GRS Club en Valencia, Valencia"
              data-ui="ubicacion-map-iframe"
              style={{ filter: 'grayscale(0.3) contrast(1.1)' }}
            />
          </div>

          {/* Map overlay card */}
          <div
            className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 right-4 sm:right-auto"
            data-ui="ubicacion-map-card"
          >
            <div
              className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 rounded-xl backdrop-blur-md"
              style={{
                backgroundColor: `${FER_COLORS.bgCard}e6`,
                border: `1px solid ${FER_COLORS.accent}25`,
              }}
              data-ui="ubicacion-map-card-inner"
            >
              <MapPin
                size={20}
                style={{ color: FER_COLORS.accent }}
                data-ui="ubicacion-map-card-icon"
              />
              <div data-ui="ubicacion-map-card-info">
                <p
                  className="font-semibold text-sm sm:text-base"
                  style={{ color: FER_COLORS.text }}
                  data-ui="ubicacion-map-card-name"
                >
                  {VENUE_INFO.name}
                </p>
                <p
                  className="text-xs sm:text-sm"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui="ubicacion-map-card-address"
                >
                  {VENUE_INFO.address}
                </p>
              </div>
              <button
                onClick={handleOpenMaps}
                className="ml-2 p-2 rounded-lg transition-colors hover:bg-white/10"
                style={{ border: `1px solid ${FER_COLORS.accent}30` }}
                data-ui="ubicacion-map-card-external"
                aria-label="Abrir en Google Maps"
              >
                <ExternalLink
                  size={16}
                  style={{ color: FER_COLORS.accent }}
                  data-ui="ubicacion-map-card-external-icon"
                />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Google Maps link */}
        <div
          className="text-center mt-6"
          data-ui="ubicacion-map-link-wrapper"
        >
          <a
            href={VENUE_INFO.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:underline"
            style={{ color: FER_COLORS.accent }}
            data-ui="ubicacion-map-link"
          >
            <MapPin size={16} data-ui="ubicacion-map-link-icon" />
            <span data-ui="ubicacion-map-link-text">
              Abrir en Google Maps
            </span>
            <ExternalLink size={14} data-ui="ubicacion-map-link-external" />
          </a>
        </div>
      </div>
    </section>
  );
}
