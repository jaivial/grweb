import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import api from '../../api/client';
import type { Competicion } from '../../types/api';
import { FER_COLORS } from './constants';
import { useFerInscripcion } from './hooks/useFerInscripcion';
import { Hero } from './components/Hero';
import { QueEs } from './components/QueEs';
import { QueIncluye } from './components/QueIncluye';
import { QuienPuede } from './components/QuienPuede';
import { InscripcionForm } from './components/InscripcionForm';
import { ConfirmacionModal } from './components/ConfirmacionModal';
import { UpsellModal } from './components/UpsellModal';
import { PaymentChoiceModal } from './components/PaymentChoiceModal';
import { FerFooter } from './components/FerFooter';
import { DisciplinasSection } from './components/DisciplinasSection';
import { ModalidadesHomeSection } from './components/ModalidadesHomeSection';
import { ParallaxShowcase } from './components/ParallaxShowcase';
import { HorariosSection } from './components/HorariosSection';
import { ComoFunciona } from './components/ComoFunciona';
import { GrHandlerService } from './components/GrHandlerService';
import { FloatingCtaButton } from './components/FloatingCtaButton';

export function FerLanding() {
  const [competicion, setCompeticion] = useState<Competicion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [plazasDisponibles, setPlazasDisponibles] = useState(80);
  const [categoriasMasculino, setCategoriasMasculino] = useState<string[]>([]);
  const [categoriasFemenino, setCategoriasFemenino] = useState<string[]>([]);
  const [pagoStripeActivo, setPagoStripeActivo] = useState(false);
  const [pagoEfectivoActivo, setPagoEfectivoActivo] = useState(false);
  const [stripeDisponible, setStripeDisponible] = useState(false);
  const [cuponesDescuentoActivo, setCuponesDescuentoActivo] = useState(false);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);
  const inscripcionHook = useFerInscripcion();

  // ── Load competicion data ──
  const loadCompeticion = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch both competition details and config in parallel
      const [compResult, configResult] = await Promise.all([
        api.getCompeticionBySlug('fer'),
        api.getCompeticionConfig('fer'),
      ]);
      
      if (compResult.success && compResult.data) {
        setCompeticion(compResult.data);
        const plazas = compResult.data.plazasDisponibles ?? 80;
        setPlazasDisponibles(plazas);
      }
      
      if (configResult.success && configResult.data) {
        setCategoriasMasculino(configResult.data.categoriasMasculino || []);
        setCategoriasFemenino(configResult.data.categoriasFemenino || []);
        setPagoStripeActivo(Boolean(configResult.data.pagoStripeActivo));
        setPagoEfectivoActivo(configResult.data.pagoEfectivoActivo !== false);
        setStripeDisponible(Boolean(configResult.data.stripeDisponible));
        setCuponesDescuentoActivo(Boolean(configResult.data.cuponesDescuentoActivo));
        if (configResult.data.plazasDisponibles !== undefined) {
          setPlazasDisponibles(configResult.data.plazasDisponibles);
        }
      }
    } catch (error) {
      console.error('Error loading competicion:', error);
      toast.error('Error cargando la información del evento', {
        style: { background: '#161B26', color: '#F8FAFC' },
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompeticion();
  }, [loadCompeticion]);

  // ── Scroll to form ──
  const scrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const subtotalAmount = useMemo(
    () => (competicion?.eventoConfig?.precioBase ?? 0) + (inscripcionHook.formData.peakProgram ? competicion?.eventoConfig?.precioPeakProgram ?? 0 : 0),
    [competicion?.eventoConfig?.precioBase, competicion?.eventoConfig?.precioPeakProgram, inscripcionHook.formData.peakProgram]
  );

  const totalAmount = useMemo(
    () => inscripcionHook.appliedCoupon?.total ?? subtotalAmount,
    [inscripcionHook.appliedCoupon?.total, subtotalAmount]
  );

  const discountAmount = useMemo(
    () => inscripcionHook.appliedCoupon?.importeDescuento ?? 0,
    [inscripcionHook.appliedCoupon?.importeDescuento]
  );

  const isStripeAvailable = useMemo(
    () => pagoStripeActivo && stripeDisponible,
    [pagoStripeActivo, stripeDisponible]
  );

  const paymentModalMode = useMemo(
    () => (pagoStripeActivo && !pagoEfectivoActivo ? 'stripeOnly' : 'choice') as 'stripeOnly' | 'choice',
    [pagoEfectivoActivo, pagoStripeActivo]
  );

  // ── Form submit handler ──
  const handleFormSubmit = useCallback(async () => {
    if (totalAmount <= 0) {
      const success = await inscripcionHook.submitCash('fer', false);
      if (success) {
        setShowConfirmation(true);
        setPlazasDisponibles((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (!pagoEfectivoActivo && !isStripeAvailable) {
      toast.error('El pago online no está disponible ahora mismo. Inténtalo más tarde.', {
        style: { background: '#161B26', color: '#F8FAFC' },
      });
      return;
    }

    if (isStripeAvailable) {
      setShowPaymentChoice(true);
      return;
    }

    const success = await inscripcionHook.submitCash('fer', false);
    if (success) {
      setShowConfirmation(true);
      setPlazasDisponibles((prev) => Math.max(0, prev - 1));
    }
  }, [inscripcionHook, pagoEfectivoActivo, isStripeAvailable, totalAmount]);

  const handleCashPayment = useCallback(async () => {
    const includeOnlinePaymentLink = pagoStripeActivo && pagoEfectivoActivo;
    const success = await inscripcionHook.submitCash('fer', includeOnlinePaymentLink);
    if (success) {
      setShowPaymentChoice(false);
      setShowConfirmation(true);
      setPlazasDisponibles((prev) => Math.max(0, prev - 1));
    }
  }, [inscripcionHook, pagoEfectivoActivo, pagoStripeActivo]);

  const handleStripePayment = useCallback(async () => {
    const result = await inscripcionHook.startStripeCheckout('fer');
    if (result === 'already_paid') {
      setShowPaymentChoice(false);
      setShowConfirmation(true);
    }
  }, [inscripcionHook]);

  const closePaymentChoice = useCallback(() => {
    if (!inscripcionHook.isSubmitting) {
      setShowPaymentChoice(false);
    }
  }, [inscripcionHook.isSubmitting]);

  // ── Show upsell after confetti (only if user didn't select Peak Program) ──
  const handleShowUpsell = useCallback(() => {
    if (!inscripcionHook.formData.peakProgram && inscripcionHook.inscripcionResult?.id) {
      setShowUpsell(true);
    }
  }, [inscripcionHook.formData.peakProgram, inscripcionHook.inscripcionResult?.id]);

  // ── Close modals ──
  const closeConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const closeUpsell = useCallback(() => {
    setShowUpsell(false);
  }, []);

  // ── Memoized derived state ──
  const qrCode = useMemo(
    () => inscripcionHook.inscripcionResult?.qrCode ?? '',
    [inscripcionHook.inscripcionResult]
  );

  const inscripcionId = useMemo(
    () => inscripcionHook.inscripcionResult?.id ?? null,
    [inscripcionHook.inscripcionResult]
  );

  const nombre = useMemo(
    () => inscripcionHook.formData?.nombre ?? undefined,
    [inscripcionHook.formData?.nombre]
  );

  const email = useMemo(
    () => inscripcionHook.formData?.email ?? undefined,
    [inscripcionHook.formData?.email]
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="fer-loading"
      >
        <div className="relative" data-ui="fer-loading-spinner">
          <div
            className="w-16 h-16 rounded-full border-4 border-white/10"
            style={{ borderColor: `${FER_COLORS.accent}30` }}
          />
          <Loader2
            className="absolute inset-0 w-16 h-16 animate-spin"
            style={{ color: FER_COLORS.accent }}
          />
          <div
            className="absolute inset-2 rounded-full bg-gradient-to-br from-transparent to-white/5"
          />
        </div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg font-medium tracking-wide"
          style={{ color: FER_COLORS.textMuted }}
          data-ui="fer-loading-text"
        >
          Cargando evento...
        </motion.p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="fer-landing-root"
    >
      <Hero onCtaClick={scrollToForm} />

      <FloatingCtaButton onCtaClick={scrollToForm} />

      <QueEs />

      <DisciplinasSection />

      <ModalidadesHomeSection />

      <QueIncluye />

      <QuienPuede />

      <ComoFunciona
        precioBase={competicion?.eventoConfig?.precioBase}
        precioHandler={competicion?.eventoConfig?.precioHandler}
        precioPeakProgram={competicion?.eventoConfig?.precioPeakProgram}
        fechaLimitePeakProgram={competicion?.eventoConfig?.fechaLimitePeakProgram}
      />

      <ParallaxShowcase />

      <HorariosSection />

      {/* Wrap form section in a div for the ref */}
      <div ref={formRef} data-ui="fer-form-anchor">
        <InscripcionForm
          hook={inscripcionHook}
          plazasDisponibles={plazasDisponibles}
          precioBase={competicion?.eventoConfig?.precioBase}
          categoriasMasculino={categoriasMasculino}
          categoriasFemenino={categoriasFemenino}
          contactEmail={competicion?.landingConfig?.contactEmail}
          precioPeakProgram={competicion?.eventoConfig?.precioPeakProgram}
          fechaLimitePeakProgram={competicion?.eventoConfig?.fechaLimitePeakProgram ?? null}
          cuponesDescuentoActivo={cuponesDescuentoActivo}
          onSubmit={handleFormSubmit}
        />
      </div>

      <GrHandlerService />

      <FerFooter contactEmail={competicion?.landingConfig?.contactEmail} />

      {/* Modals */}
      <PaymentChoiceModal
        isOpen={showPaymentChoice}
        mode={paymentModalMode}
        amount={totalAmount}
        subtotal={subtotalAmount}
        discount={discountAmount}
        couponCode={inscripcionHook.appliedCoupon?.codigo}
        isSubmitting={inscripcionHook.isSubmitting}
        onStripe={handleStripePayment}
        onCash={handleCashPayment}
        onClose={closePaymentChoice}
      />

      <ConfirmacionModal
        isOpen={showConfirmation}
        qrCode={qrCode}
        nombre={nombre}
        email={email}
        onClose={closeConfirmation}
        onShowUpsell={handleShowUpsell}
      />

      <UpsellModal
        isOpen={showUpsell}
        inscripcionId={inscripcionId}
        slug="fer"
        onClose={closeUpsell}
        precioPeakProgram={competicion?.eventoConfig?.precioPeakProgram}
        fechaLimitePeakProgram={competicion?.eventoConfig?.fechaLimitePeakProgram ?? null}
      />
    </div>
  );
}

export default FerLanding;
