import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS, FER_EVENT } from '../../fer/constants/constants';
import { FerFooter } from '../../fer/components/FerFooter';

interface InscripcionClosedProps {
  reason: 'closed' | 'soldout';
  onRetry?: () => void;
}

export function InscripcionClosed({ reason, onRetry }: InscripcionClosedProps) {
  const [, navigate] = useLocation();

  const title = useMemo(
    () => (reason === 'soldout' ? 'Plazas agotadas' : 'Inscripción cerrada'),
    [reason]
  );

  const description = useMemo(
    () =>
      reason === 'soldout'
        ? `Todas las plazas para el ${FER_EVENT.name} han sido reservadas. Sigue ${FER_EVENT.instagramHandle} para futuras ediciones.`
        : `Las inscripciones para el ${FER_EVENT.name} aún no están abiertas. Mantente atento a ${FER_EVENT.instagramHandle} para saber cuándo se abren.`,
    [reason]
  );

  const Icon = reason === 'soldout' ? AlertCircle : Lock;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="inscripcion-closed"
    >
      <div
        className="flex-1 flex items-center justify-center px-4"
        data-ui="inscripcion-closed-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-lg"
          data-ui="inscripcion-closed-content"
        >
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: `${FER_COLORS.gold}12` }}
            data-ui="inscripcion-closed-icon-bg"
          >
            <Icon size={36} style={{ color: FER_COLORS.gold }} data-ui="inscripcion-closed-icon" />
          </div>

          {/* Title */}
          <h1
            className="text-3xl sm:text-4xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="inscripcion-closed-title"
          >
            {title}
          </h1>

          {/* Description */}
          <p
            className="text-base sm:text-lg leading-relaxed mb-8"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="inscripcion-closed-description"
          >
            {description}
          </p>

          {/* Divider */}
          <div
            className="w-16 h-1 mx-auto mb-8 rounded-full"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="inscripcion-closed-divider"
          />

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3" data-ui="inscripcion-closed-actions">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-200 hover:opacity-90"
              style={{
                backgroundColor: `${FER_COLORS.accent}20`,
                color: FER_COLORS.accent,
                border: `1px solid ${FER_COLORS.accent}30`,
              }}
              data-ui="inscripcion-closed-home-btn"
            >
              <ArrowLeft size={16} data-ui="inscripcion-closed-home-icon" />
              <span data-ui="inscripcion-closed-home-text">Volver al inicio</span>
            </button>

            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-200 hover:opacity-90"
                style={{
                  backgroundColor: `${FER_COLORS.gold}15`,
                  color: FER_COLORS.gold,
                  border: `1px solid ${FER_COLORS.gold}25`,
                }}
                data-ui="inscripcion-closed-retry-btn"
              >
                <RefreshCw size={16} data-ui="inscripcion-closed-retry-icon" />
                <span data-ui="inscripcion-closed-retry-text">Reintentar</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>

      <FerFooter />
    </div>
  );
}
