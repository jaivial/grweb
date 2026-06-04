import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the URL building without making real network calls.
describe('api.getAdminInscripciones — URL building', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockReset();
  });

  it('includes base URL with competicionId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } }),
    });
    const { api } = await import('./api');
    await api.getAdminInscripciones(42, { page: 1, pageSize: 15 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/admin/competiciones/42/inscripciones');
  });

  it('appends the 6 new filter params when set', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } }),
    });
    const { api } = await import('./api');
    await api.getAdminInscripciones(7, {
      page: 1,
      pageSize: 15,
      sexo: 'masculino',
      categoriaPeso: '-83kg',
      quiereHandler: true,
      quierePeakProgram: false,
      participacionConfirmada: true,
      hasCoupon: false,
    });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('sexo=masculino');
    expect(url).toContain('categoriaPeso=-83kg');
    expect(url).toContain('quiereHandler=true');
    expect(url).toContain('quierePeakProgram=false');
    expect(url).toContain('participacionConfirmada=true');
    expect(url).toContain('hasCoupon=false');
  });

  it('omits the 6 new filter params when null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } }),
    });
    const { api } = await import('./api');
    await api.getAdminInscripciones(7, { page: 1, pageSize: 15 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('sexo=');
    expect(url).not.toContain('categoriaPeso=');
    expect(url).not.toContain('quiereHandler=');
    expect(url).not.toContain('quierePeakProgram=');
    expect(url).not.toContain('participacionConfirmada=');
    expect(url).not.toContain('hasCoupon=');
  });

  it('preserves legacy params (pagoConfirmado, experiencia, etc.) alongside new ones', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } }),
    });
    const { api } = await import('./api');
    await api.getAdminInscripciones(7, {
      page: 1,
      pageSize: 15,
      search: 'alex',
      pagoConfirmado: true,
      experiencia: 'intermedio',
      modalidad: 'completa',
      paymentMethod: 'stripe',
      sexo: 'femenino',
    });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('search=alex');
    expect(url).toContain('pagoConfirmado=true');
    expect(url).toContain('experiencia=intermedio');
    expect(url).toContain('modalidad=completa');
    expect(url).toContain('paymentMethod=stripe');
    expect(url).toContain('sexo=femenino');
  });
});

describe('api.getAdminInscripcionStats', () => {
  it('hits the stats endpoint for the given competicion', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { revenue: 100, count: 5 } }),
    });
    const { api } = await import('./api');
    await api.getAdminInscripcionStats(13);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/admin/competiciones/13/inscripciones/stats');
  });
});

describe('api.drawRaffleInscripciones', () => {
  it('POSTs the raffle body to the right endpoint', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { winners: [], fallbackReason: undefined } }),
    });
    const { api } = await import('./api');
    await api.drawRaffleInscripciones(13, {
      filterCriteria: 'all',
      numWinners: 3,
      equityMode: 'none',
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/admin/competiciones/13/inscripciones/raffle');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      filterCriteria: 'all',
      numWinners: 3,
      equityMode: 'none',
    });
  });
});
