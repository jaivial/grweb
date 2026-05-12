import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { Button } from '../../../../components/ui';
import type { Inscripcion } from '../../../../types/api';

interface FerInscripcionEditFormProps {
  inscripcion: Inscripcion;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function FerInscripcionEditForm({
  inscripcion,
  onSubmit,
  onCancel,
  isLoading,
}: FerInscripcionEditFormProps): JSX.Element {
  const [formData, setFormData] = useState({
    nombre: inscripcion.nombre || '',
    email: inscripcion.email || '',
    instagram: inscripcion.instagram || '',
    telefono: inscripcion.telefono || '',
    sexo: inscripcion.sexo || '',
    categoriaPeso: inscripcion.categoriaPeso || '',
    experiencia: inscripcion.experiencia || 'principiante',
    tieneEntrenador: inscripcion.tieneEntrenador ?? false,
    pesoAprox: inscripcion.pesoAprox ?? 0,
    pagoConfirmado: inscripcion.pagoConfirmado ?? false,
    participacionConfirmada: inscripcion.participacionConfirmada ?? false,
    notas: inscripcion.notas || '',
  });

  const handleChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  }, [formData, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-ui="fer-edit-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-ui="fer-edit-grid">
        <div data-ui="fer-edit-nombre">
          <label className="block text-sm text-white/60 mb-1.5">Nombre</label>
          <input
            type="text"
            value={formData.nombre}
            onChange={(e) => handleChange('nombre', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50"
            data-ui="fer-edit-nombre-input"
          />
        </div>
        <div data-ui="fer-edit-email">
          <label className="block text-sm text-white/60 mb-1.5">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50"
            data-ui="fer-edit-email-input"
          />
        </div>
        <div data-ui="fer-edit-telefono">
          <label className="block text-sm text-white/60 mb-1.5">Teléfono</label>
          <input
            type="text"
            value={formData.telefono}
            onChange={(e) => handleChange('telefono', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50"
            data-ui="fer-edit-telefono-input"
          />
        </div>
        <div data-ui="fer-edit-instagram">
          <label className="block text-sm text-white/60 mb-1.5">Instagram</label>
          <input
            type="text"
            value={formData.instagram}
            onChange={(e) => handleChange('instagram', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50"
            data-ui="fer-edit-instagram-input"
          />
        </div>
        <div data-ui="fer-edit-categoria">
          <label className="block text-sm text-white/60 mb-1.5">Categoría peso</label>
          <input
            type="text"
            value={formData.categoriaPeso}
            onChange={(e) => handleChange('categoriaPeso', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50"
            data-ui="fer-edit-categoria-input"
          />
        </div>
        <div data-ui="fer-edit-peso">
          <label className="block text-sm text-white/60 mb-1.5">Peso aprox. (kg)</label>
          <input
            type="number"
            value={formData.pesoAprox}
            onChange={(e) => handleChange('pesoAprox', Number(e.target.value))}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50"
            data-ui="fer-edit-peso-input"
          />
        </div>
      </div>

      {/* Pago confirmado toggle */}
      <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-edit-pago-toggle">
        <button
          type="button"
          onClick={() => handleChange('pagoConfirmado', !formData.pagoConfirmado)}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
            formData.pagoConfirmado ? 'bg-green-500' : 'bg-gray-600'
          }`}
          data-ui="fer-edit-pago-button"
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
              formData.pagoConfirmado ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-white/70" data-ui="fer-edit-pago-label">
          {formData.pagoConfirmado ? 'Pago confirmado' : 'Pago pendiente'}
        </span>
      </div>

      {/* Check-in toggle */}
      <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-edit-checkin-toggle">
        <button
          type="button"
          onClick={() => handleChange('participacionConfirmada', !formData.participacionConfirmada)}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
            formData.participacionConfirmada ? 'bg-blue-500' : 'bg-gray-600'
          }`}
          data-ui="fer-edit-checkin-button"
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
              formData.participacionConfirmada ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-white/70" data-ui="fer-edit-checkin-label">
          {formData.participacionConfirmada ? 'Check-in confirmado' : 'Check-in pendiente'}
        </span>
      </div>

      {/* Notas */}
      <div data-ui="fer-edit-notas">
        <label className="block text-sm text-white/60 mb-1.5">Notas</label>
        <textarea
          value={formData.notas}
          onChange={(e) => handleChange('notas', e.target.value)}
          rows={3}
          className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 resize-none"
          data-ui="fer-edit-notas-input"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2" data-ui="fer-edit-actions">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="min-h-[44px] text-white/60 hover:text-white"
          data-ui="fer-edit-cancel-btn"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="min-h-[44px] bg-red-accent/90 hover:bg-red-accent text-white border-0"
          data-ui="fer-edit-submit-btn"
        >
          {isLoading ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
