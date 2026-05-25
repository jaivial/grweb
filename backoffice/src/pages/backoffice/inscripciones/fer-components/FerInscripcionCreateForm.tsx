import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { Button } from '../../../../components/ui';
import { CheckCircle, ChevronDown } from 'lucide-react';

const DEFAULT_MEN_CATEGORIES = ['-53', '-59', '-66', '-74', '-83', '-93', '-105', '-120', '+120'] as const;
const DEFAULT_WOMEN_CATEGORIES = ['-43', '-47', '-52', '-57', '-63', '-69', '-76', '-84', '+84'] as const;

const EXPERIENCE_LEVELS = ['rookie', 'principiante', 'intermedio', 'avanzado'] as const;
const EXPERIENCE_LABELS: Record<string, string> = {
  rookie: 'Rookie',
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};
const EXPERIENCE_DESCRIPTIONS: Record<string, string> = {
  rookie: 'Es mi primera competición y nunca he hecho una toma de marcas',
  principiante: 'He hecho alguna toma de marcas y he competido en al menos un AEP3',
  intermedio: 'He competido en varios AEP3 o al menos un AEP3 y un AEP2',
  avanzado: 'He competido en más de 10 AEP2 y al menos un AEP1',
};

const MODALIDAD_VALUES = ['completa', 'solo_banca', 'solo_peso_muerto'] as const;
const MODALIDAD_LABELS: Record<string, string> = {
  completa: 'Competición completa',
  solo_banca: 'Solo banca',
  solo_peso_muerto: 'Solo peso muerto',
};
const MODALIDAD_DESCRIPTIONS: Record<string, string> = {
  completa: 'Sentadilla, press de banca y peso muerto',
  solo_banca: 'Solo registra intentos de press de banca',
  solo_peso_muerto: 'Solo registra intentos de peso muerto',
};

interface FerInscripcionCreateFormProps {
  onSubmit: (data: any) => Promise<void>;
  isLoading: boolean;
}

