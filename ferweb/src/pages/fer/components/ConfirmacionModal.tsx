import { useCallback, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, Share2, X, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import { FER_COLORS, CONFETTI_COUNT } from '../constants';
import { CanvasConfetti } from './CanvasConfetti';

interface ConfirmacionModalProps {
  isOpen: boolean;
  qrCode: string;
  nombre: string | undefined;
  email: string | undefined;
  onClose: () => void;
  onShowUpsell: () => void;
}

const CONFETTI_COLORS = [FER_COLORS.accent, FER_COLORS.gold, FER_COLORS.purple, FER_COLORS.green];

export function ConfirmacionModal({
  isOpen,
  qrCode,
  nombre,
  email,
  onClose,
  onShowUpsell,
}: ConfirmacionModalProps) {
  const [confettiActive, setConfettiActive] = useState(false);

  // Trigger confetti on open, then show upsell after duration
  useEffect(() => {
    if (isOpen) {
      setConfettiActive(true);
      const timer = setTimeout(() => {
        setConfettiActive(false);
        onShowUpsell();
      }, 3500);
      return () => clearTimeout(timer);
    } else {
      setConfettiActive(false);
    }
  }, [isOpen, onShowUpsell]);

  const handleDownload = useCallback(() => {
    if (!qrCode) return;
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = `FER-inscripcion-${nombre || 'participante'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [qrCode, nombre]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: 'FER CUP - Inscripción Confirmada',
      text: `¡Estoy inscrito en el FER CUP! 25 Julio, Valencia.`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareData.text);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.text);
      } catch {
        // silent fail
      }
    }
  }, []);

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 0.6,
        duration: 2 + Math.random() * 2.5,
        rotation: Math.random() * 720,
        size: 3 + Math.random() * 5,
      })),
    []
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(10, 22, 40, 0.96)' }}
          onClick={onClose}
          data-ui="fer-confirmation-overlay"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="max-w-md w-full p-6 sm:p-8 rounded-3xl text-center relative overflow-hidden"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.accent}25`,
              boxShadow: `0 0 60px ${FER_COLORS.accent}15`,
            }}
            onClick={(e) => e.stopPropagation()}
            data-ui="fer-confirmation-modal"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute top-4 right-4 p-2 rounded-full transition-colors duration-200 z-10"
              style={{
                backgroundColor: `${FER_COLORS.bgDark}80`,
                color: FER_COLORS.textMuted,
              }}
              data-ui="fer-confirmation-close"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>

            {/* Canvas confetti */}
            <CanvasConfetti
              isActive={confettiActive}
              duration={3500}
              pieceCount={400}
              colors={CONFETTI_COLORS}
            />

            {/* Success icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
              className="relative mx-auto mb-4"
              data-ui="fer-confirmation-icon-wrapper"
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: `${FER_COLORS.green}15` }}
                data-ui="fer-confirmation-icon-bg"
              >
                <CheckCircle size={40} style={{ color: FER_COLORS.green }} data-ui="fer-confirmation-icon" />
              </div>
              <motion.div
                className="absolute -inset-3 rounded-full"
                style={{ border: `2px solid ${FER_COLORS.green}30` }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0] }}
                transition={{ duration: 1.5, delay: 0.3, repeat: 2, repeatDelay: 0.5 }}
                data-ui="fer-confirmation-icon-pulse"
                aria-hidden="true"
              />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl sm:text-3xl font-display font-bold mb-2"
              style={{ color: FER_COLORS.text }}
              data-ui="fer-confirmation-title"
            >
              ¡Inscripción confirmada!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-6 text-base"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="fer-confirmation-subtitle"
            >
              Tu plaza está reservada.{' '}
              {nombre && (
                <span className="font-semibold" style={{ color: FER_COLORS.text }}>
                  {nombre}
                </span>
              )}
              . Guarda tu QR para el día del evento.
            </motion.p>

            {/* QR Code */}
            {qrCode ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 300 }}
                className="mb-6 p-4 rounded-2xl inline-block"
                style={{
                  backgroundColor: 'white',
                  boxShadow: `0 0 30px ${FER_COLORS.accent}20`,
                }}
                data-ui="fer-confirmation-qr-wrapper"
              >
                {qrCode.startsWith('http') ? (
                  <img
                    src={qrCode}
                    alt="Código QR de inscripción"
                    className="w-48 h-48 sm:w-56 sm:h-56"
                    data-ui="fer-confirmation-qr"
                  />
                ) : (
                  <div
                    className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center bg-gray-100 rounded-xl"
                    data-ui="fer-confirmation-qr-fallback"
                  >
                    <div className="text-center px-4" data-ui="fer-confirmation-qr-text">
                      <CheckCircle size={32} className="mx-auto mb-2 text-green-600" data-ui="fer-confirmation-qr-check" />
                      <p className="text-sm text-gray-600 font-medium" data-ui="fer-confirmation-qr-label">
                        Inscripción registrada
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="mb-6 p-6 rounded-2xl inline-block"
                style={{ backgroundColor: FER_COLORS.bgDark }}
                data-ui="fer-confirmation-qr-placeholder"
              >
                <Sparkles size={48} className="mx-auto" style={{ color: FER_COLORS.gold }} data-ui="fer-confirmation-qr-placeholder-icon" />
              </motion.div>
            )}

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-3 mb-5"
              data-ui="fer-confirmation-actions"
            >
              <button
                onClick={handleDownload}
                disabled={!qrCode}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                  qrCode
                    ? 'hover:bg-opacity-90 active:scale-[0.98]'
                    : 'opacity-50 cursor-not-allowed',
                )}
                style={{
                  backgroundColor: FER_COLORS.bgDark,
                  color: FER_COLORS.text,
                  border: `1px solid ${FER_COLORS.accent}20`,
                }}
                data-ui="fer-confirmation-download-btn"
              >
                <Download size={18} />
                Descargar QR
              </button>
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:bg-opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
                style={{
                  backgroundColor: FER_COLORS.bgDark,
                  color: FER_COLORS.text,
                  border: `1px solid ${FER_COLORS.accent}20`,
                }}
                data-ui="fer-confirmation-share-btn"
              >
                <Share2 size={18} />
                Compartir
              </button>
            </motion.div>

            {/* Email note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-xs sm:text-sm"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="fer-confirmation-email-note"
            >
              {email ? (
                <>
                  También te hemos enviado la confirmación a{' '}
                  <span className="font-medium" style={{ color: FER_COLORS.glow }}>
                    {email}
                  </span>
                </>
              ) : (
                'Revisa tu email para más información'
              )}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
