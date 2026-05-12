import { useMemo, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ClipboardList,
  MailCheck,
  QrCode,
  Trophy,
  ArrowDown,
  UserCheck,
  Banknote,
  Clock,
  UserPlus,
  Info,
  ChevronRight,
} from 'lucide-react';
import { FER_COLORS } from '../constants';

/* ---------- constants ---------- */

const STEPS = [
  {
    number: 1,
    icon: ClipboardList,
    title: 'Inscripcion online',
    desc: 'Reserva tu plaza completando el formulario de inscripcion con tus datos personales y categoria.',
  },
  {
    number: 2,
    icon: MailCheck,
    title: 'Reserva confirmada',
    desc: 'Recibiras un email de confirmacion con tu codigo QR y los detalles del evento.',
  },
  {
    number: 3,
    icon: QrCode,
    title: 'Registro el dia del evento',
    desc: 'Presenta tu QR en la mesa de registro y realiza el pago en efectivo para completar tu inscripcion.',
  },
  {
    number: 4,
    icon: Trophy,
    title: 'Competir y superar tu PR',
    desc: 'Disfruta de la competicion con jueces certificados y da lo mejor de ti en la plataforma.',
  },
] as const;

const DISCLAIMER_ITEMS = [
  {
    icon: UserCheck,
    text: 'La inscripcion online solo garantiza una plaza reservada debido al limite de participantes.',
  },
  {
    icon: Banknote,
    text: 'El pago se realiza SOLO en efectivo en la mesa de registro el dia de la competicion, por orden de llamada/llegada.',
  },
  {
    icon: Clock,
    text: 'Es posible inscribirse el mismo dia sin reserva online si quedan plazas disponibles.',
  },
  {
    icon: UserPlus,
    text: 'La entrada incluye tu pase y el de 1 handler en el area reservada al competidor.',
  },
] as const;

/* ---------- sub-components ---------- */

function StepCard({
  step,
  index,
  variants,
  reduced,
}: {
  step: (typeof STEPS)[number];
  index: number;
  variants: Record<string, unknown>;
  reduced: boolean;
}) {
  return (
    <motion.div
      variants={variants}
      custom={index}
      className="w-full max-w-md mx-auto relative p-6 sm:p-8 rounded-2xl transition-shadow duration-300 hover:shadow-lg flex flex-col items-center text-center"
      style={{
        backgroundColor: FER_COLORS.bgCard,
        border: `1px solid ${FER_COLORS.accent}20`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      }}
      data-ui={`fer-como-funciona-step-card-${index}`}
    >
      {/* Step number circle — centered */}
      <motion.div
        className="flex items-center justify-center rounded-full mb-4"
        style={{
          width: 56,
          height: 56,
          backgroundColor: FER_COLORS.bgDark,
          color: FER_COLORS.gold,
          border: `2px solid ${FER_COLORS.gold}50`,
          boxShadow: `0 0 20px ${FER_COLORS.gold}25`,
          fontSize: '1.25rem',
          fontWeight: 700,
        }}
        animate={
          reduced
            ? undefined
            : {
                boxShadow: [
                  `0 0 16px ${FER_COLORS.gold}15`,
                  `0 0 28px ${FER_COLORS.gold}35`,
                  `0 0 16px ${FER_COLORS.gold}15`,
                ],
              }
        }
        transition={
          reduced ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
        }
        data-ui={`fer-como-funciona-step-number-${index}`}
      >
        {step.number}
      </motion.div>

      {/* Icon */}
      <div
        className="rounded-xl flex items-center justify-center mb-4"
        style={{
          width: 56,
          height: 56,
          backgroundColor: `${FER_COLORS.accent}12`,
        }}
        data-ui={`fer-como-funciona-step-icon-bg-${index}`}
      >
        <step.icon
          size={26}
          style={{ color: FER_COLORS.accent }}
          data-ui={`fer-como-funciona-step-icon-${index}`}
        />
      </div>

      {/* Title */}
      <h3
        className="text-lg sm:text-xl font-display font-bold mb-2"
        style={{ color: FER_COLORS.text }}
        data-ui={`fer-como-funciona-step-title-${index}`}
      >
        {step.title}
      </h3>

      {/* Description */}
      <p
        className="text-sm sm:text-base leading-relaxed"
        style={{ color: FER_COLORS.textMuted }}
        data-ui={`fer-como-funciona-step-desc-${index}`}
      >
        {step.desc}
      </p>
    </motion.div>
  );
}

