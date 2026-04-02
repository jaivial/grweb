import { FC, useState, useMemo, useCallback, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { BiLogoInstagram } from 'react-icons/bi';
import Layout from '../../layouts/Layout';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CustomSelector } from '../../components/ui/CustomSelector/CustomSelector';
import { RaffleFrames } from './RaffleFrames';
import { Footer } from '../home/components/Footer';
import { countryCodeOptions } from '../../utils/countryCodes';
import { api } from '../../utils/api';
import { latestConfirmedWinner, fetchConfirmedWinner } from '../../stores/participants';

// Spanish rules data
const rules = [
  {
    icon: 'dollar',
    title: '0,50€ por boleto',
    description: 'Cada boleto cuesta solo 0,50 euros. Compra tantos como quieras para aumentar tus posibilidades de ganar.',
  },
  {
    icon: 'ticket',
    title: 'Boletos ilimitados',
    description: 'Sin restricciones en la cantidad de boletos que puedes comprar. ¡Más boletos = más posibilidades!',
  },
  {
    icon: 'users',
    title: 'Un ganador por persona',
    description: 'Incluso si compras varios boletos, solo puedes ganar una vez. ¡Justo para todos!',
  },
  {
    icon: 'shield',
    title: 'Pago seguro',
    description: 'Todos los pagos se procesan de forma segura a través de Stripe. Tus datos están protegidos.',
  },
  {
    icon: 'award',
    title: 'Selección aleatoria',
    description: 'El ganador se elige al azar utilizando selección ponderada basada en la cantidad de boletos.',
  },
  {
    icon: 'globe',
    title: 'Participación mundial',
    description: 'Participa desde cualquier lugar del mundo. ¡Los participantes internacionales son bienvenidos!',
  },
];

// Spanish steps data
const steps = [
  {
    number: 1,
    title: 'Elige tus boletos',
    description: 'Selecciona cuántos boletos quieres comprar. Cada boleto cuesta 0,50€.',
    icon: 'ticket',
  },
  {
    number: 2,
    title: 'Rellena tus datos',
    description: 'Ingresa tu nombre, apellidos y dirección de correo electrónico.',
    icon: 'user',
  },
  {
    number: 3,
    title: 'Síguenos en Instagram',
    description: 'Asegúrate de seguir a @grstrength en Instagram para ser eligible.',
    icon: 'instagram',
  },
  {
    number: 4,
    title: 'Completa el pago',
    description: 'Paga de forma segura a través de Stripe Checkout con tu tarjeta.',
    icon: 'credit-card',
  },
  {
    number: 5,
    title: 'Espera al sorteo',
    description: 'El ganador será seleccionado al azar y anunciado en la web.',
    icon: 'target',
  },
];

