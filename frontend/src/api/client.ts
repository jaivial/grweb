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
} from '../types/api';

const API_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }


  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

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

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok && !data.success) {
        return {
          success: false,
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
  }>> {
    return this.request(`/api/competiciones/${slug}/config`);
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


  async updateLandingConfig(id: number, config: any): Promise<ApiResponse<Competicion>> {
    return this.request<Competicion>(`/api/admin/competiciones/${id}/landing-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }


  async updateEventoConfig(id: number, config: any): Promise<ApiResponse<Competicion>> {
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


  async addUpsell(slug: string, inscripcionId: number, quiereUpsell: boolean): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/inscripcion/${inscripcionId}/upsell`, {
      method: 'POST',
      body: JSON.stringify({ quiereUpsell }),
    });
  }


  async updateInscripcion(inscripcionId: number, data: { quiereUpsell?: boolean }): Promise<ApiResponse<Inscripcion>> {
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


  async createAdminInscripcion(
    competicionId: number,
    data: CreateInscripcionRequest
  ): Promise<ApiResponse<Inscripcion>> {
    return this.request<Inscripcion>(
      `/api/admin/competiciones/${competicionId}/inscripciones`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
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


  // ─── Email Config ───

  async getEmailConfig(competicionId?: number): Promise<ApiResponse<{
    mainProvider: number;
    gmailAddress: string | null;
    gmailAppPassword: string | null;
    smtpUsername: string | null;
    smtpPassword: string | null;
    smtpEmailAddress: string | null;
    smtpHost: string | null;
    smtpPort: number;
  }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/email-config${params}`);
  }

  async updateEmailConfig(data: {
    mainProvider: number;
    gmailAddress: string | null;
    gmailAppPassword: string | null;
    smtpUsername: string | null;
    smtpPassword: string | null;
    smtpEmailAddress: string | null;
    smtpHost: string | null;
    smtpPort: number;
  }, competicionId?: number): Promise<ApiResponse<{
    mainProvider: number;
    gmailAddress: string | null;
    gmailAppPassword: string | null;
    smtpUsername: string | null;
    smtpPassword: string | null;
    smtpEmailAddress: string | null;
    smtpHost: string | null;
    smtpPort: number;
  }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/email-config${params}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEmailConfig(competicionId?: number): Promise<ApiResponse<{ message: string }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/email-config${params}`, {
      method: 'DELETE',
    });
  }

  // ─── Stripe Config ───

  async getStripeAdminConfig(competicionId?: number): Promise<ApiResponse<{
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
  }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/stripe-config${params}`);
  }

  async updateStripeAdminConfig(data: {
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
  }, competicionId?: number): Promise<ApiResponse<{
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
  }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/stripe-config${params}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStripeAdminConfig(competicionId?: number): Promise<ApiResponse<{ message: string }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/stripe-config${params}`, {
      method: 'DELETE',
    });
  }

  // ─── Schedules (Horarios) Admin ───

  async getSchedules(sexCategory?: string, competicionId?: number): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams();
    if (sexCategory) params.set('sexCategory', sexCategory);
    if (competicionId) params.set('competicionId', competicionId.toString());
    const qs = params.toString();
    return this.request(`/api/admin/schedules${qs ? '?' + qs : ''}`);
  }

  async getSchedule(id: number): Promise<ApiResponse<any>> {
    return this.request(`/api/admin/schedules/${id}`);
  }

  async createSchedule(data: any): Promise<ApiResponse<any>> {
    return this.request('/api/admin/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSchedule(id: number, data: any): Promise<ApiResponse<any>> {
    return this.request(`/api/admin/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSchedule(id: number): Promise<ApiResponse<any>> {
    return this.request(`/api/admin/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  // ─── Schedule Published Config ───

  async getSchedulesPublishedConfig(competicionId?: number): Promise<ApiResponse<{ value: boolean; dateModified: string | null }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/schedules/published-config${params}`);
  }

  async updateSchedulesPublishedConfig(data: { value: boolean }, competicionId?: number): Promise<ApiResponse<{ value: boolean; dateModified: string }>> {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request(`/api/admin/schedules/published-config${params}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ─── FER Lift Attempts ───

  async getFerOpeners(slug: string, inscripcionId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/openers`);
  }

  async setFerOpeners(slug: string, inscripcionId: number, data: {
    sentadilla1: number; sentadilla2: number; sentadilla3: number;
    banca1: number; banca2: number; banca3: number;
    pesoMuerto1: number; pesoMuerto2: number; pesoMuerto3: number;
  }): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/openers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateJudgeVote(slug: string, inscripcionId: number, liftType: string, attemptNumber: number, juezNumero: number, voto: boolean | null): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/checkin/${inscripcionId}/attempt/${liftType}/${attemptNumber}/juez`, {
      method: 'PUT',
      body: JSON.stringify({ juezNumero, voto }),
    });
  }

  async getFerCompetitionAttempts(slug: string): Promise<ApiResponse<any>> {
    return this.request(`/api/competiciones/${slug}/attempts`);
  }
}

export const api = new ApiClient(API_URL);
export default api;
