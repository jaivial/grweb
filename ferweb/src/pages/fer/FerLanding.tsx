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
import { FerFooter } from './components/FerFooter';
import { DisciplinasSection } from './components/DisciplinasSection';
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

  // ── Form submit handler ──
  const handleFormSubmit = useCallback(async () => {
    const success = await inscripcionHook.submit('fer');
    if (success) {
      setShowConfirmation(true);
      setPlazasDisponibles((prev) => Math.max(0, prev - 1));
    }
  }, [inscripcionHook]);

  // ── Show upsell after confetti (only if user didn't select Peak Program) ──
  const handleShowUpsell = useCallback(() => {
    if (!inscripcionHook.formData.peakProgram) {
      setShowUpsell(true);
    }
  }, [inscripcionHook.formData.peakProgram]);

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
          onSubmit={handleFormSubmit}
        />
      </div>

      <GrHandlerService />

      <FerFooter contactEmail={competicion?.landingConfig?.contactEmail} />

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
        precioPeakProgram={competicion?.eventoConfig?.precioPeakProgram}
        fechaLimitePeakProgram={competicion?.eventoConfig?.fechaLimitePeakProgram ?? null}
      />
    </div>
  );
}

export default FerLanding;