export const Raffle: FC = () => {
  const TICKET_PRICE = 0.5;
  const MAX_TICKETS = 50;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    countryCode: '+34',
    phone: '',
    followsInstagram: false,
    dataConsent: false,
    contestPolicy: false,
  });

  const [ticketCount, setTicketCount] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isLoadingWinner, setIsLoadingWinner] = useState(true);

  useEffect(() => {
    fetchConfirmedWinner().finally(() => {
      setIsLoadingWinner(false);
    });
  }, []);

  const totalPrice = useMemo(() => {
    return `€${(ticketCount * TICKET_PRICE).toFixed(2)}`;
  }, [ticketCount]);

  const isFormFilled = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (
      formData.name.trim().length >= 2 &&
      emailRegex.test(formData.email) &&
      formData.countryCode &&
      formData.phone.trim().length >= 6 &&
      formData.followsInstagram &&
      formData.dataConsent &&
      formData.contestPolicy
    );
  }, [formData]);

  const updateFormData = useCallback((field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);

  const incrementTickets = useCallback(() => {
    setTicketCount(prev => Math.min(prev + 1, MAX_TICKETS));
  }, []);

  const decrementTickets = useCallback(() => {
    setTicketCount(prev => Math.max(prev - 1, 1));
  }, []);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'El nombre debe tener al menos 2 caracteres';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailRegex.test(formData.email)) {
      newErrors.email = 'Introduce un correo electrónico válido';
    }

    if (!formData.countryCode) {
      newErrors.countryCode = 'Selecciona un código de país';
    }

    if (!formData.phone.trim() || formData.phone.trim().length < 6) {
      newErrors.phone = 'Introduce un número de teléfono válido';
    }

    if (!formData.followsInstagram) {
      newErrors.followsInstagram = 'Debes seguirnos en Instagram para participar';
    }

    if (!formData.dataConsent) {
      newErrors.dataConsent = 'Debes aceptar el tratamiento de tus datos';
    }

    if (!formData.contestPolicy) {
      newErrors.contestPolicy = 'Debes aceptar la política del concurso';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleEnrollSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const nameParts = formData.name.trim().split(' ');
      const firstName = nameParts[0];
      const surname = nameParts.slice(1).join(' ') || '';

      const response = await api.buyTickets({
        firstName,
        surname,
        email: formData.email.trim(),
        instagram: formData.followsInstagram ? '@grstrength' : '',
        ticketCount,
        phone: `${formData.countryCode}${formData.phone}`,
      });

      window.location.href = response.url;
    } catch (error) {
      console.error('Enrollment error:', error);
      setErrors({ submit: 'Error al procesar tu inscripción. Inténtalo de nuevo.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, ticketCount, validateForm]);

  return (
    <Layout>
      <main className="min-h-screen bg-black" data-section="raffle-page">
        {/* 200vh Hero Animation Section */}
        <div
          id="raffle-page-container"
          className="relative"
          style={{ height: '200vh' }}
          data-component="RaffleHeroContainer"
        >
          <div
            className="sticky top-0 h-screen overflow-hidden"
            data-component="RaffleHeroViewport"
          >
            {/* Title with separator */}
            <div className="absolute top-36 left-0 right-0 z-30" data-component="RaffleTitle">
              <h1
                className="text-center text-5xl md:text-6xl lg:text-7xl font-bold uppercase tracking-wider"
                style={{
                  fontFamily: '"Contrail One", sans-serif',
                  color: '#b91c1c',
                }}
              >
                SORTEO
              </h1>
              {/* Separator line with faded margins */}
              <div className="relative mt-4 mx-8 md:mx-16 lg:mx-32">
                <div
                  className="h-px"
                  style={{
                    background: 'linear-gradient(to right, transparent, #dc2626 20%, #dc2626 80%, transparent)',
                  }}
                />
              </div>
            </div>

            {/* Frame Animation with independent mask */}
            <RaffleFrames containerId="raffle-page-container" />

            {/* Text Overlay Container - Static text, no scroll animations */}
            <div
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-32 md:pb-40 z-20"
              data-component="RaffleTextOverlay"
            >
              {/* Text 1 - Static */}
              <div className="w-full flex justify-center" style={{ opacity: 1 }}>
                <h2
                  className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white text-center px-4 max-w-4xl"
                  style={{
                    fontFamily: '"Contrail One", sans-serif',
                    textTransform: 'uppercase',
                  }}
                >
                  Entra en el sorteo de un cinturon SBD
                </h2>
              </div>

              {/* Text 2 - Static */}
              <div className="w-full flex justify-center mt-4" style={{ opacity: 1 }}>
                <h2
                  className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-white text-center px-4 max-w-4xl"
                  style={{
                    fontFamily: '"Contrail One", sans-serif',
                    textTransform: 'uppercase',
                  }}
                >
                  Participa tantas veces como quieras para tener mas oportunidades de ganar
                </h2>
              </div>
            </div>

          </div>
        </div>

        {/* Rules Section - Black background */}
        <section id="rules" className="min-h-screen py-24 px-4 bg-black" data-section="rules">
          <div className="max-w-6xl mx-auto" data-slot="rules-container">
            <div className="text-center mb-16" data-slot="rules-header">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="rules-title">
                Normas del sorteo
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto" data-ui="rules-subtitle">
                Simple, justo y transparente. Aquí tienes todo lo que necesitas saber sobre el sorteo de GR Cup.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-slot="rules-grid">
              {rules.map((rule, index) => (
                <div
                  key={rule.title}
                  className="group p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-red-accent/50 transition-all duration-300 hover:scale-[1.02]"
                  style={{ animationDelay: `${index * 0.1}s` }}
                  data-slot={`rule-card-${index}`}
                  data-ui={`rule-item-${index + 1}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-red-accent/10 flex items-center justify-center mb-4 group-hover:bg-red-accent/20 transition-colors" data-ui={`rule-icon-${index + 1}`}>
                    <Icon name={rule.icon as any} color="red-accent" size="lg" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2" data-ui={`rule-title-${index + 1}`}>
                    {rule.title}
                  </h3>
                  <p className="text-gray-400" data-ui={`rule-description-${index + 1}`}>
                    {rule.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-16 text-center" data-slot="rules-pricing">
              <div className="inline-block p-8 rounded-2xl bg-gradient-to-r from-red-accent/10 to-dark-red/10 border border-red-accent/30" data-ui="pricing-box">
                <p className="text-gray-300 mb-2" data-ui="pricing-question">
                  ¿Cuánto cuesta?
                </p>
                <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-accent to-dark-red" data-ui="pricing-amount">
                  0,50€ por boleto
                </p>
                <p className="text-gray-500 mt-2" data-ui="pricing-note">
                  ¡Compra 10 boletos por solo 5€ = 10x más posibilidades!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How to Enter Section - Black background */}
        <section id="how-to-enter" className="min-h-screen py-24 px-4 bg-black" data-section="how-to-enter">
          <div className="max-w-6xl mx-auto" data-slot="how-to-enter-container">
            <div className="text-center mb-16" data-slot="how-to-enter-header">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="how-to-enter-title">
                Cómo participar
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto" data-ui="how-to-enter-subtitle">
                ¡Es rápido y fácil! Sigue estos 5 simples pasos para entrar en el sorteo de GR Cup.
              </p>
            </div>

            <div className="relative" data-slot="steps-timeline">
              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-red-accent via-dark-red to-red-accent" />

              <div className="space-y-12" data-slot="steps-list">
                {steps.map((step, index) => (
                  <div
                    key={step.number}
                    className={`relative flex flex-col lg:flex-row items-center gap-8 ${
                      index % 2 === 1 ? 'lg:flex-row-reverse' : ''
                    }`}
                    data-slot={`step-${index + 1}`}
                    data-ui={`step-item-${index + 1}`}
                  >
                    <div className={`flex-1 ${index % 2 === 1 ? 'lg:text-right' : ''}`} data-slot={`step-content-${index + 1}`}>
                      <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-red-accent/50 transition-all duration-300" data-ui={`step-card-${index + 1}`}>
                        <div className="flex flex-row sm:flex-col items-center sm:items-center gap-2 mb-4">
                          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-accent text-white font-bold text-lg flex-shrink-0" data-ui={`step-number-${index + 1}`}>
                            {step.number}
                          </div>
                          <h3 className="text-2xl font-bold text-white" data-ui={`step-title-${index + 1}`}>
                            {step.title}
                          </h3>
                        </div>
                        <p className="text-gray-400" data-ui={`step-description-${index + 1}`}>
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <div className="relative z-10 w-16 h-16 rounded-full bg-gray-900 border-4 border-red-accent flex items-center justify-center flex-shrink-0" data-ui={`step-icon-${index + 1}`}>
                      <Icon name={step.icon as any} color="red-accent" size="lg" />
                    </div>

                    <div className="flex-1 hidden lg:block" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Resultados Section - Black background */}
        <section id="resultados" className="min-h-screen py-24 px-4 bg-black" data-section="resultados">
          <div className="max-w-6xl mx-auto" data-slot="resultados-container">
            <div className="text-center mb-16" data-slot="resultados-header">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="resultados-title">
                Resultados
              </h2>
              <div className="flex justify-center mt-6" data-ui="resultados-icon">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-accent to-dark-red flex items-center justify-center">
                  <Trophy size={32} color="white" />
                </div>
              </div>
            </div>

            {isLoadingWinner ? (
              <div className="flex justify-center items-center py-16" data-ui="resultados-loading">
                <div className="w-12 h-12 border-4 border-red-accent/30 border-t-red-accent rounded-full animate-spin" data-ui="resultados-spinner" />
              </div>
            ) : latestConfirmedWinner.value ? (
              <div className="max-w-lg mx-auto" data-slot="resultados-winner">
                <div className="p-8 rounded-2xl bg-gradient-to-r from-red-accent/10 to-dark-red/10 border border-red-accent/30 text-center" data-ui="resultado-winner-card">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-accent to-dark-red flex items-center justify-center mx-auto mb-6" data-ui="resultado-winner-trophy">
                    <Icon name="trophy" size="xl" color="white" />
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-2" data-ui="resultado-winner-name">
                    {latestConfirmedWinner.value.winnerName}
                  </h3>
                  {latestConfirmedWinner.value.winnerInstagram && (
                    <a
                      href={`https://instagram.com/${latestConfirmedWinner.value.winnerInstagram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-accent hover:text-dark-red transition-colors inline-block mb-4"
                      data-ui="resultado-winner-instagram"
                    >
                      {latestConfirmedWinner.value.winnerInstagram}
                    </a>
                  )}
                  <p className="text-gray-400" data-ui="resultado-winner-tickets">
                    {latestConfirmedWinner.value.winnerTicketCount} boleto{latestConfirmedWinner.value.winnerTicketCount !== 1 ? 's' : ''} en el sorteo
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6" data-slot="resultados-content">
                <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800" data-ui="resultado-item-1">
                  <p className="text-xl text-gray-300 leading-relaxed">
                    El ganador sera anunciado el ultimo dia de la competicion tras la entrega de premios de la ultima categoria.
                  </p>
                </div>

                <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800" data-ui="resultado-item-2">
                  <p className="text-xl text-gray-300 leading-relaxed">
                    Tambien se anunciara el ganador por redes sociales y se publicara en vivo un video de como se elije al ganador.
                  </p>
                </div>

                <div className="p-8 rounded-2xl bg-gradient-to-r from-red-accent/10 to-dark-red/10 border border-red-accent/30" data-ui="resultado-item-3">
                  <p className="text-2xl text-white font-bold text-center leading-relaxed">
                    Cuantas mas boletos compres mas oportunidades tienes de ganar.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-16 text-center" data-slot="resultados-cta">
              <p className="text-gray-400 mb-6" data-ui="resultados-cta-text">
                ¿Quieres ser nuestro próximo ganador?
              </p>
              <Button
                variant="primary"
                size="xl"
                onClick={() => {
                  window.location.href = '/checkout';
                }}
                className="shadow-lg shadow-red-accent/30"
                leftIcon={<Icon name="sparkles" />}
                data-ui="participate-button"
              >
                Participa ahora
              </Button>
            </div>
          </div>
        </section>

        {/* Enrollment Section */}
        <section id="enroll" className="min-h-screen py-24 px-4 bg-dark-base" data-section="enroll">
          <div className="max-w-2xl mx-auto" data-slot="enroll-container">
            <div className="text-center mb-12" data-slot="enroll-header">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="enroll-title">
                Inscríbete ahora
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto" data-ui="enroll-subtitle">
                Completa el formulario para participar en el sorteo del GR Cup 2026
              </p>
            </div>

            <form
              onSubmit={handleEnrollSubmit}
              className="space-y-6 bg-dark-surface rounded-2xl p-8 border border-gray-800"
              data-slot="enroll-form"
            >
              {/* Name Input */}
              <div data-ui="enroll-field-name">
                <Input
                  label="Nombre completo"
                  type="text"
                  name="name"
                  placeholder="Tu nombre y apellidos"
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  error={errors.name}
                  fullWidth
                  className="!px-6 !py-4 !text-[16px]"
                />
              </div>

              {/* Email Input */}
              <div data-ui="enroll-field-email">
                <Input
                  label="Correo electrónico"
                  type="email"
                  name="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => updateFormData('email', e.target.value)}
                  error={errors.email}
                  fullWidth
                  className="!px-6 !py-4 !text-[16px]"
                />
              </div>

              {/* Phone with Country Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-ui="enroll-field-phone">
                <div className="sm:col-span-1">
                  <CustomSelector
                    label="Código"
                    options={countryCodeOptions}
                    value={formData.countryCode}
                    onChange={(value) => updateFormData('countryCode', value as string)}
                    placeholder="+34"
                    searchable
                    allowClear={false}
                    error={errors.countryCode}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Teléfono"
                    type="tel"
                    name="phone"
                    placeholder="123 456 789"
                    value={formData.phone}
                    onChange={(e) => updateFormData('phone', e.target.value)}
                    error={errors.phone}
                    fullWidth
                    className="!px-6 !py-4 !text-[16px]"
                  />
                </div>
              </div>

              {/* Instagram Checkbox */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10" data-ui="enroll-field-instagram">
                <input
                  type="checkbox"
                  id="instagram-follow"
                  checked={formData.followsInstagram}
                  onChange={(e) => updateFormData('followsInstagram', e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-600 bg-dark-card text-red-accent focus:ring-red-accent focus:ring-offset-0 cursor-pointer"
                />
                <label htmlFor="instagram-follow" className="flex items-center gap-2 cursor-pointer flex-1">
                  <BiLogoInstagram size="24" className="text-pink-500" />
                  <span className="text-gray-300">Os sigo en instagram <span className="text-red-accent font-semibold">@grstrength</span></span>
                </label>
                {errors.followsInstagram && (
                  <span className="text-red-400 text-sm">{errors.followsInstagram}</span>
                )}
              </div>

              {/* Ticket Counter */}
              <div className="py-6 border-t border-b border-gray-700" data-ui="enroll-field-tickets">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-300 font-medium">Número de boletos</span>
                  <span className="text-gray-500 text-sm">0,50 € por boleto</span>
                </div>

                <div className="flex items-center justify-center gap-6">
                  {/* Minus Button */}
                  <button
                    type="button"
                    onClick={decrementTickets}
                    disabled={ticketCount <= 1}
                    className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    aria-label="Reducir tickets"
                    data-ui="ticket-minus-btn"
                  >
                    <Icon name="minus" size="lg" className="text-white" />
                  </button>

                  {/* Ticket Count */}
                  <div className="text-5xl font-bold text-white min-w-[80px] text-center" data-ui="ticket-count">
                    {ticketCount}
                  </div>

                  {/* Plus Button */}
                  <button
                    type="button"
                    onClick={incrementTickets}
                    disabled={ticketCount >= 50}
                    className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    aria-label="Aumentar tickets"
                    data-ui="ticket-plus-btn"
                  >
                    <Icon name="plus" size="lg" className="text-white" />
                  </button>
                </div>

                {/* Quick Select */}
                <div className="flex justify-center gap-2 mt-4">
                  {[1, 5, 10, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTicketCount(num)}
                      className={`px-3 py-1 text-sm rounded-full transition-colors ${
                        ticketCount === num
                          ? 'bg-red-accent text-black font-medium'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                      data-ui={`ticket-quick-${num}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between py-4" data-ui="enroll-summary">
                <span className="text-xl text-gray-300">
                  {ticketCount} boleto{ticketCount !== 1 ? 's' : ''} × 0,50 €
                </span>
                <span className="text-3xl font-bold text-white">
                  {totalPrice}
                </span>
              </div>

              {/* Legal Checkboxes */}
              <div className="space-y-4 pt-4 border-t border-gray-700" data-ui="enroll-legal">
                {/* Data Consent */}
                <div className="flex items-start gap-3" data-ui="enroll-field-data-consent">
                  <input
                    type="checkbox"
                    id="data-consent"
                    checked={formData.dataConsent}
                    onChange={(e) => updateFormData('dataConsent', e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-gray-600 bg-dark-card text-red-accent focus:ring-red-accent focus:ring-offset-0 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="data-consent" className="text-gray-300 cursor-pointer">
                      He leído y acepto la{' '}
                      <a
                        href="/consentimiento-datos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        política de tratamiento de mis datos
                      </a>
                    </label>
                    {errors.dataConsent && (
                      <p className="text-red-400 text-sm mt-1">{errors.dataConsent}</p>
                    )}
                  </div>
                </div>

                {/* Contest Policy */}
                <div className="flex items-start gap-3" data-ui="enroll-field-contest-policy">
                  <input
                    type="checkbox"
                    id="contest-policy"
                    checked={formData.contestPolicy}
                    onChange={(e) => updateFormData('contestPolicy', e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-gray-600 bg-dark-card text-red-accent focus:ring-red-accent focus:ring-offset-0 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="contest-policy" className="text-gray-300 cursor-pointer">
                      He leído y estoy de acuerdo con la{' '}
                      <a
                        href="/politica-concurso"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        política del concurso
                      </a>
                    </label>
                    {errors.contestPolicy && (
                      <p className="text-red-400 text-sm mt-1">{errors.contestPolicy}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4" data-ui="enroll-submit">
                <Button
                  type="submit"
                  variant="primary"
                  size="xl"
                  fullWidth
                  isLoading={isSubmitting}
                  disabled={isSubmitting || !isFormFilled}
                  className="shadow-lg shadow-red-accent/30"
                  data-ui="enroll-submit-btn"
                >
                  Inscribirme
                </Button>
              </div>
            </form>
          </div>
        </section>

        <Footer />
      </main>
    </Layout>
  );
};

export default Raffle;