function ArrowConnector({
  reduced,
}: {
  reduced: boolean;
}) {
  return (
    <div
      className="flex justify-center py-1"
      data-ui="fer-como-funciona-arrow-connector"
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: reduced ? 0 : 0.4 }}
        animate={
          reduced
            ? undefined
            : { y: [0, 5, 0] }
        }
        {...(reduced
          ? {}
          : {
              transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
            })}
        data-ui="fer-como-funciona-arrow-motion"
      >
        <ArrowDown
          size={28}
          style={{ color: FER_COLORS.gold, opacity: 0.7 }}
          data-ui="fer-como-funciona-arrow-icon"
        />
      </motion.div>
    </div>
  );
}

function DisclaimerTile({
  item,
  index,
  variants,
}: {
  item: (typeof DISCLAIMER_ITEMS)[number];
  index: number;
  variants: Record<string, unknown>;
}) {
  return (
    <motion.div
      variants={variants}
      custom={index}
      className="flex items-start gap-4 p-4 sm:p-5 rounded-xl transition-shadow duration-200 hover:shadow-md"
      style={{
        backgroundColor: FER_COLORS.bgDark,
        border: `1px solid ${FER_COLORS.accent}15`,
      }}
      data-ui={`fer-como-funciona-disclaimer-tile-${index}`}
    >
      {/* Icon container */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${FER_COLORS.gold}15` }}
        data-ui={`fer-como-funciona-disclaimer-icon-bg-${index}`}
      >
        <item.icon
          size={20}
          style={{ color: FER_COLORS.gold }}
          data-ui={`fer-como-funciona-disclaimer-icon-${index}`}
        />
      </div>
      <span
        className="text-sm sm:text-base leading-relaxed"
        style={{ color: FER_COLORS.textMuted }}
        data-ui={`fer-como-funciona-disclaimer-text-${index}`}
      >
        {item.text}
      </span>
    </motion.div>
  );
}

/* ---------- main component ---------- */

interface ComoFuncionaProps {
  precioBase?: number;
  precioHandler?: number;
}

export function ComoFunciona({ precioBase, precioHandler }: ComoFuncionaProps) {
  const prefersReducedMotion = useReducedMotion();

  /* --- variants --- */

  const headerVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: 'easeOut' },
      },
    }),
    []
  );

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30, scale: 0.96 },
      visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          delay: prefersReducedMotion ? 0 : 0.12 * i,
          duration: prefersReducedMotion ? 0 : 0.5,
          ease: [0.25, 0.25, 0.25, 0.75],
        },
      }),
    }),
    [prefersReducedMotion]
  );

  const disclaimerContainerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: prefersReducedMotion ? 0 : 0.1,
          delayChildren: prefersReducedMotion ? 0 : 0.2,
        },
      },
    }),
    [prefersReducedMotion]
  );

  const disclaimerItemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: prefersReducedMotion ? 0 : 0.45, ease: 'easeOut' },
      },
    }),
    [prefersReducedMotion]
  );

  const ctaVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: prefersReducedMotion ? 0 : 0.5,
          delay: prefersReducedMotion ? 0 : 0.3,
        },
      },
    }),
    [prefersReducedMotion]
  );

  /* --- shimmer style for "funciona" highlight --- */

  const shimmerStyle = useMemo(
    () =>
      prefersReducedMotion
        ? { color: FER_COLORS.gold }
        : {
            background: `linear-gradient(90deg, ${FER_COLORS.gold} 0%, ${FER_COLORS.shimmer} 50%, ${FER_COLORS.gold} 100%)`,
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'ferShimmer 3s ease-in-out infinite',
          },
    [prefersReducedMotion]
  );

  const keyframesCSS = useMemo(
    () =>
      prefersReducedMotion
        ? ''
        : '@keyframes ferShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }',
    [prefersReducedMotion]
  );

  /* --- handlers --- */

  const handleScrollToHandlerService = useCallback(() => {
    document.getElementById('gr-handler-service')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <section
      className="py-20 sm:py-28 px-4"
      data-ui="fer-como-funciona-section"
    >
      {/* Inject shimmer keyframes */}
      {keyframesCSS && (
        <style data-ui="fer-como-funciona-shimmer-style">{keyframesCSS}</style>
      )}

      <div className="max-w-3xl mx-auto" data-ui="fer-como-funciona-container">
        {/* Header */}
        <motion.div
          variants={headerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-12 sm:mb-16"
          data-ui="fer-como-funciona-header"
        >
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="fer-como-funciona-title"
          >
            Como{' '}
            <span
              style={shimmerStyle}
              data-ui="fer-como-funciona-title-highlight"
            >
              funciona
            </span>
            ?
          </h2>
          <p
            className="text-base sm:text-lg max-w-xl mx-auto"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="fer-como-funciona-subtitle"
          >
            Proceso sencillo para que solo te preocupes de competir
          </p>
        </motion.div>

        {/* Steps — vertical single-column with arrow connectors */}
        <div
          className="flex flex-col items-center gap-0"
          data-ui="fer-como-funciona-steps"
        >
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              data-ui={`fer-como-funciona-step-wrapper-${i}`}
            >
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                data-ui={`fer-como-funciona-step-motion-${i}`}
              >
                <StepCard
                  step={step}
                  index={i}
                  variants={cardVariants}
                  reduced={!!prefersReducedMotion}
                />
              </motion.div>
              {i < STEPS.length - 1 && (
                <ArrowConnector reduced={!!prefersReducedMotion} />
              )}
            </div>
          ))}
        </div>

        {/* Disclaimer tiles with individual icons */}
        <div
          className="mt-12 sm:mt-16"
          data-ui="fer-como-funciona-disclaimer"
        >
          {/* Disclaimer header */}
          <div
            className="flex items-center gap-3 mb-5 sm:mb-6 justify-center"
            data-ui="fer-como-funciona-disclaimer-header"
          >
            <Info
              size={20}
              style={{ color: FER_COLORS.gold }}
              data-ui="fer-como-funciona-disclaimer-icon"
            />
            <h4
              className="text-lg sm:text-xl font-bold"
              style={{ color: FER_COLORS.gold }}
              data-ui="fer-como-funciona-disclaimer-title"
            >
              Informacion importante
            </h4>
          </div>

          {/* Tiles grid */}
          <motion.div
            variants={disclaimerContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
            data-ui="fer-como-funciona-disclaimer-grid"
          >
            {DISCLAIMER_ITEMS.map((item, i) => (
              <DisclaimerTile
                key={i}
                item={item}
                index={i}
                variants={disclaimerItemVariants}
              />
            ))}
          </motion.div>
        </div>

        {/* Pricing info */}
        {(precioBase !== undefined || (precioHandler !== undefined && precioHandler > 0)) && (
          <div
            className="mt-8 sm:mt-10 p-5 sm:p-6 rounded-2xl text-center"
            style={{
              backgroundColor: FER_COLORS.bgCard,
              border: `1px solid ${FER_COLORS.gold}30`,
            }}
            data-ui="fer-como-funciona-pricing"
          >
            <h5
              className="text-base sm:text-lg font-bold mb-3"
              style={{ color: FER_COLORS.gold }}
              data-ui="fer-como-funciona-pricing-title"
            >
              Precios
            </h5>
            <div
              className="flex flex-wrap items-center justify-center gap-4 sm:gap-6"
              data-ui="fer-como-funciona-pricing-items"
            >
              {precioBase !== undefined && (
                <div data-ui="fer-como-funciona-pricing-base">
                  <span
                    className="text-sm"
                    style={{ color: FER_COLORS.textMuted }}
                    data-ui="fer-como-funciona-pricing-base-label"
                  >
                    Inscripcion:{' '}
                  </span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: FER_COLORS.text }}
                    data-ui="fer-como-funciona-pricing-base-value"
                  >
                    {precioBase} EUR
                  </span>
                </div>
              )}
              {precioHandler !== undefined && precioHandler > 0 && (
                <div data-ui="fer-como-funciona-pricing-handler">
                  <span
                    className="text-sm"
                    style={{ color: FER_COLORS.textMuted }}
                    data-ui="fer-como-funciona-pricing-handler-label"
                  >
                    Handler GR Strength:{' '}
                  </span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: FER_COLORS.gold }}
                    data-ui="fer-como-funciona-pricing-handler-value"
                  >
                    {precioHandler} EUR
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA — prominent GRStrength handler service */}
        <motion.div
          variants={ctaVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-10 sm:mt-14 text-center"
          data-ui="fer-como-funciona-cta-container"
        >
          <motion.button
            type="button"
            onClick={handleScrollToHandlerService}
            whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className="inline-flex items-center justify-center gap-3 px-8 py-4 sm:px-10 sm:py-5 rounded-2xl text-base sm:text-lg font-bold cursor-pointer transition-shadow duration-200"
            style={{
              background: `linear-gradient(135deg, ${FER_COLORS.gold} 0%, ${FER_COLORS.shimmer} 100%)`,
              color: FER_COLORS.bgDark,
              boxShadow: `0 4px 24px ${FER_COLORS.gold}40, 0 0 48px ${FER_COLORS.gold}15`,
            }}
            data-ui="fer-como-funciona-cta-button"
          >
            <span data-ui="fer-como-funciona-cta-text">
              No tienes handler? Elige el servicio de handlers de GRStrength
            </span>
            <motion.span
              animate={
                prefersReducedMotion ? undefined : { x: [0, 4, 0] }
              }
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              data-ui="fer-como-funciona-cta-arrow-wrapper"
            >
              <ChevronRight
                size={22}
                data-ui="fer-como-funciona-cta-chevron"
              />
            </motion.span>
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
