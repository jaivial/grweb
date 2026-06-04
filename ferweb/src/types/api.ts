// API Types for Multi-tenant System

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Competicion ───

export interface Competicion {
  id: number;
  nombre: string;
  slug: string;
  fecha: string;
  lugar: string;
  tipo: string;
  activo: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  plazasDisponibles?: number;
  landingConfig?: LandingConfig;
  eventoConfig?: EventoConfig;
  qrSecret?: string;
  horariosReady?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LandingConfig {
  primaryColor?: string;
  secondaryColor?: string;
  heroImageUrl?: string;
  logoUrl?: string;
  descripcion?: string;
  contactEmail?: string;
  instagramUrl?: string;
}

export interface EventoConfig {
  aforMaximo: number;
  precioBase: number;
  precioUpsell: number;
  precioHandler: number;
  precioPeakProgram: number;
  fechaLimitePeakProgram: string;
  precioRifa: number;
  maxTicketsPorPersona: number;
  inscripcionAbierta: boolean;
  pagoStripeActivo?: boolean;
  pagoEfectivoActivo?: boolean;
  cuponesDescuentoActivo?: boolean;
  stripePriceId?: string;
  stripeUpsellPriceId?: string;
}

export interface FerConfigSnapshot {
  precioBase: number;
  precioHandler: number;
  precioPeakProgram: number;
  precioRifa: number;
  aforoMaximo: number;
  plazasDisponibles: number;
  fechaLimitePeakProgram: string | null;
  inscripcionAbierta: boolean;
  pagoStripeActivo: boolean;
  pagoEfectivoActivo: boolean;
  cuponesDescuentoActivo: boolean;
  stripeDisponible: boolean;
  categoriasMasculino: string[];
  categoriasFemenino: string[];
}

// ─── Usuario ───

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  isSuperadmin: boolean;
  isActive: boolean;
  competiciones?: CompeticionAssignment[];
  permissions?: UserPermission[];
}

export interface CompeticionAssignment {
  id: number;
  nombre: string;
  slug: string;
  role: 'admin' | 'operator';
}

export interface UserPermission {
  key: string;
  competicionId?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: Usuario;
}

// ─── Inscripcion ───

export type Modalidad = 'completa' | 'solo_banca' | 'solo_peso_muerto';

