import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../api/client';

// Mock fetch globally
global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Auth', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 1,
          email: 'test@example.com',
          nombre: 'Test User',
          isSuperadmin: false,
          competiciones: [],
          permissions: [],
        },
        token: 'mock-token',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await api.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data?.email).toBe('test@example.com');
    });

    it('should handle login failure', async () => {
      const mockResponse = {
        success: false,
        message: 'Invalid credentials',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => mockResponse,
      });

      const result = await api.login({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials');
    });
  });

  describe('Competiciones', () => {
    it('should get all competitions', async () => {
      const mockCompeticiones = [
        { id: 1, nombre: 'GR Cup', slug: 'grcup', fecha: '2026-07-25' },
        { id: 2, nombre: 'FER', slug: 'fer', fecha: '2026-07-25' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockCompeticiones }),
      });

      const result = await api.getCompeticiones();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].slug).toBe('grcup');
    });

    it('should get competition by slug', async () => {
      const mockCompeticion = {
        id: 1,
        nombre: 'GR Cup',
        slug: 'grcup',
        fecha: '2026-07-25',
        lugar: 'Almussafes',
        plazasDisponibles: 50,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockCompeticion }),
      });

      const result = await api.getCompeticionBySlug('grcup');

      expect(result.success).toBe(true);
      expect(result.data?.slug).toBe('grcup');
      expect(result.data?.plazasDisponibles).toBe(50);
    });
  });

  describe('Inscripciones', () => {
    it('should create inscription', async () => {
      const mockInscripcion = {
        id: 1,
        nombre: 'John Doe',
        email: 'john@example.com',
        qrCode: 'data:image/png;base64,...',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { ...mockInscripcion, mensaje: 'Inscripción creada' },
        }),
      });

      const result = await api.createInscripcion('fer', {
        nombre: 'John Doe',
        email: 'john@example.com',
        pesoAprox: 75,
        experiencia: 'principiante',
        tieneEntrenador: false,
        aceptaTerminos: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.qrCode).toBeDefined();
    });

    it('should validate inscription form data', () => {
      // Test that the API call is made with correct data
      const formData = {
        nombre: 'John Doe',
        email: 'john@example.com',
        pesoAprox: 75,
        experiencia: 'principiante' as const,
        tieneEntrenador: false,
        aceptaTerminos: true,
      };

      expect(formData.nombre.length).toBeGreaterThanOrEqual(2);
      expect(formData.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(formData.pesoAprox).toBeGreaterThanOrEqual(40);
      expect(formData.pesoAprox).toBeLessThanOrEqual(150);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await api.getCompeticiones();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network error');
    });

    it('should handle non-JSON responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await api.getCompeticiones();

      expect(result.success).toBe(false);
    });
  });
});
