import type { EventoConfigFormData } from './types';

export function toFormData(raw: Record<string, unknown>): EventoConfigFormData {
  return {
    aforMaximo: typeof raw.aforMaximo === 'number' ? raw.aforMaximo : 100,
    precioBase: typeof raw.precioBase === 'number' ? raw.precioBase : 35,
    precioUpsell: typeof raw.precioUpsell === 'number' ? raw.precioUpsell : 60,
    precioRifa: typeof raw.precioRifa === 'number' ? raw.precioRifa : 5,
    precioHandler: typeof raw.precioHandler === 'number' ? raw.precioHandler : 0,
    maxTicketsPorPersona: typeof raw.maxTicketsPorPersona === 'number' ? raw.maxTicketsPorPersona : 10,
    inscripcionAbierta: typeof raw.inscripcionAbierta === 'boolean' ? raw.inscripcionAbierta : true,
  };
}
