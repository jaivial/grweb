import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';
import type { CheckinStatus, SetOpenersRequest } from '../../../types/lift';
import { QrCode, Keyboard, User, Check, X, Dumbbell, AlertTriangle } from 'lucide-react';

type ScanMode = 'camera' | 'manual';
interface OpenersForm { squatWeight: string; benchWeight: string; deadliftWeight: string; }
interface SubmissionState { loading: boolean; success: string | null; error: string | null; }

const WEIGHT_MIN = 20;
const WEIGHT_MAX = 500;
const EMPTY_OPENERS: OpenersForm = { squatWeight: '', benchWeight: '', deadliftWeight: '' };
const EMPTY_SUBMISSION: SubmissionState = { loading: false, success: null, error: null };

const OPENER_FIELDS = ['squatWeight', 'benchWeight', 'deadliftWeight'] as const;
const OPENER_LABELS: Record<string, string> = { squatWeight: 'Squat', benchWeight: 'Bench', deadliftWeight: 'Deadlift' };

function isValidWeight(v: string): boolean {
  const n = Number(v);
  return v !== '' && !isNaN(n) && n >= WEIGHT_MIN && n <= WEIGHT_MAX;
}

function gateBadge(passed: boolean, label: string, uiKey: string) {
  const Icon = passed ? Check : X;
  const color = passed ? 'text-green-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-1.5" data-ui={`checkin-gate-${uiKey}`}>
      <Icon className={`w-5 h-5 ${color}`} />
      <span className={`text-sm font-medium ${color}`} data-ui={`checkin-gate-${uiKey}-label`}>{label}</span>
    </div>
  );
}

