import { useMemo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { FER_COLORS } from '../constants';
import api from '../../../api/client';

interface UpsellModalProps {
  isOpen: boolean;
  inscripcionId: number | null;
  slug: string;
  onClose: () => void;
}

export function UpsellModal({ isOpen, inscripcionId, slug, onClose }: UpsellModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpsell = useCallback(
    async (quiere: boolean) => {
      if (!inscripcionId || !quiere) {
        onClose();
        return;
      }

      setIsSubmitting(true);
      try {
        await api.addUpsell(slug, inscripcionId, true);
        toast.success('¡Preparación añadida! Te contactaremos pronto.', {
          icon: '🎯',
          style: { background: '#161B26', color: '#F8FAFC' },
        });
      } catch (error) {
        console.error('Upsell error:', error);
        toast.error('No se pudo añadir la preparación. Contacta con nosotros.', {
          style: { background: '#161B26', color: '#F8FAFC' },
        });
      } finally {
        setIsSubmitting(false);
        onClose();
      }
    },
    [inscripcionId, slug, onClose]
  );

  const handleNoThanks = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(10, 22, 40, 0.96)' }}
          onClick={handleNoThanks}
          data-ui="fer-upsell-overlay"
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="max-w-md w-full p-6 sm:p-8 rounded-3xl relative"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.gold}25`,
              boxShadow: `0 0 50px ${FER_COLORS.gold}10`,
            }}
            onClick={(e) => e.stopPropagation()}
            data-ui="fer-upsell-modal"
          >
            {/* Close button */}
            <button
              onClick={handleNoThanks}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
              data-ui="fer-upsell-close"
              aria-label="Cerrar"
            >
              <X size={20} style={{ color: FER_COLORS.textMuted }} />
            </button>

            {/* Icon */}
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${FER_COLORS.gold}18` }}
              data-ui="fer-upsell-icon-bg"
            >
              <Star size={32} style={{ color: FER_COLORS.gold }} data-ui="fer-upsell-icon" />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl sm:text-2xl font-display font-bold mb-3 text-center"
              style={{ color: FER_COLORS.text }}
              data-ui="fer-upsell-title"
            >
              ¿No tienes entrenador?
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-center mb-6 text-sm sm:text-base leading-relaxed"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="fer-upsell-description"
            >
              Podemos ayudarte con la preparación para tu primera competición.
              Incluye planificación de entrenamiento, técnica de los tres levantamientos
              y seguimiento personalizado.
            </motion.p>

            {/* Price card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="p-4 sm:p-5 rounded-xl mb-6"
              style={{
                backgroundColor: FER_COLORS.bgDark,
                border: `1px solid ${FER_COLORS.gold}20`,
              }}
              data-ui="fer-upsell-price-card"
            >
              <div className="flex justify-between items-center" data-ui="fer-upsell-price-row">
                <div data-ui="fer-upsell-price-label-wrapper">
                  <span
                    className="font-semibold"
                    style={{ color: FER_COLORS.text }}
                    data-ui="fer-upsell-price-label"
                  >
                    Ayuda de preparación
                  </span>
                  <p
                    className="text-xs mt-1"
                    style={{ color: FER_COLORS.textMuted }}
                    data-ui="fer-upsell-price-detail"
                  >
                    Plan de entrenamiento + técnica
                  </p>
                </div>
                <span
                  className="text-2xl sm:text-3xl font-black"
                  style={{ color: FER_COLORS.gold }}
                  data-ui="fer-upsell-price"
                >
                  +50€
                </span>
              </div>
            </motion.div>

            {/* Note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-xs sm:text-sm text-center mb-6"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="fer-upsell-note"
            >
              No es obligatorio, pero puede marcar la diferencia en tu debut
            </motion.p>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex gap-3"
              data-ui="fer-upsell-actions"
            >
              <button
                onClick={handleNoThanks}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:bg-opacity-80 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50 disabled:opacity-50"
                style={{
                  backgroundColor: FER_COLORS.bgDark,
                  color: FER_COLORS.text,
                }}
                data-ui="fer-upsell-no-btn"
              >
                No, gracias
              </button>
              <button
                onClick={() => handleUpsell(true)}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-gold/50 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: FER_COLORS.gold,
                  color: FER_COLORS.bgDark,
                }}
                data-ui="fer-upsell-yes-btn"
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" data-ui="fer-upsell-spinner" />
                ) : null}
                Quiero ayuda
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
