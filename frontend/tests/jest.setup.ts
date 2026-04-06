// Extend expect with jest-dom matchers
import '@testing-library/jest-dom';

// Jest setup file for mocking modules
jest.mock('../src/utils/api', () => ({
  api: {
    getEmailConfig: jest.fn(),
    updateEmailConfig: jest.fn(),
    deleteEmailConfig: jest.fn(),
  },
}));

jest.mock('../src/stores/auth', () => ({
  token: { value: 'mock-token' },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Settings: () => 'svg-settings-icon',
}));

// Mock wouter
jest.mock('wouter', () => ({
  useLocation: () => ['/backoffice/configuracion', jest.fn()],
  useParams: () => ({}),
}));
