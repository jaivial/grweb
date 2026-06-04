import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2, Zap, AlertCircle, ChevronDown, Shield, Percent, X } from 'lucide-react';
import clsx from 'clsx';
import {
  FER_COLORS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_DESCRIPTIONS,
  EXPERIENCE_LABELS,
  MODALIDAD_VALUES,
  MODALIDAD_LABELS,
  MODALIDAD_DESCRIPTIONS,
  MODALIDAD_LIFTS,
  type Experiencia,
  type Modalidad,
} from '../constants';
import type { UseFerInscripcionReturn } from '../hooks/useFerInscripcion';
import { DuplicateEmailPanel } from './DuplicateEmailPanel';

// Default weight categories (fallback if config not loaded)
const DEFAULT_MEN_CATEGORIES = ['-53', '-59', '-66', '-74', '-83', '-93', '-105', '-120', '+120'] as const;
const DEFAULT_WOMEN_CATEGORIES = ['-43', '-47', '-52', '-57', '-63', '-69', '-76', '-84', '+84'] as const;

interface InscripcionFormProps {
  hook: UseFerInscripcionReturn;
  plazasDisponibles: number;
  precioBase?: number;
  categoriasMasculino?: string[];
  categoriasFemenino?: string[];
  contactEmail?: string;
  precioPeakProgram?: number;
  fechaLimitePeakProgram?: string | null;
  cuponesDescuentoActivo?: boolean;
  onSubmit: () => void;
}

