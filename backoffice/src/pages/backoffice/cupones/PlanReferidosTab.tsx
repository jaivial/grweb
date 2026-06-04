import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { Edit2, Mail, RefreshCw, Save, Users } from 'lucide-react';
import { currentCompeticionIdAtom } from '../../../stores/auth.atoms';
import { CustomSelector, type SelectOption } from '../../../components/ui';
import api from '../../../api/client';
import type {
  ReferidoConfig,
  ReferidoConfigRequest,
  ReferidoInscripcionRow,
  ReferidoInscripcionOverrideRequest,
  ReferidoModo,
  ReferidoModoAcumulativo,
  ReferidoTipoDescuento,
} from '../../../types/api';

const EMPTY_CONFIG: ReferidoConfigRequest = {
  activo: false,
  modo: 'basico',
  tipoDescuentoReferente: 'importe',
  valorDescuentoReferente: 0,
  tieneLimiteUsos: false,
  limiteUsos: null,
  modoAcumulativo: null,
  multiplicadorAcumulativo: null,
  tipoDescuentoNuevoUsuario: 'porcentaje',
  valorDescuentoNuevoUsuario: 0,
};

function formatDiscount(tipo: ReferidoTipoDescuento, valor: number): string {
  return tipo === 'porcentaje' ? `${valor}%` : `${valor} EUR`;
}

// ─── Local UI primitives (toggle + number input) ───

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  testId?: string;
}

function Toggle({ checked, onChange, disabled, label, description, testId }: ToggleProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4" data-ui={testId}>
      {(label || description) && (
        <div className="flex-1" data-ui={`${testId}-text`}>
          {label && <span className="block text-sm font-semibold text-white/85" data-ui={`${testId}-label`}>{label}</span>}
          {description && <span className="block text-xs text-white/50 mt-0.5" data-ui={`${testId}-description`}>{description}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 mt-0.5 ${checked ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
        data-ui={`${testId}-switch`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-7' : 'translate-x-1'}`}
          data-ui={`${testId}-knob`}
        />
      </button>
    </div>
  );
}

interface NumberFieldProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  testId: string;
}

function NumberField({ value, onChange, min, max, step = 1, placeholder, disabled, testId }: NumberFieldProps): JSX.Element {
  const display = value === null || value === undefined || Number.isNaN(value) ? '' : String(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === '') {
          onChange(0);
          return;
        }
        const normalized = raw.replace(',', '.');
        if (!/^-?\d*(\.\d*)?$/.test(normalized)) return;
        const num = normalized === '' || normalized === '-' ? 0 : Number(normalized);
        if (Number.isNaN(num)) return;
        if (min !== undefined && num < min) return;
        if (max !== undefined && num > max) return;
        onChange(num);
      }}
      onBlur={(e) => {
        // Normalize trailing dots
        const raw = e.target.value.replace(',', '.');
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
          onChange(0);
          e.target.value = '0';
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      data-ui={testId}
      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-red-accent/60"
      style={{ MozAppearance: 'textfield' }}
    />
  );
}

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  testId: string;
}

function Stepper({ value, onChange, min = 0, max, step = 1, disabled, testId }: StepperProps): JSX.Element {
  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  };
  return (
    <div className="flex items-center gap-2" data-ui={testId}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={disabled || (min !== undefined && value <= min)}
        className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        data-ui={`${testId}-minus`}
        aria-label="Disminuir"
      >−</button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        disabled={disabled}
        className="flex-1 min-h-[44px] px-3 py-2 text-center rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-red-accent/60"
        style={{ MozAppearance: 'textfield' }}
        data-ui={`${testId}-input`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={disabled || (max !== undefined && value >= max)}
        className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        data-ui={`${testId}-plus`}
        aria-label="Aumentar"
      >+</button>
    </div>
  );
}

// ─── Select option lists ───

const MODO_OPTIONS: SelectOption<ReferidoModo>[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'acumulativo', label: 'Acumulativo' },
];

const MODO_ACUMULATIVO_OPTIONS: SelectOption<'' | ReferidoModoAcumulativo>[] = [
  { value: '', label: 'Seleccionar...' },
  { value: 'basica', label: 'Basica' },
  { value: 'multiplicador', label: 'Multiplicador' },
];

