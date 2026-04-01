import { FC, useMemo, useEffect, useState } from 'react';
import Layout from '../../layouts/Layout';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { useFramePreloader } from '../../hooks/useFramePreloader';
import { BELT_FRAMES_CONFIG } from '../../utils/frameSources';
import { FrameAnimator } from '../../components/animations/FrameAnimator';

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
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const { frames, isLoading: framesLoading, loadProgress } = useFramePreloader({
    frameSource: BELT_FRAMES_CONFIG,
    batchSize: 20,
    batchDelay: 50,
  });

  // Sync loading state
  useEffect(() => {
    setIsLoading(framesLoading);
  }, [framesLoading]);

  // Prevent scrolling while loading
  useEffect(() => {
    if (isLoading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isLoading]);

  // Intersection observer for visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.intersectionRatio > 0.02);
        setHasBeenVisible(entry.intersectionRatio > 0.02);
      },
      {
        threshold: Array.from({ length: 100 }, (_, i) => i / 100),
      }
    );

    const element = document.getElementById('raffle-page-container');
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  const { progress: scrollProgress } = useScrollProgress({
    totalVh: 200,
    smooth: true,
    smoothFactor: 0.15,
    sectionSelector: '#raffle-page-container',
  });

  // Calculate frame progress (0 to 1 mapped across the 200vh section)
  const frameProgress = scrollProgress;

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
            className="sticky top-0 h-screen overflow-hidden transition-opacity duration-500"
            style={{ opacity: hasBeenVisible ? 1 : 0 }}
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
            <div className="absolute inset-0 flex items-center justify-center z-0 pb-32" data-component="FrameWrapper">
              <div className="relative w-screen h-auto overflow-hidden">
                <FrameAnimator
                  frames={frames}
                  progress={frameProgress}
                  isAnimating={true}
                  staticPauseStart={1}
                />
                {/* Radial gradient mask on canvas */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  data-ui="canvas-radial-mask"
                  style={{
                    maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                    maskSize: '100% 100%',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                  }}
                  aria-hidden
                />
                {/* Additional edge fade overlay for 4-sided margin fade effect */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  data-ui="canvas-edge-fade"
                  style={{
                    background: 'linear-gradient(to right, rgba(0, 0, 0, 0.9) 0%, transparent 15%, transparent 85%, rgba(0, 0, 0, 0.9) 100%), linear-gradient(to bottom, rgba(0, 0, 0, 0.9) 0%, transparent 15%, transparent 85%, rgba(0, 0, 0, 0.9) 100%)',
                  }}
                  aria-hidden
                />
              </div>
            </div>

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

            {/* Loading Overlay */}
            {isLoading && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-black"
                data-component="LoadingOverlay"
              >
                <div className="text-center">
                  <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-accent to-dark-red"
                      style={{ width: (loadProgress * 100) + '%', transition: 'width 0.3s ease-out' }}
                    />
                  </div>
                  <p className="text-gray-400 text-sm mt-2">
                    {Math.round(loadProgress * 100)}%
                  </p>
                </div>
              </div>
            )}
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
              <div className="absolute left-8 sm:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-red-accent via-dark-red to-red-accent transform sm:-translate-x-1/2" />

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
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-accent text-white font-bold text-lg mb-4" data-ui={`step-number-${index + 1}`}>
                          {step.number}
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-3" data-ui={`step-title-${index + 1}`}>
                          {step.title}
                        </h3>
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
                  <Icon name="trophy" size="xl" color="white" />
                </div>
              </div>
            </div>

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
      </main>
    </Layout>
  );
};

export default Raffle;
