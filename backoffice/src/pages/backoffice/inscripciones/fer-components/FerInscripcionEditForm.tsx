import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { Button } from '../../../../components/ui';
import { CheckCircle, ChevronDown } from 'lucide-react';
import type { Inscripcion } from '../../../../types/api';
import api from '../../../../api/client';
import { useAtomValue } from 'jotai';
import { currentCompeticionAtom } from '../../../../stores/auth.atoms';

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
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const slug = currentCompeticion?.slug ?? '';

  const [formData, setFormData] = useState({
    nombre: inscripcion.nombre || '',
    email: inscripcion.email || '',
    instagram: inscripcion.instagram || '',
    telefono: inscripcion.telefono || '',
    sexo: inscripcion.sexo || '',
    categoriaPeso: inscripcion.categoriaPeso || '',
    modalidad: inscripcion.modalidad || 'completa',
    experiencia: inscripcion.experiencia || 'principiante',
    quiereHandler: inscripcion.quiereHandler ?? false,
    quierePeakProgram: inscripcion.quierePeakProgram ?? false,
    aceptaTerminos: inscripcion.aceptaTerminos ?? false,
    pagoConfirmado: inscripcion.pagoConfirmado ?? false,
    paymentMethod: inscripcion.paymentMethod || 'efectivo',
    participacionConfirmada: inscripcion.participacionConfirmada ?? false,
    notas: inscripcion.notas || '',
  });

  const [activeTab, setActiveTab] = useState<'datos' | 'intentos'>('datos');

  const [liftData, setLiftData] = useState({
    sentadilla1: 0, sentadilla2: 0, sentadilla3: 0,
    banca1: 0, banca2: 0, banca3: 0,
    pesoMuerto1: 0, pesoMuerto2: 0, pesoMuerto3: 0,
  });
  const [liftSaving, setLiftSaving] = useState(false);
  const [liftSaved, setLiftSaved] = useState(false);

  const updateLift = (field: string, value: number) => setLiftData(prev => ({ ...prev, [field]: value }));

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
    onSubmit(formData);
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

  const showSentadilla = formData.modalidad === 'completa';
  const showBanca = formData.modalidad === 'completa' || formData.modalidad === 'solo_banca';
  const showPesoMuerto = formData.modalidad === 'completa' || formData.modalidad === 'solo_peso_muerto';

  // Load existing openers on mount
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

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liftDataRef = useRef(liftData);
  liftDataRef.current = liftData;

  // Auto-save 600ms after user stops typing
  useEffect(() => {
    if (!slug || !inscripcion?.id) return;
    // Skip the initial mount load
    if (liftData.sentadilla1 === 0 && liftData.sentadilla2 === 0 && liftData.sentadilla3 === 0 &&
        liftData.banca1 === 0 && liftData.banca2 === 0 && liftData.banca3 === 0 &&
        liftData.pesoMuerto1 === 0 && liftData.pesoMuerto2 === 0 && liftData.pesoMuerto3 === 0) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      setLiftSaving(true);
      try {
        const result = await api.setFerOpeners(slug, inscripcion.id, liftDataRef.current);
        if (result.success) {
          setLiftSaved(true);
          setTimeout(() => setLiftSaved(false), 3000);
        }
      } catch (err) {
        console.error('Error saving lifts:', err);
      } finally {
        setLiftSaving(false);
      }
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [slug, inscripcion?.id, liftData]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-ui="fer-edit-form">
      {/* ── Tab Headers ── */}
      <div className="flex border-b border-white/10 mb-4" data-ui="fer-edit-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('datos')}
          className={`px-6 py-3 text-sm font-semibold transition-all duration-200 focus:outline-none ${
            activeTab === 'datos'
              ? 'text-red-accent border-b-2 border-red-accent'
              : 'text-white/50 hover:text-white/80'
          }`}
          data-ui="fer-edit-tab-datos"
          data-active={activeTab === 'datos' ? 'true' : 'false'}
        >
          Datos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('intentos')}
          className={`px-6 py-3 text-sm font-semibold transition-all duration-200 focus:outline-none ${
            activeTab === 'intentos'
              ? 'text-red-accent border-b-2 border-red-accent'
              : 'text-white/50 hover:text-white/80'
          }`}
          data-ui="fer-edit-tab-intentos"
          data-active={activeTab === 'intentos' ? 'true' : 'false'}
        >
          Intentos
        </button>
      </div>

      {activeTab === 'datos' &&
        <div className="contents" data-ui="fer-edit-datos-tab">
      {/* ── Grid Fields ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-ui="fer-edit-grid">
        {/* Nombre */}
        <div data-ui="fer-edit-nombre">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Nombre completo</label>
          <input
            type="text"
            value={formData.nombre}
            onChange={(e) => handleChange('nombre', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
            data-ui="fer-edit-nombre-input"
          />
        </div>

        {/* Email */}
        <div data-ui="fer-edit-email">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
            data-ui="fer-edit-email-input"
          />
        </div>

        {/* Telefono */}
        <div data-ui="fer-edit-telefono">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Teléfono</label>
          <input
            type="text"
            value={formData.telefono}
            onChange={(e) => handleChange('telefono', e.target.value)}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
            data-ui="fer-edit-telefono-input"
          />
        </div>

        {/* Instagram */}
        <div data-ui="fer-edit-instagram">
          <label className="block text-sm font-semibold text-white/60 mb-1.5">Instagram</label>
          <div className="relative" data-ui="fer-edit-instagram-wrapper">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" data-ui="fer-edit-instagram-at">@</span>
            <input
              type="text"
              value={formData.instagram}
              onChange={(e) => handleChange('instagram', e.target.value)}
              className="w-full pl-9 pr-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
              data-ui="fer-edit-instagram-input"
            />
          </div>
        </div>
      </div>

      {/* ── Sexo ── */}
      <div data-ui="fer-edit-sexo">
        <label className="block text-sm font-semibold text-white/60 mb-2.5">Sexo</label>
        <div className="grid grid-cols-2 gap-3" data-ui="fer-edit-sexo-grid">
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
                data-ui={`fer-edit-sexo-btn-${sex}`}
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
      <div data-ui="fer-edit-categoria" ref={categoryDropdownRef}>
        <label className="block text-sm font-semibold text-white/60 mb-1.5">Categoría de peso</label>
        <div className="relative" data-ui="fer-edit-categoria-wrapper">
          <button
            type="button"
            onClick={toggleDropdown}
            className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-left flex items-center justify-between transition-all duration-200 focus:outline-none focus:border-red-accent/50 focus:border-2"
            data-ui="fer-edit-categoria-trigger"
          >
            <span className={formData.categoriaPeso ? 'text-white' : 'text-white/40'} data-ui="fer-edit-categoria-selected">
              {formData.categoriaPeso ? `${formData.categoriaPeso} kg` : 'Selecciona categoría'}
            </span>
            <ChevronDown
              size={18}
              className={`text-white/40 transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`}
              data-ui="fer-edit-categoria-chevron"
              aria-hidden="true"
            />
          </button>
          {categoryDropdownOpen && (
            <div
              className="absolute z-20 w-full mt-1 py-1 rounded-xl overflow-hidden bg-gray-800 border border-white/10 shadow-xl"
              data-ui="fer-edit-categoria-dropdown"
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
                    data-ui={`fer-edit-categoria-option-${cat}`}
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
      <div data-ui="fer-edit-modalidad">
        <label className="block text-sm font-semibold text-white/60 mb-2.5">Modalidad</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-ui="fer-edit-modalidad-grid">
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
                data-ui={`fer-edit-modalidad-btn-${modalidad}`}
                data-active={isActive ? 'true' : 'false'}
                aria-pressed={isActive}
              >
                <span className="block text-sm font-semibold" data-ui={`fer-edit-modalidad-label-${modalidad}`}>
                  {MODALIDAD_LABELS[modalidad]}
                </span>
                <span className="block text-xs mt-1 opacity-70" data-ui={`fer-edit-modalidad-desc-${modalidad}`}>
                  {MODALIDAD_DESCRIPTIONS[modalidad]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Experiencia (Buttons) ── */}
      <div data-ui="fer-edit-experiencia">
        <label className="block text-sm font-semibold text-white/60 mb-2.5">Experiencia</label>
        <div className="grid grid-cols-2 gap-2.5" data-ui="fer-edit-experiencia-grid">
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
                data-ui={`fer-edit-experiencia-btn-${exp}`}
                data-active={isActive ? 'true' : 'false'}
                aria-pressed={isActive}
              >
                <span className="block" data-ui={`fer-edit-experiencia-label-${exp}`}>
                  {EXPERIENCE_LABELS[exp]}
                </span>
                <span
                  className="block text-xs mt-0.5 font-normal leading-tight opacity-70"
                  data-ui={`fer-edit-experiencia-desc-${exp}`}
                >
                  {EXPERIENCE_DESCRIPTIONS[exp]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Toggle Switches Row ── */}
      <div className="space-y-3" data-ui="fer-edit-toggles">
        {/* Quiere Handler */}
        <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-edit-handler">
          <div data-ui="fer-edit-handler-info">
            <p className="text-sm font-semibold text-white/80">Handler GR Strength</p>
            <p className="text-xs text-white/50">Servicio de acompañamiento el día del evento</p>
          </div>
          <button
            type="button"
            onClick={() => toggleSwitch('quiereHandler')}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
              formData.quiereHandler ? 'bg-red-accent/80' : 'bg-gray-600'
            }`}
            data-ui="fer-edit-handler-toggle"
            role="switch"
            aria-checked={formData.quiereHandler}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                formData.quiereHandler ? 'translate-x-7' : 'translate-x-1'
              }`}
              data-ui="fer-edit-handler-knob"
            />
          </button>
        </div>

        {/* Quiere Peak Program */}
        <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-edit-peakprogram">
          <div data-ui="fer-edit-peakprogram-info">
            <p className="text-sm font-semibold text-white/80">Peak Program</p>
            <p className="text-xs text-white/50">Programa de peak semanal personalizado</p>
          </div>
          <button
            type="button"
            onClick={() => toggleSwitch('quierePeakProgram')}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
              formData.quierePeakProgram ? 'bg-red-accent/80' : 'bg-gray-600'
            }`}
            data-ui="fer-edit-peakprogram-toggle"
            role="switch"
            aria-checked={formData.quierePeakProgram}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                formData.quierePeakProgram ? 'translate-x-7' : 'translate-x-1'
              }`}
              data-ui="fer-edit-peakprogram-knob"
            />
          </button>
        </div>

      </div>

      {/* ── Acepta Términos (Checkbox) ── */}
      <div data-ui="fer-edit-terminos">
        <label
          className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl bg-white/[0.03] border border-white/5"
          htmlFor="fer-edit-acepta-terminos"
          data-ui="fer-edit-terminos-label"
        >
          <div className="relative mt-0.5" data-ui="fer-edit-terminos-checkbox-wrapper">
            <input
              id="fer-edit-acepta-terminos"
              type="checkbox"
              checked={formData.aceptaTerminos}
              onChange={() => toggleSwitch('aceptaTerminos')}
              className="sr-only"
              data-ui="fer-edit-terminos-input"
            />
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 ${
                formData.aceptaTerminos
                  ? 'bg-red-accent/80 shadow-md shadow-red-accent/30'
                  : 'bg-gray-600 border border-gray-500'
              }`}
              data-ui="fer-edit-terminos-checkbox"
            >
              {formData.aceptaTerminos && (
                <CheckCircle size={14} className="text-white" data-ui="fer-edit-terminos-check" aria-hidden="true" />
              )}
            </div>
          </div>
          <span className="text-sm leading-relaxed text-white/60" data-ui="fer-edit-terminos-text">
            Acepta términos y condiciones y política de privacidad
          </span>
        </label>
      </div>

      {/* ── Pago confirmado toggle ── */}
      <div data-ui="fer-edit-payment-method">
        <label className="block text-sm font-semibold text-white/60 mb-1.5" data-ui="fer-edit-payment-method-label">
          Método de pago
        </label>
        <select
          value={formData.paymentMethod}
          onChange={(e) => handleChange('paymentMethod', e.target.value)}
          className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all"
          data-ui="fer-edit-payment-method-select"
        >
          <option value="efectivo" data-ui="fer-edit-payment-method-efectivo">Efectivo</option>
          <option value="stripe" data-ui="fer-edit-payment-method-stripe">Stripe</option>
        </select>
      </div>

      {/* ── Pago confirmado toggle ── */}
      <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-edit-pago-toggle">
        <button
          type="button"
          onClick={() => toggleSwitch('pagoConfirmado')}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
            formData.pagoConfirmado ? 'bg-green-500' : 'bg-gray-600'
          }`}
          data-ui="fer-edit-pago-button"
          role="switch"
          aria-checked={formData.pagoConfirmado}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
              formData.pagoConfirmado ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-white/70" data-ui="fer-edit-pago-label">
          {formData.pagoConfirmado ? 'Pago confirmado' : 'Pago pendiente'}
        </span>
      </div>

      {/* ── Check-in toggle ── */}
      <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="fer-edit-checkin-toggle">
        <button
          type="button"
          onClick={() => toggleSwitch('participacionConfirmada')}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
            formData.participacionConfirmada ? 'bg-blue-500' : 'bg-gray-600'
          }`}
          data-ui="fer-edit-checkin-button"
          role="switch"
          aria-checked={formData.participacionConfirmada}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
              formData.participacionConfirmada ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-white/70" data-ui="fer-edit-checkin-label">
          {formData.participacionConfirmada ? 'Check-in confirmado' : 'Check-in pendiente'}
        </span>
      </div>

      {/* ── Notas ── */}
      <div data-ui="fer-edit-notas">
        <label className="block text-sm font-semibold text-white/60 mb-1.5">Notas</label>
        <textarea
          value={formData.notas}
          onChange={(e) => handleChange('notas', e.target.value)}
          rows={3}
          className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-red-accent/50 focus:border-2 transition-all resize-none"
          data-ui="fer-edit-notas-input"
        />
      </div>

      </div>
}

      {activeTab === 'intentos' && 
        <div className="space-y-5" data-ui="fer-edit-intentos">
          <div className="text-center mb-2">
            <p className="text-sm font-semibold text-white/80" data-ui="fer-edit-intentos-title">INTENTOS (OPENERS)</p>
            <p className="text-xs text-white/50" data-ui="fer-edit-intentos-subtitle">Registra los pesos de apertura para cada levantamiento</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sentadilla */}
            {showSentadilla && <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl" data-ui="fer-edit-sentadilla">
              <p className="text-sm font-bold text-blue-400 mb-3 text-center">Sentadilla</p>
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={`sentadilla-${n}`} data-ui={`fer-edit-sentadilla-${n}`}>
                    <label className="text-xs text-white/50 block mb-0.5">Intento {n}</label>
                    <input
                      type="number"
                      value={liftData[`sentadilla${n}` as keyof typeof liftData] || ''}
                      onChange={(e) => updateLift(`sentadilla${n}`, Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-accent/50"
                      placeholder="0"
                      min="0" step="0.5"
                      data-ui={`fer-edit-sentadilla-${n}-input`}
                    />
                  </div>
                ))}
              </div>
            </div>}

            {/* Press de Banca */}
            {showBanca && <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl" data-ui="fer-edit-banca">
              <p className="text-sm font-bold text-purple-400 mb-3 text-center">Press de Banca</p>
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={`banca-${n}`} data-ui={`fer-edit-banca-${n}`}>
                    <label className="text-xs text-white/50 block mb-0.5">Intento {n}</label>
                    <input
                      type="number"
                      value={liftData[`banca${n}` as keyof typeof liftData] || ''}
                      onChange={(e) => updateLift(`banca${n}`, Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-accent/50"
                      placeholder="0"
                      min="0" step="0.5"
                      data-ui={`fer-edit-banca-${n}-input`}
                    />
                  </div>
                ))}
              </div>
            </div>}

            {/* Peso Muerto */}
            {showPesoMuerto && <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl" data-ui="fer-edit-pesomuerto">
              <p className="text-sm font-bold text-orange-400 mb-3 text-center">Peso Muerto</p>
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={`pesomuerto-${n}`} data-ui={`fer-edit-pesomuerto-${n}`}>
                    <label className="text-xs text-white/50 block mb-0.5">Intento {n}</label>
                    <input
                      type="number"
                      value={liftData[`pesoMuerto${n}` as keyof typeof liftData] || ''}
                      onChange={(e) => updateLift(`pesoMuerto${n}`, Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-accent/50"
                      placeholder="0"
                      min="0" step="0.5"
                      data-ui={`fer-edit-pesomuerto-${n}-input`}
                    />
                  </div>
                ))}
              </div>
            </div>}
          </div>

          {liftSaving && (
            <div className="text-center text-xs text-blue-400 animate-pulse" data-ui="fer-edit-lifts-saving">
              Guardando...
            </div>
          )}
          {liftSaved && !liftSaving && (
            <div className="text-center text-xs text-green-400" data-ui="fer-edit-lifts-saved">
              Guardado
            </div>
          )}
        </div>
}

      {/* ── Actions (visible in both tabs) ── */}
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