const TIPO_OPTIONS: SelectOption<ReferidoTipoDescuento>[] = [
  { value: 'porcentaje', label: 'Porcentaje' },
  { value: 'importe', label: 'Importe fijo' },
];

export function PlanReferidosTab(): JSX.Element {
  const competicionId = useAtomValue(currentCompeticionIdAtom);

  const [config, setConfig] = useState<ReferidoConfigRequest>(EMPTY_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const [rows, setRows] = useState<ReferidoInscripcionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState('');
  const [loadingRows, setLoadingRows] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const [editingRow, setEditingRow] = useState<ReferidoInscripcionRow | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const loadConfig = useCallback(async () => {
    if (!competicionId) return;
    setLoadingConfig(true);
    const result = await api.getReferidosConfig(competicionId);
    if (result.success) {
      const cfg = result.data;
      if (cfg) {
        setConfig({
          activo: cfg.activo,
          modo: cfg.modo,
          tipoDescuentoReferente: cfg.tipoDescuentoReferente,
          valorDescuentoReferente: cfg.valorDescuentoReferente,
          tieneLimiteUsos: cfg.tieneLimiteUsos,
          limiteUsos: cfg.limiteUsos ?? null,
          modoAcumulativo: cfg.modoAcumulativo ?? null,
          multiplicadorAcumulativo: cfg.multiplicadorAcumulativo ?? null,
          tipoDescuentoNuevoUsuario: cfg.tipoDescuentoNuevoUsuario,
          valorDescuentoNuevoUsuario: cfg.valorDescuentoNuevoUsuario,
        });
      } else {
        setConfig(EMPTY_CONFIG);
      }
    } else {
      toast.error(result.message || 'Error al cargar la configuración de referidos');
    }
    setLoadingConfig(false);
  }, [competicionId]);

  const loadRows = useCallback(async () => {
    if (!competicionId) return;
    setLoadingRows(true);
    const result = await api.listReferidosInscripciones(competicionId, page, pageSize, search || undefined);
    if (result.success && result.data) {
      setRows(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.message || 'Error al cargar las inscripciones');
    }
    setLoadingRows(false);
  }, [competicionId, page, search]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const saveConfig = useCallback(async () => {
    if (!competicionId) return;
    setSavingConfig(true);
    const result = await api.upsertReferidosConfig(competicionId, config);
    setSavingConfig(false);
    if (result.success) {
      toast.success('Configuración de referidos guardada');
      loadConfig();
    } else {
      toast.error(result.message || 'Error al guardar');
    }
  }, [competicionId, config, loadConfig]);

  const backfill = useCallback(async () => {
    if (!competicionId) return;
    setBackfilling(true);
    const result = await api.backfillReferidos(competicionId);
    setBackfilling(false);
    if (result.success && result.data) {
      toast.success(`Códigos generados: ${result.data.generated}`);
      loadRows();
    } else {
      toast.error(result.message || 'Error al generar códigos');
    }
  }, [competicionId, loadRows]);

  const activateAll = useCallback(async () => {
    if (!competicionId) return;
    setNotifying(true);
    const result = await api.activateAllReferidos(competicionId);
    setNotifying(false);
    if (result.success && result.data) {
      toast.success(`Notificaciones enviadas: ${result.data.notified}`);
      loadRows();
    } else {
      toast.error(result.message || 'Error al enviar notificaciones');
    }
  }, [competicionId, loadRows]);

  const openEditRow = useCallback((row: ReferidoInscripcionRow) => {
    setEditingRow(row);
  }, []);

  const closeEditRow = useCallback(() => setEditingRow(null), []);

  const saveRowOverride = useCallback(async (payload: ReferidoInscripcionOverrideRequest) => {
    if (!competicionId || !editingRow) return;
    const result = await api.updateReferidoInscripcion(competicionId, editingRow.inscripcionId, payload);
    if (result.success) {
      toast.success('Configuración guardada');
      closeEditRow();
      loadRows();
    } else {
      toast.error(result.message || 'Error al guardar');
    }
  }, [competicionId, editingRow, closeEditRow, loadRows]);

  const updateField = useCallback(<K extends keyof ReferidoConfigRequest>(key: K, value: ReferidoConfigRequest[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setModo = useCallback((modo: ReferidoModo) => {
    setConfig((prev) => ({
      ...prev,
      modo,
      modoAcumulativo: modo === 'acumulativo' ? (prev.modoAcumulativo ?? 'basica') : null,
      multiplicadorAcumulativo: modo === 'acumulativo' ? prev.multiplicadorAcumulativo : null,
    }));
  }, []);

  if (!competicionId) {
    return (
      <div className="p-6 text-white/60" data-ui="referidos-no-competicion">Selecciona una competición.</div>
    );
  }

  return (
    <div className="space-y-6" data-ui="referidos-tab-content">
      {/* ─── Config Card ─── */}
      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 sm:p-6" data-ui="referidos-config-card">
        <header className="mb-5" data-ui="referidos-config-header">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2" data-ui="referidos-config-title">
            <Users size={18} className="text-red-accent" aria-hidden="true" />
            Configuración del plan
          </h2>
          <p className="text-sm text-white/50 mt-1" data-ui="referidos-config-subtitle">
            Define los descuentos por defecto para esta competición. Cada inscripción puede tener un override individual.
          </p>
        </header>

        {loadingConfig ? (
          <div className="p-8 text-center text-white/50" data-ui="referidos-config-loading">Cargando configuración...</div>
        ) : (
          <div className="space-y-4" data-ui="referidos-config-form">
            <Toggle
              checked={config.activo}
              onChange={(v) => updateField('activo', v)}
              label="Activar plan de referidos para esta competición"
              testId="referidos-activo"
            />

            {/* Modo */}
            <fieldset className="space-y-2" data-ui="referidos-modo-fieldset">
              <legend className="text-sm font-medium text-white/70" data-ui="referidos-modo-legend">Modo</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-ui="referidos-modo-grid">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${config.modo === 'basico' ? 'border-red-accent/60 bg-red-accent/5' : 'border-white/10 bg-white/[0.03]'}`} data-ui="referidos-modo-basico">
                  <input
                    type="radio"
                    name="modo"
                    checked={config.modo === 'basico'}
                    onChange={() => setModo('basico')}
                    className="mt-1"
                    data-ui="referidos-modo-basico-radio"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-white" data-ui="referidos-modo-basico-title">Básico</span>
                    <span className="block text-xs text-white/45 mt-0.5">Cada uso del código aplica el mismo descuento.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${config.modo === 'acumulativo' ? 'border-red-accent/60 bg-red-accent/5' : 'border-white/10 bg-white/[0.03]'}`} data-ui="referidos-modo-acumulativo">
                  <input
                    type="radio"
                    name="modo"
                    checked={config.modo === 'acumulativo'}
                    onChange={() => setModo('acumulativo')}
                    className="mt-1"
                    data-ui="referidos-modo-acumulativo-radio"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-white" data-ui="referidos-modo-acumulativo-title">Acumulativo</span>
                    <span className="block text-xs text-white/45 mt-0.5">El descuento del referente crece con cada uso.</span>
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Acumulative options */}
            {config.modo === 'acumulativo' && (
              <div className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/5" data-ui="referidos-acumulativo-block">
                <fieldset className="space-y-2" data-ui="referidos-modo-acumulativo-fieldset">
                  <legend className="text-sm font-medium text-white/70" data-ui="referidos-modo-acumulativo-legend">Tipo de acumulación</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-ui="referidos-modo-acumulativo-grid">
                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${config.modoAcumulativo === 'basica' ? 'border-red-accent/60 bg-red-accent/5' : 'border-white/10 bg-white/[0.03]'}`} data-ui="referidos-acum-basica">
                      <input
                        type="radio"
                        checked={config.modoAcumulativo === 'basica'}
                        onChange={() => updateField('modoAcumulativo', 'basica' as ReferidoModoAcumulativo)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Basica</span>
                        <span className="block text-xs text-white/45 mt-0.5">Cada uso suma la recompensa base (sin límite de usos, con el tope global de tu inscripción).</span>
                      </span>
                    </label>
                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${config.modoAcumulativo === 'multiplicador' ? 'border-red-accent/60 bg-red-accent/5' : 'border-white/10 bg-white/[0.03]'}`} data-ui="referidos-acum-multiplicador">
                      <input
                        type="radio"
                        checked={config.modoAcumulativo === 'multiplicador'}
                        onChange={() => updateField('modoAcumulativo', 'multiplicador' as ReferidoModoAcumulativo)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Multiplicador</span>
                        <span className="block text-xs text-white/45 mt-0.5">Cada nuevo uso multiplica la recompensa.</span>
                      </span>
                    </label>
                  </div>
                </fieldset>
                {config.modoAcumulativo === 'multiplicador' && (
                  <div data-ui="referidos-multiplicador-field">
                    <span className="block text-sm font-medium text-white/70 mb-1.5">Multiplicador (×)</span>
                    <Stepper
                      value={config.multiplicadorAcumulativo ?? 0}
                      onChange={(v) => updateField('multiplicadorAcumulativo', v || null)}
                      min={0}
                      step={0.1}
                      testId="referidos-multiplicador"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Referente discount */}
            <fieldset className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/5" data-ui="referidos-referente-block">
              <legend className="text-sm font-medium text-white/70" data-ui="referidos-referente-legend">Descuento para el referente (dueño del código)</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-ui="referidos-referente-grid">
                <div data-ui="referidos-referente-tipo">
                  <span className="block text-sm font-medium text-white/70 mb-1.5">Tipo</span>
                  <CustomSelector<ReferidoTipoDescuento>
                    options={TIPO_OPTIONS}
                    value={config.tipoDescuentoReferente}
                    onChange={(v) => v && updateField('tipoDescuentoReferente', v)}
                    allowClear={false}
                    data-testid="referidos-referente-tipo-select"
                  />
                </div>
                <div data-ui="referidos-referente-valor">
                  <span className="block text-sm font-medium text-white/70 mb-1.5">Valor</span>
                  <NumberField
                    value={config.valorDescuentoReferente}
                    onChange={(v) => updateField('valorDescuentoReferente', v)}
                    min={0}
                    max={config.tipoDescuentoReferente === 'porcentaje' ? 100 : undefined}
                    step={0.01}
                    testId="referidos-referente-valor-input"
                  />
                </div>
              </div>
            </fieldset>

            {/* Limite de usos — available in both basic and acumulativo modes */}
            <div className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/5" data-ui="referidos-limit-block">
              <Toggle
                checked={config.tieneLimiteUsos}
                onChange={(v) => updateField('tieneLimiteUsos', v)}
                label="Limitar usos"
                description="Si se activa, el código se bloquea al alcanzar el límite."
                testId="referidos-limit"
              />
              {config.tieneLimiteUsos && (
                <div data-ui="referidos-limit-number-field">
                  <span className="block text-sm font-medium text-white/70 mb-1.5">Límite de usos</span>
                  <Stepper
                    value={config.limiteUsos ?? 1}
                    onChange={(v) => updateField('limiteUsos', v || null)}
                    min={1}
                    testId="referidos-limit-number"
                  />
                </div>
              )}
            </div>

            {/* New user discount */}
            <fieldset className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/5" data-ui="referidos-newuser-block">
              <legend className="text-sm font-medium text-white/70" data-ui="referidos-newuser-legend">Descuento para el nuevo usuario (quien usa el código)</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-ui="referidos-newuser-grid">
                <div data-ui="referidos-newuser-tipo">
                  <span className="block text-sm font-medium text-white/70 mb-1.5">Tipo</span>
                  <CustomSelector<ReferidoTipoDescuento>
                    options={TIPO_OPTIONS}
                    value={config.tipoDescuentoNuevoUsuario}
                    onChange={(v) => v && updateField('tipoDescuentoNuevoUsuario', v)}
                    allowClear={false}
                    data-testid="referidos-newuser-tipo-select"
                  />
                </div>
                <div data-ui="referidos-newuser-valor">
                  <span className="block text-sm font-medium text-white/70 mb-1.5">Valor</span>
                  <NumberField
                    value={config.valorDescuentoNuevoUsuario}
                    onChange={(v) => updateField('valorDescuentoNuevoUsuario', v)}
                    min={0}
                    max={config.tipoDescuentoNuevoUsuario === 'porcentaje' ? 100 : undefined}
                    step={0.01}
                    testId="referidos-newuser-valor-input"
                  />
                </div>
              </div>
            </fieldset>

            <div className="flex justify-end pt-2" data-ui="referidos-config-actions">
              <button
                type="button"
                onClick={saveConfig}
                disabled={savingConfig}
                className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50"
                data-ui="referidos-save-btn"
              >
                <Save size={16} aria-hidden="true" />
                {savingConfig ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Inscripciones Table ─── */}
      <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 sm:p-6" data-ui="referidos-table-card">
        <header className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-ui="referidos-table-header">
          <div>
            <h2 className="text-lg font-semibold text-white" data-ui="referidos-table-title">Inscripciones y códigos</h2>
            <p className="text-sm text-white/50 mt-0.5" data-ui="referidos-table-subtitle">Genera códigos para todos los inscritos y personaliza el plan de cada uno.</p>
          </div>
          <div className="flex items-center gap-2" data-ui="referidos-table-actions">
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar nombre o email..."
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-red-accent/60 w-full sm:w-64"
              data-ui="referidos-search-input"
            />
            <button
              type="button"
              onClick={backfill}
              disabled={backfilling}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all disabled:opacity-50"
              data-ui="referidos-backfill-btn"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {backfilling ? 'Generando...' : 'Generar códigos existentes'}
            </button>
            <button
              type="button"
              onClick={activateAll}
              disabled={notifying}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all disabled:opacity-50"
              data-ui="referidos-activate-all-btn"
            >
              <Mail size={16} aria-hidden="true" />
              {notifying ? 'Enviando...' : 'Activar y notificar a todos'}
            </button>
          </div>
        </header>

        {loadingRows ? (
          <div className="p-8 text-center text-white/50" data-ui="referidos-table-loading">Cargando inscripciones...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center" data-ui="referidos-table-empty">
            <Users className="w-10 h-10 mx-auto mb-3 text-white/25" aria-hidden="true" />
            <p className="text-white/70 font-medium" data-ui="referidos-table-empty-title">No hay inscripciones con código</p>
            <p className="text-sm text-white/40 mt-1" data-ui="referidos-table-empty-desc">Pulsa &quot;Generar códigos existentes&quot; para crear los códigos de los inscritos actuales.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto" data-ui="referidos-table-wrapper">
              <table className="w-full min-w-[860px]" data-ui="referidos-table">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="referidos-th-nombre">Nombre</th>
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="referidos-th-email">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="referidos-th-codigo">Código</th>
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="referidos-th-activo">Activo</th>
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="referidos-th-descuento">Descuento nuevo usuario</th>
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="referidos-th-usos">Usos</th>
                    <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase text-right" data-ui="referidos-th-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5" data-ui="referidos-table-body">
                  {rows.map((row) => (
                    <tr key={row.codigoReferidoId} className="hover:bg-white/[0.02]" data-ui={`referidos-row-${row.codigoReferidoId}`}>
                      <td className="px-4 py-3 text-white" data-ui={`referidos-nombre-${row.codigoReferidoId}`}>{row.nombre}</td>
                      <td className="px-4 py-3 text-white/70" data-ui={`referidos-email-${row.codigoReferidoId}`}>{row.email}</td>
                      <td className="px-4 py-3 font-mono text-sm text-white" data-ui={`referidos-codigo-${row.codigoReferidoId}`}>{row.codigo}</td>
                      <td className="px-4 py-3" data-ui={`referidos-activo-${row.codigoReferidoId}`}>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${row.activo ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/45'}`}>
                          {row.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/70" data-ui={`referidos-descuento-${row.codigoReferidoId}`}>{formatDiscount(row.tipoDescuentoNuevoUsuario, row.valorDescuentoNuevoUsuario)}</td>
                      <td className="px-4 py-3 text-white/70" data-ui={`referidos-usos-${row.codigoReferidoId}`}>{row.usos}</td>
                      <td className="px-4 py-3 text-right" data-ui={`referidos-actions-${row.codigoReferidoId}`}>
                        <button
                          type="button"
                          onClick={() => openEditRow(row)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                          data-ui={`referidos-edit-${row.codigoReferidoId}`}
                        >
                          <Edit2 size={14} aria-hidden="true" />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4" data-ui="referidos-pagination">
                <span className="text-sm text-white/50" data-ui="referidos-pagination-info">
                  Página {page} de {totalPages} ({total} inscripciones)
                </span>
                <div className="flex items-center gap-2" data-ui="referidos-pagination-actions">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    data-ui="referidos-prev-btn"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    data-ui="referidos-next-btn"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {editingRow && (
        <ReferidosInscripcionEditModal
          row={editingRow}
          onClose={closeEditRow}
          onSave={saveRowOverride}
        />
      )}
    </div>
  );
}

// ─── Edit Modal ───

function ReferidosInscripcionEditModal({
  row,
  onClose,
  onSave,
}: {
  row: ReferidoInscripcionRow;
  onClose: () => void;
  onSave: (payload: ReferidoInscripcionOverrideRequest) => Promise<void>;
}): JSX.Element {
  const [activo, setActivo] = useState(row.activo);
  const [modo, setModoLocal] = useState<ReferidoModo>(row.modo ?? 'basico');
  const [tipoRef, setTipoRef] = useState<ReferidoTipoDescuento>(row.tipoDescuentoNuevoUsuario);
  const [valorRef, setValorRef] = useState<number>(row.valorDescuentoNuevoUsuario);
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    setSaving(true);
    await onSave({
      activo,
      modo,
      tipoDescuentoReferente: tipoRef,
      valorDescuentoReferente: valorRef,
      tieneLimiteUsos: false,
      limiteUsos: null,
      modoAcumulativo: null,
      multiplicadorAcumulativo: null,
      tipoDescuentoNuevoUsuario: tipoRef,
      valorDescuentoNuevoUsuario: valorRef,
    });
    setSaving(false);
  }, [activo, modo, tipoRef, valorRef, onSave]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-ui="referidos-modal-backdrop" onClick={onClose}>
      <div className="bg-dark-surface border border-white/10 rounded-2xl w-full max-w-md p-6" data-ui="referidos-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white mb-1" data-ui="referidos-modal-title">Editar código de {row.nombre}</h3>
        <p className="text-sm text-white/50 mb-4 font-mono" data-ui="referidos-modal-codigo">{row.codigo}</p>

        <div className="space-y-4" data-ui="referidos-modal-form">
          <Toggle
            checked={activo}
            onChange={setActivo}
            label="Activo"
            testId="referidos-modal-activo"
          />

          <fieldset data-ui="referidos-modal-modo-fieldset">
            <legend className="text-sm font-medium text-white/70 mb-1.5">Modo</legend>
            <div className="grid grid-cols-2 gap-2" data-ui="referidos-modal-modo-grid">
              <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${modo === 'basico' ? 'border-red-accent/60 bg-red-accent/5' : 'border-white/10'}`}>
                <input
                  type="radio"
                  checked={modo === 'basico'}
                  onChange={() => setModoLocal('basico')}
                />
                <span className="text-sm text-white">Básico</span>
              </label>
              <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${modo === 'acumulativo' ? 'border-red-accent/60 bg-red-accent/5' : 'border-white/10'}`}>
                <input
                  type="radio"
                  checked={modo === 'acumulativo'}
                  onChange={() => setModoLocal('acumulativo')}
                />
                <span className="text-sm text-white">Acumulativo</span>
              </label>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3" data-ui="referidos-modal-discount-grid">
            <div data-ui="referidos-modal-tipo-field">
              <span className="block text-sm font-medium text-white/70 mb-1.5">Tipo descuento</span>
              <CustomSelector<ReferidoTipoDescuento>
                options={TIPO_OPTIONS}
                value={tipoRef}
                onChange={(v) => v && setTipoRef(v)}
                allowClear={false}
                data-testid="referidos-modal-tipo-select"
              />
            </div>
            <div data-ui="referidos-modal-valor-field">
              <span className="block text-sm font-medium text-white/70 mb-1.5">Valor</span>
              <NumberField
                value={valorRef}
                onChange={setValorRef}
                min={0}
                step={0.01}
                testId="referidos-modal-valor-input"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6" data-ui="referidos-modal-actions">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            data-ui="referidos-modal-cancel-btn"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-red-accent text-white font-semibold hover:bg-red-accent/90 disabled:opacity-50"
            data-ui="referidos-modal-save-btn"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlanReferidosTab;
