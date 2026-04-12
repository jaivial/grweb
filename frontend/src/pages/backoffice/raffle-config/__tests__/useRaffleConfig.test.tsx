/**
 * TDD RED: Tests for RaffleConfigPage.
 * Run: npx vitest run --project unit -- src/pages/backoffice/raffle-config
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import { api } from '../../../../utils/api';

vi.mock('../../../../utils/api', () => ({
  api: {
    getRaffleConfig: vi.fn(),
    updateRaffleConfig: vi.fn(),
  },
}));

vi.mock('../../../../stores/auth', () => ({
  token: { value: 'mock-token' },
  isAuthenticated: { value: true },
}));

const mockApi = api as vi.Mocked<typeof api>;

const mockEnabled = { isEnabled: true, disabledMessage: null as string | null, raffleMethod: 'default' as const };
const mockDisabled = { isEnabled: false, disabledMessage: 'El sorteo ha terminado.', raffleMethod: 'default' as const };

const { RaffleConfigPage } = await import('../RaffleConfigPage') as { RaffleConfigPage: React.ComponentType };

function renderPage(config = mockEnabled) {
  mockApi.getRaffleConfig.mockResolvedValue(config);
  return render(<RaffleConfigPage />);
}

describe('RaffleConfigPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('fetches config on mount', () => {
    renderPage();
    expect(mockApi.getRaffleConfig).toHaveBeenCalledTimes(1);
  });

  test('shows loading spinner while fetching', () => {
    mockApi.getRaffleConfig.mockImplementation(() => new Promise(() => {}));
    const { queryByTestId } = renderPage();
    expect(queryByTestId('loading-spinner')).toBeInTheDocument();
  });

  test('shows "Sorteo activo" when enabled', async () => {
    const { findByText } = renderPage(mockEnabled);
    expect(await findByText(/sorteo activo/i)).toBeInTheDocument();
  });

  test('shows "Sorteo desactivado" when disabled', async () => {
    const { findByText } = renderPage(mockDisabled);
    expect(await findByText(/sorteo desactivado/i)).toBeInTheDocument();
  });

  test('shows message input when disabled', async () => {
    const { findByPlaceholderText } = renderPage(mockDisabled);
    expect(await findByPlaceholderText(/mensaje personalizado/i)).toBeInTheDocument();
  });

  test('hides message input when enabled', async () => {
    const { queryByPlaceholderText, findByText } = renderPage(mockEnabled);
    // Wait for config to load
    await findByText(/sorteo activo/i);
    expect(queryByPlaceholderText(/mensaje personalizado/i)).not.toBeInTheDocument();
  });

  test('calls updateRaffleConfig when disabling', async () => {
    mockApi.updateRaffleConfig.mockResolvedValue({ isEnabled: false, disabledMessage: null });
    const { container, findByText } = renderPage(mockEnabled);
    // Wait for config to load
    await findByText(/sorteo activo/i);
    const btn = container.querySelector('button[aria-label="Desactivar sorteo"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => {
      expect(mockApi.updateRaffleConfig).toHaveBeenCalledWith({ isEnabled: false, disabledMessage: null, raffleMethod: 'default' });
    });
  });

  test('shows error when API fails', async () => {
    mockApi.getRaffleConfig.mockRejectedValue(new Error('fail'));
    const { findByText } = render(<RaffleConfigPage />);
    expect(await findByText(/error al cargar/i)).toBeInTheDocument();
  });

  test('shows success after save', async () => {
    mockApi.updateRaffleConfig.mockResolvedValue({ isEnabled: false, disabledMessage: null });
    const { findByText, container } = renderPage(mockEnabled);
    // Wait for config to load
    await findByText(/sorteo activo/i);
    const btn = container.querySelector('button[aria-label="Desactivar sorteo"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(await findByText(/cambios guardados/i)).toBeInTheDocument();
  });
});
