import { render, screen, fireEvent, act } from '@testing-library/react';
import { StripeSettingsForm } from '../components/StripeSettingsForm';
import type { StripeConfigData } from '../../../../stores/stripeConfigStore';

vi.mock('../../../../api/client', () => ({
  api: {},
}));

const defaultConfig: StripeConfigData = {
  secretKey: '',
  publishableKey: '',
  webhookSecret: '',
};

describe('StripeSettingsForm', () => {
  const mockOnSave = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders form with all Stripe fields', () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      expect(screen.getByText('Claves de API de Stripe')).toBeInTheDocument();
      expect(screen.getByText('Clave Secreta (Secret Key)')).toBeInTheDocument();
      expect(screen.getByText('Clave Publicable (Publishable Key)')).toBeInTheDocument();
      expect(screen.getByText('Secreto de Webhook (Webhook Secret)')).toBeInTheDocument();
    });

    test('renders with correct submit button text', () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);
      expect(screen.getByText('Guardar configuración')).toBeInTheDocument();
    });

    test('shows saving state with disabled button', () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={true} />);
      expect(screen.getByText('Guardando...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled();
    });

    test('renders info banner about credentials storage', () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);
      expect(screen.getByText(/Las credenciales se almacenan de forma segura/)).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    test('shows validation errors on empty submit', async () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('La clave secreta es obligatoria')).toBeInTheDocument();
      expect(screen.getByText('La clave publicable es obligatoria')).toBeInTheDocument();
      expect(screen.getByText('El secreto del webhook es obligatorio')).toBeInTheDocument();
    });

    test('does not call onSave when validation fails', async () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('La clave secreta es obligatoria')).toBeInTheDocument();
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    test('calls onSave with correct data', async () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      fireEvent.change(screen.getByPlaceholderText('sk_live_...'), {
        target: { value: 'sk_test_12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText('pk_live_...'), {
        target: { value: 'pk_test_87654321' },
      });
      fireEvent.change(screen.getByPlaceholderText('whsec_...'), {
        target: { value: 'whsec_abcdef1234' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(mockOnSave).toHaveBeenCalledTimes(1);

      const savedData = mockOnSave.mock.calls[0][0];
      expect(savedData.secretKey).toBe('sk_test_12345678');
      expect(savedData.publishableKey).toBe('pk_test_87654321');
      expect(savedData.webhookSecret).toBe('whsec_abcdef1234');
    });

    test('shows success message after successful save', async () => {
      render(<StripeSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      fireEvent.change(screen.getByPlaceholderText('sk_live_...'), {
        target: { value: 'sk_test_12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText('pk_live_...'), {
        target: { value: 'pk_test_87654321' },
      });
      fireEvent.change(screen.getByPlaceholderText('whsec_...'), {
        target: { value: 'whsec_abcdef1234' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('Configuración de Stripe guardada correctamente')).toBeInTheDocument();
    });
  });

  describe('Pre-populated data', () => {
    test('renders with existing masked config values', () => {
      const existingConfig: StripeConfigData = {
        secretKey: '****5678',
        publishableKey: 'pk_test_12345678',
        webhookSecret: '****abcd',
      };
      render(<StripeSettingsForm initialData={existingConfig} onSave={mockOnSave} isSaving={false} />);

      expect(screen.getByPlaceholderText('sk_live_...')).toHaveValue('****5678');
      expect(screen.getByPlaceholderText('pk_live_...')).toHaveValue('pk_test_12345678');
      expect(screen.getByPlaceholderText('whsec_...')).toHaveValue('****abcd');
    });
  });
});
