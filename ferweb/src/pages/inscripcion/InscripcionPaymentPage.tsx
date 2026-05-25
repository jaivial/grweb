import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Banknote, CheckCircle, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { Head } from '../../components/Head';
import api from '../../api/client';
import { FER_COLORS } from '../fer/constants/constants';
import { FerFooter } from '../fer/components/FerFooter';

type PaymentPageState = 'loading' | 'redirecting' | 'already_paid' | 'stripe_unavailable' | 'error';

export function InscripcionPaymentPage() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<PaymentPageState>('loading');
  const [message, setMessage] = useState('No se pudo abrir el enlace de pago.');
  const [retryKey, setRetryKey] = useState(0);

  const token = useMemo(
    () => new URLSearchParams(window.location.search).get('token') || '',
    []
  );

  const resolvePayment = useCallback(async () => {
    if (!token) {
      setMessage('Falta el token de pago. Abre el enlace exacto que recibiste por email.');
      setState('error');
      return;
    }

    setState('loading');
    const result = await api.resolveInscripcionPaymentLink('fer', token);
    if (!result.success || !result.data) {
      setMessage(result.message || 'El enlace de pago no es válido o ha caducado.');
      setState('error');
      return;
    }

    if (result.data.status === 'checkout' && result.data.url) {
      setState('redirecting');
      window.location.href = result.data.url;
      return;
    }

    if (result.data.status === 'already_paid') {
      setState('already_paid');
      return;
    }

    if (result.data.status === 'stripe_unavailable') {
      setState('stripe_unavailable');
      return;
    }

    setMessage('No se pudo iniciar el pago online.');
    setState('error');
  }, [token]);

  useEffect(() => {
    resolvePayment();
  }, [resolvePayment, retryKey]);

  const retry = useCallback(() => {
    setRetryKey((prev) => prev + 1);
  }, []);

  return (
    <>
      <Head
        title="Pago online | FER CUP"
        description="Pago online de inscripción al FER CUP."
        canonicalUrl="https://fercup.com/inscripcion/pagar"
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="inscripcion-payment-page"
      >
        <main className="flex-1 flex items-center justify-center px-4 py-24" data-ui="inscripcion-payment-main">
          <motion.section
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-lg rounded-3xl p-5 sm:p-8 text-center relative overflow-hidden"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.accent}25`,
              boxShadow: `0 0 70px ${FER_COLORS.accent}14`,
            }}
            data-ui="inscripcion-payment-card"
          >
            <div
              className="absolute -top-28 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl opacity-25"
              style={{ backgroundColor: state === 'already_paid' ? FER_COLORS.green : FER_COLORS.accent }}
              data-ui="inscripcion-payment-glow"
              aria-hidden="true"
            />

            <div className="relative" data-ui="inscripcion-payment-content">
              {(state === 'loading' || state === 'redirecting') && (
                <div data-ui="inscripcion-payment-loading">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${FER_COLORS.accent}15` }} data-ui="inscripcion-payment-loading-icon-bg">
                    <Loader2 className="h-10 w-10 animate-spin" style={{ color: FER_COLORS.accent }} data-ui="inscripcion-payment-loading-icon" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-payment-loading-title">
                    {state === 'redirecting' ? 'Abriendo Stripe' : 'Preparando tu pago'}
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-payment-loading-text">
                    {state === 'redirecting'
                      ? 'Te estamos redirigiendo a la pasarela segura de Stripe.'
                      : 'Estamos validando tu enlace de pago.'}
                  </p>
                </div>
              )}

              {state === 'already_paid' && (
                <div data-ui="inscripcion-payment-paid">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${FER_COLORS.green}15` }} data-ui="inscripcion-payment-paid-icon-bg">
                    <CheckCircle size={42} style={{ color: FER_COLORS.green }} data-ui="inscripcion-payment-paid-icon" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-payment-paid-title">
                    Tu inscripción ya está pagada
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-payment-paid-text">
                    No tienes que hacer nada más. Te esperamos el día del evento con tu QR de inscripción.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
                    style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
                    data-ui="inscripcion-payment-paid-home"
                  >
                    <ArrowLeft size={18} data-ui="inscripcion-payment-paid-home-icon" aria-hidden="true" />
                    <span data-ui="inscripcion-payment-paid-home-text">Volver al inicio</span>
                  </button>
                </div>
              )}

              {state === 'stripe_unavailable' && (
                <div data-ui="inscripcion-payment-unavailable">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${FER_COLORS.gold}15` }} data-ui="inscripcion-payment-unavailable-icon-bg">
                    <Banknote size={42} style={{ color: FER_COLORS.gold }} data-ui="inscripcion-payment-unavailable-icon" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-payment-unavailable-title">
                    Pago online no disponible
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed mb-5" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-payment-unavailable-text">
                    Tu inscripción sigue registrada, pero ahora mismo no podemos aceptar pagos online. Deberás pagar en efectivo en la mesa de registro el día del evento.
                  </p>
                  <div className="rounded-2xl p-4 mb-6 text-left" style={{ backgroundColor: FER_COLORS.bgDark, border: `1px solid ${FER_COLORS.gold}25` }} data-ui="inscripcion-payment-unavailable-note">
                    <div className="flex items-start gap-3" data-ui="inscripcion-payment-unavailable-note-row">
                      <AlertTriangle size={20} style={{ color: FER_COLORS.gold }} data-ui="inscripcion-payment-unavailable-note-icon" aria-hidden="true" />
                      <p className="text-sm leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-payment-unavailable-note-text">
                        Lleva efectivo el día de la competición. El equipo confirmará el pago antes del check-in.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-gold/50"
                    style={{ backgroundColor: FER_COLORS.gold, color: FER_COLORS.bgDark }}
                    data-ui="inscripcion-payment-unavailable-home"
                  >
                    <ArrowLeft size={18} data-ui="inscripcion-payment-unavailable-home-icon" aria-hidden="true" />
                    <span data-ui="inscripcion-payment-unavailable-home-text">Volver al inicio</span>
                  </button>
                </div>
              )}

              {state === 'error' && (
                <div data-ui="inscripcion-payment-error">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${FER_COLORS.red}15` }} data-ui="inscripcion-payment-error-icon-bg">
                    <CreditCard size={42} style={{ color: FER_COLORS.red }} data-ui="inscripcion-payment-error-icon" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-payment-error-title">
                    Enlace de pago no disponible
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-payment-error-text">
                    {message}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3" data-ui="inscripcion-payment-error-actions">
                    <button
                      type="button"
                      onClick={retry}
                      className="inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
                      style={{ backgroundColor: FER_COLORS.bgDark, color: FER_COLORS.text, border: `1px solid ${FER_COLORS.accent}22` }}
                      data-ui="inscripcion-payment-error-retry"
                    >
                      <RefreshCw size={18} data-ui="inscripcion-payment-error-retry-icon" aria-hidden="true" />
                      <span data-ui="inscripcion-payment-error-retry-text">Reintentar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/inscripcion')}
                      className="inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
                      style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
                      data-ui="inscripcion-payment-error-back"
                    >
                      <ArrowLeft size={18} data-ui="inscripcion-payment-error-back-icon" aria-hidden="true" />
                      <span data-ui="inscripcion-payment-error-back-text">Volver</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        </main>
        <FerFooter />
      </div>
    </>
  );
}

export default InscripcionPaymentPage;
