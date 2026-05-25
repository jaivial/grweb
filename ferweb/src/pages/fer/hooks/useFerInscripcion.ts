import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import type { CouponValidationResponse, CreateInscripcionRequest } from '../../../types/api';
import { MODALIDAD_VALUES } from '../constants';

// ─── Zod Schema ───

export const ferInscripcionSchema = z.object({
  nombre: z
    .string()
    .min(2, 'Nombre demasiado corto')
    .max(100, 'Nombre demasiado largo'),
  email: z
    .string()
    .email('Email inválido'),
  instagram: z
    .string()
    .regex(/^@?[\w.]{1,30}$/, 'Formato de Instagram inválido')
    .optional()
    .or(z.literal('')),
  telefono: z
    .string()
    .min(6, 'Teléfono demasiado corto')
    .max(50, 'Teléfono demasiado largo')
    .regex(/^[+]?[\d\s()-]{6,50}$/, 'Formato de teléfono inválido'),
  sexo: z.enum(['masculino', 'femenino'], { error: 'Selecciona tu sexo' }),
  categoriaPeso: z
    .string()
    .min(1, 'Selecciona una categoría de peso'),
  modalidad: z.enum(MODALIDAD_VALUES, { error: 'Selecciona una modalidad' }),
  quiereHandler: z.boolean(),
  experiencia: z.enum(['rookie', 'principiante', 'intermedio', 'avanzado']),
  peakProgram: z.boolean(),
  aceptaTerminos: z.boolean().refine((val) => val === true, {
    message: 'Debes aceptar los términos y condiciones',
  }),
});

export type FerInscripcionFormData = z.infer<typeof ferInscripcionSchema>;

// ─── Initial Values ───

export const INITIAL_FORM_DATA: FerInscripcionFormData = {
  nombre: '',
  email: '',
  instagram: '',
  telefono: '',
  sexo: 'masculino',
  categoriaPeso: '',
  modalidad: 'completa',
  quiereHandler: false,
  experiencia: 'principiante',
  peakProgram: false,
  aceptaTerminos: false,
};

// ─── Hook ───

export interface UseFerInscripcionReturn {
  formData: FerInscripcionFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  inscripcionResult: { id: number; qrCode: string } | null;
  isDuplicateEmail: boolean;
  couponCode: string;
  appliedCoupon: CouponValidationResponse | null;
  couponError: string | null;
  isValidatingCoupon: boolean;
  updateField: <K extends keyof FerInscripcionFormData>(
    field: K,
    value: FerInscripcionFormData[K]
  ) => void;
  validate: () => boolean;
  applyCoupon: (slug: string) => Promise<boolean>;
  removeCoupon: () => void;
  submit: (slug: string) => Promise<boolean>;
  submitCash: (slug: string, includeOnlinePaymentLink?: boolean) => Promise<boolean>;
  startStripeCheckout: (slug: string) => Promise<'redirecting' | 'already_paid' | 'stripe_unavailable' | 'error'>;
  reset: () => void;
  setInscripcionResult: (result: { id: number; qrCode: string } | null) => void;
  clearDuplicateEmail: () => void;
  setCouponCode: (value: string) => void;
}

