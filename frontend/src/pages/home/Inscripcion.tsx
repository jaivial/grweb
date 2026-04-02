import { useState, useCallback, useMemo, useEffect } from 'react';
import type { JSX } from 'react';
import Layout from '../../layouts/Layout';
import { CustomSelector } from '../../components/ui';
import { api } from '../../utils/api';
import type { AthleteFormData } from '../../types/athlete';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../constants/categories';

const SEX_OPTIONS = [
  { value: 'Male', label: 'Hombre' },
  { value: 'Female', label: 'Mujer' },
];

export function Inscripcion(): JSX.Element {
  const [formData, setFormData] = useState<AthleteFormData>({
    firstName: '',
    surname: '',
    email: '',
    phone: '',
    sex: 'Male',
    weightCategory: '',
    club: '',
    totalWeight: undefined,
    registrationDate: new Date().toISOString().split('T')[0],
    coach: '',
    status: 'PendingPayment',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AthleteFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [buttonHovered, setButtonHovered] = useState(false);
  const [preparada, setPreparada] = useState<boolean | null>(null);
  const [responsable, setResponsable] = useState<boolean | null>(null);
  const [aepUrl, setAepUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getPublicInscripcionPreparada()
      .then((data) => {
        setPreparada(data?.prepared ?? false);
        setResponsable(data?.responsable ?? true);
        setAepUrl(data?.aepUrl ?? null);
      })
      .catch(() => {
        setPreparada(false);
        setResponsable(true);
        setAepUrl(null);
      });
  }, []);

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
    if (!validate()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await api.createAthlete(formData);
      setSubmitSuccess(true);
      // Reset form
      setFormData({
        firstName: '',
        surname: '',
        email: '',
        phone: '',
        sex: 'Male',
        weightCategory: '',
        club: '',
        totalWeight: undefined,
        registrationDate: new Date().toISOString().split('T')[0],
        coach: '',
        status: 'PendingPayment',
      });
    } catch (error) {
      setSubmitError('Error al enviar la inscripción. Por favor, inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validate]);

  const inputClass = (hasError: boolean) =>
    `w-full px-4 py-3 min-h-[48px] bg-white/5 backdrop-blur-xl border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${hasError ? 'border-red-500/50' : 'border-white/10'}`;

  // Show loading state while checking prepared status
  if (preparada === null) {
    return (
      <Layout>
        <main className="min-h-screen bg-dark-base py-16 px-4 mt-[10rem]" data-section="inscripcion" data-ui="inscripcion-page">
          <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        </main>
      </Layout>
    );
  }

  // Show AEP delegation info if inscripciones are prepared but AEP manages them
  if (preparada && responsable === false) {
    return (
      <Layout>
        <main className="min-h-screen bg-dark-base py-16 px-4 mt-[10rem]" data-section="inscripcion" data-ui="inscripcion-page">
          <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[400px]" data-ui="aep-delegation">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }}>
              Inscripciones AEP
            </h2>
            <p className="text-center text-lg text-gray-300 mb-6 max-w-xl px-4">
              Las inscripciones para la GRStrength CUP se gestionan a través de la página oficial de la Asociación Española de Powerlifting (AEP). Haz clic en el botón para acceder al formulario de inscripción en su web.
            </p>
            {aepUrl ? (
            <div className="group/scale relative">
              <a
                href={aepUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative inline-flex items-center gap-3 px-6 py-3 min-h-[48px] text-base font-medium text-white bg-white/10 backdrop-blur-md border border-white/20 rounded-lg hover:border-white/30 transition-all cursor-pointer"
                data-ui="aep-inscripcion-button"
              >
                <span className="absolute inset-0 rounded-lg -z-10" style={{ background: 'linear-gradient(to right, #9333ea, #ec4899, #f97316)' }} />
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Ir a la inscripción oficial AEP
              </a>
              <div className="absolute inset-0 rounded-lg transition-shadow duration-200 group-hover/scale:shadow-lg group-hover/scale:shadow-red-500/30 pointer-events-none -z-10" />
            </div>
            ) : (
            <p className="text-center text-sm text-gray-400 italic mt-4" data-ui="aep-url-pending">
              Todavía no se han publicado la URL de las inscripciones de la AEP
            </p>
            )}
          </div>
        </main>
      </Layout>
    );
  }

  // Show fallback when inscripciones are not prepared
  if (!preparada) {
    return (
      <Layout>
        <main className="min-h-screen bg-dark-base py-16 px-4 mt-[10rem]" data-section="inscripcion" data-ui="inscripcion-page">
          <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[400px]" data-ui="inscripcion-fallback">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }}>
              Próximamente...
            </h2>
            <svg className="w-16 h-16 text-white opacity-100 mb-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <p className="text-center text-lg text-gray-300 mb-6 max-w-xl px-4">
              Las inscripciones a la GRStrength CUP todavía no están abiertas. Síguenos en instagram para mantenerte informado.
            </p>
            <div className="group/scale relative">
              <a
                href="https://www.instagram.com/grstrengthclub/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative inline-flex items-center gap-3 px-6 py-3 min-h-[48px] text-base font-medium text-white bg-white/10 backdrop-blur-md border border-white/20 rounded-lg hover:border-white/30 transition-all cursor-pointer"
                data-ui="instagram-fallback-button"
              >
                <span className="absolute inset-0 rounded-lg -z-10" style={{ background: 'linear-gradient(to right, #9333ea, #ec4899, #f97316)' }} />
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Síguenos en Instagram
              </a>
              <div className="absolute inset-0 rounded-lg transition-shadow duration-200 group-hover/scale:shadow-lg group-hover/scale:shadow-red-500/30 pointer-events-none -z-10" />
            </div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="min-h-screen bg-dark-base py-16 px-4 mt-[10rem]" data-section="inscripcion" data-ui="inscripcion-page">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12" data-ui="inscripcion-header">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }}>
              ¡Inscríbete al II GRSTRENGTH CUP!
            </h1>
            <p className="text-lg text-gray-400">
              Rellena el formulario para registrarte en el campeonato
            </p>
          </div>

          {/* Success Message */}
          {submitSuccess && (
            <div className="mb-8 p-6 bg-green-500/10 border border-green-500/30 rounded-2xl text-center" data-ui="success-message">
              <svg className="w-12 h-12 mx-auto mb-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xl font-semibold text-white mb-2">¡Inscripción enviada!</h3>
              <p className="text-gray-400">Te hemos registrado correctamente. Te contactaremos pronto.</p>
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400" data-ui="error-message">
              {submitError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6" data-ui="inscripcion-form">
            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  className={inputClass(!!errors.firstName)}
                  placeholder="Tu nombre"
                />
                {errors.firstName && <p className="mt-1 text-sm text-red-400">{errors.firstName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Apellidos *</label>
                <input
                  type="text"
                  value={formData.surname}
                  onChange={(e) => updateField('surname', e.target.value)}
                  className={inputClass(!!errors.surname)}
                  placeholder="Tus apellidos"
                />
                {errors.surname && <p className="mt-1 text-sm text-red-400">{errors.surname}</p>}
              </div>
            </div>

            {/* Contact Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={inputClass(!!errors.email)}
                  placeholder="email@ejemplo.com"
                />
                {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Teléfono</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className={inputClass(false)}
                  placeholder="+34 600 000 000"
                />
              </div>
            </div>

            {/* Sex and Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Sexo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEX_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateField('sex', option.value as 'Male' | 'Female')}
                      className={`px-4 py-3 min-h-[48px] rounded-xl border transition-all ${
                        formData.sex === option.value
                          ? 'bg-red-accent/20 border-red-accent text-white'
                          : 'bg-white/5 border-white/10 text-white/70 hover:border-white/20'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <CustomSelector
                  label="Categoría de peso *"
                  options={categoryOptions}
                  value={formData.weightCategory || null}
                  onChange={(v) => updateField('weightCategory', v || '')}
                  placeholder="Seleccionar categoría"
                  error={errors.weightCategory}
                />
              </div>
            </div>

            {/* Club and Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Club</label>
                <input
                  type="text"
                  value={formData.club}
                  onChange={(e) => updateField('club', e.target.value)}
                  className={inputClass(false)}
                  placeholder="Nombre del club"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Marca Total (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.totalWeight || ''}
                  onChange={(e) => updateField('totalWeight', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className={inputClass(false)}
                  placeholder="0.0"
                />
              </div>
            </div>

            {/* Coach */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Entrenador (opcional)</label>
              <input
                type="text"
                value={formData.coach}
                onChange={(e) => updateField('coach', e.target.value)}
                className={inputClass(false)}
                placeholder="Nombre del entrenador"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4 relative">
              <button
                type="submit"
                disabled={isSubmitting}
                onMouseEnter={() => setButtonHovered(true)}
                onMouseLeave={() => setButtonHovered(false)}
                className="w-full min-h-[56px] px-6 py-4 text-lg font-semibold text-white flex items-center justify-center gap-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: buttonHovered ? 'rgba(20, 20, 20, 0.95)' : 'rgba(10, 10, 10, 0.7)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: `1px solid rgba(139, 0, 0, ${buttonHovered ? 0.6 : 0.3})`,
                  boxShadow: `0 ${buttonHovered ? 12 : 8}px 32px rgba(0, 0, 0, 0.3), inset 0 0 ${buttonHovered ? 80 : 60}px rgba(139, 0, 0, ${buttonHovered ? 0.1 : 0.05})`,
                }}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Enviar inscripción
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </button>
              {/* Red accent glow at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 50%, transparent 100%)',
                }}
              />
            </div>
          </form>

          {/* Footer Note */}
          <p className="text-center text-sm text-gray-500 mt-8">
            * Campos obligatorios. Te contactaremos por email para confirmar tu inscripción.
          </p>
        </div>
      </main>
    </Layout>
  );
}

export default Inscripcion;
