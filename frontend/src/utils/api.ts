const API_URL = import.meta.env.VITE_API_URL || '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  token?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      method,
      headers,
      credentials: 'include',
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Public endpoints
  async buyTickets(data: {
    firstName: string;
    surname: string;
    email: string;
    instagram: string;
    ticketCount: number;
    phone?: string;
    competicionId?: number;
  }) {
    return this.request<{ sessionId: string; url: string }>('/api/tickets/buy', {
      method: 'POST',
      body: { ...data, frontendUrl: window.location.origin },
    });
  }

  async getParticipantCount() {
    return this.request<{ count: number }>('/api/participants/count');
  }

  async getStripeConfig() {
    return this.request<{ publishableKey: string }>('/api/config/stripe');
  }

  async getSessionDetails(sessionId: string) {
    return this.request<{
      firstName: string;
      surname: string;
      email: string;
      instagram: string;
      ticketCount: number;
      totalPaid: number;
      sessionId: string;
    }>(`/api/tickets/session/${sessionId}`);
  }

  async getPublicInscripcionConfig() {
    return this.request<{ active: boolean; url: string | null }>('/api/inscripcion-config');
  }

  // Admin endpoints
  async login(username: string, password: string) {
    return this.request<{ token: string }>('/api/admin/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  async verifyToken(token: string) {
    return this.request<{ username: string; valid: boolean }>('/api/admin/verify', { token });
  }

  async getStatistics() {
    return this.request<{
      totalParticipants: number;
      totalTickets: number;
      totalRevenue: number;
      cashRevenue: number;
      stripeRevenue: number;
      bankRevenue: number;
    }>('/api/admin/statistics');
  }

  async getParticipants(params: {
    page: number;
    search?: string;
    sortBy?: 'ticketCount' | 'name' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
    isPaid?: boolean | null;
    paymentMethod?: string | null;
    pageSize?: number;
  }) {
    const urlParams = new URLSearchParams({ page: params.page.toString() });
    if (params.search) urlParams.append('search', params.search);
    if (params.sortBy) urlParams.append('sortBy', params.sortBy);
    if (params.sortOrder) urlParams.append('sortOrder', params.sortOrder);
    if (params.isPaid !== undefined && params.isPaid !== null) urlParams.append('isPaid', String(params.isPaid));
    if (params.paymentMethod) urlParams.append('paymentMethod', params.paymentMethod);
    if (params.pageSize) urlParams.append('pageSize', params.pageSize.toString());

    return this.request<{
      participants: any[];
      totalCount: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/api/admin/participants?${urlParams}`);
  }

  async exportCsv() {
    const response = await fetch(`${this.baseUrl}/api/admin/export/csv`, {
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gr-cup-participants-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async drawWinner() {
    return this.request<any>('/api/admin/draw', { method: 'POST' });
  }

  async confirmWinner(drawId: number) {
    return this.request<any>(`/api/admin/draw/${drawId}/confirm`, { method: 'POST' });
  }

  async getDraws() {
    return this.request<any[]>('/api/admin/draws');
  }

  async createManualParticipant(data: {
    firstName: string;
    surname: string;
    email: string;
    instagram: string;
    ticketCount: number;
    price: number;
    paymentMethod: 'cash' | 'bank' | 'stripe';
    phone: string;
  }) {
    return this.request<any>('/api/admin/participants/manual', {
      method: 'POST',
      body: data,
    });
  }

  async updateParticipant(id: number, data: {
    firstName: string;
    surname: string;
    email: string;
    instagram: string;
    ticketCount: number;
    price?: number;
    isPaid: boolean;
    paymentMethod?: string;
    phone?: string;
  }) {
    return this.request<any>(`/api/admin/participants/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteParticipant(id: number) {
    return this.request<{ message: string }>(`/api/admin/participants/${id}`, {
      method: 'DELETE',
    });
  }

  async voidDraw(drawId: number) {
    return this.request<{ message: string }>(`/api/admin/draw/${drawId}`, {
      method: 'DELETE',
    });
  }

  // ─── Athletes (Inscripciones) ───

  async getAthletes(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    sex?: string;
    weightCategory?: string;
    status?: string;
    club?: string;
  } = {}) {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    if (params.search) searchParams.append('search', params.search);
    if (params.sex) searchParams.append('sex', params.sex);
    if (params.weightCategory) searchParams.append('weightCategory', params.weightCategory);
    if (params.status) searchParams.append('status', params.status);
    if (params.club) searchParams.append('club', params.club);

    return this.request<{
      athletes: any[];
      totalCount: number;
      page: number;
      pageSize: number;
      totalPages: number;
      stats: {
        total: number;
        inscritos: number;
        paid: number;
        pending: number;
        disqualified: number;
        missingDocumentation: number;
      };
    }>(`/api/admin/athletes?${searchParams}`);
  }

  async getAthlete(id: number) {
    return this.request<any>(`/api/admin/athletes/${id}`);
  }

  async createAthlete(data: any) {
    return this.request<any>('/api/athletes', {
      method: 'POST',
      body: data,
    });
  }

  async updateAthlete(id: number, data: any) {
    return this.request<any>(`/api/admin/athletes/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteAthlete(id: number) {
    return this.request<{ message?: string }>(`/api/admin/athletes/${id}`, {
      method: 'DELETE',
    });
  }

  async getClubs() {
    return this.request<string[]>('/api/admin/athletes/clubs');
  }

  // ─── Schedules (Horarios) ───

  async getSchedules(sexCategory?: string, competicionId?: number) {
    const params = new URLSearchParams();
    if (sexCategory) params.set('sexCategory', sexCategory);
    if (competicionId) params.set('competicionId', competicionId.toString());
    const qs = params.toString();
    return this.request<any[]>(`/api/admin/schedules${qs ? '?' + qs : ''}`);
  }

  async getSchedule(id: number) {
    return this.request<any>(`/api/admin/schedules/${id}`);
  }

  async createSchedule(data: any) {
    return this.request<any>('/api/admin/schedules', {
      method: 'POST',
      body: data,
    });
  }

  async updateSchedule(id: number, data: any) {
    return this.request<any>(`/api/admin/schedules/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteSchedule(id: number) {
    return this.request<{ message?: string }>(`/api/admin/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  // ─── Inscripcion Config ───

  async getInscripcionConfig() {
    return this.request<{ active: boolean; url: string | null }>('/api/admin/inscripcion-config');
  }

  async updateInscripcionConfig(data: { active: boolean; url: string | null }) {
    return this.request<{ active: boolean; url: string | null }>('/api/admin/inscripcion-config', {
      method: 'PUT',
      body: data,
    });
  }

  // ─── Raffle Config ───

  async getPublicRaffleConfig() {
    return this.request<{ isEnabled: boolean; disabledMessage: string | null; raffleMethod?: number }>('/api/raffle/config');
  }

  async getRaffleConfig() {
    return this.request<{ isEnabled: boolean; disabledMessage: string | null; raffleMethod?: number }>('/api/admin/raffle-config');
  }

  async updateRaffleConfig(data: { isEnabled: boolean; disabledMessage: string | null; raffleMethod?: number }) {
    return this.request<{ isEnabled: boolean; disabledMessage: string | null; raffleMethod: number }>('/api/admin/raffle-config', {
      method: 'PUT',
      body: data,
    });
  }

  // ─── Inscripcion Preparada ───

  async getInscripcionPreparada() {
    return this.request<{ dateTime: string | null; preparadas: boolean }>('/api/admin/inscripcion-preparada');
  }

  async updateInscripcionPreparada(data: { dateTime: string | null; preparadas: boolean }) {
    return this.request<{ dateTime: string | null; preparadas: boolean }>('/api/admin/inscripcion-preparada', {
      method: 'PUT',
      body: data,
    });
  }

  async getPublicInscripcionPreparada() {
    return this.request<{ prepared: boolean; responsable: boolean; aepUrl: string | null }>('/api/inscripcion-preparada');
  }

  // ─── Responsable URL Inscripciones ───

  async getResponsableUrlInscripciones() {
    return this.request<{ value: boolean; url: string | null; dateModified: string | null }>('/api/admin/responsable-url-inscripciones');
  }

  async updateResponsableUrlInscripciones(data: { value: boolean; url: string | null }) {
    return this.request<{ value: boolean; url: string | null; dateModified: string }>('/api/admin/responsable-url-inscripciones', {
      method: 'PUT',
      body: data,
    });
  }

  // ─── Public Schedules ───

  async getPublicSchedules(slug?: string) {
    const params = slug ? `?slug=${encodeURIComponent(slug)}` : '';
    return this.request<any[]>(`/api/schedules${params}`);
  }

  async isSchedulesPublished(slug?: string) {
    const params = slug ? `?slug=${encodeURIComponent(slug)}` : '';
    return this.request<{ published: boolean; horariosReady: boolean }>(`/api/schedules/published${params}`);
  }

  async getSchedulesPublishedConfig(competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{ value: boolean; dateModified: string | null }>(`/api/admin/schedules/published-config${params}`);
  }

  async updateSchedulesPublishedConfig(data: { value: boolean }, competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{ value: boolean; dateModified: string }>(`/api/admin/schedules/published-config${params}`, {
      method: 'PUT',
      body: data,
    });
  }

  async getConfirmedWinner() {
    return this.request<{ success: boolean; data: any | null }>('/api/winner');
  }

  // ─── Email Config ───

  async getEmailConfig(competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{
      mainProvider: number;
      gmailAddress: string | null;
      gmailAppPassword: string | null;
      smtpUsername: string | null;
      smtpPassword: string | null;
      smtpEmailAddress: string | null;
      smtpHost: string | null;
      smtpPort: number;
    }>(`/api/admin/email-config${params}`);
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
  }, competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{
      mainProvider: number;
      gmailAddress: string | null;
      gmailAppPassword: string | null;
      smtpUsername: string | null;
      smtpPassword: string | null;
      smtpEmailAddress: string | null;
      smtpHost: string | null;
      smtpPort: number;
    }>(`/api/admin/email-config${params}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteEmailConfig(competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{ message: string }>(`/api/admin/email-config${params}`, {
      method: 'DELETE',
    });
  }

  // ─── Stripe Config (Admin) ───

  async getStripeAdminConfig(competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{
      secretKey: string | null;
      publishableKey: string | null;
      webhookSecret: string | null;
    }>(`/api/admin/stripe-config${params}`);
  }

  async updateStripeAdminConfig(data: {
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
  }, competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{
      secretKey: string | null;
      publishableKey: string | null;
      webhookSecret: string | null;
    }>(`/api/admin/stripe-config${params}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteStripeAdminConfig(competicionId?: number) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{ message: string }>(`/api/admin/stripe-config${params}`, {
      method: 'DELETE',
    });
  }

  // ─── QR Check-in (Multi-tenant) ───

  async getCheckinEstado(slug: string, inscripcionId: number) {
    return this.request<{ success: boolean; data: any }>(`/api/competiciones/${slug}/checkin/${inscripcionId}/estado`);
  }

  async confirmarParticipacion(slug: string, inscripcionId: number) {
    return this.request<{ success: boolean; data: any }>(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar-participacion`, {
      method: 'POST',
    });
  }

  async confirmarPagoEfectivo(slug: string, inscripcionId: number) {
    return this.request<{ success: boolean; data: any }>(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar-pago-efectivo`, {
      method: 'POST',
    });
  }

  async searchCheckinByQr(slug: string, qrData: string) {
    return this.request<{ success: boolean; data: any }>(`/api/competiciones/${slug}/checkin/buscar-qr`, {
      method: 'POST',
      body: { qrData },
    });
  }
}

export const api = new ApiClient(API_URL);
