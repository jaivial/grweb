import { render, screen, fireEvent, act } from '@testing-library/react';
import { EmailSettingsForm } from '../components/EmailSettingsForm';
import type { EmailConfigData } from '../hooks/useEmailConfig';

vi.mock('../../../../api/client', () => ({
  api: {},
}));

const defaultConfig: EmailConfigData = {
  mainProvider: 0,
  gmailAddress: null,
  gmailAppPassword: null,
  smtpUsername: '',
  smtpPassword: '',
  smtpEmailAddress: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
};

describe('EmailSettingsForm', () => {
  const mockOnSave = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders form with SMTP fields by default', () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      expect(screen.getByText('Proveedor de email')).toBeInTheDocument();
      expect(screen.getByText('SMTP')).toBeInTheDocument();
      // Gmail is inside CustomSelector dropdown (portal), only visible when open
      expect(screen.getByText('Usuario SMTP')).toBeInTheDocument();
      expect(screen.getByText('Contraseña SMTP')).toBeInTheDocument();
      expect(screen.getByText('Dirección de email')).toBeInTheDocument();
      expect(screen.getByText('Host SMTP')).toBeInTheDocument();
      expect(screen.getByText('Puerto')).toBeInTheDocument();
    });

    test('renders with correct submit button text', () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);
      expect(screen.getByText('Guardar configuración')).toBeInTheDocument();
    });

    test('shows saving state with disabled button', () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={true} />);
      expect(screen.getByText('Guardando...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled();
    });
  });

  describe('Validation', () => {
    test('shows validation errors on empty SMTP submit', async () => {
      // Use empty host to trigger host validation error
      const emptyHostConfig: EmailConfigData = { ...defaultConfig, smtpHost: '' };
      render(<EmailSettingsForm initialData={emptyHostConfig} onSave={mockOnSave} isSaving={false} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('El usuario SMTP es obligatorio')).toBeInTheDocument();
      expect(screen.getByText('La contraseña SMTP es obligatoria')).toBeInTheDocument();
      expect(screen.getByText('El email SMTP es obligatorio')).toBeInTheDocument();
      expect(screen.getByText('El host SMTP es obligatorio')).toBeInTheDocument();
    });

    test('calls onSave with correct SMTP data', async () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      fireEvent.change(screen.getByPlaceholderText('usuario@ejemplo.com'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('********'), {
        target: { value: 'password123' },
      });
      fireEvent.change(screen.getByPlaceholderText('noreply@ejemplo.com'), {
        target: { value: 'noreply@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('smtp.ejemplo.com'), {
        target: { value: 'smtp.gmail.com' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(mockOnSave).toHaveBeenCalledTimes(1);

      const savedData = mockOnSave.mock.calls[0][0];
      expect(savedData.mainProvider).toBe(0);
      expect(savedData.smtpUsername).toBe('test@example.com');
      expect(savedData.smtpPassword).toBe('password123');
      expect(savedData.smtpEmailAddress).toBe('noreply@example.com');
      expect(savedData.smtpHost).toBe('smtp.gmail.com');
      expect(savedData.smtpPort).toBe(587);
      // Gmail fields should be null for SMTP provider
      expect(savedData.gmailAddress).toBeNull();
      expect(savedData.gmailAppPassword).toBeNull();
    });

    test('does not call onSave when validation fails', async () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('El usuario SMTP es obligatorio')).toBeInTheDocument();
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    test('shows success message after successful save', async () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      fireEvent.change(screen.getByPlaceholderText('usuario@ejemplo.com'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('********'), {
        target: { value: 'password123' },
      });
      fireEvent.change(screen.getByPlaceholderText('noreply@ejemplo.com'), {
        target: { value: 'noreply@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('smtp.ejemplo.com'), {
        target: { value: 'smtp.gmail.com' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('Configuración guardada correctamente')).toBeInTheDocument();
    });

    test('errors persist after typing (validation only on submit)', async () => {
      // The component validates only on submit, not on change
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      // Submit empty form
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));
      });

      expect(screen.getByText('El usuario SMTP es obligatorio')).toBeInTheDocument();

      // Typing does NOT clear validation errors (validate only runs on submit)
      fireEvent.change(screen.getByPlaceholderText('usuario@ejemplo.com'), {
        target: { value: 'test' },
      });

      // Error still visible because validate() only runs on submit
      expect(screen.getByText('El usuario SMTP es obligatorio')).toBeInTheDocument();
    });
  });

  describe('Provider switching', () => {
    test('shows Gmail option in dropdown', async () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);

      // The CustomSelector uses a button with the current value
      const selectorTrigger = screen.getAllByRole('button')[0];
      fireEvent.click(selectorTrigger);

      // Gmail option should appear in dropdown
      expect(screen.getByText('Gmail')).toBeInTheDocument();
    });
  });

  describe('Helper text', () => {
    test('shows helper text for SMTP provider', () => {
      render(<EmailSettingsForm initialData={defaultConfig} onSave={mockOnSave} isSaving={false} />);
      expect(screen.getByText('Usa cualquier servidor SMTP personalizado')).toBeInTheDocument();
    });
  });
});
