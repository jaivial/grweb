import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { JSX } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAtomValue } from 'jotai';
import { currentCompeticionAtom } from '../../../stores/auth.atoms';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';
import { Confetti, AnimatedCheckmark, SuccessBanner, WarningIcon } from './components';

// ─── Types ───

interface InscripcionEstado {
  id: number;
  nombre: string;
  email: string;
  instagram?: string;
  telefono?: string;
  sexo: string;
  categoriaPeso?: string;
  modalidad: string;
  experiencia: string;
  quiereHandler: boolean;
  pagoConfirmado: boolean;
  paymentMethod?: string;
  participacionConfirmada: boolean;
  totalPagado: number;
  checkinAt?: string;
  competicionNombre: string;
  precioInscripcion?: number;
  precioHandler?: number;
  horarios?: Array<{
    date: string;
    startTime: string;
    endTime: string;
    weightCategory: string;
    sexCategory: string;
  }>;
}

type ScanState = 'scanning' | 'loading' | 'loaded' | 'error';

// ─── Helpers ───

function formatPrice(amount: number): string {
  return amount.toFixed(2);
}

function getModalidadLabel(modalidad?: string): string {
  switch (modalidad) {
    case 'solo_banca':
      return 'Solo banca';
    case 'solo_peso_muerto':
      return 'Solo peso muerto';
    default:
      return 'Competición completa';
  }
}

function getPaymentMethodLabel(paymentMethod?: string): string {
  switch (paymentMethod) {
    case 'stripe':
      return 'Stripe';
    case 'transferencia':
      return 'Transferencia';
    case 'efectivo':
      return 'Efectivo';
    default:
      return 'Sin definir';
  }
}

function isLiftAllowedForModalidad(modalidad: string | undefined, liftType: 'Squat' | 'Bench' | 'Deadlift'): boolean {
  if (modalidad === 'solo_banca') return liftType === 'Bench';
  if (modalidad === 'solo_peso_muerto') return liftType === 'Deadlift';
  return true;
}

// ─── Main Component ───

