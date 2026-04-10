/**
 * TDD RED: Tests for RaffleConfigPage.
 * Run: npm test -- --testPathPatterns="raffle-config"
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { api } from '../../../../utils/api';

jest.mock('../../../../utils/api', () => ({
  api: {
    getRaffleConfig: jest.fn(),
    updateRaffleConfig: jest.fn(),
  },
}));

jest.mock('../../../../stores/auth', () => ({
  token: { value: 'mock-token' },
  isAuthenticated: { value: true },
}));

const mockApi = api as jest.Mocked<typeof api>;

const mockEnabled = { isEnabled: true, disabledMessage: null as string | null };
const mockDisabled = { isEnabled: false, disabledMessage: 'El sorteo ha terminado.' };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RaffleConfigPage } = require('../RaffleConfigPage') as { RaffleConfigPage: React.ComponentType };

function renderPage(config = mockEnabled) {
  mockApi.getRaffleConfig.mockResolvedValue(config);
  return render(<RaffleConfigPage />);
}

describe('RaffleConfigPage', () => {
  beforeEach(() => { jest.clearAllMocks(); });

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

  test('hides message input when enabled', () => {
    const { queryByPlaceholderText } = renderPage(mockEnabled);
    expect(queryByPlaceholderText(/mensaje personalizado/i)).not.toBeInTheDocument();
  });

  test('calls updateRaffleConfig when disabling', async () => {
    mockApi.updateRaffleConfig.mockResolvedValue({ isEnabled: false, disabledMessage: null });
    const { container } = renderPage(mockEnabled);
    const btn = container.querySelector('button[aria-label="Desactivar sorteo"]');
    btn && fireEvent.click(btn);
    expect(mockApi.updateRaffleConfig).toHaveBeenCalledWith({ isEnabled: false, disabledMessage: null });
  });

  test('shows error when API fails', async () => {
    mockApi.getRaffleConfig.mockRejectedValue(new Error('fail'));
    const { findByText } = renderPage();
    expect(await findByText(/error al cargar/i)).toBeInTheDocument();
  });

  test('shows success after save', async () => {
    mockApi.updateRaffleConfig.mockResolvedValue({ isEnabled: false, disabledMessage: null });
    const { findByText, container } = renderPage(mockEnabled);
    const btn = container.querySelector('button[aria-label="Desactivar sorteo"]');
    btn && fireEvent.click(btn);
    expect(await findByText(/cambios guardados/i)).toBeInTheDocument();
  });
});
