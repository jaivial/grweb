import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Download, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { Head } from '../../components/Head';
import api from '../../api/client';
import type { StripeInscripcionSessionResponse } from '../../types/api';
import { FER_COLORS } from '../fer/constants/constants';
import { FerFooter } from '../fer/components/FerFooter';

type SuccessState = 'loading' | 'paid' | 'pending' | 'error';

export function InscripcionSuccessPage() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<SuccessState>('loading');
  const [inscripcion, setInscripcion] = useState<StripeInscripcionSessionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('No se pudo confirmar el pago.');
  const [attempt, setAttempt] = useState(0);

  const sessionId = useMemo(
    () => new URLSearchParams(window.location.search).get('session_id') || '',
    []
  );

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setErrorMessage('Falta el identificador de la sesión de Stripe.');
      setState('error');
      return;
    }

    setState('loading');
    const result = await api.getStripeInscripcionSession('fer', sessionId);
    if (!result.success || !result.data) {
      setErrorMessage(result.message || 'No se pudo recuperar tu inscripción.');
      setState('error');
      return;
    }

    setInscripcion(result.data);
    setState(result.data.status === 'paid' ? 'paid' : 'pending');
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession, attempt]);

  useEffect(() => {
    if (state !== 'pending' || attempt >= 6) return;

    const timer = window.setTimeout(() => {
      setAttempt((prev) => prev + 1);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [attempt, state]);

  const handleDownload = useCallback(() => {
    if (!inscripcion?.qrCode) return;
    const link = document.createElement('a');
    link.href = inscripcion.qrCode;
    link.download = `FER-inscripcion-${inscripcion.nombre || 'participante'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [inscripcion]);

  const retry = useCallback(() => {
    setAttempt((prev) => prev + 1);
  }, []);

  const amountText = useMemo(
    () => `${(inscripcion?.totalPagado ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
    [inscripcion?.totalPagado]
  );

  return (
    <>
      <Head
        title="Pago confirmado | FER CUP"
        description="Confirmación de pago de inscripción al FER CUP."
        canonicalUrl="https://fercup.com/inscripcion/success"
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="inscripcion-success-page"
      >
        <main className="flex-1 flex items-center justify-center px-4 py-24" data-ui="inscripcion-success-main">
          <motion.section
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-xl rounded-3xl p-5 sm:p-8 text-center relative overflow-hidden"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.accent}25`,
              boxShadow: `0 0 70px ${FER_COLORS.accent}14`,
            }}
            data-ui="inscripcion-success-card"
          >
            <div
              className="absolute -top-28 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl opacity-25"
              style={{ backgroundColor: state === 'paid' ? FER_COLORS.green : FER_COLORS.accent }}
              data-ui="inscripcion-success-glow"
              aria-hidden="true"
            />

            <div className="relative" data-ui="inscripcion-success-content">
              {state === 'loading' && (
                <div data-ui="inscripcion-success-loading">
                  <Loader2 className="mx-auto mb-5 h-14 w-14 animate-spin" style={{ color: FER_COLORS.accent }} data-ui="inscripcion-success-loading-icon" aria-hidden="true" />
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-success-loading-title">
                    Confirmando tu pago
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-success-loading-text">
                    Estamos verificando la confirmación de Stripe. No cierres esta ventana todavía.
                  </p>
                </div>
              )}

              {state === 'pending' && (
                <div data-ui="inscripcion-success-pending">
                  <Loader2 className="mx-auto mb-5 h-14 w-14 animate-spin" style={{ color: FER_COLORS.gold }} data-ui="inscripcion-success-pending-icon" aria-hidden="true" />
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-success-pending-title">
                    Pago en verificación
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed mb-5" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-success-pending-text">
                    Stripe todavía no ha terminado de notificar el pago. Esta página se actualizará automáticamente.
                  </p>
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-gold/50"
                    style={{ backgroundColor: FER_COLORS.gold, color: FER_COLORS.bgDark }}
                    data-ui="inscripcion-success-pending-retry"
                  >
                    <RefreshCw size={16} data-ui="inscripcion-success-pending-retry-icon" aria-hidden="true" />
                    <span data-ui="inscripcion-success-pending-retry-text">Comprobar de nuevo</span>
                  </button>
                </div>
              )}

              {state === 'error' && (
                <div data-ui="inscripcion-success-error">
                  <ShieldCheck className="mx-auto mb-5 h-14 w-14" style={{ color: FER_COLORS.red }} data-ui="inscripcion-success-error-icon" aria-hidden="true" />
                  <h1 className="text-2xl sm:text-3xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-success-error-title">
                    No pudimos confirmar el pago
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-success-error-text">
                    {errorMessage}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/inscripcion')}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-all duration-200 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
                    style={{ backgroundColor: `${FER_COLORS.accent}20`, color: FER_COLORS.accent, border: `1px solid ${FER_COLORS.accent}30` }}
                    data-ui="inscripcion-success-error-back"
                  >
                    <ArrowLeft size={16} data-ui="inscripcion-success-error-back-icon" aria-hidden="true" />
                    <span data-ui="inscripcion-success-error-back-text">Volver a inscripción</span>
                  </button>
                </div>
              )}

              {state === 'paid' && inscripcion && (
                <div data-ui="inscripcion-success-paid">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${FER_COLORS.green}15` }} data-ui="inscripcion-success-paid-icon-bg">
                    <CheckCircle size={42} style={{ color: FER_COLORS.green }} data-ui="inscripcion-success-paid-icon" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-display font-bold mb-3" style={{ color: FER_COLORS.text }} data-ui="inscripcion-success-paid-title">
                    ¡Inscripción confirmada!
                  </h1>
                  <p className="text-sm sm:text-base leading-relaxed mb-5" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-success-paid-text">
                    Tu pago está confirmado, <strong style={{ color: FER_COLORS.text }} data-ui="inscripcion-success-paid-name">{inscripcion.nombre}</strong>. Te hemos enviado la confirmación por email.
                  </p>

                  <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: FER_COLORS.bgDark, border: `1px solid ${FER_COLORS.green}25` }} data-ui="inscripcion-success-paid-summary">
                    <div className="flex items-center justify-between gap-4" data-ui="inscripcion-success-paid-summary-row">
                      <span className="text-sm font-semibold" style={{ color: FER_COLORS.textMuted }} data-ui="inscripcion-success-paid-summary-label">Pago confirmado</span>
                      <span className="text-lg font-black" style={{ color: FER_COLORS.green }} data-ui="inscripcion-success-paid-summary-amount">{amountText}</span>
                    </div>
                  </div>

                  {inscripcion.qrCode && (
                    <div className="mb-6 inline-block rounded-2xl bg-white p-4" data-ui="inscripcion-success-qr-card">
                      {inscripcion.qrCode.startsWith('http') ? (
                        <img src={inscripcion.qrCode} alt="Código QR de inscripción" className="h-52 w-52 sm:h-60 sm:w-60" data-ui="inscripcion-success-qr-image" />
                      ) : (
                        <div className="flex h-52 w-52 items-center justify-center rounded-xl bg-gray-100 sm:h-60 sm:w-60" data-ui="inscripcion-success-qr-fallback">
                          <p className="px-4 text-center text-sm font-semibold text-gray-700" data-ui="inscripcion-success-qr-fallback-text">Inscripción registrada</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3" data-ui="inscripcion-success-paid-actions">
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={!inscripcion.qrCode}
                      className="inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: FER_COLORS.bgDark, color: FER_COLORS.text, border: `1px solid ${FER_COLORS.accent}22` }}
                      data-ui="inscripcion-success-download"
                    >
                      <Download size={18} data-ui="inscripcion-success-download-icon" aria-hidden="true" />
                      <span data-ui="inscripcion-success-download-text">Descargar QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/')}
                      className="inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
                      style={{ backgroundColor: FER_COLORS.accent, color: FER_COLORS.text }}
                      data-ui="inscripcion-success-home"
                    >
                      <ArrowLeft size={18} data-ui="inscripcion-success-home-icon" aria-hidden="true" />
                      <span data-ui="inscripcion-success-home-text">Volver al inicio</span>
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

export default InscripcionSuccessPage;
