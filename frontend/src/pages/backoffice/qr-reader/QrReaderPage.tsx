import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { currentCompeticionAtom } from '../../../stores/auth.atoms';
import { BackofficeLayout } from '../BackofficeLayout';
import { api } from '../../../api/client';
import { CheckIcon, XIcon, WarningIcon } from '../../../components/ui/Icon';

interface InscripcionEstado {
  id: number;
  nombre: string;
  email: string;
  instagram?: string;
  telefono?: string;
  sexo: string;
  categoriaPeso?: string;
  experiencia: string;
  quiereHandler: boolean;
  pagoConfirmado: boolean;
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

function formatPrice(amount: number): string {
  return amount.toFixed(2);
}

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
  const [showConfetti, setShowConfetti] = useState(false);
  const [manualQrInput, setManualQrInput] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const isScannerStartedRef = useRef(false);

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

  const triggerConfetti = useCallback(() => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, []);

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
            setErrorMsg('Permiso de cámara denegado. Introduce el código QR manualmente.');
          } else if (msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
            setErrorMsg('No se detectó ninguna cámara. Introduce el código QR manualmente.');
          } else {
            setErrorMsg('No se pudo acceder a la cámara. Introduce el código QR manualmente.');
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
          setErrorMsg(result.message || 'No se encontró la inscripción');
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
          toast.success('Participación confirmada');
        }
      } catch (err) {
        console.error('Error confirming participation:', err);
        toast.error('Error al confirmar participación');
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
        triggerConfetti();
        toast.success('Pago confirmado');
      }
    } catch (err) {
      console.error('Error confirming cash payment:', err);
      toast.error('Error al confirmar pago');
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
    setShowConfetti(false);
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

  const caseType = useMemo(() => {
    if (!inscripcion) return null;
    if (!inscripcion.participacionConfirmada && !inscripcion.pagoConfirmado) return 'A';
    if (inscripcion.participacionConfirmada && !inscripcion.pagoConfirmado) return 'B';
    return 'C';
  }, [inscripcion]);

  return (
    <BackofficeLayout breadcrumbs={[{ label: 'Escáner QR' }]} title="Lector QR">
      <div className="max-w-2xl mx-auto" data-ui="qr-reader-page">
        <div className="mb-6" data-ui="qr-reader-header">
          <h1 className="text-2xl font-bold text-white mb-1" data-ui="qr-reader-title">
            Lector QR
          </h1>
          <p className="text-gray-400 text-sm" data-ui="qr-reader-subtitle">
            Escanea el código QR del participante para confirmar participación y pago
          </p>
        </div>

        {scanState === 'scanning' && (
          <div className="space-y-4" data-ui="qr-reader-scanning">
            <div
              className="rounded-2xl overflow-hidden border border-white/10 bg-dark-surface"
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

        {scanState === 'loaded' && inscripcion && (
          <div className="space-y-4" data-ui="qr-reader-result">
            {caseType === 'C' && !paymentConfirmed && (
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center" data-ui="qr-reader-success-banner">
                <div className="flex justify-center mb-2">
                  <CheckIcon size="xl" className="text-green-400" />
                </div>
                <p className="text-green-400 font-semibold">Todo correcto</p>
                <p className="text-gray-400 text-sm">Participación y pago confirmados</p>
              </div>
            )}

            <div className="p-5 rounded-xl bg-dark-surface border border-white/5" data-ui="qr-reader-athlete-card">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3" data-ui="qr-reader-athlete-label">
                Datos del participante
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
                      @{inscripcion.instagram}
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
              </div>
            </div>

            {!inscripcion.pagoConfirmado && !paymentConfirmed && participationConfirmed && (
              <div className="space-y-3" data-ui="qr-reader-payment-section">
                <div
                  className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20"
                  data-ui="qr-reader-payment-alert"
                >
                  <div className="flex items-start gap-3" data-ui="qr-reader-payment-alert-inner">
                    <WarningIcon size="sm" className="text-amber-400 mt-0.5" />
                    <div data-ui="qr-reader-payment-alert-text">
                      <p className="text-amber-400 text-sm font-semibold mb-1" data-ui="qr-reader-payment-alert-title">
                        Pago pendiente en efectivo
                      </p>
                      <p className="text-gray-400 text-sm" data-ui="qr-reader-payment-alert-desc">
                        Recoger <strong className="text-white">{formatPrice(priceBreakdown?.total ?? inscripcion.totalPagado)} EUR</strong> en efectivo
                      </p>
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

            {showPaymentConfirmDialog && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                data-ui="qr-reader-payment-dialog-overlay"
              >
                <div
                  className="bg-dark-surface rounded-2xl p-6 max-w-sm w-full mx-4 border border-white/10"
                  data-ui="qr-reader-payment-dialog"
                >
                  <h3 className="text-lg font-bold text-white mb-4" data-ui="qr-reader-payment-dialog-title">
                    Confirmar recepción de pago
                  </h3>
                  <div className="bg-dark-base/50 rounded-xl p-4 mb-4 space-y-2" data-ui="qr-reader-payment-dialog-breakdown">
                    <div className="flex justify-between text-sm" data-ui="qr-reader-dialog-inscripcion-row">
                      <span className="text-gray-400">Inscripción</span>
                      <span className="text-white font-medium">{formatPrice(priceBreakdown?.inscripcion ?? inscripcion.totalPagado)} EUR</span>
                    </div>
                    {priceBreakdown?.hasHandler && (
                      <div className="flex justify-between text-sm" data-ui="qr-reader-dialog-handler-row">
                        <span className="text-gray-400">Handler GR Strength</span>
                        <span className="text-white font-medium">{formatPrice(priceBreakdown.handler)} EUR</span>
                      </div>
                    )}
                    <div className="border-t border-white/10 pt-2" data-ui="qr-reader-dialog-total-divider" />
                    <div className="flex justify-between font-bold" data-ui="qr-reader-dialog-total-row">
                      <span className="text-amber-400">Total a cobrar</span>
                      <span className="text-amber-400">{formatPrice(priceBreakdown?.total ?? inscripcion.totalPagado)} EUR</span>
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
  );
}

export default QrReaderPage;