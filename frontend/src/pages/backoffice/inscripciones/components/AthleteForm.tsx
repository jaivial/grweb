import { useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { Button, CustomSelector, DatePicker } from '../../../../components/ui';
import type { Athlete, AthleteFormData } from '../../../../types/athlete';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../../../constants/categories';

interface AthleteFormProps {
  initialData?: Athlete;
  onSubmit: (data: AthleteFormData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'Inscrito', label: 'Inscrito' },
  { value: 'Paid', label: 'Pagado' },
  { value: 'PendingPayment', label: 'Pendiente pago' },
  { value: 'Disqualified', label: 'Descalificado' },
  { value: 'MissingDocumentation', label: 'Falta documentación' },
];

const SEX_OPTIONS = [
  { value: 'Male', label: 'Hombre' },
  { value: 'Female', label: 'Mujer' },
];

export function AthleteForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: AthleteFormProps): JSX.Element {
  const [formData, setFormData] = useState<AthleteFormData>({
    firstName: initialData?.firstName || '',
    surname: initialData?.surname || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    sex: initialData?.sex || 'Male',
    weightCategory: initialData?.weightCategory || '',
    club: initialData?.club || '',
    totalWeight: initialData?.totalWeight || undefined,
    registrationDate: initialData?.registrationDate?.split('T')[0] || new Date().toISOString().split('T')[0],
    coach: initialData?.coach || '',
    status: initialData?.status || 'Inscrito',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AthleteFormData, string>>>({});

  const categoryOptions = useMemo(() => {
    const categories = formData.sex === 'Female' ? WOMEN_CATEGORIES : MEN_CATEGORIES;
    return categories.map(c => ({ value: c, label: `${c} kg` }));
  }, [formData.sex]);

  const updateField = useCallback(<K extends keyof AthleteFormData>(
    field: K,
    value: AthleteFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    // Reset weight category when sex changes
    if (field === 'sex') {
      setFormData(prev => ({ ...prev, weightCategory: '' }));
    }
  }, [errors]);

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof AthleteFormData, string>> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'El nombre es obligatorio';
    }
    if (!formData.surname.trim()) {
      newErrors.surname = 'Los apellidos son obligatorios';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }
    if (!formData.weightCategory) {
      newErrors.weightCategory = 'La categoría es obligatoria';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      await onSubmit(formData);
    }
  }, [formData, validate, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6" data-ui="athlete-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Nombre *</label>
          <input
            type="text"
            value={formData.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
            className={`w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30 ${errors.firstName ? 'border-red-500/50' : 'border-white/10'}`}
            placeholder="Nombre"
          />
          {errors.firstName && <p className="mt-1 text-sm text-red-400">{errors.firstName}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Apellidos *</label>
          <input
            type="text"
            value={formData.surname}
            onChange={(e) => updateField('surname', e.target.value)}
            className={`w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30 ${errors.surname ? 'border-red-500/50' : 'border-white/10'}`}
            placeholder="Apellidos"
          />
          {errors.surname && <p className="mt-1 text-sm text-red-400">{errors.surname}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Email *</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            className={`w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30 ${errors.email ? 'border-red-500/50' : 'border-white/10'}`}
            placeholder="email@ejemplo.com"
          />
          {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Teléfono</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30"
            placeholder="+34 600 000 000"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CustomSelector
          label="Sexo *"
          options={SEX_OPTIONS}
          value={formData.sex}
          onChange={(v) => updateField('sex', v as 'Male' | 'Female')}
        />

        <CustomSelector
          label="Categoría de peso *"
          options={categoryOptions}
          value={formData.weightCategory}
          onChange={(v) => updateField('weightCategory', v || '')}
          placeholder="Seleccionar categoría"
          error={errors.weightCategory}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Club</label>
          <input
            type="text"
            value={formData.club}
            onChange={(e) => updateField('club', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30"
            placeholder="Nombre del club"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Marca Total (kg)</label>
          <input
            type="number"
            step="0.1"
            value={formData.totalWeight || ''}
            onChange={(e) => updateField('totalWeight', e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30"
            placeholder="0.0"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DatePicker
          label="Fecha de inscripción"
          value={formData.registrationDate}
          onChange={(v) => updateField('registrationDate', v || new Date().toISOString().split('T')[0])}
        />

        <CustomSelector
          label="Estado"
          options={STATUS_OPTIONS}
          value={formData.status}
          onChange={(v) => updateField('status', v as any)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white/80 mb-1.5">Entrenador (opcional)</label>
        <input
          type="text"
          value={formData.coach}
          onChange={(e) => updateField('coach', e.target.value)}
          className="w-full px-4 py-3 min-h-[48px] bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/30"
          placeholder="Nombre del entrenador"
        />
      </div>

      <div className="flex flex-col xs:flex-row justify-end gap-3 pt-4 border-t border-white/10">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10">
            Cancelar
          </Button>
        )}
        <Button type="submit" isLoading={isLoading} className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0 shadow-lg shadow-red-accent/20">
          {initialData ? 'Guardar cambios' : 'Crear inscripción'}
        </Button>
      </div>
    </form>
  );
}

export default AthleteForm;