export function CheckinPage(): JSX.Element {
  const [scanMode, setScanMode] = useState<ScanMode>('manual');
  const [manualId, setManualId] = useState('');
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [openersForm, setOpenersForm] = useState<OpenersForm>(EMPTY_OPENERS);
  const [existingOpeners, setExistingOpeners] = useState<SetOpenersRequest | null>(null);
  const [openersSub, setOpenersSub] = useState<SubmissionState>(EMPTY_SUBMISSION);
  const [checkinSub, setCheckinSub] = useState<SubmissionState>(EMPTY_SUBMISSION);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef<any>(null);

  const canSetOpeners = useMemo(() => status?.canSetOpeners === true, [status]);
  const isAlreadyCheckedIn = useMemo(() => status?.checkinAt != null, [status]);
  const hasExistingOpeners = useMemo(() => existingOpeners !== null, [existingOpeners]);
  const openersValid = useMemo(
    () => OPENER_FIELDS.every((f) => isValidWeight(openersForm[f])),
    [openersForm],
  );

  // ─── QR Scanner lifecycle ───

  useEffect(() => {
    if (scanMode !== 'camera' || !scannerActive) return;
    let scanner: any = null;
    let cancelled = false;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          undefined,
        );
      } catch {
        if (!cancelled) { setStatusError('No se pudo iniciar la camara. Usa la entrada manual.'); setScannerActive(false); }
      }
    };
    start();
    return () => { cancelled = true; if (scanner) { scanner.stop().catch(() => {}); scanner.clear(); scannerRef.current = null; } };
  }, [scanMode, scannerActive]);

  // ─── Handlers ───

  const onScanSuccess = useCallback(async (decodedText: string) => {
    const parsed = Number(decodedText);
    if (isNaN(parsed) || parsed <= 0) { setStatusError('Codigo QR invalido. Intenta con entrada manual.'); return; }
    await loadAthleteStatus(parsed);
  }, []);

  const loadAthleteStatus = useCallback(async (athleteId: number) => {
    try {
      setLoadingStatus(true); setStatusError(null); setStatus(null);
      setExistingOpeners(null); setOpenersForm(EMPTY_OPENERS);
      setOpenersSub(EMPTY_SUBMISSION); setCheckinSub(EMPTY_SUBMISSION);

      const data = await api.getCheckinStatus(athleteId);
      setStatus(data);

      if (data.canSetOpeners) {
        try {
          const od = await api.getOpeners(athleteId);
          if (od?.squatWeight != null) {
            setExistingOpeners(od);
            setOpenersForm({ squatWeight: String(od.squatWeight), benchWeight: String(od.benchWeight), deadliftWeight: String(od.deadliftWeight) });
          }
        } catch { /* openers not set yet */ }
      }
    } catch { setStatusError('Atleta no encontrado. Verifica el ID.'); }
    finally { setLoadingStatus(false); }
  }, []);

  const handleManualSubmit = useCallback(() => {
    const id = Number(manualId.trim());
    if (isNaN(id) || id <= 0) { setStatusError('Introduce un ID de atleta valido.'); return; }
    loadAthleteStatus(id);
  }, [manualId, loadAthleteStatus]);

  const handleOpenersChange = useCallback((field: keyof OpenersForm, value: string) => {
    setOpenersForm((p) => ({ ...p, [field]: value }));
    setOpenersSub((p) => ({ ...p, success: null, error: null }));
  }, []);

  const handleOpenersSubmit = useCallback(async () => {
    if (!status || !openersValid) return;
    const payload: SetOpenersRequest = {
      squatWeight: Number(openersForm.squatWeight),
      benchWeight: Number(openersForm.benchWeight),
      deadliftWeight: Number(openersForm.deadliftWeight),
    };
    try {
      setOpenersSub({ loading: true, success: null, error: null });
      await api.setOpeners(status.athlete.id, payload);
      setExistingOpeners(payload);
      setOpenersSub({ loading: false, success: 'Openers guardados correctamente.', error: null });
    } catch { setOpenersSub({ loading: false, success: null, error: 'Error al guardar openers.' }); }
  }, [status, openersForm, openersValid]);

  const handleConfirmCheckin = useCallback(async () => {
    if (!status) return;
    try {
      setCheckinSub({ loading: true, success: null, error: null });
      const result = await api.confirmCheckin(status.athlete.id);
      setStatus((p) => p ? { ...p, checkinAt: result?.checkinAt ?? new Date().toISOString() } : p);
      setCheckinSub({ loading: false, success: 'Check-in confirmado.', error: null });
    } catch { setCheckinSub({ loading: false, success: null, error: 'Error al confirmar check-in.' }); }
  }, [status]);

  const resetAll = useCallback(() => {
    setStatus(null); setStatusError(null); setManualId('');
    setExistingOpeners(null); setOpenersForm(EMPTY_OPENERS);
    setOpenersSub(EMPTY_SUBMISSION); setCheckinSub(EMPTY_SUBMISSION);
  }, []);

  // ─── Render ───

  const modeBtnClass = useCallback((mode: ScanMode) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      scanMode === mode ? 'bg-red-accent text-white' : 'bg-white/5 text-gray-400 hover:text-white'
    }`, [scanMode]);

  return (
    <BackofficeLayout>
      <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6" data-ui="checkin-page">
        {/* Header */}
        <div className="flex items-center justify-between" data-ui="checkin-header">
          <h1 className="text-2xl font-bold text-white" data-ui="checkin-title">Check-in Pesaje</h1>
          {status && (
            <button onClick={resetAll} className="text-sm text-gray-400 hover:text-white transition-colors" data-ui="checkin-reset-btn">
              Nuevo escaneo
            </button>
          )}
        </div>

        {/* ─── Scanner / Manual Input ─── */}
        {!status && !loadingStatus && (
          <div className="bg-dark-surface rounded-xl border border-white/10 p-5 space-y-4" data-ui="checkin-input-section">
            <div className="flex gap-2" data-ui="checkin-mode-toggle">
              <button onClick={() => { setScanMode('manual'); setScannerActive(false); }} className={modeBtnClass('manual')} data-ui="checkin-mode-manual-btn">
                <Keyboard className="w-4 h-4" /> Manual
              </button>
              <button onClick={() => setScanMode('camera')} className={modeBtnClass('camera')} data-ui="checkin-mode-camera-btn">
                <QrCode className="w-4 h-4" /> Camara QR
              </button>
            </div>

            {scanMode === 'manual' && (
              <div className="space-y-3" data-ui="checkin-manual-section">
                <label className="block text-sm text-gray-400" data-ui="checkin-manual-label">ID del atleta</label>
                <div className="flex gap-2" data-ui="checkin-manual-row">
                  <input type="number" value={manualId} onChange={(e) => setManualId(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }} placeholder="Ej: 42"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent"
                    data-ui="checkin-manual-input" />
                  <button onClick={handleManualSubmit} disabled={!manualId.trim()}
                    className="px-5 py-2.5 bg-red-accent hover:bg-red-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    data-ui="checkin-manual-submit-btn">Buscar</button>
                </div>
              </div>
            )}

            {scanMode === 'camera' && (
              <div className="space-y-3" data-ui="checkin-camera-section">
                <button onClick={() => setScannerActive((p) => !p)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${scannerActive ? 'bg-yellow-600' : 'bg-green-600'} text-white`}
                  data-ui="checkin-camera-toggle-btn">
                  {scannerActive ? 'Detener camara' : 'Iniciar camara'}
                </button>
                <div id="qr-reader" className="rounded-lg overflow-hidden bg-black min-h-[300px]" data-ui="checkin-qr-reader" />
              </div>
            )}

            {statusError && (
              <div className="flex items-center gap-2 text-red-400 text-sm" data-ui="checkin-status-error">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span data-ui="checkin-status-error-text">{statusError}</span>
              </div>
            )}
          </div>
        )}

        {/* ─── Loading ─── */}
        {loadingStatus && (
          <div className="flex items-center justify-center py-12" data-ui="checkin-loading">
            <div className="w-8 h-8 border-2 border-red-accent border-t-transparent rounded-full animate-spin" data-ui="checkin-spinner" />
            <span className="ml-3 text-gray-400" data-ui="checkin-loading-text">Buscando atleta...</span>
          </div>
        )}

        {/* ─── Athlete Card + Actions ─── */}
        {status && (
          <div className="space-y-5" data-ui="checkin-result-section">
            <div className="bg-dark-surface rounded-xl border border-white/10 p-5 space-y-3" data-ui="checkin-athlete-card">
              <div className="flex items-center gap-2" data-ui="checkin-athlete-header">
                <User className="w-5 h-5 text-red-accent" />
                <h2 className="text-lg font-semibold text-white" data-ui="checkin-athlete-name">
                  {status.athlete.firstName} {status.athlete.surname}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm" data-ui="checkin-athlete-details">
                <div data-ui="checkin-athlete-email">
                  <span className="text-gray-500" data-ui="checkin-label-email">Email:</span>{' '}
                  <span className="text-gray-300" data-ui="checkin-value-email">{status.athlete.email}</span>
                </div>
                <div data-ui="checkin-athlete-category">
                  <span className="text-gray-500" data-ui="checkin-label-category">Categoria:</span>{' '}
                  <span className="text-gray-300" data-ui="checkin-value-category">{status.athlete.weightCategory}</span>
                </div>
                {status.athlete.club && (
                  <div data-ui="checkin-athlete-club">
                    <span className="text-gray-500" data-ui="checkin-label-club">Club:</span>{' '}
                    <span className="text-gray-300" data-ui="checkin-value-club">{status.athlete.club}</span>
                  </div>
                )}
                {status.athlete.coach && (
                  <div data-ui="checkin-athlete-coach">
                    <span className="text-gray-500" data-ui="checkin-label-coach">Entrenador:</span>{' '}
                    <span className="text-gray-300" data-ui="checkin-value-coach">{status.athlete.coach}</span>
                  </div>
                )}
              </div>

              {/* Double gate badges */}
              <div className="flex gap-4 pt-2" data-ui="checkin-gate-badges">
                {gateBadge(status.inscriptionConfirmed, 'Inscripcion', 'inscripcion')}
                {gateBadge(status.paymentCompleted, 'Pago', 'pago')}
              </div>

              {!canSetOpeners && (
                <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-ui="checkin-gate-alert">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300" data-ui="checkin-gate-alert-text">
                    El atleta debe completar inscripcion y pago antes del pesaje
                  </p>
                </div>
              )}
              {canSetOpeners && (
                <div className="mt-3 flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg p-3" data-ui="checkin-gate-passed">
                  <Check className="w-4 h-4 text-green-400" />
                  <p className="text-sm text-green-300" data-ui="checkin-gate-passed-text">
                    Atleta verificado. Puedes registrar openers y confirmar check-in.
                  </p>
                </div>
              )}
            </div>

            {/* Already checked in */}
            {isAlreadyCheckedIn && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4" data-ui="checkin-already-done">
                <p className="text-sm text-blue-300" data-ui="checkin-already-done-text">
                  Check-in ya realizado: {new Date(status.checkinAt!).toLocaleString('es-ES')}
                </p>
              </div>
            )}

            {/* ─── Openers Form ─── */}
            {canSetOpeners && !isAlreadyCheckedIn && (
              <div className="bg-dark-surface rounded-xl border border-white/10 p-5 space-y-4" data-ui="checkin-openers-section">
                <div className="flex items-center gap-2" data-ui="checkin-openers-header">
                  <Dumbbell className="w-5 h-5 text-red-accent" />
                  <h3 className="text-base font-semibold text-white" data-ui="checkin-openers-title">
                    {hasExistingOpeners ? 'Actualizar Openers' : 'Registrar Openers'}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-ui="checkin-openers-grid">
                  {OPENER_FIELDS.map((field) => {
                    const value = openersForm[field];
                    const invalid = value !== '' && !isValidWeight(value);
                    return (
                      <div key={field} data-ui={`checkin-opener-${field}`}>
                        <label className="block text-sm text-gray-400 mb-1" data-ui={`checkin-opener-${field}-label`}>
                          {OPENER_LABELS[field]} (kg)
                        </label>
                        <input type="number" value={value} onChange={(e) => handleOpenersChange(field, e.target.value)}
                          min={WEIGHT_MIN} max={WEIGHT_MAX}
                          className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${
                            invalid ? 'border-red-500' : 'border-white/10 focus:border-red-accent'
                          }`} data-ui={`checkin-opener-${field}-input`} />
                        {invalid && (
                          <p className="text-xs text-red-400 mt-1" data-ui={`checkin-opener-${field}-error`}>
                            Entre {WEIGHT_MIN} y {WEIGHT_MAX} kg
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {openersSub.success && <p className="text-sm text-green-400" data-ui="checkin-openers-success">{openersSub.success}</p>}
                {openersSub.error && <p className="text-sm text-red-400" data-ui="checkin-openers-error">{openersSub.error}</p>}
                <button onClick={handleOpenersSubmit} disabled={!openersValid || openersSub.loading}
                  className="w-full py-2.5 bg-red-accent hover:bg-red-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  data-ui="checkin-openers-submit-btn">
                  {openersSub.loading ? 'Guardando...' : hasExistingOpeners ? 'Actualizar Openers' : 'Guardar Openers'}
                </button>
              </div>
            )}

            {/* ─── Confirm Checkin ─── */}
            {canSetOpeners && !isAlreadyCheckedIn && (
              <div className="bg-dark-surface rounded-xl border border-white/10 p-5 space-y-3" data-ui="checkin-confirm-section">
                <button onClick={handleConfirmCheckin} disabled={checkinSub.loading}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                  data-ui="checkin-confirm-btn">
                  {checkinSub.loading ? 'Confirmando...' : 'Confirmar Check-in'}
                </button>
                {checkinSub.success && <p className="text-sm text-green-400 text-center" data-ui="checkin-confirm-success">{checkinSub.success}</p>}
                {checkinSub.error && <p className="text-sm text-red-400 text-center" data-ui="checkin-confirm-error">{checkinSub.error}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}
