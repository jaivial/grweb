import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Banknote, CreditCard, Loader2, Timer, X } from 'lucide-react';
import clsx from 'clsx';
import { FER_COLORS } from '../constants';

interface PaymentChoiceModalProps {
  isOpen: boolean;
  mode: 'stripeOnly' | 'choice';
  amount: number;
  subtotal?: number;
  discount?: number;
  couponCode?: string;
  isSubmitting: boolean;
  onStripe: () => void;
  onCash: () => void;
  onClose: () => void;
}

export function PaymentChoiceModal({
  isOpen,
  mode,
  amount,
  subtotal,
  discount = 0,
  couponCode,
  isSubmitting,
  onStripe,
  onCash,
  onClose,
}: PaymentChoiceModalProps) {
  const [cashAcknowledged, setCashAcknowledged] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setCashAcknowledged(false);
      setCountdown(5);
      autoSubmittedRef.current = false;
      return;
    }

    if (mode !== 'stripeOnly') return;

    setCountdown(5);
    autoSubmittedRef.current = false;
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            onStripe();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isOpen, mode, onStripe]);

  const amountText = useMemo(
    () => `${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
    [amount]
  );
  const subtotalText = useMemo(
    () => `${(subtotal ?? amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
    [amount, subtotal]
  );
  const discountText = useMemo(
    () => `-${discount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
    [discount]
  );

  const title = mode === 'stripeOnly' ? 'Pago online requerido' : 'Elige cómo quieres pagar';
  const subtitle = mode === 'stripeOnly'
    ? 'Para confirmar tu inscripción, completa el pago online con tarjeta.'
    : 'Puedes pagar ahora con tarjeta o reservar tu plaza y pagar en efectivo el día del evento.';

  const handleStripeClick = useCallback(() => {
    autoSubmittedRef.current = true;
    onStripe();
  }, [onStripe]);

  const handleCashAcknowledgement = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setCashAcknowledged(event.target.checked),
    []
  );

  const handleOverlayClick = useCallback(() => {
    if (!isSubmitting) onClose();
  }, [isSubmitting, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(10, 22, 40, 0.96)' }}
          onClick={handleOverlayClick}
          data-ui="fer-payment-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fer-payment-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-lg rounded-3xl p-5 sm:p-7 relative overflow-hidden"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.accent}25`,
              boxShadow: `0 0 60px ${FER_COLORS.accent}18`,
            }}
            onClick={(event) => event.stopPropagation()}
            data-ui="fer-payment-modal"
          >
            <div
              className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: FER_COLORS.accent }}
              data-ui="fer-payment-modal-glow"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fer-accent/50 disabled:opacity-50"
              data-ui="fer-payment-modal-close"
              aria-label="Cerrar"
            >
              <X size={20} style={{ color: FER_COLORS.textMuted }} data-ui="fer-payment-modal-close-icon" />
            </button>

            <div className="relative" data-ui="fer-payment-modal-content">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ backgroundColor: `${FER_COLORS.accent}18` }}
                data-ui="fer-payment-modal-icon-bg"
              >
                <CreditCard size={28} style={{ color: FER_COLORS.accent }} data-ui="fer-payment-modal-icon" aria-hidden="true" />
              </div>

              <h2
                id="fer-payment-modal-title"
                className="text-2xl sm:text-3xl font-display font-bold mb-2"
                style={{ color: FER_COLORS.text }}
                data-ui="fer-payment-modal-title"
              >
                {title}
              </h2>
              <p
                className="text-sm sm:text-base leading-relaxed mb-5"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="fer-payment-modal-subtitle"
              >
                {subtitle}
              </p>

              <div
                className="rounded-2xl p-4 mb-5"
                style={{ backgroundColor: FER_COLORS.bgDark, border: `1px solid ${FER_COLORS.gold}25` }}
                data-ui="fer-payment-modal-amount-card"
              >
                <div className="flex items-center justify-between gap-4" data-ui="fer-payment-modal-amount-row">
                  <div data-ui="fer-payment-modal-amount-copy">
                    <p className="text-xs uppercase tracking-[0.18em] font-bold" style={{ color: FER_COLORS.gold }} data-ui="fer-payment-modal-amount-label">
                      Total inscripción
                    </p>
                    <p className="text-sm mt-1" style={{ color: FER_COLORS.textMuted }} data-ui="fer-payment-modal-amount-hint">
                      Incluye inscripción y extras seleccionados
                    </p>
                  </div>
                  <p className="text-2xl sm:text-3xl font-black whitespace-nowrap" style={{ color: FER_COLORS.gold }} data-ui="fer-payment-modal-amount">
                    {amountText}
                  </p>
                </div>
                {discount > 0 && (
                  <div className="mt-4 pt-4 space-y-2 border-t border-white/10" data-ui="fer-payment-modal-discount-breakdown">
                    <div className="flex items-center justify-between gap-3 text-sm" data-ui="fer-payment-modal-subtotal-row">
                      <span style={{ color: FER_COLORS.textMuted }} data-ui="fer-payment-modal-subtotal-label">Subtotal</span>
                      <span style={{ color: FER_COLORS.text }} data-ui="fer-payment-modal-subtotal-value">{subtotalText}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm" data-ui="fer-payment-modal-discount-row">
                      <span style={{ color: FER_COLORS.green }} data-ui="fer-payment-modal-discount-label">
                        Cupón{couponCode ? ` ${couponCode}` : ''}
                      </span>
                      <span style={{ color: FER_COLORS.green }} data-ui="fer-payment-modal-discount-value">{discountText}</span>
                    </div>
                  </div>
                )}
              </div>

              {mode === 'stripeOnly' && (
                <div
                  className="flex items-center gap-3 rounded-2xl p-4 mb-5"
                  style={{ backgroundColor: `${FER_COLORS.accent}10`, border: `1px solid ${FER_COLORS.accent}22` }}
                  data-ui="fer-payment-modal-countdown"
                >
                  <Timer size={20} style={{ color: FER_COLORS.accent }} data-ui="fer-payment-modal-countdown-icon" aria-hidden="true" />
                  <p className="text-sm leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="fer-payment-modal-countdown-text">
                    Te redirigiremos a Stripe en <strong style={{ color: FER_COLORS.text }} data-ui="fer-payment-modal-countdown-value">{countdown}s</strong>. También puedes continuar ahora.
                  </p>
                </div>
              )}

              <div className="space-y-3" data-ui="fer-payment-modal-actions">
                <button
                  type="button"
                  onClick={handleStripeClick}
                  disabled={isSubmitting}
                  className="w-full min-h-[52px] rounded-xl font-bold text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
                  style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
                  data-ui="fer-payment-modal-stripe-btn"
                >
                  {isSubmitting ? (
                    <Loader2 size={20} className="animate-spin" data-ui="fer-payment-modal-stripe-spinner" aria-hidden="true" />
                  ) : (
                    <CreditCard size={20} data-ui="fer-payment-modal-stripe-icon" aria-hidden="true" />
                  )}
                  <span data-ui="fer-payment-modal-stripe-text">Pagar ahora online</span>
                </button>

                {mode === 'choice' && (
                  <div
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: FER_COLORS.bgDark, border: `1px solid ${FER_COLORS.accent}18` }}
                    data-ui="fer-payment-modal-cash-card"
                  >
                    <label className="flex items-start gap-3 cursor-pointer" data-ui="fer-payment-modal-cash-ack-label">
                      <input
                        type="checkbox"
                        checked={cashAcknowledged}
                        onChange={handleCashAcknowledgement}
                        disabled={isSubmitting}
                        className="mt-1 h-5 w-5 rounded border-gray-500 bg-transparent text-fer-accent focus:ring-fer-accent/50"
                        data-ui="fer-payment-modal-cash-ack-input"
                      />
                      <span className="text-sm leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="fer-payment-modal-cash-ack-text">
                        Entiendo que mi pago queda pendiente y deberé abonarlo en efectivo en la mesa de registro el día del evento.
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={onCash}
                      disabled={isSubmitting || !cashAcknowledged}
                      className={clsx(
                        'mt-4 w-full min-h-[52px] rounded-xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-fer-gold/50 disabled:opacity-50 disabled:cursor-not-allowed',
                        cashAcknowledged && !isSubmitting && 'hover:brightness-110 active:scale-[0.98]'
                      )}
                      style={{ backgroundColor: FER_COLORS.gold, color: FER_COLORS.bgDark }}
                      data-ui="fer-payment-modal-cash-btn"
                    >
                      {isSubmitting ? (
                        <Loader2 size={20} className="animate-spin" data-ui="fer-payment-modal-cash-spinner" aria-hidden="true" />
                      ) : (
                        <Banknote size={20} data-ui="fer-payment-modal-cash-icon" aria-hidden="true" />
                      )}
                      <span data-ui="fer-payment-modal-cash-text">Pagar en efectivo</span>
                    </button>
                  </div>
                )}
              </div>

              {mode === 'choice' && (
                <div className="flex items-start gap-2 mt-4" data-ui="fer-payment-modal-warning">
                  <AlertTriangle size={16} style={{ color: FER_COLORS.gold }} data-ui="fer-payment-modal-warning-icon" aria-hidden="true" />
                  <p className="text-xs leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="fer-payment-modal-warning-text">
                    Si eliges efectivo, recibirás tu QR por email, pero el pago seguirá pendiente hasta el día del evento.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
