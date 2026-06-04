import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FER_COLORS } from '../constants';

interface StaleConfigModalProps {
  isOpen: boolean;
  onReload: () => void;
}

export function StaleConfigModal({ isOpen, onReload }: StaleConfigModalProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(5);
      return;
    }

    setCountdown(5);
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          onReload();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isOpen, onReload]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(10, 22, 40, 0.94)' }}
          data-ui="fer-stale-config-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fer-stale-config-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md rounded-3xl p-6 sm:p-7 text-center relative overflow-hidden"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.red}30`,
              boxShadow: `0 0 60px ${FER_COLORS.red}18`,
            }}
            data-ui="fer-stale-config-modal"
          >
            <div
              className="absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: FER_COLORS.red }}
              data-ui="fer-stale-config-glow"
              aria-hidden="true"
            />

            <div className="relative" data-ui="fer-stale-config-content">
              <div
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${FER_COLORS.red}18` }}
                data-ui="fer-stale-config-icon-bg"
              >
                <AlertTriangle size={30} style={{ color: FER_COLORS.red }} data-ui="fer-stale-config-icon" aria-hidden="true" />
              </div>

              <h2
                id="fer-stale-config-title"
                className="text-2xl sm:text-3xl font-display font-bold mb-3"
                style={{ color: FER_COLORS.text }}
                data-ui="fer-stale-config-title"
              >
                Configuracion desactualizada
              </h2>

              <p
                className="text-sm sm:text-base leading-relaxed mb-4"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="fer-stale-config-text"
              >
                Ha ocurrido un error, recarga la pagina y vuelvelo a intentar.
              </p>

              <p
                className="text-xs uppercase tracking-[0.18em] font-bold mb-5"
                style={{ color: FER_COLORS.gold }}
                data-ui="fer-stale-config-countdown"
              >
                Recargando en {countdown}s
              </p>

              <button
                type="button"
                onClick={onReload}
                className="w-full min-h-[52px] rounded-xl font-bold text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50 flex items-center justify-center gap-2.5"
                style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
                data-ui="fer-stale-config-reload"
              >
                <RefreshCw size={18} data-ui="fer-stale-config-reload-icon" aria-hidden="true" />
                <span data-ui="fer-stale-config-reload-text">Recargar pagina</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
