import { useState, useCallback, useMemo } from 'react';
import { Head } from '../../components/Head';
import { FER_COLORS } from '../fer/constants/constants';
import { useFerInscripcion } from '../fer/hooks/useFerInscripcion';
import { InscripcionForm } from '../fer/components/InscripcionForm';
import { ConfirmacionModal } from '../fer/components/ConfirmacionModal';
import { UpsellModal } from '../fer/components/UpsellModal';
import { FerFooter } from '../fer/components/FerFooter';
import { useInscripcionConfig } from './hooks';
import { InscripcionHero, InscripcionClosed, InscripcionLoading, InscripcionError } from './components';

export function InscripcionPage() {
  const config = useInscripcionConfig();
  const inscripcionHook = useFerInscripcion();

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [localPlazas, setLocalPlazas] = useState<number | null>(null);

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

  // ── Handlers ──
  const handleFormSubmit = useCallback(async () => {
    const success = await inscripcionHook.submit('fer');
    if (success) {
      setShowConfirmation(true);
      setLocalPlazas((prev) => Math.max(0, (prev ?? config.plazasDisponibles) - 1));
    }
  }, [inscripcionHook, config.plazasDisponibles]);

  const handleShowUpsell = useCallback(() => {
    if (!inscripcionHook.formData.peakProgram) {
      setShowUpsell(true);
    }
  }, [inscripcionHook.formData.peakProgram]);

  const closeConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const closeUpsell = useCallback(() => {
    setShowUpsell(false);
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
        canonicalUrl="https://fer.menustudioai.com/inscripcion"
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
            onSubmit={handleFormSubmit}
          />
        </main>

        <FerFooter />

        {/* Modals */}
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
      </div>
    </>
  );
}

export default InscripcionPage;
