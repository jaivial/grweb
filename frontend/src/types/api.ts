// API Types for Multi-tenant System

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
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
  precioRifa: number;
  precioHandler?: number;
  maxTicketsPorPersona: number;
  inscripcionAbierta: boolean;
  stripePriceId?: string;
  stripeUpsellPriceId?: string;
}

// ─── Usuario ───

/**
 * Supported roles in the RBAC system:
 * - root: ALL permissions, ALL competitions (superadmin)
 * - admin: ALL permissions, member competitions only
 * - manager: inscripciones, participantes, sorteo, QR, horarios (NOT configuracion)
 * - empleado: inscripciones, horarios, QR only
 * - checkin: QR page ONLY
 */
export type UserRole = 'root' | 'admin' | 'manager' | 'empleado' | 'checkin';

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
  role: UserRole;
  tipo: string;
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

export interface Inscripcion {
  id: number;
  competicionId: number;
  nombre: string;
  email: string;
  instagram?: string;
  pesoAprox: number;
  experiencia: 'principiante' | 'intermedio' | 'avanzado';
  quierePeakProgram?: boolean;
  telefono?: string;
  sexo?: string;
  categoriaPeso?: string;
  quiereHandler?: boolean;
  participacionConfirmada?: boolean;
  qrCode?: string;
  pagoConfirmado: boolean;
  paymentMethod?: string;
  totalPagado: number;
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
  pesoAprox: number;
  experiencia: 'principiante' | 'intermedio' | 'avanzado';
  quiereHandler?: boolean;
  quierePeakProgram?: boolean;
  aceptaTerminos: boolean;
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
  role: UserRole;
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
  pesoAprox?: number;
  experiencia?: 'principiante' | 'intermedio' | 'avanzado';
  quiereHandler?: boolean;
  quierePeakProgram?: boolean;
  participacionConfirmada?: boolean;
  pagoConfirmado?: boolean;
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

// ─── FER Landing Specific ───

export interface FERInscripcionFormData {
  nombre: string;
  email: string;
  instagram: string;
  pesoAprox: number;
  experiencia: 'principiante' | 'intermedio' | 'avanzado';
  aceptaTerminos: boolean;
}
