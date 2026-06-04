import type { FerConfigSnapshot } from '../../../types/api';

type SnapshotSource = Omit<FerConfigSnapshot, 'categoriasMasculino' | 'categoriasFemenino'> & {
  categoriasMasculino?: string[];
  categoriasFemenino?: string[];
};

export function buildFerConfigSnapshot(source: SnapshotSource): FerConfigSnapshot {
  return {
    precioBase: source.precioBase,
    precioHandler: source.precioHandler,
    precioPeakProgram: source.precioPeakProgram,
    precioRifa: source.precioRifa,
    aforoMaximo: source.aforoMaximo,
    plazasDisponibles: source.plazasDisponibles,
    fechaLimitePeakProgram: source.fechaLimitePeakProgram,
    inscripcionAbierta: source.inscripcionAbierta,
    pagoStripeActivo: source.pagoStripeActivo,
    pagoEfectivoActivo: source.pagoEfectivoActivo,
    cuponesDescuentoActivo: source.cuponesDescuentoActivo,
    stripeDisponible: source.stripeDisponible,
    categoriasMasculino: [...(source.categoriasMasculino ?? [])],
    categoriasFemenino: [...(source.categoriasFemenino ?? [])],
  };
}

export function isFerConfigSnapshotEqual(current: FerConfigSnapshot | null, next: FerConfigSnapshot | null): boolean {
  if (current == null || next == null) return false;

  return current.precioBase === next.precioBase
    && current.precioHandler === next.precioHandler
    && current.precioPeakProgram === next.precioPeakProgram
    && current.precioRifa === next.precioRifa
    && current.inscripcionAbierta === next.inscripcionAbierta
    && current.pagoStripeActivo === next.pagoStripeActivo
    && current.pagoEfectivoActivo === next.pagoEfectivoActivo
    && current.cuponesDescuentoActivo === next.cuponesDescuentoActivo
    && current.stripeDisponible === next.stripeDisponible;
}
