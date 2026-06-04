import type {
  ApiResponse,
  PaginatedResponse,
  Competicion,
  Usuario,
  LoginRequest,
  Inscripcion,
  InscripcionStats,
  RifaConfig,
  RifaTicket,
  RifaPublicInfo,
  CreateInscripcionRequest,
  CreateCompeticionRequest,
  UpdateCompeticionRequest,
  CreateUsuarioRequest,
  UpdateUsuarioRequest,
  AssignToCompetitionRequest,
  SetPermissionRequest,
  UpdateInscripcionRequest,
  UpdateRifaConfigRequest,
  SellTicketRequest,
  LandingConfig,
  EventoConfig,
  FerConfigSnapshot,
  ScheduleGroupedByDate,
  SchedulePublishedConfig,
  StripeInscripcionCheckoutResponse,
  StripeInscripcionSessionResponse,
  CouponValidationResponse,
} from '../types/api';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Get token from cookie
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('gr_token='));
    if (tokenCookie) {
      const token = tokenCookie.split('=')[1];
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok && !data.success) {
        return {
          success: false,
          code: data.code,
          message: data.message || `HTTP ${response.status}`,
        };
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // ─── Auth ───

  async login(credentials: LoginRequest): Promise<ApiResponse<Usuario>> {
    return this.request<Usuario>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/auth/logout', {
      method: 'POST',
    });
  }

  async getMe(): Promise<ApiResponse<Usuario>> {
    return this.request<Usuario>('/api/auth/me');
  }

  // ─── Competiciones ───

  async getCompeticiones(): Promise<ApiResponse<Competicion[]>> {
    return this.request<Competicion[]>('/api/competiciones');
  }

  async getCompeticionBySlug(slug: string): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>(`/api/competiciones/${slug}`);
  }

  async getCompeticionConfig(slug: string): Promise<ApiResponse<{
    precioBase: number;
    precioHandler: number;
    precioPeakProgram: number;
    fechaLimitePeakProgram: string;
    precioUpsell: number;
    precioRifa: number;
    precioTotal: number;
    precioTotalConHandler: number;
    precioTotalConUpsell: number;
    precioTotalConTodo: number;
    categoriasMasculino: string[];
    categoriasFemenino: string[];
    plazasDisponibles: number;
    inscripcionAbierta: boolean;
    pagoStripeActivo: boolean;
    pagoEfectivoActivo: boolean;
    cuponesDescuentoActivo: boolean;
    stripeDisponible: boolean;
    configSnapshot: FerConfigSnapshot;
  }>> {
    return this.request(`/api/competiciones/${slug}/config`);
  }

  async getInscripcionConfigSnapshot(slug: string): Promise<ApiResponse<FerConfigSnapshot>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/config-snapshot`);
  }

  async getAdminCompeticiones(): Promise<ApiResponse<Competicion[]>> {
    return this.request<Competicion[]>('/api/admin/competiciones');
  }

  async getAdminCompeticion(id: number): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>(`/api/admin/competiciones/${id}`);
  }

  async createCompeticion(data: CreateCompeticionRequest): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>('/api/admin/competiciones', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCompeticion(id: number, data: UpdateCompeticionRequest): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>(`/api/admin/competiciones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCompeticion(id: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/admin/competiciones/${id}`, {
      method: 'DELETE',
    });
  }

  async updateLandingConfig(id: number, config: LandingConfig): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>(`/api/admin/competiciones/${id}/landing-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async updateEventoConfig(id: number, config: EventoConfig): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>(`/api/admin/competiciones/${id}/evento-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  // ─── Inscripciones ───

  async createInscripcion(slug: string, data: CreateInscripcionRequest): Promise<ApiResponse<Inscripcion & { qrCode: string; mensaje: string }>> {
    return this.request(`/api/competiciones/${slug}/inscripcion`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createStripeInscripcionCheckout(slug: string, data: CreateInscripcionRequest): Promise<ApiResponse<StripeInscripcionCheckoutResponse>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/stripe-checkout`, {
      method: 'POST',
      body: JSON.stringify({ inscripcion: data, frontendUrl: window.location.origin }),
    });
  }

  async validateCoupon(slug: string, codigo: string, peakProgram: boolean, modalidad?: string): Promise<ApiResponse<CouponValidationResponse>> {
    return this.request(`/api/competiciones/${slug}/cupones/validar`, {
      method: 'POST',
      body: JSON.stringify({ codigo, peakProgram, modalidad }),
    });
  }

  async resolveInscripcionPaymentLink(slug: string, token: string): Promise<ApiResponse<StripeInscripcionCheckoutResponse>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/pago-online`, {
      method: 'POST',
      body: JSON.stringify({ token, frontendUrl: window.location.origin }),
    });
  }

  async getStripeInscripcionSession(slug: string, sessionId: string): Promise<ApiResponse<StripeInscripcionSessionResponse>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/stripe-session/${encodeURIComponent(sessionId)}`);
  }

  async addUpsell(slug: string, inscripcionId: number, quiereUpsell: boolean): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/${inscripcionId}/upsell`, {
      method: 'POST',
      body: JSON.stringify({ quiereUpsell }),
    });
  }

  async addPeakProgram(slug: string, inscripcionId: number): Promise<ApiResponse<Inscripcion>> {
    return this.request<Inscripcion>(`/api/competiciones/${slug}/inscripcion/${inscripcionId}/peak-program`, {
      method: 'POST',
    });
  }

  async updateInscripcion(inscripcionId: number, data: { quiereUpsell?: boolean }): Promise<ApiResponse<Inscripcion>> {
    // This would call an admin endpoint to update an inscripcion
    // For now, we use the upsell endpoint
    return this.request<Inscripcion>(`/api/admin/inscripciones/${inscripcionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getInscripcionQr(slug: string, inscripcionId: number): Promise<ApiResponse<{ id: number; nombre: string; qrCode: string }>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/${inscripcionId}/qr`);
  }

  async checkin(slug: string, inscripcionId: number): Promise<ApiResponse<Inscripcion>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}`);
  }

  async searchCheckin(slug: string, q: string): Promise<ApiResponse<any[]>> {
    return this.request(`/api/competiciones/${slug}/checkin/buscar?q=${encodeURIComponent(q)}`);
  }

  async confirmarPago(slug: string, inscripcionId: number, paymentMethod?: string): Promise<ApiResponse<Inscripcion>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod }),
    });
  }

  async marcarAsistio(slug: string, inscripcionId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/asistio`, {
      method: 'POST',
    });
  }

  // Admin Inscripciones
  async getAdminInscripciones(
    competicionId: number,
    params: { page?: number; pageSize?: number; search?: string; pagoConfirmado?: boolean; experiencia?: string } = {}
  ): Promise<ApiResponse<PaginatedResponse<Inscripcion>>> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.search) queryParams.set('search', params.search);
    if (params.pagoConfirmado !== undefined) queryParams.set('pagoConfirmado', params.pagoConfirmado.toString());
    if (params.experiencia) queryParams.set('experiencia', params.experiencia);

    const query = queryParams.toString();
    return this.request<PaginatedResponse<Inscripcion>>(
      `/api/admin/competiciones/${competicionId}/inscripciones${query ? `?${query}` : ''}`
    );
  }

  async getAdminInscripcionStats(competicionId: number): Promise<ApiResponse<InscripcionStats>> {
    return this.request<InscripcionStats>(`/api/admin/competiciones/${competicionId}/inscripciones/stats`);
  }

  async updateAdminInscripcion(
    competicionId: number,
    inscripcionId: number,
    data: UpdateInscripcionRequest
  ): Promise<ApiResponse<Inscripcion>> {
    return this.request<Inscripcion>(
      `/api/admin/competiciones/${competicionId}/inscripciones/${inscripcionId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async deleteAdminInscripcion(competicionId: number, inscripcionId: number): Promise<ApiResponse<void>> {
    return this.request<void>(
      `/api/admin/competiciones/${competicionId}/inscripciones/${inscripcionId}`,
      { method: 'DELETE' }
    );
  }

  getExportCsvUrl(competicionId: number): string {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('gr_token='))?.split('=')[1];
    return `${this.baseUrl}/api/admin/competiciones/${competicionId}/inscripciones/export?token=${token}`;
  }

  // ─── Rifa ───

  async getRifaPublicInfo(slug: string): Promise<ApiResponse<RifaPublicInfo>> {
    return this.request<RifaPublicInfo>(`/api/competiciones/${slug}/rifa`);
  }

  async getRifaConfig(competicionId: number): Promise<ApiResponse<RifaConfig>> {
    return this.request<RifaConfig>(`/api/admin/competiciones/${competicionId}/rifa`);
  }

  async updateRifaConfig(competicionId: number, data: UpdateRifaConfigRequest): Promise<ApiResponse<RifaConfig>> {
    return this.request<RifaConfig>(`/api/admin/competiciones/${competicionId}/rifa`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getRifaTickets(
    competicionId: number,
    params: { page?: number; pageSize?: number; confirmado?: boolean } = {}
  ): Promise<ApiResponse<PaginatedResponse<RifaTicket>>> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.confirmado !== undefined) queryParams.set('confirmado', params.confirmado.toString());

    const query = queryParams.toString();
    return this.request<PaginatedResponse<RifaTicket>>(
      `/api/admin/competiciones/${competicionId}/rifa/tickets${query ? `?${query}` : ''}`
    );
  }

  async sellTicket(competicionId: number, data?: SellTicketRequest): Promise<ApiResponse<RifaTicket>> {
    return this.request<RifaTicket>(`/api/admin/competiciones/${competicionId}/rifa/tickets`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async realizarSorteo(competicionId: number): Promise<ApiResponse<{ numeroGanador: string; buyerEmail?: string; buyerNombre?: string }>> {
    return this.request(`/api/admin/competiciones/${competicionId}/rifa/sorteo`, {
      method: 'POST',
    });
  }

  // ─── Users Admin ───

  async getPublicSchedules(slug?: string): Promise<ApiResponse<ScheduleGroupedByDate[]>> {
    const params = slug ? `?slug=${encodeURIComponent(slug)}` : '';
    return this.request<ScheduleGroupedByDate[]>(`/api/schedules${params}`);
  }

  async isSchedulesPublished(slug?: string): Promise<ApiResponse<SchedulePublishedConfig & { horariosReady?: boolean }>> {
    const params = slug ? `?slug=${encodeURIComponent(slug)}` : '';
    return this.request<SchedulePublishedConfig & { horariosReady?: boolean }>(`/api/schedules/published${params}`);
  }

  // ─── Users Admin ───

  async getUsers(): Promise<ApiResponse<Usuario[]>> {
    return this.request<Usuario[]>('/api/admin/users');
  }

  async getUser(id: number): Promise<ApiResponse<Usuario>> {
    return this.request<Usuario>(`/api/admin/users/${id}`);
  }

  async createUser(data: CreateUsuarioRequest): Promise<ApiResponse<Usuario>> {
    return this.request<Usuario>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: number, data: UpdateUsuarioRequest): Promise<ApiResponse<Usuario>> {
    return this.request<Usuario>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async assignToCompetition(userId: number, data: AssignToCompetitionRequest): Promise<ApiResponse<any>> {
    return this.request(`/api/admin/users/${userId}/competiciones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeFromCompetition(userId: number, competicionId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/admin/users/${userId}/competiciones/${competicionId}`, {
      method: 'DELETE',
    });
  }

  async setPermissions(userId: number, permissions: SetPermissionRequest[]): Promise<ApiResponse<void>> {
    return this.request(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
  }

  // ─── QR Check-in ───

  async getCheckinEstado(slug: string, inscripcionId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/estado`);
  }

  async confirmarParticipacion(slug: string, inscripcionId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar-participacion`, {
      method: 'POST',
    });
  }

  async confirmarPagoEfectivo(slug: string, inscripcionId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar-pago-efectivo`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient(API_URL);
export default api;
