import type { EventoConfigFormData } from './types';

export const DEFAULT_EVENTO_CONFIG: EventoConfigFormData = {
  aforMaximo: 100,
  precioBase: 35,
  precioUpsell: 60,
  precioRifa: 5,
  precioHandler: 0,
  precioPeakProgram: 0,
  fechaLimitePeakProgram: '',
  maxTicketsPorPersona: 10,
  inscripcionAbierta: true,
} as const;

export const FIELD_CONFIG = [
  { key: 'precioBase' as const, label: 'Precio inscripción', suffix: 'EUR', min: 0, step: 1 },
  { key: 'precioUpsell' as const, label: 'Precio upsell preparación', suffix: 'EUR', min: 0, step: 1 },
  { key: 'precioHandler' as const, label: 'Precio handler GR Strength', suffix: 'EUR', min: 0, step: 1 },
  { key: 'precioRifa' as const, label: 'Precio ticket rifa', suffix: 'EUR', min: 0, step: 0.5 },
  { key: 'precioPeakProgram' as const, label: 'Precio GRS Peak Program', suffix: 'EUR', min: 0, step: 1 },
  { key: 'fechaLimitePeakProgram' as const, label: 'Fecha límite GRS Peak Program', suffix: 'DATE', min: 0, step: 1 },
  { key: 'aforMaximo' as const, label: 'Aforo máximo', suffix: null, min: 1, step: 1 },
  { key: 'maxTicketsPorPersona' as const, label: 'Max tickets por persona', suffix: null, min: 1, step: 1 },
] as const;