export function InscripcionForm({ hook, plazasDisponibles, precioBase, categoriasMasculino, categoriasFemenino, contactEmail, precioPeakProgram, fechaLimitePeakProgram, cuponesDescuentoActivo = false, onSubmit }: InscripcionFormProps) {
  const {
    formData,
    errors,
    isSubmitting,
    isFormSubmittable,
    isDuplicateEmail,
    couponCode,
    appliedCoupon,
    couponError,
    isValidatingCoupon,
    clearDuplicateEmail,
    updateField,
    applyCoupon,
    removeCoupon,
    setCouponCode,
  } = hook;

  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
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

  // Categories filtered by selected sex (use config categories if available, fallback to defaults)
  const availableCategories = useMemo(
    () => {
      const cats = formData.sexo === 'masculino' 
        ? (categoriasMasculino?.length ? categoriasMasculino : [...DEFAULT_MEN_CATEGORIES])
        : (categoriasFemenino?.length ? categoriasFemenino : [...DEFAULT_WOMEN_CATEGORIES]);
      return [...cats];
    },
    [formData.sexo, categoriasMasculino, categoriasFemenino]
  );

  // Reset categoriaPeso when sexo changes
  useEffect(() => {
    updateField('categoriaPeso', '');
  }, [formData.sexo, updateField]);

  const isAgotado = plazasDisponibles <= 0;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    },
    [onSubmit]
  );

  const inputChange = useCallback(
    <K extends keyof typeof formData>(field: K) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value =
          field === 'aceptaTerminos'
            ? (e.target as HTMLInputElement).checked
            : e.target.value;
        updateField(field, value as (typeof formData)[K]);
      },
    [updateField]
  );

  const setSexo = useCallback((sex: 'masculino' | 'femenino') => updateField('sexo', sex), [updateField]);
  const setModalidad = useCallback((modalidad: Modalidad) => updateField('modalidad', modalidad), [updateField]);
  const setExperiencia = useCallback((exp: Experiencia) => updateField('experiencia', exp), [updateField]);
  const selectCategory = useCallback((cat: string) => { updateField('categoriaPeso', cat); setCategoryDropdownOpen(false); }, [updateField]);
  const toggleDropdown = useCallback(() => setCategoryDropdownOpen(prev => !prev), []);
  const toggleHandler = useCallback(() => updateField('quiereHandler', !formData.quiereHandler), [formData.quiereHandler, updateField]);
  const togglePeakProgram = useCallback(() => updateField('peakProgram', !formData.peakProgram), [formData.peakProgram, updateField]);
  const toggleTerminos = useCallback((e: React.ChangeEvent<HTMLInputElement>) => updateField('aceptaTerminos', e.target.checked), [updateField]);
  const toggleCouponOpen = useCallback(() => setCouponOpen((prev) => !prev), []);
  const handleCouponChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = e.target.value;
      if (appliedCoupon) {
        removeCoupon();
      }
      setCouponCode(nextValue);
    },
    [appliedCoupon, removeCoupon, setCouponCode]
  );
  const handleApplyCoupon = useCallback(() => {
    void applyCoupon('fer');
  }, [applyCoupon]);
  const subtotalPreview = useMemo(
    () => (precioBase ?? 0) + (formData.peakProgram ? precioPeakProgram ?? 0 : 0),
    [formData.peakProgram, precioBase, precioPeakProgram]
  );
  const finalPreview = appliedCoupon?.total ?? subtotalPreview;

  const inputStyle = useMemo(
    () => ({
      backgroundColor: FER_COLORS.bgCard,
      color: FER_COLORS.text,
    }),
    []
  );

  const inputClass = useCallback(
    (fieldName: string) =>
      `w-full px-4 py-3.5 rounded-xl outline-none transition-all duration-200 border-2 focus:border-fer-accent/60 placeholder-gray-500 ${
        errors[fieldName] ? 'border-red-500/80' : 'border-transparent'
      }`,
    [errors]
  );

  return (
    <section
      id="fer-inscripcion"
      className="py-20 sm:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="fer-inscripcion-section"
    >
      <div className="max-w-xl mx-auto" data-ui="fer-inscripcion-container">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 sm:mb-12"
          data-ui="fer-inscripcion-header"
        >
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="fer-inscripcion-title"
          >
            <span style={{ color: FER_COLORS.accent }} data-ui="fer-inscripcion-title-highlight">
              Inscríbete
            </span>{' '}
            ahora
          </h2>

          {/* Plazas badge */}
          <div className="flex items-center justify-center" data-ui="fer-inscripcion-plazas">
            <div
              className={clsx('px-5 py-2 rounded-full text-sm font-semibold border', {
                'animate-pulse': plazasDisponibles <= 10 && plazasDisponibles > 0,
              })}
              style={{
                backgroundColor: plazasDisponibles > 20 ? `${FER_COLORS.green}15` : `${FER_COLORS.gold}15`,
                color: plazasDisponibles > 20 ? FER_COLORS.green : FER_COLORS.gold,
                borderColor: plazasDisponibles > 20 ? `${FER_COLORS.green}30` : `${FER_COLORS.gold}30`,
              }}
              data-ui="fer-inscripcion-plazas-badge"
            >
              {isAgotado ? (
                <>
                  <AlertCircle size={16} className="inline mr-1.5" data-ui="fer-inscripcion-agotado-icon" aria-hidden="true" />
                  AGOTADO
                </>
              ) : (
                `${plazasDisponibles} ${plazasDisponibles === 1 ? 'plaza' : 'plazas'} disponibles`
              )}
            </div>
          </div>
        </motion.div>

        {/* Form or Duplicate Email Panel */}
        <AnimatePresence mode="wait">
          {isDuplicateEmail ? (
            <DuplicateEmailPanel
              contactEmail={contactEmail}
              onRetry={clearDuplicateEmail}
            />
          ) : (
            <motion.form
              key="fer-inscripcion-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              onSubmit={handleSubmit}
              className="space-y-5 p-6 sm:p-8 rounded-3xl"
              style={{
                backgroundColor: FER_COLORS.bgDark,
                border: `1px solid ${FER_COLORS.accent}15`,
              }}
              data-ui="fer-inscripcion-form"
              noValidate
            >
              {/* ── Nombre ── */}
              <div data-ui="fer-form-field-nombre">
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: FER_COLORS.text }}
                  htmlFor="fer-nombre"
                  data-ui="fer-form-label-nombre"
                >
                  Nombre completo *
                </label>
                <input
                  id="fer-nombre"
                  type="text"
                  value={formData.nombre}
                  onChange={inputChange('nombre')}
                  className={inputClass('nombre')}
                  style={inputStyle}
                  placeholder="Tu nombre completo"
                  autoComplete="name"
                  disabled={isSubmitting}
                  data-ui="fer-form-input-nombre"
                />
                {errors.nombre && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-nombre">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.nombre}
                  </p>
                )}
              </div>

              {/* ── Email ── */}
              <div data-ui="fer-form-field-email">
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: FER_COLORS.text }}
                  htmlFor="fer-email"
                  data-ui="fer-form-label-email"
                >
                  Email *
                </label>
                <input
                  id="fer-email"
                  type="email"
                  value={formData.email}
                  onChange={inputChange('email')}
                  className={inputClass('email')}
                  style={inputStyle}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  data-ui="fer-form-input-email"
                />
                {errors.email && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-email">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* ── Instagram ── */}
              <div data-ui="fer-form-field-instagram">
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: FER_COLORS.text }}
                  htmlFor="fer-instagram"
                  data-ui="fer-form-label-instagram"
                >
                  Instagram (opcional)
                </label>
                <div className="relative" data-ui="fer-form-instagram-wrapper">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2"
                    style={{ color: FER_COLORS.textMuted }}
                    data-ui="fer-form-instagram-at"
                  >
                    @
                  </span>
                  <input
                    id="fer-instagram"
                    type="text"
                    value={formData.instagram}
                    onChange={inputChange('instagram')}
                    className={`w-full pl-9 pr-4 py-3.5 rounded-xl outline-none transition-all duration-200 border-2 border-transparent focus:border-fer-accent/60 placeholder-gray-500`}
                    style={inputStyle}
                    placeholder="usuario"
                    autoComplete="off"
                    disabled={isSubmitting}
                    data-ui="fer-form-input-instagram"
                  />
                </div>
                {errors.instagram && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-instagram">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.instagram}
                  </p>
                )}
              </div>

              {/* ── Telefono ── */}
              <div data-ui="fer-form-field-telefono">
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: FER_COLORS.text }}
                  htmlFor="fer-telefono"
                  data-ui="fer-form-label-telefono"
                >
                  Teléfono *
                </label>
                <input
                  id="fer-telefono"
                  type="tel"
                  value={formData.telefono}
                  onChange={inputChange('telefono')}
                  className={inputClass('telefono')}
                  style={inputStyle}
                  placeholder="+34 600 000 000"
                  autoComplete="tel"
                  disabled={isSubmitting}
                  data-ui="fer-form-input-telefono"
                />
                {errors.telefono && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-telefono">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.telefono}
                  </p>
                )}
              </div>

              {/* ── Sexo ── */}
              <div data-ui="fer-form-field-sexo">
                <label
                  className="block text-sm font-semibold mb-3"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-form-label-sexo"
                >
                  Sexo *
                </label>
                <div className="grid grid-cols-2 gap-3" data-ui="fer-form-sexo-grid">
                  {(['masculino', 'femenino'] as const).map((sex) => {
                    const isActive = formData.sexo === sex;
                    return (
                      <button
                        key={sex}
                        type="button"
                        onClick={() => setSexo(sex)}
                        disabled={isSubmitting}
                        className={clsx(
                          'px-4 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                          isActive && 'scale-[1.02] shadow-lg',
                        )}
                        style={{
                          backgroundColor: isActive ? FER_COLORS.accent : FER_COLORS.bgCard,
                          color: isActive ? FER_COLORS.text : FER_COLORS.textMuted,
                          boxShadow: isActive ? `0 0 20px ${FER_COLORS.accent}30` : 'none',
                        }}
                        data-ui={`fer-form-sexo-btn-${sex}`}
                        data-active={isActive ? 'true' : 'false'}
                        aria-pressed={isActive}
                      >
                        {sex === 'masculino' ? 'Masculino' : 'Femenino'}
                      </button>
                    );
                  })}
                </div>
                {errors.sexo && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-sexo">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.sexo}
                  </p>
                )}
              </div>

              {/* ── Categoria de Peso ── */}
              <div data-ui="fer-form-field-categoria-peso" ref={categoryDropdownRef}>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-form-label-categoria-peso"
                >
                  Categoría de peso *
                </label>
                <div className="relative" data-ui="fer-form-categoria-wrapper">
                  <button
                    type="button"
                    onClick={toggleDropdown}
                    disabled={isSubmitting}
                    className={clsx(
                      'w-full px-4 py-3.5 rounded-xl text-left flex items-center justify-between transition-all duration-200 border-2',
                      errors.categoriaPeso ? 'border-red-500/80' : categoryDropdownOpen ? 'border-fer-accent/60' : 'border-transparent',
                    )}
                    style={{
                      backgroundColor: FER_COLORS.bgCard,
                      color: formData.categoriaPeso ? FER_COLORS.text : FER_COLORS.textMuted,
                    }}
                    data-ui="fer-form-categoria-trigger"
                  >
                    <span data-ui="fer-form-categoria-selected">
                      {formData.categoriaPeso ? `${formData.categoriaPeso} kg` : 'Selecciona categoría'}
                    </span>
                    <ChevronDown
                      size={18}
                      className={clsx('transition-transform duration-200', categoryDropdownOpen && 'rotate-180')}
                      style={{ color: FER_COLORS.textMuted }}
                      data-ui="fer-form-categoria-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {categoryDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute z-20 w-full mt-1 py-1 rounded-xl overflow-hidden"
                      style={{
                        backgroundColor: FER_COLORS.bgCard,
                        border: `1px solid ${FER_COLORS.accent}20`,
                        boxShadow: `0 8px 30px rgba(0,0,0,0.3)`,
                      }}
                      data-ui="fer-form-categoria-dropdown"
                    >
                      {availableCategories.map((cat) => {
                        const isSelected = formData.categoriaPeso === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => selectCategory(cat)}
                            className={clsx(
                              'w-full px-4 py-2.5 text-left text-sm transition-colors',
                              isSelected ? 'font-semibold' : 'hover:bg-white/5',
                            )}
                            style={{
                              color: isSelected ? FER_COLORS.text : FER_COLORS.textMuted,
                              backgroundColor: isSelected ? `${FER_COLORS.accent}20` : 'transparent',
                            }}
                            data-ui={`fer-form-categoria-option-${cat}`}
                          >
                            {cat} kg
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
                {errors.categoriaPeso && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-categoria-peso">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.categoriaPeso}
                  </p>
                )}
              </div>

              {/* ── Modalidad ── */}
              <div data-ui="fer-form-field-modalidad">
                <label
                  className="block text-sm font-semibold mb-3"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-form-label-modalidad"
                >
                  Modalidad *
                </label>
                <div className="grid grid-cols-1 gap-3" data-ui="fer-form-modalidad-grid">
                  {MODALIDAD_VALUES.map((modalidad) => {
                    const isActive = formData.modalidad === modalidad;
                    return (
                      <button
                        key={modalidad}
                        type="button"
                        onClick={() => setModalidad(modalidad)}
                        disabled={isSubmitting}
                        className={clsx(
                          'px-4 py-4 rounded-xl text-left transition-all duration-200 border',
                          'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                          isActive && 'scale-[1.01] shadow-lg',
                        )}
                        style={{
                          backgroundColor: isActive ? `${FER_COLORS.accent}22` : FER_COLORS.bgCard,
                          borderColor: isActive ? `${FER_COLORS.accent}80` : `${FER_COLORS.accent}12`,
                          boxShadow: isActive ? `0 0 22px ${FER_COLORS.accent}24` : 'none',
                        }}
                        data-ui={`fer-form-modalidad-btn-${modalidad}`}
                        data-active={isActive ? 'true' : 'false'}
                        aria-pressed={isActive}
                      >
                        <span
                          className="block text-sm font-bold"
                          style={{ color: isActive ? FER_COLORS.text : FER_COLORS.textMuted }}
                          data-ui={`fer-form-modalidad-label-${modalidad}`}
                        >
                          {MODALIDAD_LABELS[modalidad]}
                        </span>
                        <span
                          className="block text-xs mt-1 font-semibold uppercase tracking-[0.18em]"
                          style={{ color: FER_COLORS.gold }}
                          data-ui={`fer-form-modalidad-lifts-${modalidad}`}
                        >
                          {MODALIDAD_LIFTS[modalidad]}
                        </span>
                        <span
                          className="block text-xs mt-1.5 leading-relaxed"
                          style={{ color: FER_COLORS.textMuted }}
                          data-ui={`fer-form-modalidad-desc-${modalidad}`}
                        >
                          {MODALIDAD_DESCRIPTIONS[modalidad]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors.modalidad && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-modalidad">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.modalidad}
                  </p>
                )}
              </div>

              {/* ── Experiencia ── */}
              <div data-ui="fer-form-field-experiencia">
                <label
                  className="block text-sm font-semibold mb-3"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-form-label-experiencia"
                >
                  Experiencia *
                </label>
                <div className="grid grid-cols-2 gap-2.5" data-ui="fer-form-experiencia-grid">
                  {EXPERIENCE_LEVELS.map((exp) => {
                    const isActive = formData.experiencia === exp;
                    return (
                      <button
                        key={exp}
                        type="button"
                        onClick={() => setExperiencia(exp)}
                        disabled={isSubmitting}
                        className={clsx(
                          'px-3 py-3 rounded-xl font-semibold text-sm transition-all duration-200 text-left',
                          'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                          isActive && 'scale-[1.02] shadow-lg',
                        )}
                        style={{
                          backgroundColor: isActive ? FER_COLORS.accent : FER_COLORS.bgCard,
                          color: isActive ? FER_COLORS.text : FER_COLORS.textMuted,
                          boxShadow: isActive ? `0 0 20px ${FER_COLORS.accent}30` : 'none',
                        }}
                        data-ui={`fer-form-experiencia-btn-${exp}`}
                        data-active={isActive ? 'true' : 'false'}
                        aria-pressed={isActive}
                      >
                        <span className="block" data-ui={`fer-form-experiencia-label-${exp}`}>
                          {EXPERIENCE_LABELS[exp]}
                        </span>
                        <span
                          className="block text-xs mt-0.5 font-normal leading-tight"
                          style={{ color: isActive ? FER_COLORS.text : FER_COLORS.textMuted, opacity: 0.8 }}
                          data-ui={`fer-form-experiencia-desc-${exp}`}
                        >
                          {EXPERIENCE_DESCRIPTIONS[exp]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors.experiencia && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1" data-ui="fer-form-error-experiencia">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.experiencia}
                  </p>
                )}
              </div>

              {/* ── Handler Service ── */}
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: FER_COLORS.bgCard }}
                data-ui="fer-form-field-handler"
              >
                <div className="flex items-center justify-between mb-2" data-ui="fer-form-handler-header">
                  <div data-ui="fer-form-handler-info">
                    <div className="flex items-center gap-2" data-ui="fer-form-handler-title-row">
                      <Shield size={16} style={{ color: FER_COLORS.accent }} data-ui="fer-form-handler-icon" aria-hidden="true" />
                      <p className="font-semibold" style={{ color: FER_COLORS.text }} data-ui="fer-form-handler-question">
                        Handler GR Strength
                      </p>
                    </div>
                    <p className="text-sm mt-0.5" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-handler-hint">
                      Servicio de acompañamiento el día del evento — <strong style={{ color: FER_COLORS.green }}>gratuito</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleHandler}
                    disabled={isSubmitting}
                    className={clsx(
                      'w-14 h-8 rounded-full transition-all duration-300 relative flex-shrink-0',
                      formData.quiereHandler ? 'bg-green-500' : 'bg-gray-600',
                      'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                    )}
                    data-ui="fer-form-handler-toggle"
                    role="switch"
                    aria-checked={formData.quiereHandler}
                    aria-label="Handler GR Strength"
                  >
                    <motion.div
                      className="absolute top-1 w-6 h-6 rounded-full bg-white shadow-md"
                      animate={{ left: formData.quiereHandler ? 'calc(100% - 28px)' : '4px' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      data-ui="fer-form-handler-toggle-knob"
                    />
                  </button>
                </div>
              </div>

              {/* ── GRS Peak Program ── */}
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: FER_COLORS.bgCard }}
                data-ui="fer-form-field-peak-program"
              >
                <div className="flex items-start justify-between gap-4" data-ui="fer-form-peak-header">
                  <div data-ui="fer-form-peak-info">
                    <div className="flex items-center gap-2" data-ui="fer-form-peak-title-row">
                      <Zap size={16} style={{ color: FER_COLORS.accent }} data-ui="fer-form-peak-icon" aria-hidden="true" />
                      <p className="font-semibold" style={{ color: FER_COLORS.text }} data-ui="fer-form-peak-title">
                        GRS Peak Program
                      </p>
                    </div>
                    <p className="text-sm mt-0.5" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-peak-desc">
                      Programamos tu entrenamiento hasta el evento
                    </p>
                    {precioPeakProgram !== undefined && precioPeakProgram > 0 && (
                      <p className="text-xs mt-2 font-semibold" style={{ color: FER_COLORS.gold }} data-ui="fer-form-peak-price">
                        {precioPeakProgram} EUR
                      </p>
                    )}
                    {fechaLimitePeakProgram && (
                      <p className="text-xs mt-0.5" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-peak-date">
                        Límite: {new Date(fechaLimitePeakProgram).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={togglePeakProgram}
                    disabled={isSubmitting}
                    className={clsx(
                      'w-14 h-8 rounded-full transition-all duration-300 relative flex-shrink-0 mt-1',
                      formData.peakProgram ? 'bg-green-500' : 'bg-gray-600',
                      'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                    )}
                    data-ui="fer-form-peak-toggle"
                    role="switch"
                    aria-checked={formData.peakProgram}
                    aria-label="GRS Peak Program"
                  >
                    <motion.div
                      className="absolute top-1 w-6 h-6 rounded-full bg-white shadow-md"
                      animate={{ left: formData.peakProgram ? 'calc(100% - 28px)' : '4px' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      data-ui="fer-form-peak-toggle-knob"
                    />
                  </button>
                </div>
                {formData.peakProgram && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 p-3 rounded-lg text-sm leading-relaxed"
                    style={{
                      backgroundColor: `${FER_COLORS.accent}10`,
                      color: FER_COLORS.textMuted,
                      border: `1px solid ${FER_COLORS.accent}20`,
                    }}
                    data-ui="fer-form-peak-message"
                  >
                    Te ayudaremos a prepararte con un plan de entrenamiento personalizado hasta el día del evento. Al activar esta opción, añadirás el <strong style={{ color: FER_COLORS.gold }}>{precioPeakProgram} EUR</strong> del Peak Program a tu inscripción.
                  </motion.div>
                )}
              </div>

              {cuponesDescuentoActivo && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: FER_COLORS.bgCard, border: `1px solid ${FER_COLORS.accent}18` }}
                  data-ui="fer-form-coupon-card"
                >
                  <button
                    type="button"
                    onClick={toggleCouponOpen}
                    disabled={isSubmitting}
                    className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-fer-accent/50 disabled:opacity-60"
                    data-ui="fer-form-coupon-toggle"
                    aria-expanded={couponOpen}
                  >
                    <span className="flex items-center gap-3" data-ui="fer-form-coupon-toggle-copy">
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${FER_COLORS.gold}18` }}
                        data-ui="fer-form-coupon-icon-bg"
                      >
                        <Percent size={18} style={{ color: FER_COLORS.gold }} data-ui="fer-form-coupon-icon" aria-hidden="true" />
                      </span>
                      <span data-ui="fer-form-coupon-title-wrap">
                        <span className="block text-sm font-semibold" style={{ color: FER_COLORS.text }} data-ui="fer-form-coupon-title">
                          Tengo un cupón
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-coupon-subtitle">
                          Se aplicará al total de inscripción y extras
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      size={18}
                      className={clsx('transition-transform duration-200', couponOpen && 'rotate-180')}
                      style={{ color: FER_COLORS.textMuted }}
                      data-ui="fer-form-coupon-chevron"
                      aria-hidden="true"
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {couponOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        data-ui="fer-form-coupon-panel"
                      >
                        <div className="px-4 pb-4 space-y-3" data-ui="fer-form-coupon-panel-inner">
                          <div className="flex flex-col sm:flex-row gap-2" data-ui="fer-form-coupon-input-row">
                            <input
                              id="fer-coupon-code"
                              type="text"
                              value={couponCode}
                              onChange={handleCouponChange}
                              maxLength={200}
                              className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200 border-2 border-transparent focus:border-fer-accent/60 placeholder-gray-500"
                              style={inputStyle}
                              placeholder="Escribe tu cupón"
                              disabled={isSubmitting || isValidatingCoupon}
                              data-ui="fer-form-coupon-input"
                            />
                            <button
                              type="button"
                              onClick={handleApplyCoupon}
                              disabled={isSubmitting || isValidatingCoupon || !couponCode.trim()}
                              className="min-h-[48px] px-5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-fer-gold/50 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                              style={{ backgroundColor: FER_COLORS.gold, color: FER_COLORS.bgDark }}
                              data-ui="fer-form-coupon-apply"
                            >
                              {isValidatingCoupon ? (
                                <Loader2 size={16} className="animate-spin" data-ui="fer-form-coupon-spinner" aria-hidden="true" />
                              ) : null}
                              <span data-ui="fer-form-coupon-apply-text">Aplicar</span>
                            </button>
                          </div>

                          {couponError && (
                            <p className="text-red-400 text-sm flex items-center gap-1" data-ui="fer-form-coupon-error">
                              <AlertCircle size={14} data-ui="fer-form-coupon-error-icon" aria-hidden="true" />
                              <span data-ui="fer-form-coupon-error-text">{couponError}</span>
                            </p>
                          )}

                          {appliedCoupon && (
                            <div
                              className="rounded-xl p-3"
                              style={{ backgroundColor: `${FER_COLORS.green}10`, border: `1px solid ${FER_COLORS.green}25` }}
                              data-ui="fer-form-coupon-success"
                            >
                              <div className="flex items-start justify-between gap-3" data-ui="fer-form-coupon-success-header">
                                <div data-ui="fer-form-coupon-success-copy">
                                  <p className="text-sm font-bold" style={{ color: FER_COLORS.green }} data-ui="fer-form-coupon-success-title">
                                    Cupón aplicado: {appliedCoupon.codigo}
                                  </p>
                                  <p className="text-xs mt-1" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-coupon-success-detail">
                                    Descuento de {appliedCoupon.importeDescuento.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR sobre {appliedCoupon.subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={removeCoupon}
                                  disabled={isSubmitting}
                                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fer-accent/50 disabled:opacity-50"
                                  data-ui="fer-form-coupon-remove"
                                  aria-label="Quitar cupón"
                                >
                                  <X size={16} style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-coupon-remove-icon" aria-hidden="true" />
                                </button>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3" data-ui="fer-form-coupon-total-row">
                                <span className="text-xs uppercase tracking-[0.16em] font-bold" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-coupon-total-label">
                                  Total final
                                </span>
                                <span className="text-lg font-black" style={{ color: FER_COLORS.gold }} data-ui="fer-form-coupon-total-value">
                                  {finalPreview.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── Términos ── */}
              <div data-ui="fer-form-field-terminos">
                <label
                  className="flex items-start gap-3 cursor-pointer group"
                  htmlFor="fer-acepta-terminos"
                  data-ui="fer-form-terminos-label"
                >
                  <div className="relative mt-0.5" data-ui="fer-form-terminos-checkbox-wrapper">
                    <input
                      id="fer-acepta-terminos"
                      type="checkbox"
                      checked={formData.aceptaTerminos}
                      onChange={toggleTerminos}
                      disabled={isSubmitting}
                      className="sr-only"
                      data-ui="fer-form-terminos-input"
                    />
                    <div
                      className={clsx(
                        'w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200',
                        formData.aceptaTerminos
                          ? 'bg-fer-accent shadow-md shadow-fer-accent/30'
                          : 'bg-gray-600 border border-gray-500',
                      )}
                      data-ui="fer-form-terminos-checkbox"
                    >
                      {formData.aceptaTerminos && (
                        <CheckCircle size={14} className="text-white" data-ui="fer-form-terminos-check" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: FER_COLORS.textMuted }} data-ui="fer-form-terminos-text">
                    Acepto los{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-fer-glow transition-colors"
                      style={{ color: FER_COLORS.accent }}
                      data-ui="fer-form-terminos-link-terms"
                    >
                      términos y condiciones
                    </a>{' '}
                    y la{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-fer-glow transition-colors"
                      style={{ color: FER_COLORS.accent }}
                      data-ui="fer-form-terminos-link-privacy"
                    >
                      política de privacidad
                    </a>
                  </span>
                </label>
                {errors.aceptaTerminos && (
                  <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1 ml-9" data-ui="fer-form-error-terminos">
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.aceptaTerminos}
                  </p>
                )}
              </div>

              {/* ── Submit ── */}
              <motion.button
                type="submit"
                disabled={isAgotado || isSubmitting || !isFormSubmittable}
                className={clsx(
                  'w-full py-4 rounded-xl font-bold text-lg transition-all duration-300',
                  'flex items-center justify-center gap-2.5',
                  'focus:outline-none focus:ring-2 focus:ring-fer-accent/50',
                  !isAgotado && !isSubmitting && isFormSubmittable && 'hover:scale-[1.015] active:scale-[0.985]',
                  (isAgotado || !isFormSubmittable) && 'opacity-50 cursor-not-allowed',
                )}
                style={{
                  backgroundColor: !isAgotado && isFormSubmittable ? FER_COLORS.accent : FER_COLORS.bgCard,
                  color: !isAgotado && isFormSubmittable ? FER_COLORS.text : FER_COLORS.textMuted,
                  boxShadow: !isAgotado && isFormSubmittable ? `0 0 30px ${FER_COLORS.accent}35` : 'none',
                }}
                whileTap={!isAgotado && !isSubmitting && isFormSubmittable ? { scale: 0.97 } : undefined}
                data-ui="fer-form-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" data-ui="fer-form-submit-spinner" aria-hidden="true" />
                    Inscribiendo...
                  </>
                ) : isAgotado ? (
                  'AGOTADO'
                ) : !isFormSubmittable ? (
                  'COMPLETA LOS CAMPOS OBLIGATORIOS'
                ) : (
                  <>
                    <Zap size={20} data-ui="fer-form-submit-icon" aria-hidden="true" />
                    CONFIRMAR INSCRIPCIÓN
                  </>
                )}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
