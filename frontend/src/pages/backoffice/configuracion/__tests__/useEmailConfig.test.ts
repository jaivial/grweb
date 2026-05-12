import { renderHook, act } from '@testing-library/react';
import { useEmailConfig } from '../hooks/useEmailConfig';
import api from '../../../../api/client';
import type { EmailConfigData } from '../hooks/useEmailConfig';

vi.mock('../../../../api/client', () => ({
  __esModule: true,
  default: {
    getEmailConfig: vi.fn(),
    updateEmailConfig: vi.fn(),
    deleteEmailConfig: vi.fn(),
  },
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

// Helper: wrap response in ApiResponse format
function ok<T>(data: T) { return { success: true as const, data }; }
function fail(message: string) { return { success: false as const, message }; }

describe('useEmailConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchConfig', () => {
    test('fetches config successfully', async () => {
      (api.getEmailConfig as jest.Mock).mockResolvedValue(ok(mockConfig));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(api.getEmailConfig).toHaveBeenCalledWith(undefined);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    test('fetches config with competicionId', async () => {
      (api.getEmailConfig as jest.Mock).mockResolvedValue(ok(mockConfig));

      const { result } = renderHook(() => useEmailConfig(5));

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(api.getEmailConfig).toHaveBeenCalledWith(5);
      expect(result.current.config).toEqual(mockConfig);
    });

    test('sets error on fetch failure', async () => {
      (api.getEmailConfig as jest.Mock).mockResolvedValue(fail('Network error'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.config).toBeNull();
    });

    test('sets error on exception', async () => {
      (api.getEmailConfig as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.fetchConfig();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.config).toBeNull();
    });
  });

  describe('saveConfig', () => {
    test('saves config successfully', async () => {
      (api.updateEmailConfig as jest.Mock).mockResolvedValue(ok(mockConfig));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(true);
      });

      expect(api.updateEmailConfig).toHaveBeenCalledWith(mockConfig, undefined);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.isSaving).toBe(false);
    });

    test('saves config with competicionId', async () => {
      (api.updateEmailConfig as jest.Mock).mockResolvedValue(ok(mockConfig));

      const { result } = renderHook(() => useEmailConfig(5));

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(true);
      });

      expect(api.updateEmailConfig).toHaveBeenCalledWith(mockConfig, 5);
    });

    test('returns false and sets error on save failure', async () => {
      (api.updateEmailConfig as jest.Mock).mockResolvedValue(fail('Save failed'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe('Save failed');
    });

    test('returns false on exception', async () => {
      (api.updateEmailConfig as jest.Mock).mockRejectedValue(new Error('Save failed'));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.saveConfig(mockConfig);
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe('Save failed');
    });

    test('saves Gmail config correctly', async () => {
      (api.updateEmailConfig as jest.Mock).mockResolvedValue(ok(mockGmailConfig));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        await result.current.saveConfig(mockGmailConfig);
      });

      expect(api.updateEmailConfig).toHaveBeenCalledWith(mockGmailConfig, undefined);
      expect(result.current.config?.mainProvider).toBe(1);
      expect(result.current.config?.gmailAddress).toBe('test@gmail.com');
    });

    test('sets isSaving state during save', async () => {
      let resolvePromise: (value: any) => void;
      (api.updateEmailConfig as jest.Mock).mockImplementation(
        () => new Promise<any>((resolve) => { resolvePromise = resolve; })
      );

      const { result } = renderHook(() => useEmailConfig());

      act(() => {
        result.current.saveConfig(mockConfig);
      });

      expect(result.current.isSaving).toBe(true);

      await act(async () => {
        resolvePromise!(ok(mockConfig));
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('deleteConfig', () => {
    test('deletes config successfully', async () => {
      (api.deleteEmailConfig as jest.Mock).mockResolvedValue(ok({ message: 'Deleted' }));

      const { result } = renderHook(() => useEmailConfig());

      await act(async () => {
        const success = await result.current.deleteConfig();
        expect(success).toBe(true);
      });

      expect(api.deleteEmailConfig).toHaveBeenCalledWith(undefined);
      expect(result.current.config).toBeNull();
    });

    test('deletes config with competicionId', async () => {
      (api.deleteEmailConfig as jest.Mock).mockResolvedValue(ok({ message: 'Deleted' }));

      const { result } = renderHook(() => useEmailConfig(5));

      await act(async () => {
        const success = await result.current.deleteConfig();
        expect(success).toBe(true);
      });

      expect(api.deleteEmailConfig).toHaveBeenCalledWith(5);
    });

    test('returns false on delete failure', async () => {
      (api.deleteEmailConfig as jest.Mock).mockResolvedValue(fail('Delete failed'));

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