export function QrReaderPage(): JSX.Element {
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [inscripcion, setInscripcion] = useState<InscripcionEstado | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [confirmingParticipation, setConfirmingParticipation] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [participationConfirmed, setParticipationConfirmed] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [showPaymentConfirmDialog, setShowPaymentConfirmDialog] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [manualQrInput, setManualQrInput] = useState('');
  const [liftData, setLiftData] = useState({
    sentadilla1: 0, sentadilla2: 0, sentadilla3: 0,
    banca1: 0, banca2: 0, banca3: 0,
    pesoMuerto1: 0, pesoMuerto2: 0, pesoMuerto3: 0,
  });
  const [liftSaving, setLiftSaving] = useState(false);
  const [liftSaved, setLiftSaved] = useState(false);

  const updateLift = (field: string, value: number) => setLiftData(prev => ({ ...prev, [field]: value }));

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const isScannerStartedRef = useRef(false);
  const paymentSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slug = useMemo(() => currentCompeticion?.slug ?? '', [currentCompeticion?.slug]);

  const priceBreakdown = useMemo(() => {
    if (!inscripcion) return null;
    const inscripcionPrice = inscripcion.precioInscripcion ?? inscripcion.totalPagado;
    const handlerPrice = inscripcion.quiereHandler ? (inscripcion.precioHandler ?? 0) : 0;
    const total = inscripcionPrice + handlerPrice;
    return {
      inscripcion: inscripcionPrice,
      handler: handlerPrice,
      total: total || inscripcion.totalPagado,
      hasHandler: inscripcion.quiereHandler && handlerPrice > 0,
    };
  }, [inscripcion]);

  const showSentadilla = isLiftAllowedForModalidad(inscripcion?.modalidad, 'Squat');
  const showBanca = isLiftAllowedForModalidad(inscripcion?.modalidad, 'Bench');
  const showPesoMuerto = isLiftAllowedForModalidad(inscripcion?.modalidad, 'Deadlift');

  const triggerConfetti = useCallback(() => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, []);

  useEffect(() => {
    if (!showPaymentSuccess) return;
    paymentSuccessTimerRef.current = setTimeout(() => setShowPaymentSuccess(false), 5000);
    return () => {
      if (paymentSuccessTimerRef.current) clearTimeout(paymentSuccessTimerRef.current);
    };
  }, [showPaymentSuccess]);

  useEffect(() => {
    if (scanState !== 'scanning' || !slug) return;

    let cancelled = false;

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader-video');
        scannerRef.current = scanner;
        isScanningRef.current = true;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (isScanningRef.current) {
              isScanningRef.current = false;
              handleQrScanned(decodedText);
            }
          },
          () => {}
        );

        if (!cancelled) {
          isScannerStartedRef.current = true;
        } else {
          scanner.stop().catch(() => {});
          scannerRef.current = null;
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('QR scanner error:', err);
          const msg = err?.message ?? '';
          if (msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
            setErrorMsg('Permiso de cámara denegado por el navegador. Si usas backoffice.fercup.com, el administrador debe crear una Transform Rule en Cloudflare Dashboard (Security > Transform Rules) que añada "Permissions-Policy: camera=(self)" para este subdominio. Mientras tanto, introduce el código QR manualmente.');
          } else if (msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
            setErrorMsg('No se detectó ninguna cámara en este dispositivo. Puedes introducir el código QR manualmente.');
          } else {
            setErrorMsg('No se pudo acceder a la cámara. Puedes introducir el código QR manualmente.');
          }
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (scannerRef.current && isScannerStartedRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
      isScanningRef.current = false;
      isScannerStartedRef.current = false;
    };
  }, [scanState, slug]);

  // Load existing openers when athlete data is loaded
  useEffect(() => {
    if (!slug || !inscripcion?.id) return;
    (async () => {
      try {
        const result = await api.getFerOpeners(slug, inscripcion.id);
        if (result.success && result.data) {
          const data = result.data;
          setLiftData({
            sentadilla1: data.sentadilla1 ?? 0,
            sentadilla2: data.sentadilla2 ?? 0,
            sentadilla3: data.sentadilla3 ?? 0,
            banca1: data.banca1 ?? 0,
            banca2: data.banca2 ?? 0,
            banca3: data.banca3 ?? 0,
            pesoMuerto1: data.pesoMuerto1 ?? 0,
            pesoMuerto2: data.pesoMuerto2 ?? 0,
            pesoMuerto3: data.pesoMuerto3 ?? 0,
          });
        }
      } catch (err) {
        console.error('Error loading openers:', err);
      }
    })();
  }, [slug, inscripcion?.id]);

  const handleSaveLifts = useCallback(async () => {
    if (!slug || !inscripcion) return;
    setLiftSaving(true);
    setLiftSaved(false);
    try {
      const result = await api.setFerOpeners(slug, inscripcion.id, liftData);
      if (result.success) {
        setLiftSaved(true);
        setTimeout(() => setLiftSaved(false), 3000);
      }
    } catch (err) {
      console.error('Error saving lifts:', err);
    } finally {
      setLiftSaving(false);
    }
  }, [slug, inscripcion, liftData]);

  const handleQrScanned = useCallback(
    async (qrData: string) => {
      if (!slug) return;

      if (scannerRef.current && isScannerStartedRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {}
        scannerRef.current = null;
        isScannerStartedRef.current = false;
      }

      setScanState('loading');
      setErrorMsg('');

      try {
        const parts = qrData.split(':');
        if (parts.length < 2) {
          setErrorMsg('Formato de QR inválido');
          setScanState('error');
          return;
        }

        const inscripcionId = parseInt(parts[1], 10);
        if (isNaN(inscripcionId)) {
          setErrorMsg('ID de inscripción inválido en QR');
          setScanState('error');
          return;
        }

        const result = await api.getCheckinEstado(slug, inscripcionId);
        if (result.success && result.data) {
          const data = result.data as InscripcionEstado;
          setInscripcion(data);
          setScanState('loaded');

          if (!data.participacionConfirmada) {
            confirmParticipation(slug, inscripcionId);
          }
        } else {
          setErrorMsg((result as any).message || 'No se encontró la inscripción');
          setScanState('error');
        }
      } catch (err) {
        setErrorMsg('Error al procesar el código QR');
        setScanState('error');
      }
    },
    [slug]
  );

  const confirmParticipation = useCallback(
    async (competicionSlug: string, inscripcionId: number) => {
      setConfirmingParticipation(true);
      try {
        const result = await api.confirmarParticipacion(competicionSlug, inscripcionId);
        if (result.success) {
          setParticipationConfirmed(true);
          setInscripcion((prev) => (prev ? { ...prev, participacionConfirmada: true } : prev));
          triggerConfetti();
        }
      } catch (err) {
        console.error('Error confirming participation:', err);
      } finally {
        setConfirmingParticipation(false);
      }
    },
    [triggerConfetti]
  );

  const confirmCashPayment = useCallback(async () => {
    if (!slug || !inscripcion) return;
    setShowPaymentConfirmDialog(false);
    setConfirmingPayment(true);
    try {
      const result = await api.confirmarPagoEfectivo(slug, inscripcion.id);
      if (result.success) {
        setPaymentConfirmed(true);
        setInscripcion((prev) => (prev ? { ...prev, pagoConfirmado: true } : prev));
        setShowPaymentSuccess(true);
        triggerConfetti();
      }
    } catch (err) {
      console.error('Error confirming cash payment:', err);
    } finally {
      setConfirmingPayment(false);
    }
  }, [slug, inscripcion, triggerConfetti]);

  const resetScanner = useCallback(() => {
    setScanState('scanning');
    setInscripcion(null);
    setErrorMsg('');
    setParticipationConfirmed(false);
    setPaymentConfirmed(false);
    setConfirmingParticipation(false);
    setConfirmingPayment(false);
    setShowPaymentConfirmDialog(false);
    setShowPaymentSuccess(false);
    setShowConfetti(false);
    setLiftData({ sentadilla1: 0, sentadilla2: 0, sentadilla3: 0, banca1: 0, banca2: 0, banca3: 0, pesoMuerto1: 0, pesoMuerto2: 0, pesoMuerto3: 0 });
    setLiftSaving(false);
    setLiftSaved(false);
    if (paymentSuccessTimerRef.current) clearTimeout(paymentSuccessTimerRef.current);
  }, []);

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (manualQrInput.trim()) {
        handleQrScanned(manualQrInput.trim());
      }
    },
    [manualQrInput, handleQrScanned]
  );

  const handleManualInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setManualQrInput(e.target.value);
  }, []);

  const handleOpenPaymentDialog = useCallback(() => setShowPaymentConfirmDialog(true), []);

  const handleClosePaymentDialog = useCallback(() => setShowPaymentConfirmDialog(false), []);

  const handleClosePaymentSuccess = useCallback(() => {
    setShowPaymentSuccess(false);
    if (paymentSuccessTimerRef.current) clearTimeout(paymentSuccessTimerRef.current);
  }, []);

  const caseType = useMemo(() => {
    if (!inscripcion) return null;
    if (!inscripcion.participacionConfirmada && !inscripcion.pagoConfirmado) return 'A';
    if (inscripcion.participacionConfirmada && !inscripcion.pagoConfirmado) return 'B';
    return 'C';
  }, [inscripcion]);

  return (
    <>
      <Confetti active={showConfetti} />

      <BackofficeLayout>
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto" data-ui="qr-reader-page">
        <div className="mb-6" data-ui="qr-reader-header">
          <h1 className="text-2xl font-bold text-white mb-1" data-ui="qr-reader-title">
            Lector QR
          </h1>
          <p className="text-gray-400 text-sm" data-ui="qr-reader-subtitle">
            Escanea el código QR del atleta para confirmar participación y pago
          </p>
        </div>

        {/* ── Scanner ── */}
        {scanState === 'scanning' && (
          <div className="space-y-4" data-ui="qr-reader-scanning">
            <div
              className="rounded-2xl overflow-hidden border border-white/10"
              style={{ minHeight: 300 }}
              data-ui="qr-reader-video-container"
            >
              <div id="qr-reader-video" data-ui="qr-reader-video" style={{ width: '100%' }} />
            </div>

            <div className="p-4 rounded-xl bg-dark-surface border border-white/5" data-ui="qr-reader-manual">
              <p className="text-sm text-gray-400 mb-2" data-ui="qr-reader-manual-label">
                O introduce el código QR manualmente:
              </p>
              <form onSubmit={handleManualSubmit} className="flex gap-2" data-ui="qr-reader-manual-form">
                <input
                  type="text"
                  value={manualQrInput}
                  onChange={handleManualInputChange}
                  placeholder="competicionId:inscripcionId:firma"
                  className="flex-1 px-3 py-2 rounded-lg bg-dark-base border border-white/10 text-white text-sm focus:outline-none focus:border-red-accent"
                  data-ui="qr-reader-manual-input"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-accent text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                  data-ui="qr-reader-manual-submit"
                >
                  Buscar
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {scanState === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20" data-ui="qr-reader-loading">
            <div
              className="w-12 h-12 border-4 border-red-accent border-t-transparent rounded-full animate-spin mb-4"
              data-ui="qr-reader-loading-spinner"
            />
            <p className="text-gray-400" data-ui="qr-reader-loading-text">
              Cargando datos de inscripción...
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {scanState === 'error' && (
          <div className="p-6 rounded-xl bg-dark-surface border border-red-500/20 text-center" data-ui="qr-reader-error">
            <p className="text-red-400 mb-4" data-ui="qr-reader-error-msg">{errorMsg}</p>
            <button
              onClick={resetScanner}
              className="px-6 py-2 rounded-lg bg-red-accent text-white font-semibold hover:bg-red-600 transition-colors"
              data-ui="qr-reader-error-retry"
            >
              Escanear otro QR
            </button>
          </div>
        )}

        {/* ── Loaded ── */}
        {scanState === 'loaded' && inscripcion && (
          <div className="space-y-4" data-ui="qr-reader-result">
            {/* Case A: Participation just confirmed */}
            {caseType === 'A' && (
              <div className="text-center py-6" data-ui="qr-reader-case-a">
                {confirmingParticipation ? (
                  <div className="flex flex-col items-center py-8" data-ui="qr-reader-confirming-participation">
                    <div
                      className="w-12 h-12 border-4 border-red-accent border-t-transparent rounded-full animate-spin mb-4"
                      data-ui="qr-reader-confirming-spinner"
                    />
                    <p className="text-gray-400" data-ui="qr-reader-confirming-text">
                      Confirmando participación...
                    </p>
                  </div>
                ) : participationConfirmed ? (
                  <div data-ui="qr-reader-participation-confirmed" className="py-4">
                    <div className="flex justify-center mb-4" data-ui="qr-reader-checkmark-wrapper">
                      <AnimatedCheckmark size={80} color="#22c55e" />
                    </div>
                    <h2
                      className="text-2xl font-bold text-green-400 mb-2"
                      data-ui="qr-reader-confirmed-title"
                    >
                      Participación confirmada
                    </h2>
                    <p className="text-gray-400 text-sm" data-ui="qr-reader-confirmed-subtitle">
                      Has confirmado participación para{' '}
                      <strong className="text-white">{inscripcion.competicionNombre}</strong>
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Case C: All complete */}
            {caseType === 'C' && !paymentConfirmed && (
              <SuccessBanner title="Todo correcto" subtitle="Participación y pago confirmados" />
            )}

            {/* Payment success overlay dialog */}
            {showPaymentSuccess && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                data-ui="qr-reader-payment-success-overlay"
              >
                <div
                  className="bg-dark-surface rounded-2xl p-6 sm:p-8 max-w-sm w-full mx-4 border border-green-500/20 shadow-2xl"
                  data-ui="qr-reader-payment-success-dialog"
                >
                  <div className="text-center" data-ui="qr-reader-payment-success-content">
                    <div className="flex justify-center mb-4" data-ui="qr-reader-payment-success-icon">
                      <AnimatedCheckmark size={72} color="#22c55e" />
                    </div>
                    <h3
                      className="text-2xl font-bold text-green-400 mb-4"
                      data-ui="qr-reader-payment-success-title"
                    >
                      Pago exitoso
                    </h3>

                    <div
                      className="space-y-2 mb-6 text-left bg-dark-base/50 rounded-xl p-4"
                      data-ui="qr-reader-payment-success-breakdown"
                    >
                      <div className="flex justify-between text-sm" data-ui="qr-reader-breakdown-inscripcion-row">
                        <span className="text-gray-400" data-ui="qr-reader-breakdown-inscripcion-label">
                          Inscripción
                        </span>
                        <span className="text-white font-medium" data-ui="qr-reader-breakdown-inscripcion-value">
                          {formatPrice(priceBreakdown?.inscripcion ?? inscripcion.totalPagado)} EUR
                        </span>
                      </div>
                      {priceBreakdown?.hasHandler && (
                        <div className="flex justify-between text-sm" data-ui="qr-reader-breakdown-handler-row">
                          <span className="text-gray-400" data-ui="qr-reader-breakdown-handler-label">
                            Handler GR Strength
                          </span>
                          <span className="text-white font-medium" data-ui="qr-reader-breakdown-handler-value">
                            {formatPrice(priceBreakdown.handler)} EUR
                          </span>
                        </div>
                      )}
                      <div
                        className="border-t border-white/10 pt-2 mt-2"
                        data-ui="qr-reader-breakdown-total-divider"
                      />
                      <div className="flex justify-between font-bold" data-ui="qr-reader-breakdown-total-row">
                        <span className="text-green-400" data-ui="qr-reader-breakdown-total-label">Total</span>
                        <span className="text-green-400" data-ui="qr-reader-breakdown-total-value">
                          {formatPrice(priceBreakdown?.total ?? inscripcion.totalPagado)} EUR
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleClosePaymentSuccess}
                      className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
                      data-ui="qr-reader-payment-success-close"
                    >
                      Continuar
                    </button>
                    <p
                      className="text-xs text-gray-500 mt-2"
                      data-ui="qr-reader-payment-success-autoclose"
                    >
                      Se cerrará automáticamente...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Payment confirmed inline banner (after dialog closes) */}
            {paymentConfirmed && !showPaymentSuccess && (
              <SuccessBanner
                title="Pago exitoso"
                subtitle={`Se ha recibido ${formatPrice(priceBreakdown?.total ?? inscripcion.totalPagado)} EUR en efectivo`}
              />
            )}

            {/* Athlete data card */}
            <div className="p-5 rounded-xl bg-dark-surface border border-white/5" data-ui="qr-reader-athlete-card">
              <h3
                className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3"
                data-ui="qr-reader-athlete-label"
              >
                Datos del atleta
              </h3>
              <div className="grid grid-cols-2 gap-3" data-ui="qr-reader-athlete-grid">
                <div data-ui="qr-reader-field-nombre">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-nombre">Nombre</p>
                  <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-nombre">
                    {inscripcion.nombre}
                  </p>
                </div>
                <div data-ui="qr-reader-field-email">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-email">Email</p>
                  <p className="text-white font-medium text-sm truncate" data-ui="qr-reader-field-value-email">
                    {inscripcion.email}
                  </p>
                </div>
                {inscripcion.telefono && (
                  <div data-ui="qr-reader-field-telefono">
                    <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-telefono">Teléfono</p>
                    <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-telefono">
                      {inscripcion.telefono}
                    </p>
                  </div>
                )}
                {inscripcion.instagram && (
                  <div data-ui="qr-reader-field-instagram">
                    <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-instagram">Instagram</p>
                    <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-instagram">
                      {inscripcion.instagram}
                    </p>
                  </div>
                )}
                <div data-ui="qr-reader-field-sexo">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-sexo">Sexo</p>
                  <p className="text-white font-medium text-sm capitalize" data-ui="qr-reader-field-value-sexo">
                    {inscripcion.sexo}
                  </p>
                </div>
                {inscripcion.categoriaPeso && (
                  <div data-ui="qr-reader-field-categoria">
                    <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-categoria">Categoría</p>
                    <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-categoria">
                      {inscripcion.categoriaPeso}
                    </p>
                  </div>
                )}
                <div data-ui="qr-reader-field-modalidad">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-modalidad">Modalidad</p>
                  <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-modalidad">
                    {getModalidadLabel(inscripcion.modalidad)}
                  </p>
                </div>
                <div data-ui="qr-reader-field-experiencia">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-experiencia">Experiencia</p>
                  <p className="text-white font-medium text-sm capitalize" data-ui="qr-reader-field-value-experiencia">
                    {inscripcion.experiencia}
                  </p>
                </div>
                <div data-ui="qr-reader-field-handler">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-handler">Handler</p>
                  <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-handler">
                    {inscripcion.quiereHandler ? 'Sí' : 'No'}
                  </p>
                </div>
                <div data-ui="qr-reader-field-total">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-total">Total</p>
                  <p className="text-white font-bold text-sm" data-ui="qr-reader-field-value-total">
                    {formatPrice(inscripcion.totalPagado)} EUR
                  </p>
                </div>
                <div data-ui="qr-reader-field-participacion">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-participacion">Participación</p>
                  <p
                    className={`font-medium text-sm ${inscripcion.participacionConfirmada ? 'text-green-400' : 'text-yellow-400'}`}
                    data-ui="qr-reader-field-value-participacion"
                  >
                    {inscripcion.participacionConfirmada ? 'Confirmada' : 'Pendiente'}
                  </p>
                </div>
                <div data-ui="qr-reader-field-pago">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-pago">Pago</p>
                  <p
                    className={`font-medium text-sm ${inscripcion.pagoConfirmado ? 'text-green-400' : 'text-yellow-400'}`}
                    data-ui="qr-reader-field-value-pago"
                  >
                    {inscripcion.pagoConfirmado ? 'Confirmado' : 'Pendiente'}
                  </p>
                </div>
                <div data-ui="qr-reader-field-payment-method">
                  <p className="text-xs text-gray-500" data-ui="qr-reader-field-label-payment-method">Método</p>
                  <p className="text-white font-medium text-sm" data-ui="qr-reader-field-value-payment-method">
                    {getPaymentMethodLabel(inscripcion.paymentMethod)}
                  </p>
                </div>
              </div>
            </div>

            {/* Lift attempts (openers) */}
            {inscripcion.pagoConfirmado && inscripcion.participacionConfirmada && (
              <div className="p-5 rounded-xl bg-dark-surface border border-white/5" data-ui="qr-reader-lifts-card">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1" data-ui="qr-reader-lifts-label">
                  INTENTOS (OPENERS)
                </h3>
                <p className="text-xs text-gray-500 mb-4" data-ui="qr-reader-lifts-subtitle">
                  Registra los pesos de apertura para cada levantamiento
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-ui="qr-reader-lifts-grid">
                  {/* Sentadilla */}
                  {showSentadilla && <div data-ui="qr-reader-lifts-sentadilla">
                    <p className="text-xs text-gray-400 font-semibold mb-2 text-center">Sentadilla</p>
                    <div className="space-y-2">
                      {[1, 2, 3].map((n) => (
                        <input
                          key={`sentadilla${n}`}
                          type="number"
                          value={liftData[`sentadilla${n}` as keyof typeof liftData]}
                          onChange={(e) => updateLift(`sentadilla${n}`, Number(e.target.value))}
                          placeholder={`Intento ${n}`}
                          className="w-full px-3 py-2 rounded-lg bg-dark-base border border-white/10 text-white text-sm focus:outline-none focus:border-red-accent"
                          data-ui={`qr-reader-lifts-input-sentadilla${n}`}
                        />
                      ))}
                    </div>
                  </div>}
                  {/* Press de Banca */}
                  {showBanca && <div data-ui="qr-reader-lifts-banca">
                    <p className="text-xs text-gray-400 font-semibold mb-2 text-center">Press de Banca</p>
                    <div className="space-y-2">
                      {[1, 2, 3].map((n) => (
                        <input
                          key={`banca${n}`}
                          type="number"
                          value={liftData[`banca${n}` as keyof typeof liftData]}
                          onChange={(e) => updateLift(`banca${n}`, Number(e.target.value))}
                          placeholder={`Intento ${n}`}
                          className="w-full px-3 py-2 rounded-lg bg-dark-base border border-white/10 text-white text-sm focus:outline-none focus:border-red-accent"
                          data-ui={`qr-reader-lifts-input-banca${n}`}
                        />
                      ))}
                    </div>
                  </div>}
                  {/* Peso Muerto */}
                  {showPesoMuerto && <div data-ui="qr-reader-lifts-peso-muerto">
                    <p className="text-xs text-gray-400 font-semibold mb-2 text-center">Peso Muerto</p>
                    <div className="space-y-2">
                      {[1, 2, 3].map((n) => (
                        <input
                          key={`pesoMuerto${n}`}
                          type="number"
                          value={liftData[`pesoMuerto${n}` as keyof typeof liftData]}
                          onChange={(e) => updateLift(`pesoMuerto${n}`, Number(e.target.value))}
                          placeholder={`Intento ${n}`}
                          className="w-full px-3 py-2 rounded-lg bg-dark-base border border-white/10 text-white text-sm focus:outline-none focus:border-red-accent"
                          data-ui={`qr-reader-lifts-input-peso-muerto${n}`}
                        />
                      ))}
                    </div>
                  </div>}
                </div>
                <button
                  onClick={handleSaveLifts}
                  disabled={liftSaving}
                  className="w-full mt-4 py-3 rounded-xl bg-red-accent text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-ui="qr-reader-lifts-save-btn"
                >
                  {liftSaving ? 'Guardando...' : 'Guardar Intentos'}
                </button>
                {liftSaved && (
                  <p className="text-green-400 text-sm text-center mt-2" data-ui="qr-reader-lifts-saved-msg">
                    Intentos guardados correctamente
                  </p>
                )}
              </div>
            )}

            {/* Schedule */}
            {inscripcion.horarios && inscripcion.horarios.length > 0 && (
              <div className="p-5 rounded-xl bg-dark-surface border border-white/5" data-ui="qr-reader-schedule-card">
                <h3
                  className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3"
                  data-ui="qr-reader-schedule-label"
                >
                  Horario asignado
                </h3>
                {inscripcion.horarios.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm py-1" data-ui={`qr-reader-schedule-item-${i}`}>
                    <span className="text-gray-400" data-ui={`qr-reader-schedule-date-${i}`}>
                      {new Date(h.date).toLocaleDateString('es-ES')}
                    </span>
                    <span className="text-white font-medium" data-ui={`qr-reader-schedule-time-${i}`}>
                      {h.startTime} - {h.endTime}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Payment pending section */}
            {!inscripcion.pagoConfirmado && inscripcion.paymentMethod === 'stripe' && participationConfirmed && (
              <div
                className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20"
                data-ui="qr-reader-stripe-pending-alert"
              >
                <div className="flex items-start gap-3" data-ui="qr-reader-stripe-pending-inner">
                  <WarningIcon />
                  <div data-ui="qr-reader-stripe-pending-text">
                    <p className="text-indigo-300 text-sm font-semibold mb-1" data-ui="qr-reader-stripe-pending-title">
                      Pago online pendiente
                    </p>
                    <p className="text-gray-400 text-sm" data-ui="qr-reader-stripe-pending-desc">
                      Esta inscripción fue marcada para pago por Stripe. No confirmes efectivo salvo que cambies el método desde inscripciones.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!inscripcion.pagoConfirmado && !paymentConfirmed && participationConfirmed && inscripcion.paymentMethod !== 'stripe' && (
              <div className="space-y-3" data-ui="qr-reader-payment-section">
                <div
                  className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20"
                  data-ui="qr-reader-payment-alert"
                >
                  <div className="flex items-start gap-3" data-ui="qr-reader-payment-alert-inner">
                    <WarningIcon />
                    <div data-ui="qr-reader-payment-alert-text">
                      <p className="text-amber-400 text-sm font-semibold mb-1" data-ui="qr-reader-payment-alert-title">
                        Pago pendiente en efectivo
                      </p>
                      <p className="text-gray-400 text-sm" data-ui="qr-reader-payment-alert-desc">
                        Recoger{' '}
                        <strong className="text-white">
                          {formatPrice(priceBreakdown?.total ?? inscripcion.totalPagado)} EUR
                        </strong>{' '}
                        en efectivo
                      </p>
                      {priceBreakdown?.hasHandler && (
                        <div
                          className="mt-2 text-xs text-gray-500 space-y-0.5"
                          data-ui="qr-reader-payment-alert-breakdown"
                        >
                          <p data-ui="qr-reader-payment-alert-breakdown-inscripcion">
                            Inscripción: {formatPrice(priceBreakdown.inscripcion)} EUR
                          </p>
                          <p data-ui="qr-reader-payment-alert-breakdown-handler">
                            Handler GR Strength: {formatPrice(priceBreakdown.handler)} EUR
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleOpenPaymentDialog}
                  disabled={confirmingPayment}
                  className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-ui="qr-reader-payment-btn"
                >
                  {confirmingPayment ? 'Confirmando...' : 'Confirmar pago en efectivo'}
                </button>
              </div>
            )}

            {/* Payment confirmation dialog */}
            {showPaymentConfirmDialog && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                data-ui="qr-reader-payment-dialog-overlay"
              >
                <div
                  className="bg-dark-surface rounded-2xl p-6 max-w-sm w-full mx-4 border border-white/10"
                  data-ui="qr-reader-payment-dialog"
                >
                  <h3
                    className="text-lg font-bold text-white mb-4"
                    data-ui="qr-reader-payment-dialog-title"
                  >
                    Confirmar recepción de pago
                  </h3>

                  <div
                    className="bg-dark-base/50 rounded-xl p-4 mb-4 space-y-2"
                    data-ui="qr-reader-payment-dialog-breakdown"
                  >
                    <div className="flex justify-between text-sm" data-ui="qr-reader-dialog-inscripcion-row">
                      <span className="text-gray-400" data-ui="qr-reader-dialog-inscripcion-label">
                        Inscripción
                      </span>
                      <span className="text-white font-medium" data-ui="qr-reader-dialog-inscripcion-value">
                        {formatPrice(priceBreakdown?.inscripcion ?? inscripcion.totalPagado)} EUR
                      </span>
                    </div>
                    {priceBreakdown?.hasHandler && (
                      <div className="flex justify-between text-sm" data-ui="qr-reader-dialog-handler-row">
                        <span className="text-gray-400" data-ui="qr-reader-dialog-handler-label">
                          Handler GR Strength
                        </span>
                        <span className="text-white font-medium" data-ui="qr-reader-dialog-handler-value">
                          {formatPrice(priceBreakdown.handler)} EUR
                        </span>
                      </div>
                    )}
                    <div
                      className="border-t border-white/10 pt-2"
                      data-ui="qr-reader-dialog-total-divider"
                    />
                    <div className="flex justify-between font-bold" data-ui="qr-reader-dialog-total-row">
                      <span className="text-amber-400" data-ui="qr-reader-dialog-total-label">Total a cobrar</span>
                      <span className="text-amber-400" data-ui="qr-reader-dialog-total-value">
                        {formatPrice(priceBreakdown?.total ?? inscripcion.totalPagado)} EUR
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3" data-ui="qr-reader-payment-dialog-actions">
                    <button
                      onClick={handleClosePaymentDialog}
                      className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-400 font-semibold hover:bg-white/10 transition-colors"
                      data-ui="qr-reader-payment-dialog-cancel"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmCashPayment}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
                      data-ui="qr-reader-payment-dialog-confirm"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Scan another */}
            <button
              onClick={resetScanner}
              className="w-full py-3 rounded-xl bg-white/5 text-gray-400 font-semibold hover:bg-white/10 transition-colors mt-4"
              data-ui="qr-reader-scan-another"
            >
              Escanear otro QR
            </button>
          </div>
        )}
        </div>
      </BackofficeLayout>
    </>
  );
}

export default QrReaderPage;