export function useFerInscripcion(): UseFerInscripcionReturn {
  const [formData, setFormData] = useState<FerInscripcionFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inscripcionResult, setInscripcionResult] = useState<{
    id: number;
    qrCode: string;
  } | null>(null);
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const updateField = useCallback(
    <K extends keyof FerInscripcionFormData>(
      field: K,
      value: FerInscripcionFormData[K]
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (field === 'peakProgram' || field === 'modalidad') {
        setAppliedCoupon(null);
        setCouponError(null);
      }
      // Clear error on field change
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    []
  );

  const validate = useCallback((): boolean => {
    const result = ferInscripcionSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }, [formData]);

  const buildPayload = useCallback(
    (paymentMethod: 'efectivo' | 'stripe', includeOnlinePaymentLink = false): CreateInscripcionRequest => ({
      nombre: formData.nombre.trim(),
      email: formData.email.trim(),
      instagram: formData.instagram || undefined,
      telefono: formData.telefono.trim() || undefined,
      sexo: formData.sexo,
      categoriaPeso: formData.categoriaPeso,
      modalidad: formData.modalidad,
      quiereHandler: formData.quiereHandler,
      experiencia: formData.experiencia,
      peakProgram: formData.peakProgram,
      paymentMethod,
      includeOnlinePaymentLink,
      aceptaTerminos: true,
      codigoCupon: appliedCoupon?.codigo,
    }),
    [appliedCoupon?.codigo, formData]
  );

  const applyCoupon = useCallback(
    async (slug: string): Promise<boolean> => {
      const code = couponCode.trim();
      if (!code) {
        setCouponError('Introduce un cupón.');
        setAppliedCoupon(null);
        return false;
      }

      setIsValidatingCoupon(true);
      setCouponError(null);
      try {
        const result = await api.validateCoupon(slug, code, formData.peakProgram, formData.modalidad);
        if (!result.success || !result.data) {
          setCouponError(result.message || 'No se pudo validar el cupón.');
          setAppliedCoupon(null);
          return false;
        }

        if (!result.data.valid) {
          setCouponError(result.data.message || 'Cupón no válido.');
          setAppliedCoupon(null);
          return false;
        }

        setAppliedCoupon(result.data);
        toast.success('Cupón aplicado', {
          style: { background: '#161B26', color: '#F8FAFC' },
        });
        return true;
      } catch (error) {
        console.error('Coupon validation error:', error);
        setCouponError('Error de conexión validando el cupón.');
        setAppliedCoupon(null);
        return false;
      } finally {
        setIsValidatingCoupon(false);
      }
    },
    [couponCode, formData.modalidad, formData.peakProgram]
  );

  const removeCoupon = useCallback(() => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError(null);
  }, []);

  const handleDuplicateOrError = useCallback((message?: string) => {
    const isDuplicate = /email already registered/i.test(message || '');
    if (isDuplicate) {
      setIsDuplicateEmail(true);
      return;
    }

    toast.error(message || 'Error al inscribirte', {
      style: { background: '#161B26', color: '#F8FAFC' },
    });
  }, []);

  const submitCash = useCallback(
    async (slug: string, includeOnlinePaymentLink = false): Promise<boolean> => {
      if (!validate()) return false;

      setIsSubmitting(true);
      try {
        const result = await api.createInscripcion(slug, buildPayload('efectivo', includeOnlinePaymentLink));

        if (result.success && result.data) {
          setInscripcionResult({
            id: result.data.id,
            qrCode: result.data.qrCode || '',
          });
          toast.success('¡Inscripción registrada!', {
            icon: '✨',
            style: { background: '#161B26', color: '#F8FAFC' },
          });
          return true;
        }

        handleDuplicateOrError(result.message);
        return false;
      } catch (error) {
        console.error('Submit error:', error);
        toast.error('Error de conexión. Intenta de nuevo.', {
          style: { background: '#161B26', color: '#F8FAFC' },
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildPayload, handleDuplicateOrError, validate]
  );

  const startStripeCheckout = useCallback(
    async (slug: string): Promise<'redirecting' | 'already_paid' | 'stripe_unavailable' | 'error'> => {
      if (!validate()) return 'error';

      setIsSubmitting(true);
      try {
        const result = await api.createStripeInscripcionCheckout(slug, buildPayload('stripe'));

        if (!result.success || !result.data) {
          handleDuplicateOrError(result.message);
          return 'error';
        }

        if (result.data.status === 'already_paid') {
          setInscripcionResult({
            id: result.data.id || result.data.inscripcionId || 0,
            qrCode: result.data.qrCode || '',
          });
          toast.success('Tu inscripción ya estaba pagada.', {
            style: { background: '#161B26', color: '#F8FAFC' },
          });
          return 'already_paid';
        }

        if (result.data.status === 'stripe_unavailable') {
          toast.error('El pago online no está disponible ahora mismo.', {
            style: { background: '#161B26', color: '#F8FAFC' },
          });
          return 'stripe_unavailable';
        }

        if (!result.data.url) {
          toast.error('No se pudo iniciar el pago online.', {
            style: { background: '#161B26', color: '#F8FAFC' },
          });
          return 'error';
        }

        toast.success('Redirigiendo a Stripe...', {
          style: { background: '#161B26', color: '#F8FAFC' },
        });
        window.location.href = result.data.url;
        return 'redirecting';
      } catch (error) {
        console.error('Stripe checkout error:', error);
        toast.error('Error de conexión. Intenta de nuevo.', {
          style: { background: '#161B26', color: '#F8FAFC' },
        });
        return 'error';
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildPayload, handleDuplicateOrError, validate]
  );

  const submit = useCallback(
    async (slug: string): Promise<boolean> => {
      return submitCash(slug);
    },
    [submitCash]
  );

  const reset = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    setIsSubmitting(false);
    setInscripcionResult(null);
    setIsDuplicateEmail(false);
    removeCoupon();
  }, [removeCoupon]);

  const clearDuplicateEmail = useCallback(() => {
    setIsDuplicateEmail(false);
    setFormData((prev) => ({ ...prev, email: '' }));
  }, []);

  // Memoized derived state
  const errorsMemo = useMemo(() => errors, [errors]);

  return {
    formData,
    errors: errorsMemo,
    isSubmitting,
    inscripcionResult,
    isDuplicateEmail,
    couponCode,
    appliedCoupon,
    couponError,
    isValidatingCoupon,
    updateField,
    validate,
    applyCoupon,
    removeCoupon,
    submit,
    submitCash,
    startStripeCheckout,
    reset,
    setInscripcionResult,
    clearDuplicateEmail,
    setCouponCode,
  };
}
