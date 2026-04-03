// Sex enum
export type Sex = 'Male' | 'Female';

// Athlete status enum
export type AthleteStatus = 'Inscrito' | 'Paid' | 'PendingPayment' | 'Disqualified' | 'MissingDocumentation';

// Athlete interface
export interface Athlete {
  id: number;
  firstName: string;
  surname: string;
  email: string;
  phone?: string | null;
  sex: Sex;
  weightCategory: string;
  club?: string | null;
  totalWeight?: number | null;
  registrationDate: string;
  coach?: string | null;
  status: AthleteStatus;
  createdAt: string;
  updatedAt: string;
}

// Athlete form data for creating/updating
export interface AthleteFormData {
  firstName: string;
  surname: string;
  email: string;
  phone?: string;
  sex: Sex;
  weightCategory: string;
  club?: string;
  totalWeight?: number;
  registrationDate: string;
  coach?: string;
  status: AthleteStatus;
}

// Athlete filters
export interface AthleteFilters {
  search?: string;
  sex?: Sex | null;
  weightCategory?: string | null;
  status?: AthleteStatus | null;
  club?: string | null;
}

// Athlete stats for KPIs
export interface AthleteStats {
  total: number;
  inscritos: number;
  paid: number;
  pending: number;
  disqualified: number;
  missingDocumentation: number;
}

// Athletes response with pagination
export interface AthletesResponse {
  athletes: Athlete[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: AthleteStats;
}

// Status label mapping
export const ATHLETE_STATUS_LABELS: Record<AthleteStatus, string> = {
  Inscrito: 'Inscrito',
  Paid: 'Pagado',
  PendingPayment: 'Pendiente pago',
  Disqualified: 'Descalificado',
  MissingDocumentation: 'Falta documentación',
};

// Status color mapping - glassmorphism style
export const ATHLETE_STATUS_COLORS: Record<AthleteStatus, string> = {
  Inscrito: 'bg-blue-500/15 text-blue-400',
  Paid: 'bg-green-500/15 text-green-400',
  PendingPayment: 'bg-yellow-500/15 text-yellow-400',
  Disqualified: 'bg-red-500/15 text-red-400',
  MissingDocumentation: 'bg-orange-500/15 text-orange-400',
};
