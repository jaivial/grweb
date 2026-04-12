import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Participantes } from '../Participantes';

// Mock the api module
const mockGetParticipants = jest.fn();
const mockDeleteParticipant = jest.fn();
const mockUpdateParticipant = jest.fn();
const mockExportCsv = jest.fn();

jest.mock('../../../../utils/api', () => ({
  api: {
    getParticipants: (...args: any[]) => mockGetParticipants(...args),
    deleteParticipant: (...args: any[]) => mockDeleteParticipant(...args),
    updateParticipant: (...args: any[]) => mockUpdateParticipant(...args),
    exportCsv: (...args: any[]) => mockExportCsv(...args),
  },
}));

// Mock BackofficeLayout to just render children
jest.mock('../../../../layouts/BackofficeLayout', () => ({
  BackofficeLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="backoffice-layout-mock">{children}</div>
  ),
}));

// Mock wouter
jest.mock('wouter', () => ({
  useLocation: () => ['/backoffice/participantes', jest.fn()],
}));

// Suppress window.confirm in tests
const originalConfirm = window.confirm;

const mockParticipantsResponse = {
  participants: [
    {
      id: 1,
      firstName: 'Juan',
      surname: 'Pérez',
      email: 'juan@test.com',
      instagram: '@juanp',
      ticketCount: 3,
      totalPaid: 1.5,
      createdAt: '2024-01-01T00:00:00Z',
      isPaid: true,
      paymentMethod: 'stripe',
    },
    {
      id: 2,
      firstName: 'Ana',
      surname: 'García',
      email: 'ana@test.com',
      instagram: '@anag',
      ticketCount: 1,
      totalPaid: 0.5,
      createdAt: '2024-01-02T00:00:00Z',
      isPaid: false,
      paymentMethod: 'cash',
    },
  ],
  totalCount: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

describe('Participantes Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    mockGetParticipants.mockResolvedValue(mockParticipantsResponse);
  });

  afterAll(() => {
    window.confirm = originalConfirm;
  });

  it('renders the page title and layout', async () => {
    render(<Participantes />);

    expect(screen.getByTestId('backoffice-layout-mock')).toBeInTheDocument();
    expect(screen.getByText('Participantes')).toBeInTheDocument();
  });

  it('fetches and displays participants on mount', async () => {
    render(<Participantes />);

    expect(mockGetParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
      expect(screen.getByText('Ana García')).toBeInTheDocument();
    });
  });

  it('shows total participant count', async () => {
    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByText(/2 participantes en total/)).toBeInTheDocument();
    });
  });

  it('renders participant table with correct columns', async () => {
    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    expect(screen.getByText('juan@test.com')).toBeInTheDocument();
    expect(screen.getByText('@juanp')).toBeInTheDocument();
  });

  it('shows paid status badges', async () => {
    render(<Participantes />);

    await waitFor(() => {
      // Juan is paid
      expect(screen.getByText('Sí')).toBeInTheDocument();
      // Ana is not paid
      expect(screen.getByText('No')).toBeInTheDocument();
    });
  });

  it('shows payment method badges', async () => {
    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
      expect(screen.getByText('Efectivo')).toBeInTheDocument();
    });
  });

  it('shows empty state when no participants', async () => {
    mockGetParticipants.mockResolvedValue({
      participants: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });

    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByText('Sin participantes todavía')).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching', () => {
    mockGetParticipants.mockReturnValue(new Promise(() => {})); // never resolves

    render(<Participantes />);

    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('displays export CSV button', async () => {
    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument();
    });
  });

  it('displays search input', async () => {
    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByTestId('participants-search-input')).toBeInTheDocument();
    });
  });

  it('renders edit and delete action buttons for each participant', async () => {
    render(<Participantes />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTestId('edit-participant-btn');
    const deleteBtns = screen.getAllByTestId('delete-participant-btn');
    expect(editBtns).toHaveLength(2);
    expect(deleteBtns).toHaveLength(2);
  });
});
