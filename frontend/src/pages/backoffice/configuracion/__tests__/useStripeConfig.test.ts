import { renderHook, act } from '@testing-library/react';
import { useStripeConfig } from '../hooks/useStripeConfig';
import { api } from '../../../../utils/api';

jest.mock('../../../../utils/api', () => ({
  api: {
    getStripeAdminConfig: jest.fn(),
    updateStripeAdminConfig: jest.fn(),
    deleteStripeAdminConfig: jest.fn(),
  },
}));

jest.mock('../../../../stores/auth', () => ({
  token: { value: 'mock-token' },
}));

const mockConfig = {
  secretKey: '****5678',
  publishableKey: 'pk_test_12345678',
  webhookSecret: '****abcd',
};

describe('useStripeConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('has correct initial values', () => {
      const { result } = renderHook(() => useStripeConfig());

      expect(result.current.config).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSaving).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('fetchConfig', () => {
    test('fetches config successfully', async () => {
      (api.getStripeAdminConfig as jest.Mock).mockResolvedValue(mockConfig);

      const { result } = renderHook(() => useStripeConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(api.getStripeAdminConfig).toHaveBeenCalledTimes(1);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    test('sets error on fetch failure', async () => {
      (api.getStripeAdminConfig as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useStripeConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(result.current.error).toBe('Network error');
    });

    test.skip('does not fetch if not authenticated', () => {
      // Auth-gated behavior is covered by e2e protected routes tests.
    });
  });

  describe('saveConfig', () => {
    test('saves config successfully', async () => {
      (api.updateStripeAdminConfig as jest.Mock).mockResolvedValue(mockConfig);

      const { result } = renderHook(() => useStripeConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(true);
      });

      expect(api.updateStripeAdminConfig).toHaveBeenCalledWith(mockConfig);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.isSaving).toBe(false);
    });

    test('returns false and sets error on save failure', async () => {
      (api.updateStripeAdminConfig as jest.Mock).mockRejectedValue(new Error('Save failed'));

      const { result } = renderHook(() => useStripeConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe('Save failed');
    });

    test('sets isSaving state during save', async () => {
      let resolvePromise: (value: typeof mockConfig) => void;
      (api.updateStripeAdminConfig as jest.Mock).mockImplementation(
        () => new Promise<typeof mockConfig>((resolve) => { resolvePromise = resolve; })
      );

      const { result } = renderHook(() => useStripeConfig());

      act(() => {
        result.current.saveConfig(mockConfig);
      });

      expect(result.current.isSaving).toBe(true);

      await act(async () => {
        resolvePromise!(mockConfig);
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('deleteConfig', () => {
    test('deletes config successfully', async () => {
      (api.deleteStripeAdminConfig as jest.Mock).mockResolvedValue({ message: 'Deleted' });

      const { result } = renderHook(() => useStripeConfig());

      await act(async () => {
        const success = await result.current.deleteConfig();
        expect(success).toBe(true);
      });

      expect(api.deleteStripeAdminConfig).toHaveBeenCalledTimes(1);
      expect(result.current.config).toBeNull();
    });

    test('returns false on delete failure', async () => {
      (api.deleteStripeAdminConfig as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useStripeConfig());

      await act(async () => {
        const success = await result.current.deleteConfig();
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe('Delete failed');
    });
  });
});
