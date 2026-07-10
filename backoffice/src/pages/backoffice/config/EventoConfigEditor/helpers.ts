import type { EventoConfigFormData } from './types';

export function toFormData(raw: Record<string, unknown>): EventoConfigFormData {
  const pagoStripeActivo = typeof raw.pagoStripeActivo === 'boolean' ? raw.pagoStripeActivo : false;
  const pagoEfectivoActivo = typeof raw.pagoEfectivoActivo === 'boolean' ? raw.pagoEfectivoActivo : true;

  return {
    aforMaximo: typeof raw.aforMaximo === 'number' ? raw.aforMaximo : 100,
    precioBase: typeof raw.precioBase === 'number' ? raw.precioBase : 35,
    precioUpsell: typeof raw.precioUpsell === 'number' ? raw.precioUpsell : 60,
    precioRifa: typeof raw.precioRifa === 'number' ? raw.precioRifa : 5,
    precioHandler: typeof raw.precioHandler === 'number' ? raw.precioHandler : 0,
    precioPeakProgram: typeof raw.precioPeakProgram === 'number' ? raw.precioPeakProgram : 0,
    fechaLimitePeakProgram: typeof raw.fechaLimitePeakProgram === 'string' ? raw.fechaLimitePeakProgram : '',
    maxTicketsPorPersona: typeof raw.maxTicketsPorPersona === 'number' ? raw.maxTicketsPorPersona : 10,
    inscripcionAbierta: typeof raw.inscripcionAbierta === 'boolean' ? raw.inscripcionAbierta : true,
    inscripcionesAbiertas: typeof raw.inscripcionesAbiertas === 'boolean' ? raw.inscripcionesAbiertas : true,
    soldOut: typeof raw.soldOut === 'boolean' ? raw.soldOut : false,
    pagoStripeActivo,
    pagoEfectivoActivo: !pagoStripeActivo && !pagoEfectivoActivo ? true : pagoEfectivoActivo,
    cuponesDescuentoActivo: typeof raw.cuponesDescuentoActivo === 'boolean' ? raw.cuponesDescuentoActivo : false,
  };
}
