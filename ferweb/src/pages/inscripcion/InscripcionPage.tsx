import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Head } from '../../components/Head';
import { FER_COLORS } from '../fer/constants/constants';
import { useFerInscripcion } from '../fer/hooks/useFerInscripcion';
import { InscripcionForm } from '../fer/components/InscripcionForm';
import { ConfirmacionModal } from '../fer/components/ConfirmacionModal';
import { UpsellModal } from '../fer/components/UpsellModal';
import { PaymentChoiceModal } from '../fer/components/PaymentChoiceModal';
import { StaleConfigModal } from '../fer/components/StaleConfigModal';
import { FerFooter } from '../fer/components/FerFooter';
import { useInscripcionConfig } from './hooks';
import { InscripcionHero, InscripcionClosed, InscripcionLoading, InscripcionError } from './components';

export function InscripcionPage() {
  const config = useInscripcionConfig();
  const inscripcionHook = useFerInscripcion();
  const { isSubmitting, startStripeCheckout, submitCash, validate } = inscripcionHook;

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  const [localPlazas, setLocalPlazas] = useState<number | null>(null);
  const [showStaleConfigModal, setShowStaleConfigModal] = useState(false);

  // ── Derived state ──
  const plazasDisponibles = useMemo(
    () => localPlazas ?? config.plazasDisponibles,
    [localPlazas, config.plazasDisponibles]
  );

  const isSoldOut = useMemo(
    () => plazasDisponibles <= 0,
    [plazasDisponibles]
  );

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

  const subtotalAmount = useMemo(
    () => (config.precioBase ?? 0) + (inscripcionHook.formData.peakProgram ? config.precioPeakProgram ?? 0 : 0),
    [config.precioBase, config.precioPeakProgram, inscripcionHook.formData.peakProgram]
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
    () => config.pagoStripeActivo && config.stripeDisponible,
    [config.pagoStripeActivo, config.stripeDisponible]
  );

  const paymentModalMode = useMemo(
    () => (config.pagoStripeActivo && !config.pagoEfectivoActivo ? 'stripeOnly' : 'choice') as 'stripeOnly' | 'choice',
    [config.pagoEfectivoActivo, config.pagoStripeActivo]
  );

  // ── Handlers ──
  const handleFormSubmit = useCallback(async () => {
    if (!validate()) return;

    if (totalAmount <= 0) {
      const result = await submitCash('fer', config.configSnapshot, false);
      if (result === 'stale_config') {
        setShowStaleConfigModal(true);
        return;
      }

      if (result === 'success') {
        setShowConfirmation(true);
        setLocalPlazas((prev) => Math.max(0, (prev ?? config.plazasDisponibles) - 1));
      }
      return;
    }

    if (!config.pagoEfectivoActivo && !isStripeAvailable) {
      toast.error('El pago online no está disponible ahora mismo. Inténtalo más tarde.', {
        style: { background: '#161B26', color: '#F8FAFC' },
      });
      return;
    }

    if (isStripeAvailable) {
      setShowPaymentChoice(true);
      return;
    }

    const result = await submitCash('fer', config.configSnapshot, false);
    if (result === 'stale_config') {
      setShowStaleConfigModal(true);
      return;
    }

    if (result === 'success') {
      setShowConfirmation(true);
      setLocalPlazas((prev) => Math.max(0, (prev ?? config.plazasDisponibles) - 1));
    }
  }, [config.configSnapshot, config.pagoEfectivoActivo, config.plazasDisponibles, isStripeAvailable, submitCash, totalAmount, validate]);

  const handleCashPayment = useCallback(async () => {
    const includeOnlinePaymentLink = config.pagoStripeActivo && config.pagoEfectivoActivo;
    const result = await submitCash('fer', config.configSnapshot, includeOnlinePaymentLink);
    if (result === 'stale_config') {
      setShowPaymentChoice(false);
      setShowStaleConfigModal(true);
      return;
    }

    if (result === 'success') {
      setShowPaymentChoice(false);
      setShowConfirmation(true);
      setLocalPlazas((prev) => Math.max(0, (prev ?? config.plazasDisponibles) - 1));
    }
  }, [config.configSnapshot, config.pagoEfectivoActivo, config.pagoStripeActivo, config.plazasDisponibles, submitCash]);

  const handleStripePayment = useCallback(async () => {
    const result = await startStripeCheckout('fer', config.configSnapshot);
    if (result === 'already_paid') {
      setShowPaymentChoice(false);
      setShowConfirmation(true);
    }
    if (result === 'stale_config') {
      setShowPaymentChoice(false);
      setShowStaleConfigModal(true);
    }
  }, [config.configSnapshot, startStripeCheckout]);

  const handleShowUpsell = useCallback(() => {
    if (!inscripcionHook.formData.peakProgram && inscripcionHook.inscripcionResult?.id) {
      setShowUpsell(true);
    }
  }, [inscripcionHook.formData.peakProgram, inscripcionHook.inscripcionResult?.id]);

  const closeConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const closeUpsell = useCallback(() => {
    setShowUpsell(false);
  }, []);

  const closePaymentChoice = useCallback(() => {
    if (!isSubmitting) {
      setShowPaymentChoice(false);
    }
  }, [isSubmitting]);

  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  // ── Page states ──
  if (config.pageState === 'loading') {
    return (
      <>
        <Head
          title="Inscripción | FER CUP"
          description="Inscríbete al FER CUP 2026 en Valencia, Valencia. Tu primera competición de powerlifting."
        />
        <InscripcionLoading />
      </>
    );
  }

  if (config.pageState === 'error') {
    return (
      <>
        <Head
          title="Error | FER CUP"
          description="Error cargando la inscripción al FER CUP."
        />
        <InscripcionError onRetry={config.reload} />
      </>
    );
  }

  if (config.pageState === 'closed' || isSoldOut) {
    return (
      <>
        <Head
          title="Inscripción cerrada | FER CUP"
          description="Las inscripciones al FER CUP 2026 están cerradas."
        />
        <InscripcionClosed
          reason={isSoldOut ? 'soldout' : 'closed'}
          onRetry={config.reload}
        />
      </>
    );
  }

  // ── Open state ──
  return (
    <>
      <Head
        title="Inscripción | FER CUP"
        description="Inscríbete al FER CUP 2026 en Valencia, Valencia. Plazas limitadas. Tu primera competición de powerlifting."
        canonicalUrl="https://fercup.com/inscripcion"
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="inscripcion-page"
      >
        <InscripcionHero
          plazasDisponibles={plazasDisponibles}
          precioBase={config.precioBase}
        />

        <main className="flex-1" data-ui="inscripcion-page-main">
          <InscripcionForm
            hook={inscripcionHook}
            plazasDisponibles={plazasDisponibles}
            precioBase={config.precioBase}
            categoriasMasculino={config.categoriasMasculino}
            categoriasFemenino={config.categoriasFemenino}
            contactEmail={config.competicion?.landingConfig?.contactEmail}
            precioPeakProgram={config.precioPeakProgram}
            fechaLimitePeakProgram={config.fechaLimitePeakProgram}
            cuponesDescuentoActivo={config.cuponesDescuentoActivo}
            onSubmit={handleFormSubmit}
          />
        </main>

        <FerFooter />

        {/* Modals */}
        <PaymentChoiceModal
          isOpen={showPaymentChoice}
          mode={paymentModalMode}
          amount={totalAmount}
          subtotal={subtotalAmount}
          discount={discountAmount}
          couponCode={inscripcionHook.appliedCoupon?.codigo}
          isSubmitting={isSubmitting}
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
          precioPeakProgram={config.precioPeakProgram}
          fechaLimitePeakProgram={config.fechaLimitePeakProgram}
        />

        <StaleConfigModal
          isOpen={showStaleConfigModal}
          onReload={reloadPage}
        />
      </div>
    </>
  );
}

export default InscripcionPage;
