import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { Edit2, Plus, Save, TicketPercent, X } from 'lucide-react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { currentCompeticionIdAtom } from '../../../stores/auth.atoms';
import api from '../../../api/client';
import type { CuponDescuento, CuponDescuentoRequest } from '../../../types/api';

const EMPTY_FORM: CuponDescuentoRequest = {
  codigo: '',
  tipoDescuento: 'porcentaje',
  valor: 10,
  tieneLimiteUsos: false,
  limiteUsos: null,
  tieneFechaExpiracion: false,
  fechaExpiracion: null,
  activo: true,
};

function formatDiscount(cupon: CuponDescuento): string {
  return cupon.tipoDescuento === 'porcentaje' ? `${cupon.valor}%` : `${cupon.valor} EUR`;
}

function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function CuponesPage(): JSX.Element {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const [cupones, setCupones] = useState<CuponDescuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CuponDescuento | null>(null);
  const [form, setForm] = useState<CuponDescuentoRequest>(EMPTY_FORM);

  const canSave = useMemo(() => form.codigo.trim().length > 0 && form.codigo.trim().length <= 200 && form.valor > 0, [form.codigo, form.valor]);

  const loadCupones = useCallback(async () => {
    if (!competicionId) return;
    setLoading(true);
    const result = await api.getCupones(competicionId);
    if (result.success && result.data) {
      setCupones(result.data);
    } else {
      toast.error(result.message || 'Error al cargar cupones');
    }
    setLoading(false);
  }, [competicionId]);

  useEffect(() => {
    loadCupones();
  }, [loadCupones]);

  const resetForm = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
  }, []);

  const editCupon = useCallback((cupon: CuponDescuento) => {
    setEditing(cupon);
    setForm({
      codigo: cupon.codigo,
      tipoDescuento: cupon.tipoDescuento,
      valor: cupon.valor,
      tieneLimiteUsos: cupon.tieneLimiteUsos,
      limiteUsos: cupon.limiteUsos ?? null,
      tieneFechaExpiracion: cupon.tieneFechaExpiracion,
      fechaExpiracion: toDateInputValue(cupon.fechaExpiracion) || null,
      activo: cupon.activo,
    });
  }, []);

  const saveCupon = useCallback(async () => {
    if (!competicionId || !canSave) return;

    setSaving(true);
    const payload: CuponDescuentoRequest = {
      ...form,
      codigo: form.codigo.trim(),
      limiteUsos: form.tieneLimiteUsos ? form.limiteUsos : null,
      fechaExpiracion: form.tieneFechaExpiracion ? form.fechaExpiracion : null,
    };

    const result = editing
      ? await api.updateCupon(competicionId, editing.id, payload)
      : await api.createCupon(competicionId, payload);

    if (result.success) {
      toast.success(editing ? 'Cupón actualizado' : 'Cupón creado');
      resetForm();
      await loadCupones();
    } else {
      toast.error(result.message || 'Error al guardar cupón');
    }
    setSaving(false);
  }, [canSave, competicionId, editing, form, loadCupones, resetForm]);

  const toggleActive = useCallback(async (cupon: CuponDescuento) => {
    if (!competicionId) return;
    const result = await api.setCuponActive(competicionId, cupon.id, !cupon.activo);
    if (result.success) {
      await loadCupones();
    } else {
      toast.error(result.message || 'Error al cambiar estado');
    }
  }, [competicionId, loadCupones]);

  if (!competicionId) {
    return (
      <BackofficeLayout>
        <div className="p-6 text-white/60" data-ui="cupones-no-competicion">Selecciona una competición.</div>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8 pb-12 max-w-6xl mx-auto" data-ui="cupones-page">
        <div className="mb-6" data-ui="cupones-header">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3" data-ui="cupones-title">
            <TicketPercent className="w-7 h-7 text-red-accent" data-ui="cupones-title-icon" aria-hidden="true" />
            Cupones
          </h1>
          <p className="text-sm text-white/50" data-ui="cupones-subtitle">
            Crea descuentos por porcentaje o importe fijo para esta competición.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6" data-ui="cupones-grid">
          <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 sm:p-5 h-fit" data-ui="cupones-form-card">
            <div className="flex items-center justify-between mb-5" data-ui="cupones-form-header">
              <h2 className="text-lg font-semibold text-white" data-ui="cupones-form-title">
                {editing ? 'Editar cupón' : 'Nuevo cupón'}
              </h2>
              {editing && (
                <button type="button" onClick={resetForm} className="p-2 text-white/50 hover:text-white transition-colors" data-ui="cupones-form-cancel" aria-label="Cancelar edición">
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="space-y-4" data-ui="cupones-form-fields">
              <label className="block" data-ui="cupones-code-field">
                <span className="block text-sm font-medium text-white/70 mb-1.5" data-ui="cupones-code-label">Texto del cupón</span>
                <input
                  value={form.codigo}
                  onChange={(event) => setForm((prev) => ({ ...prev, codigo: event.target.value }))}
                  maxLength={200}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-red-accent/60"
                  placeholder="Ej: FER10"
                  data-ui="cupones-code-input"
                />
                <span className="mt-1 text-xs text-white/40 block" data-ui="cupones-code-counter">{form.codigo.length}/200</span>
              </label>

              <div className="grid grid-cols-2 gap-3" data-ui="cupones-discount-row">
                <label className="block" data-ui="cupones-type-field">
                  <span className="block text-sm font-medium text-white/70 mb-1.5" data-ui="cupones-type-label">Tipo</span>
                  <select
                    value={form.tipoDescuento}
                    onChange={(event) => setForm((prev) => ({ ...prev, tipoDescuento: event.target.value as 'porcentaje' | 'importe' }))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-red-accent/60"
                    data-ui="cupones-type-select"
                  >
                    <option value="porcentaje" data-ui="cupones-type-percent">Porcentaje</option>
                    <option value="importe" data-ui="cupones-type-amount">Importe</option>
                  </select>
                </label>
                <label className="block" data-ui="cupones-value-field">
                  <span className="block text-sm font-medium text-white/70 mb-1.5" data-ui="cupones-value-label">Valor</span>
                  <input
                    type="number"
                    min="0"
                    max={form.tipoDescuento === 'porcentaje' ? 100 : undefined}
                    step="0.01"
                    value={form.valor}
                    onChange={(event) => setForm((prev) => ({ ...prev, valor: Number(event.target.value) }))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-red-accent/60"
                    data-ui="cupones-value-input"
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5" data-ui="cupones-limit-field">
                <input
                  type="checkbox"
                  checked={form.tieneLimiteUsos}
                  onChange={(event) => setForm((prev) => ({ ...prev, tieneLimiteUsos: event.target.checked }))}
                  className="mt-1"
                  data-ui="cupones-limit-checkbox"
                />
                <span data-ui="cupones-limit-copy">
                  <span className="block text-sm font-medium text-white/80" data-ui="cupones-limit-title">Limitar usos</span>
                  <span className="block text-xs text-white/45 mt-0.5" data-ui="cupones-limit-desc">Si se activa, el cupón se bloquea al alcanzar el límite.</span>
                </span>
              </label>

              {form.tieneLimiteUsos && (
                <label className="block" data-ui="cupones-limit-number-field">
                  <span className="block text-sm font-medium text-white/70 mb-1.5" data-ui="cupones-limit-number-label">Límite de usos</span>
                  <input
                    type="number"
                    min="1"
                    value={form.limiteUsos ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, limiteUsos: Number(event.target.value) || null }))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-red-accent/60"
                    data-ui="cupones-limit-number-input"
                  />
                </label>
              )}

              <label className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5" data-ui="cupones-expiration-field">
                <input
                  type="checkbox"
                  checked={form.tieneFechaExpiracion}
                  onChange={(event) => setForm((prev) => ({ ...prev, tieneFechaExpiracion: event.target.checked }))}
                  className="mt-1"
                  data-ui="cupones-expiration-checkbox"
                />
                <span data-ui="cupones-expiration-copy">
                  <span className="block text-sm font-medium text-white/80" data-ui="cupones-expiration-title">Fecha de expiración</span>
                  <span className="block text-xs text-white/45 mt-0.5" data-ui="cupones-expiration-desc">Si se activa, el cupón no funcionará después de esa fecha.</span>
                </span>
              </label>

              {form.tieneFechaExpiracion && (
                <label className="block" data-ui="cupones-expiration-date-field">
                  <span className="block text-sm font-medium text-white/70 mb-1.5" data-ui="cupones-expiration-date-label">Fecha</span>
                  <input
                    type="date"
                    value={form.fechaExpiracion ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, fechaExpiracion: event.target.value || null }))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-red-accent/60"
                    data-ui="cupones-expiration-date-input"
                  />
                </label>
              )}

              <button
                type="button"
                onClick={saveCupon}
                disabled={saving || !canSave}
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-accent text-white font-semibold hover:bg-red-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-ui="cupones-save-btn"
              >
                {editing ? <Save size={18} data-ui="cupones-save-icon" /> : <Plus size={18} data-ui="cupones-create-icon" />}
                <span data-ui="cupones-save-text">{saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cupón'}</span>
              </button>
            </div>
          </section>

          <section className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden" data-ui="cupones-list-card">
            {loading ? (
              <div className="p-8 text-center text-white/50" data-ui="cupones-loading">Cargando cupones...</div>
            ) : cupones.length === 0 ? (
              <div className="p-8 text-center" data-ui="cupones-empty">
                <TicketPercent className="w-10 h-10 mx-auto mb-3 text-white/25" data-ui="cupones-empty-icon" aria-hidden="true" />
                <p className="text-white/70 font-medium" data-ui="cupones-empty-title">No hay cupones todavía</p>
                <p className="text-sm text-white/40 mt-1" data-ui="cupones-empty-desc">Crea el primero desde el formulario.</p>
              </div>
            ) : (
              <div className="overflow-x-auto" data-ui="cupones-table-wrapper">
                <table className="w-full min-w-[720px]" data-ui="cupones-table">
                  <thead data-ui="cupones-table-head">
                    <tr className="border-b border-white/5 text-left" data-ui="cupones-table-head-row">
                      <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="cupones-th-code">Cupón</th>
                      <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="cupones-th-discount">Descuento</th>
                      <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="cupones-th-uses">Usos</th>
                      <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="cupones-th-expiration">Expira</th>
                      <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase" data-ui="cupones-th-status">Estado</th>
                      <th className="px-4 py-3 text-xs font-semibold text-white/45 uppercase text-right" data-ui="cupones-th-actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5" data-ui="cupones-table-body">
                    {cupones.map((cupon) => (
                      <tr key={cupon.id} className="hover:bg-white/[0.02]" data-ui={`cupones-row-${cupon.id}`}>
                        <td className="px-4 py-4" data-ui={`cupones-code-${cupon.id}`}>
                          <p className="font-semibold text-white" data-ui={`cupones-code-text-${cupon.id}`}>{cupon.codigo}</p>
                        </td>
                        <td className="px-4 py-4 text-white/70" data-ui={`cupones-discount-${cupon.id}`}>{formatDiscount(cupon)}</td>
                        <td className="px-4 py-4 text-white/70" data-ui={`cupones-uses-${cupon.id}`}>
                          {cupon.tieneLimiteUsos ? `${cupon.usosActuales}/${cupon.limiteUsos}` : `${cupon.usosActuales}`}
                        </td>
                        <td className="px-4 py-4 text-white/70" data-ui={`cupones-expiration-${cupon.id}`}>
                          {cupon.tieneFechaExpiracion && cupon.fechaExpiracion ? new Date(cupon.fechaExpiracion).toLocaleDateString('es-ES') : 'No'}
                        </td>
                        <td className="px-4 py-4" data-ui={`cupones-status-${cupon.id}`}>
                          <button
                            type="button"
                            onClick={() => toggleActive(cupon)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${cupon.activo ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/45'}`}
                            data-ui={`cupones-active-toggle-${cupon.id}`}
                          >
                            {cupon.activo ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-right" data-ui={`cupones-actions-${cupon.id}`}>
                          <button
                            type="button"
                            onClick={() => editCupon(cupon)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            data-ui={`cupones-edit-${cupon.id}`}
                          >
                            <Edit2 size={15} data-ui={`cupones-edit-icon-${cupon.id}`} />
                            <span data-ui={`cupones-edit-text-${cupon.id}`}>Editar</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </BackofficeLayout>
  );
}

export default CuponesPage;
