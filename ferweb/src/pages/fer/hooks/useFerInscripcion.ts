import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import type { CreateInscripcionRequest } from '../../../types/api';

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
  sexo: z.enum(['masculino', 'femenino'], {
    errorMap: () => ({ message: 'Selecciona tu sexo' }),
  }),
  categoriaPeso: z
    .string()
    .min(1, 'Selecciona una categoría de peso'),
  quiereHandler: z.boolean(),
  experiencia: z.enum(['rookie', 'principiante', 'intermedio', 'avanzado']),
  tieneEntrenador: z.boolean(),
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
  quiereHandler: false,
  experiencia: 'principiante',
  tieneEntrenador: false,
  aceptaTerminos: false,
};

// ─── Hook ───

interface UseFerInscripcionReturn {
  formData: FerInscripcionFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  inscripcionResult: { id: number; qrCode: string } | null;
  isDuplicateEmail: boolean;
  updateField: <K extends keyof FerInscripcionFormData>(
    field: K,
    value: FerInscripcionFormData[K]
  ) => void;
  validate: () => boolean;
  submit: (slug: string) => Promise<boolean>;
  reset: () => void;
  setInscripcionResult: (result: { id: number; qrCode: string } | null) => void;
  clearDuplicateEmail: () => void;
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

  const updateField = useCallback(
    <K extends keyof FerInscripcionFormData>(
      field: K,
      value: FerInscripcionFormData[K]
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
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
      result.error.errors.forEach((err) => {
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

  const submit = useCallback(
    async (slug: string): Promise<boolean> => {
      if (!validate()) return false;

      setIsSubmitting(true);
      try {
        const payload: CreateInscripcionRequest = {
          nombre: formData.nombre.trim(),
          email: formData.email.trim(),
          instagram: formData.instagram || undefined,
          telefono: formData.telefono.trim() || undefined,
          sexo: formData.sexo,
          categoriaPeso: formData.categoriaPeso,
          quiereHandler: formData.quiereHandler,
          experiencia: formData.experiencia,
          tieneEntrenador: formData.tieneEntrenador,
          upsellPreparacion: false,
          aceptaTerminos: true,
        };

        const result = await api.createInscripcion(slug, payload);

        if (result.success && result.data) {
          setInscripcionResult({
            id: result.data.id,
            qrCode: result.data.qrCode || '',
          });
          toast.success('¡Inscripción confirmada!', {
            icon: '✨',
            style: { background: '#161B26', color: '#F8FAFC' },
          });
          return true;
        } else {
          const isDuplicate = /email already registered/i.test(result.message || '');
          if (isDuplicate) {
            setIsDuplicateEmail(true);
          } else {
            toast.error(result.message || 'Error al inscribirte', {
              style: { background: '#161B26', color: '#F8FAFC' },
            });
          }
          return false;
        }
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
    [formData, validate]
  );

  const reset = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    setIsSubmitting(false);
    setInscripcionResult(null);
    setIsDuplicateEmail(false);
  }, []);

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
    updateField,
    validate,
    submit,
    reset,
    setInscripcionResult,
    clearDuplicateEmail,
  };
}
