import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { api } from '../utils/api';
import { Head } from '../components/Head';
import { pageMetaConfig } from '../metaConfig';

interface SessionData {
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  totalPaid: number;
}

export default function Success() {
  const [, navigate] = useLocation();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Show navbar (no hero section on this page)
    window.dispatchEvent(new CustomEvent('heroVisibilityChange', { detail: { isVisible: false } }));

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      setError('No se encontró el ID de sesión');
      setLoading(false);
      return;
    }

    fetchSessionDetails(sessionId);
  }, []);

  async function fetchSessionDetails(sessionId: string) {
    try {
      const data = await api.getSessionDetails(sessionId);
      setSessionData({
        firstName: data.firstName,
        surname: data.surname,
        email: data.email,
        instagram: data.instagram,
        ticketCount: data.ticketCount,
        totalPaid: data.totalPaid,
      });
    } catch {
      setError('No se pudieron cargar los datos de la compra');
    } finally {
      setLoading(false);
    }
  }

  const formattedTotal = useMemo(() => {
    if (!sessionData) return '';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(sessionData.totalPaid);
  }, [sessionData]);

  if (loading) {
    return (
      <>
        <Head {...pageMetaConfig['/success']} />
        <div className="flex items-center justify-center py-32" data-ui="success-loading">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin mx-auto mb-4" data-ui="success-spinner" />
            <p className="text-white/50 text-sm">Verificando tu compra...</p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Head {...pageMetaConfig['/success']} />
        <div className="flex items-center justify-center py-32 px-4" data-ui="success-error">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4" data-ui="error-icon">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Algo salió mal</h1>
            <p className="text-white/50 text-sm mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/checkout')}
                className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-red-accent/90 hover:bg-red-accent rounded-xl transition-colors"
                data-ui="btn-retry"
              >
                Reintentar
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                data-ui="btn-home-error"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head {...pageMetaConfig['/success']} />
      <div className="py-16 px-4" style={{ paddingTop: '120px' }} data-ui="success-page">
        <div className="max-w-md mx-auto" data-ui="success-content">

          {/* Logo */}
          <div className="text-center mb-8" data-ui="success-logo">
            <img
              src="https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png"
              alt="GRStrength Cup"
              className="h-16 mx-auto"
              loading="eager"
            />
          </div>

          {/* Header */}
          <div className="text-center mb-10" data-ui="success-header">
            <div className="w-24 h-24 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-6" data-ui="success-icon-circle">
              <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-ui="success-title">
              Pago completado
            </h1>
            <p className="text-base text-white/50" data-ui="success-subtitle">
              Tu participación en el sorteo ha sido confirmada
            </p>
          </div>

          {/* Purchase Details */}
          {sessionData && (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 mb-6" data-ui="purchase-details">
              <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4" data-ui="purchase-details-title">
                Resumen
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between" data-ui="purchase-row-name">
                  <span className="text-sm text-white/50">Nombre</span>
                  <span className="text-sm font-medium text-white">{sessionData.firstName} {sessionData.surname}</span>
                </div>
                <div className="flex items-center justify-between" data-ui="purchase-row-email">
                  <span className="text-sm text-white/50">Email</span>
                  <span className="text-sm font-medium text-white">{sessionData.email}</span>
                </div>
                {sessionData.instagram && (
                  <div className="flex items-center justify-between" data-ui="purchase-row-instagram">
                    <span className="text-sm text-white/50">Instagram</span>
                    <span className="text-sm font-medium text-white">@{sessionData.instagram.replace('@', '')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between" data-ui="purchase-row-tickets">
                  <span className="text-sm text-white/50">Boletos</span>
                  <span className="text-sm font-medium text-white">{sessionData.ticketCount === 1 ? '1 boleto' : `${sessionData.ticketCount} boletos`}</span>
                </div>
                <div className="pt-3 mt-1 border-t border-white/5 flex items-center justify-between" data-ui="purchase-row-total">
                  <span className="text-sm text-white/50">Total</span>
                  <span className="text-lg font-bold text-white">{formattedTotal}</span>
                </div>
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 mb-6" data-ui="next-steps">
            <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4" data-ui="next-steps-title">
              Siguientes pasos
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3" data-ui="step-email">
                <span className="text-xs font-bold text-red-accent mt-0.5">1</span>
                <p className="text-sm text-white/60">Recibirás un correo de confirmación con los detalles de tu participación.</p>
              </div>
              <div className="flex items-start gap-3" data-ui="step-draw">
                <span className="text-xs font-bold text-red-accent mt-0.5">2</span>
                <p className="text-sm text-white/60">El ganador se anunciará el último día de competición tras la entrega de premios.</p>
              </div>
              <div className="flex items-start gap-3" data-ui="step-follow">
                <span className="text-xs font-bold text-red-accent mt-0.5">3</span>
                <p className="text-sm text-white/60">Sigue <span className="text-white font-medium">@grstrengthclub</span> en Instagram para estar al día.</p>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="flex justify-center" data-ui="action-buttons">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 min-h-[48px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
              data-ui="btn-home"
            >
              Volver al inicio
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
