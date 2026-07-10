import { describe, expect, it } from 'vitest';
import { areInscripcionesAbiertas } from './inscripcionesAbiertas';
import type { EventoConfig } from '../../../types/api';

const base = { inscripcionesAbiertas: true } as unknown as EventoConfig;

describe('areInscripcionesAbiertas', () => {
  it('returns true when inscripcionesAbiertas is true', () => {
    expect(areInscripcionesAbiertas({ ...base, inscripcionesAbiertas: true })).toBe(true);
  });

  it('returns false when inscripcionesAbiertas is false', () => {
    expect(areInscripcionesAbiertas({ ...base, inscripcionesAbiertas: false })).toBe(false);
  });

  it('defaults to true when the flag is missing', () => {
    expect(areInscripcionesAbiertas({} as EventoConfig)).toBe(true);
  });

  it('defaults to true when eventoConfig is null or undefined', () => {
    expect(areInscripcionesAbiertas(null)).toBe(true);
    expect(areInscripcionesAbiertas(undefined)).toBe(true);
  });
});

import { isSoldOut } from './inscripcionesAbiertas';

describe('isSoldOut', () => {
  it('returns true when soldOut is true', () => {
    expect(isSoldOut({ soldOut: true } as EventoConfig)).toBe(true);
  });

  it('returns false when soldOut is false or missing', () => {
    expect(isSoldOut({ soldOut: false } as EventoConfig)).toBe(false);
    expect(isSoldOut({} as EventoConfig)).toBe(false);
    expect(isSoldOut(null)).toBe(false);
    expect(isSoldOut(undefined)).toBe(false);
  });
});
