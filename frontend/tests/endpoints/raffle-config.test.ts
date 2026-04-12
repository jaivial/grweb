/**
 * Raffle Config Endpoint Tests
 * 
 * Tests for /api/admin/raffle-config endpoints.
 * Run with: npm test -- tests/endpoints/raffle-config.test.ts
 */

import { createApiClient, API_URL } from './api-client';

describe('Raffle Config Endpoints', () => {
  let api: Awaited<ReturnType<typeof createApiClient>>;
  let originalRaffleMethod: number = 0;

  beforeAll(async () => {
    api = await createApiClient();

    // Save original raffle method
    const response = await api.get('/api/admin/raffle-config');
    const json = await response.json();
    originalRaffleMethod = json.raffleMethod ?? 0;
  });

  afterAll(async () => {
    // Restore original raffle method
    try {
      await api.put('/api/admin/raffle-config', {
        isEnabled: true,
        disabledMessage: null,
        raffleMethod: originalRaffleMethod,
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('GET /api/admin/raffle-config', () => {
    it('should return raffle config with expected properties', async () => {
      const response = await api.get('/api/admin/raffle-config');
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(typeof json.raffleMethod).toBe('number');
      expect(typeof json.isEnabled).toBe('boolean');
    });
  });

  describe('PUT /api/admin/raffle-config', () => {
    it('should update raffle method to 1 (custom)', async () => {
      const response = await api.put('/api/admin/raffle-config', {
        isEnabled: true,
        disabledMessage: null,
        raffleMethod: 1,
      });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.raffleMethod).toBe(1);
    });

    it('should update raffle method to 0 (default)', async () => {
      const response = await api.put('/api/admin/raffle-config', {
        isEnabled: true,
        disabledMessage: null,
        raffleMethod: 0,
      });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.raffleMethod).toBe(0);
    });

    it('should set disabled message', async () => {
      const response = await api.put('/api/admin/raffle-config', {
        isEnabled: false,
        disabledMessage: 'Sorteo temporalmente desactivado',
        raffleMethod: 0,
      });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.disabledMessage).toBe('Sorteo temporalmente desactivado');
    });
  });
});

describe('Public Raffle Endpoints', () => {
  let api: Awaited<ReturnType<typeof createApiClient>>;

  beforeAll(async () => {
    api = await createApiClient();
  });

  describe('GET /api/raffle/products', () => {
    it('should return products when raffle method is 1', async () => {
      // Set raffle method to 1 (custom)
      await api.put('/api/admin/raffle-config', {
        isEnabled: true,
        disabledMessage: null,
        raffleMethod: 1,
      });

      const response = await fetch(`${API_URL}/api/raffle/products`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(typeof json.raffleMethod).toBe('number');
      expect(json.raffleMethod).toBe(1);
      expect(Array.isArray(json.products)).toBe(true);
    });

    it('should return empty products when raffle method is 0', async () => {
      // Set raffle method to 0 (default)
      await api.put('/api/admin/raffle-config', {
        isEnabled: true,
        disabledMessage: null,
        raffleMethod: 0,
      });

      const response = await fetch(`${API_URL}/api/raffle/products`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.raffleMethod).toBe(0);
      expect(json.products).toHaveLength(0);
    });
  });
});
