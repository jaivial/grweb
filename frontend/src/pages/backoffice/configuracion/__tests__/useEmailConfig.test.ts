import { renderHook, act } from '@testing-library/react';
import { useEmailConfig } from '../hooks/useEmailConfig';
import { api } from '../../../../utils/api';
import type { EmailConfigData } from '../hooks/useEmailConfig';

jest.mock('../../../../utils/api', () => ({
  api: {
    getEmailConfig: jest.fn(),
    updateEmailConfig: jest.fn(),
    deleteEmailConfig: jest.fn(),
  },
}));

jest.mock('../../../../stores/auth', () => ({
  token: { value: 'mock-token' },
}));

const mockConfig: EmailConfigData = {
  mainProvider: 0,
  gmailAddress: null,
  gmailAppPassword: null,
  smtpUsername: 'test@example.com',
  smtpPassword: 'password123',
  smtpEmailAddress: 'noreply@example.com',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
};

const mockGmailConfig: EmailConfigData = {
  mainProvider: 1,
  gmailAddress: 'test@gmail.com',
  gmailAppPassword: 'xxxx xxxx xxxx xxxx',
  smtpUsername: null,
  smtpPassword: null,
  smtpEmailAddress: null,
  smtpHost: null,
  smtpPort: 0,
};

describe('useEmailConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchConfig', () => {
    test('fetches config successfully', async () => {
      (api.getEmailConfig as jest.Mock).mockResolvedValue(mockConfig);

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(api.getEmailConfig).toHaveBeenCalledTimes(1);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    test('sets error on fetch failure', async () => {
      (api.getEmailConfig as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.config).toBeNull();
    });

    // Note: Testing auth-gated fetch requires module reloading via isolateModules.
    // The "does not fetch if not authenticated" scenario is covered by e2e tests
    // (protected-routes.spec.ts) which verify unauthenticated redirects.
    test.skip('does not fetch if not authenticated', () => {
      // This test requires module reloading which is complex.
      // Auth-gated behavior is covered by e2e protected routes tests.
    });
  });

  describe('saveConfig', () => {
    test('saves config successfully', async () => {
      (api.updateEmailConfig as jest.Mock).mockResolvedValue(mockConfig);

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(true);
      });

      expect(api.updateEmailConfig).toHaveBeenCalledWith(mockConfig);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.isSaving).toBe(false);
    });

    test('returns false and sets error on save failure', async () => {
      (api.updateEmailConfig as jest.Mock).mockRejectedValue(new Error('Save failed'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe('Save failed');
    });

    test('saves Gmail config correctly', async () => {
      (api.updateEmailConfig as jest.Mock).mockResolvedValue(mockGmailConfig);

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.saveConfig(mockGmailConfig);
      });

      expect(api.updateEmailConfig).toHaveBeenCalledWith(mockGmailConfig);
      expect(result.current.config?.mainProvider).toBe(1);
      expect(result.current.config?.gmailAddress).toBe('test@gmail.com');
    });

    test('sets isSaving state during save', async () => {
      let resolvePromise: (value: typeof mockConfig) => void;
      (api.updateEmailConfig as jest.Mock).mockImplementation(
        () => new Promise<typeof mockConfig>((resolve) => { resolvePromise = resolve; })
      );

      const { result } = renderHook(() => useEmailConfig());

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
      (api.deleteEmailConfig as jest.Mock).mockResolvedValue({ message: 'Deleted' });

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.deleteConfig();
        expect(success).toBe(true);
      });

      expect(api.deleteEmailConfig).toHaveBeenCalledTimes(1);
      expect(result.current.config).toBeNull();
    });

    test('returns false on delete failure', async () => {
      (api.deleteEmailConfig as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.deleteConfig();
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe('Delete failed');
    });
  });

  describe('initial state', () => {
    test('has correct initial values', () => {
      const { result } = renderHook(() => useEmailConfig());

      expect(result.current.config).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSaving).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
