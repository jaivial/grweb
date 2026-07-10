import { describe, it, expect } from 'vitest';
import { toFormData } from './helpers';

describe('toFormData', () => {
  it('reads inscripcionesAbiertas from raw config', () => {
    const result = toFormData({ inscripcionesAbiertas: false });
    expect(result.inscripcionesAbiertas).toBe(false);
  });

  it('defaults inscripcionesAbiertas to true when missing', () => {
    const result = toFormData({});
    expect(result.inscripcionesAbiertas).toBe(true);
  });

  it('keeps inscripcionesAbiertas true when explicitly open', () => {
    const result = toFormData({ inscripcionesAbiertas: true });
    expect(result.inscripcionesAbiertas).toBe(true);
  });
});