export interface Inscripcion {
  id: number;
  competicionId: number;
  nombre: string;
  email: string;
  instagram?: string;
  telefono?: string;
  sexo: 'masculino' | 'femenino';
  categoriaPeso: string;
  modalidad: Modalidad;
  quiereHandler: boolean;
  participacionConfirmada: boolean;
  experiencia: 'rookie' | 'principiante' | 'intermedio' | 'avanzado';
  tieneEntrenador: boolean;
  upsellPreparacion: boolean;
  quierePeakProgram?: boolean;
  qrCode?: string;
  pagoConfirmado: boolean;
  paymentMethod?: string;
  totalPagado: number;
  subtotalAntesDescuento?: number;
  importeDescuento?: number;
  codigoCupon?: string;
  checkinAt?: string;
  aceptaTerminos: boolean;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInscripcionRequest {
  nombre: string;
  email: string;
  instagram?: string;
  telefono?: string;
  sexo?: string;
  categoriaPeso?: string;
  modalidad?: Modalidad;
  quiereHandler: boolean;

  experiencia: 'rookie' | 'principiante' | 'intermedio' | 'avanzado';
  peakProgram: boolean;
  paymentMethod?: string;
  includeOnlinePaymentLink?: boolean;
  codigoCupon?: string;
  upsellPreparacion?: boolean;
  aceptaTerminos: boolean;
  configSnapshot?: FerConfigSnapshot;
}

export interface CouponValidationResponse {
  valid: boolean;
  message?: string;
  codigo?: string;
  tipoDescuento?: string;
  valor?: number;
  subtotal: number;
  importeDescuento: number;
  total: number;
}

export interface StripeInscripcionCheckoutResponse {
  status: 'checkout' | 'already_paid' | 'stripe_unavailable';
  id?: number;
  sessionId?: string;
  url?: string;
  inscripcionId?: number;
  qrCode?: string;
  totalPagado?: number;
  subtotalAntesDescuento?: number;
  importeDescuento?: number;
  codigoCupon?: string;
}

export interface StripeInscripcionSessionResponse {
  status: 'paid' | 'pending';
  id: number;
  nombre: string;
  email: string;
  qrCode?: string;
  totalPagado: number;
  subtotalAntesDescuento?: number;
  importeDescuento?: number;
  codigoCupon?: string;
  paymentMethod?: string;
  pagoConfirmado: boolean;
}

export interface InscripcionStats {
  total: number;
  pagados: number;
  pendientes: number;
  upsells: number;
  checkins: number;
  revenue: number;
  porExperiencia: Record<string, number>;
  conEntrenador: number;
  sinEntrenador: number;
}

// ─── Rifa ───

export interface RifaConfig {
  id?: number;
  competicionId: number;
  nombrePremio?: string;
  descripcionPremio?: string;
  precioTicket: number;
  ticketsTotal: number;
  activo: boolean;
  fechaSorteo?: string;
  numeroGanador?: string;
  ganadorInscripcionId?: number;
  ganadorConfirmado?: boolean;
}

export interface RifaTicket {
  id: number;
  competicionId: number;
  inscripcionId?: number;
  numeroTicket: string;
  buyerEmail?: string;
  buyerNombre?: string;
  confirmado: boolean;
  createdAt: string;
}

export interface RifaPublicInfo {
  activo: boolean;
  nombrePremio?: string;
  descripcionPremio?: string;
  precioTicket: number;
  ticketsTotal: number;
  ticketsVendidos: number;
  ticketsDisponibles: number;
  fechaSorteo?: string;
  numeroGanador?: string;
}

// ─── Request Types ───

export interface CreateCompeticionRequest {
  nombre: string;
  fecha: string;
  lugar: string;
  tipo?: string;
  logoUrl?: string;
  faviconUrl?: string;
  landingConfig?: LandingConfig;
  eventoConfig?: EventoConfig;
}

export interface UpdateCompeticionRequest {
  nombre?: string;
  fecha?: string;
  lugar?: string;
  activo?: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  landingConfig?: LandingConfig;
  eventoConfig?: EventoConfig;
}

export interface CreateUsuarioRequest {
  email: string;
  password: string;
  nombre: string;
  isSuperadmin?: boolean;
}

export interface UpdateUsuarioRequest {
  nombre?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
  isSuperadmin?: boolean;
}

export interface AssignToCompetitionRequest {
  competicionId: number;
  role: 'admin' | 'operator';
}

export interface SetPermissionRequest {
  permissionKey: string;
  granted: boolean;
  competicionId?: number;
}

export interface UpdateInscripcionRequest {
  nombre?: string;
  email?: string;
  instagram?: string;
  telefono?: string;
  sexo?: string;
  categoriaPeso?: string;
  modalidad?: Modalidad;
  quiereHandler?: boolean;

  experiencia?: 'rookie' | 'principiante' | 'intermedio' | 'avanzado';
  tieneEntrenador?: boolean;
  upsellPreparacion?: boolean;
  pagoConfirmado?: boolean;
  participacionConfirmada?: boolean;
  paymentMethod?: string;
  notas?: string;
}

export interface UpdateRifaConfigRequest {
  nombrePremio?: string;
  descripcionPremio?: string;
  precioTicket?: number;
  ticketsTotal?: number;
  activo?: boolean;
  fechaSorteo?: string;
}

export interface SellTicketRequest {
  numeroTicket?: string;
  inscripcionId?: number;
  buyerEmail?: string;
  buyerNombre?: string;
}

// ─── Schedules ───

export interface Schedule {
  id: number;
  sexCategory: 'Male' | 'Female';
  weightCategory: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleGroupedByDate {
  date: string;
  schedules: Schedule[];
}

export interface SchedulePublishedConfig {
  published: boolean;
  horariosReady?: boolean;
}

// ─── FER Landing Specific ───

export interface FERInscripcionFormData {
  nombre: string;
  email: string;
  instagram?: string;
  telefono: string;
  sexo: 'masculino' | 'femenino';
  categoriaPeso: string;
  modalidad: Modalidad;
  quiereHandler: boolean;

  experiencia: 'rookie' | 'principiante' | 'intermedio' | 'avanzado';
  peakProgram: boolean;
  upsellPreparacion: boolean;
  aceptaTerminos: boolean;
}