export function FerInscripcionCreateForm({
  onSubmit,
  isLoading,
}: FerInscripcionCreateFormProps): JSX.Element {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    instagram: '',
    telefono: '',
    sexo: '',
    categoriaPeso: '',
    modalidad: 'completa',
    experiencia: 'principiante',
    quiereHandler: false,
    quierePeakProgram: false,
    paymentMethod: 'efectivo',
    aceptaTerminos: false,
  });

  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    }
    if (categoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [categoryDropdownOpen]);

  // Categories filtered by selected sex
  const availableCategories = useMemo<string[]>(
    () => {
      const cats = formData.sexo === 'masculino'
        ? [...DEFAULT_MEN_CATEGORIES]
        : [...DEFAULT_WOMEN_CATEGORIES];
      return cats;
    },
    [formData.sexo]
  );

  // Reset categoriaPeso when sexo changes
  useEffect(() => {
    if (formData.categoriaPeso && !availableCategories.includes(formData.categoriaPeso)) {
      setFormData(prev => ({ ...prev, categoriaPeso: '' }));
    }
  }, [formData.sexo]);

  const handleChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sexo || !formData.categoriaPeso) {
      return;
    }
    onSubmit({ ...formData, peakProgram: formData.quierePeakProgram });
  }, [formData, onSubmit]);

  const setSexo = useCallback((sex: string) => {
    handleChange('sexo', sex);
    setCategoryDropdownOpen(false);
  }, [handleChange]);

  const setExperiencia = useCallback((exp: string) => {
    handleChange('experiencia', exp);
  }, [handleChange]);

  const setModalidad = useCallback((modalidad: string) => {
    handleChange('modalidad', modalidad);
  }, [handleChange]);

  const selectCategory = useCallback((cat: string) => {
    handleChange('categoriaPeso', cat);
    setCategoryDropdownOpen(false);
  }, [handleChange]);

  const toggleDropdown = useCallback(() => {
    setCategoryDropdownOpen(prev => !prev);
  }, []);

  const toggleSwitch = useCallback((field: string) => {
    setFormData(prev => ({ ...prev, [field]: !(prev as any)[field] }));
  }, []);

  const isFormValid = formData.nombre && formData.email && formData.sexo && formData.categoriaPeso && formData.modalidad;

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-ui="fer-create-form">
      {/* ── Grid Fields ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-ui="fer-create-grid">
        {/* Nombre */}
        <div data-ui="fer-create-nombre">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Nombre completo *</label>
          <input
            type="text"
            value={formData.nombre}
            onChange={(e) => handleChange('nombre', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
            data-ui="fer-create-nombre-input"
            placeholder="Nombre y apellidos"
            required
          />
        </div>

        {/* Email */}
        <div data-ui="fer-create-email">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Email *</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
            data-ui="fer-create-email-input"
            placeholder="correo@ejemplo.com"
            required
          />
        </div>

        {/* Telefono */}
        <div data-ui="fer-create-telefono">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Teléfono</label>
          <input
            type="text"
            value={formData.telefono}
            onChange={(e) => handleChange('telefono', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
            data-ui="fer-create-telefono-input"
            placeholder="+34 600 000 000"
          />
        </div>

        {/* Instagram */}
        <div data-ui="fer-create-instagram">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Instagram</label>
          <div className="relative" data-ui="fer-create-instagram-wrapper">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" data-ui="fer-create-instagram-at">@</span>
            <input
              type="text"
              value={formData.instagram}
              onChange={(e) => handleChange('instagram', e.target.value)}
              className="w-full pl-9 pr-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
              data-ui="fer-create-instagram-input"
              placeholder="usuario"
            />
          </div>
        </div>
      </div>

      {/* ── Sexo ── */}
      <div data-ui="fer-create-sexo">
        <label className="block text-sm font-semibold text-white/60 mb-2.5">Sexo *</label>
        <div className="grid grid-cols-2 gap-3" data-ui="fer-create-sexo-grid">
          {(['masculino', 'femenino'] as const).map((sex) => {
            const isActive = formData.sexo === sex;
            return (
              <button
                key={sex}
                type="button"
                onClick={() => setSexo(sex)}
                className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${
                  isActive
                    ? 'bg-red-accent/80 text-white shadow-lg scale-[1.02]'
                    : 'bg-white/5 text-white/50 hover:bg-white/[0.08]'
                }`}
                data-ui={`fer-create-sexo-btn-${sex}`}
                data-active={isActive ? 'true' : 'false'}
                aria-pressed={isActive}
              >
                {sex === 'masculino' ? 'Masculino' : 'Femenino'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Categoria de Peso (Dropdown) ── */}
      <div data-ui="fer-create-categoria" ref={categoryDropdownRef}>
        <label className="block text-sm font-semibold text-white/60 mb-1.5">Categoría de peso *</label>
        <div className="relative" data-ui="fer-create-categoria-wrapper">
          <button
            type="button"
            onClick={toggleDropdown}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-left flex items-center justify-between transition-all duration-200 focus:outline-none focus:border-red-accent/50 focus:border-2"
            data-ui="fer-create-categoria-trigger"
          >
            <span className={formData.categoriaPeso ? 'text-white' : 'text-white/40'} data-ui="fer-create-categoria-selected">
              {formData.categoriaPeso ? `${formData.categoriaPeso} kg` : 'Selecciona categoría'}
            </span>
            <ChevronDown
              size={18}
              className={`text-white/40 transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`}
              data-ui="fer-create-categoria-chevron"
              aria-hidden="true"
            />
          </button>
          {categoryDropdownOpen && (
            <div
              className="absolute z-20 w-full mt-1 py-1 rounded-xl overflow-hidden bg-gray-800 border border-white/10 shadow-xl"
              data-ui="fer-create-categoria-dropdown"
            >
              {availableCategories.map((cat) => {
                const isSelected = formData.categoriaPeso === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => selectCategory(cat)}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      isSelected ? 'font-semibold text-white bg-red-accent/20' : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                    data-ui={`fer-create-categoria-option-${cat}`}
                  >
                    {cat} kg
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modalidad ── */}
      <div data-ui="fer-create-modalidad">
        <label className="block text-sm font-semibold text-white/60 mb-2.5">Modalidad *</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-ui="fer-create-modalidad-grid">
          {MODALIDAD_VALUES.map((modalidad) => {
            const isActive = formData.modalidad === modalidad;
            return (
              <button
                key={modalidad}
                type="button"
                onClick={() => setModalidad(modalidad)}
                className={`px-4 py-3 rounded-xl text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${
                  isActive
                    ? 'bg-red-accent/80 text-white shadow-lg scale-[1.02]'
                    : 'bg-white/5 text-white/50 hover:bg-white/[0.08]'
                }`}
                data-ui={`fer-create-modalidad-btn-${modalidad}`}
                data-active={isActive ? 'true' : 'false'}
                aria-pressed={isActive}
              >
                <span className="block text-sm font-semibold" data-ui={`fer-create-modalidad-label-${modalidad}`}>
                  {MODALIDAD_LABELS[modalidad]}
                </span>
                <span className="block text-xs mt-1 opacity-70" data-ui={`fer-create-modalidad-desc-${modalidad}`}>
                  {MODALIDAD_DESCRIPTIONS[modalidad]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Experiencia (Buttons) ── */}
      <div data-ui="fer-create-experiencia">
        <label className="block text-sm font-semibold text-white/60 mb-2.5">Experiencia</label>
        <div className="grid grid-cols-2 gap-2.5" data-ui="fer-create-experiencia-grid">
          {EXPERIENCE_LEVELS.map((exp) => {
            const isActive = formData.experiencia === exp;
            return (
              <button
                key={exp}
                type="button"
                onClick={() => setExperiencia(exp)}
                className={`px-3 py-3 rounded-xl font-semibold text-sm transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${
                  isActive
                    ? 'bg-red-accent/80 text-white shadow-lg scale-[1.02]'
                    : 'bg-white/5 text-white/50 hover:bg-white/[0.08]'
                }`}
                data-ui={`fer-create-experiencia-btn-${exp}`}
                data-active={isActive ? 'true' : 'false'}
                aria-pressed={isActive}
              >
                <span className="block" data-ui={`fer-create-experiencia-label-${exp}`}>
                  {EXPERIENCE_LABELS[exp]}
                </span>
                <span
                  className="block text-xs mt-0.5 font-normal leading-tight opacity-70"
                  data-ui={`fer-create-experiencia-desc-${exp}`}
                >
                  {EXPERIENCE_DESCRIPTIONS[exp]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Toggle Switches Row ── */}
      <div className="space-y-3" data-ui="fer-create-toggles">
        {/* Quiere Handler */}
        <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-create-handler">
          <div data-ui="fer-create-handler-info">
            <p className="text-sm font-semibold text-white/80">Handler GR Strength</p>
            <p className="text-xs text-white/50">Servicio de acompañamiento el día del evento</p>
          </div>
          <button
            type="button"
            onClick={() => toggleSwitch('quiereHandler')}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
              formData.quiereHandler ? 'bg-red-accent/80' : 'bg-gray-600'
            }`}
            data-ui="fer-create-handler-toggle"
            role="switch"
            aria-checked={formData.quiereHandler}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                formData.quiereHandler ? 'translate-x-7' : 'translate-x-1'
              }`}
              data-ui="fer-create-handler-knob"
            />
          </button>
        </div>

        {/* Quiere Peak Program */}
        <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-create-peakprogram">
          <div data-ui="fer-create-peakprogram-info">
            <p className="text-sm font-semibold text-white/80">Peak Program</p>
            <p className="text-xs text-white/50">Programa de peak semanal personalizado</p>
          </div>
          <button
            type="button"
            onClick={() => toggleSwitch('quierePeakProgram')}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
              formData.quierePeakProgram ? 'bg-red-accent/80' : 'bg-gray-600'
            }`}
            data-ui="fer-create-peakprogram-toggle"
            role="switch"
            aria-checked={formData.quierePeakProgram}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                formData.quierePeakProgram ? 'translate-x-7' : 'translate-x-1'
              }`}
              data-ui="fer-create-peakprogram-knob"
            />
          </button>
        </div>

      </div>

      {/* ── Acepta Términos (Checkbox) ── */}
      <div data-ui="fer-create-payment-method">
        <label className="block text-sm font-semibold text-white/60 mb-1.5" data-ui="fer-create-payment-method-label">
          Método de pago
        </label>
        <select
          value={formData.paymentMethod}
          onChange={(e) => handleChange('paymentMethod', e.target.value)}
          className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
          data-ui="fer-create-payment-method-select"
        >
          <option value="efectivo" data-ui="fer-create-payment-method-efectivo">Efectivo</option>
          <option value="stripe" data-ui="fer-create-payment-method-stripe">Stripe</option>
        </select>
      </div>

      {/* ── Acepta Términos (Checkbox) ── */}
      <div data-ui="fer-create-terminos">
        <label
          className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl bg-white/[0.03] border border-white/5"
          htmlFor="fer-create-acepta-terminos"
          data-ui="fer-create-terminos-label"
        >
          <div className="relative mt-0.5" data-ui="fer-create-terminos-checkbox-wrapper">
            <input
              id="fer-create-acepta-terminos"
              type="checkbox"
              checked={formData.aceptaTerminos}
              onChange={() => toggleSwitch('aceptaTerminos')}
              className="sr-only"
              data-ui="fer-create-terminos-input"
            />
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 ${
                formData.aceptaTerminos
                  ? 'bg-red-accent/80 shadow-md shadow-red-accent/30'
                  : 'bg-gray-600 border border-gray-500'
              }`}
              data-ui="fer-create-terminos-checkbox"
            >
              {formData.aceptaTerminos && (
                <CheckCircle size={14} className="text-white" data-ui="fer-create-terminos-check" aria-hidden="true" />
              )}
            </div>
          </div>
          <span className="text-sm leading-relaxed text-white/60" data-ui="fer-create-terminos-text">
            Acepta términos y condiciones y política de privacidad
          </span>
        </label>
      </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pt-2" data-ui="fer-create-actions">
        <Button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="min-h-[44px] bg-red-accent/90 hover:bg-red-accent text-white border-0"
          data-ui="fer-create-submit-btn"
        >
          {isLoading ? 'Creando...' : 'Crear inscripción'}
        </Button>
      </div>
    </form>
  );
}
