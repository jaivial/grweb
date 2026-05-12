import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS } from '../../fer/constants/constants';
import { FerFooter } from '../../fer/components/FerFooter';

interface InscripcionErrorProps {
  onRetry: () => void;
}

export function InscripcionError({ onRetry }: InscripcionErrorProps) {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="inscripcion-error"
    >
      <div
        className="flex-1 flex items-center justify-center px-4"
        data-ui="inscripcion-error-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-lg"
          data-ui="inscripcion-error-content"
        >
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: `${FER_COLORS.red}12` }}
            data-ui="inscripcion-error-icon-bg"
          >
            <AlertTriangle size={36} style={{ color: FER_COLORS.red }} data-ui="inscripcion-error-icon" />
          </div>

          {/* Title */}
          <h1
            className="text-3xl sm:text-4xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="inscripcion-error-title"
          >
            Error de conexión
          </h1>

          {/* Description */}
          <p
            className="text-base sm:text-lg leading-relaxed mb-8"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="inscripcion-error-description"
          >
            No se pudo cargar la información del evento. Comprueba tu conexión a internet e inténtalo de nuevo.
          </p>

          {/* Divider */}
          <div
            className="w-16 h-1 mx-auto mb-8 rounded-full"
            style={{ backgroundColor: FER_COLORS.red }}
            data-ui="inscripcion-error-divider"
          />

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3" data-ui="inscripcion-error-actions">
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200 hover:opacity-90"
              style={{
                backgroundColor: FER_COLORS.accent,
                color: FER_COLORS.bgDark,
              }}
              data-ui="inscripcion-error-retry-btn"
            >
              <RefreshCw size={16} data-ui="inscripcion-error-retry-icon" />
              <span data-ui="inscripcion-error-retry-text">Reintentar</span>
            </button>

            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-200 hover:opacity-90"
              style={{
                backgroundColor: `${FER_COLORS.accent}20`,
                color: FER_COLORS.accent,
                border: `1px solid ${FER_COLORS.accent}30`,
              }}
              data-ui="inscripcion-error-home-btn"
            >
              <ArrowLeft size={16} data-ui="inscripcion-error-home-icon" />
              <span data-ui="inscripcion-error-home-text">Volver al inicio</span>
            </button>
          </div>
        </motion.div>
      </div>

      <FerFooter />
    </div>
  );
}
