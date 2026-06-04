import { describe, expect, it } from 'vitest';
import { buildFerConfigSnapshot, isFerConfigSnapshotEqual } from './configSnapshot';

describe('buildFerConfigSnapshot', () => {
  it('normalizes config response into a comparable snapshot', () => {
    const snapshot = buildFerConfigSnapshot({
      precioBase: 35,
      precioHandler: 0,
      precioPeakProgram: 30,
      precioRifa: 5,
      aforoMaximo: 70,
      plazasDisponibles: 12,
      fechaLimitePeakProgram: '2026-07-04',
      inscripcionAbierta: true,
      pagoStripeActivo: true,
      pagoEfectivoActivo: false,
      cuponesDescuentoActivo: true,
      stripeDisponible: true,
      categoriasMasculino: ['-74', '-83'],
      categoriasFemenino: ['-57', '-63'],
    });

    expect(snapshot).toEqual({
      precioBase: 35,
      precioHandler: 0,
      precioPeakProgram: 30,
      precioRifa: 5,
      aforoMaximo: 70,
      plazasDisponibles: 12,
      fechaLimitePeakProgram: '2026-07-04',
      inscripcionAbierta: true,
      pagoStripeActivo: true,
      pagoEfectivoActivo: false,
      cuponesDescuentoActivo: true,
      stripeDisponible: true,
      categoriasMasculino: ['-74', '-83'],
      categoriasFemenino: ['-57', '-63'],
    });
  });
});

describe('isFerConfigSnapshotEqual', () => {
  const baseSnapshot = buildFerConfigSnapshot({
    precioBase: 35,
    precioHandler: 0,
    precioPeakProgram: 30,
    precioRifa: 5,
    aforoMaximo: 70,
    plazasDisponibles: 12,
    fechaLimitePeakProgram: '2026-07-04',
    inscripcionAbierta: true,
    pagoStripeActivo: true,
    pagoEfectivoActivo: false,
    cuponesDescuentoActivo: true,
    stripeDisponible: true,
    categoriasMasculino: ['-74', '-83'],
    categoriasFemenino: ['-57', '-63'],
  });

  it('returns true for equal snapshots', () => {
    expect(isFerConfigSnapshotEqual(baseSnapshot, { ...baseSnapshot })).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(
      isFerConfigSnapshotEqual(baseSnapshot, {
        ...baseSnapshot,
        pagoEfectivoActivo: true,
      })
    ).toBe(false);
  });

  it('ignores capacity, availability, and category differences', () => {
    expect(
      isFerConfigSnapshotEqual(baseSnapshot, {
        ...baseSnapshot,
        aforoMaximo: 999,
        plazasDisponibles: 1,
        fechaLimitePeakProgram: '2099-01-01',
        categoriasMasculino: ['-83', '-74'],
        categoriasFemenino: ['-63', '-57'],
      })
    ).toBe(true);
  });
});
