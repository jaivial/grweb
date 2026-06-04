const API_URL = import.meta.env.VITE_API_URL || '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  token?: string;
}

export interface InscripcionStatsDTO {
  total?: number;
  pagados?: number;
  pendientes?: number;
  upsells?: number;
  checkins?: number;
  revenue: number;
  cashRevenue: number;
  stripeRevenue: number;
  porExperiencia?: Record<string, number>;
  conEntrenador?: number;
  sinEntrenador?: number;
}

export interface InscripcionFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  pagoConfirmado?: boolean;
  experiencia?: string;
  modalidad?: string;
  paymentMethod?: string;
  // Phase 1 — 6 new optional filters
  sexo?: string | null;
  categoriaPeso?: string | null;
  quiereHandler?: boolean | null;
  quierePeakProgram?: boolean | null;
  participacionConfirmada?: boolean | null;
  hasCoupon?: boolean | null;
}

export interface RaffleWinner {
  id: number;
  nombre: string;
  email: string;
  [key: string]: unknown;
}

export interface RaffleResult {
  winners: RaffleWinner[];
  fallbackReason?: string;
}

export interface RaffleRequest {
  filterCriteria: string;
  numWinners: number;
  equityMode: string;
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

  async getSchedules(sexCategory?: string, competicionId?: number | null) {
    const params = new URLSearchParams();
    if (sexCategory) params.append('sexCategory', sexCategory);
    if (competicionId) params.append('competicionId', String(competicionId));
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
    return this.request<{ published: boolean }>(`/api/schedules/published${params}`);
  }

  async getSchedulesPublishedConfig(competicionId?: number | null) {
    const params = competicionId ? `?competicionId=${competicionId}` : '';
    return this.request<{ value: boolean; dateModified: string | null }>(`/api/admin/schedules/published-config${params}`);
  }

  async updateSchedulesPublishedConfig(data: { value: boolean }, competicionId?: number | null) {
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

  async getEmailConfig() {
    return this.request<{
      mainProvider: number;
      gmailAddress: string | null;
      gmailAppPassword: string | null;
      smtpUsername: string | null;
      smtpPassword: string | null;
      smtpEmailAddress: string | null;
      smtpHost: string | null;
      smtpPort: number;
    }>('/api/admin/email-config');
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
  }) {
    return this.request<{
      mainProvider: number;
      gmailAddress: string | null;
      gmailAppPassword: string | null;
      smtpUsername: string | null;
      smtpPassword: string | null;
      smtpEmailAddress: string | null;
      smtpHost: string | null;
      smtpPort: number;
    }>('/api/admin/email-config', {
      method: 'PUT',
      body: data,
    });
  }

  async deleteEmailConfig() {
    return this.request<{ message: string }>('/api/admin/email-config', {
      method: 'DELETE',
    });
  }

  // ─── Stripe Config (Admin) ───

  async getStripeAdminConfig() {
    return this.request<{
      secretKey: string | null;
      publishableKey: string | null;
      webhookSecret: string | null;
    }>('/api/admin/stripe-config');
  }

  async updateStripeAdminConfig(data: {
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
  }) {
    return this.request<{
      secretKey: string | null;
      publishableKey: string | null;
      webhookSecret: string | null;
    }>('/api/admin/stripe-config', {
      method: 'PUT',
      body: data,
    });
  }

  async deleteStripeAdminConfig() {
    return this.request<{ message: string }>('/api/admin/stripe-config', {
      method: 'DELETE',
    });
  }

  // ─── Checkin ───

  async getCheckinStatus(athleteId: number) {
    return this.request<any>(`/api/admin/checkin/${athleteId}`);
  }

  async findByQrCode(qrCode: string) {
    return this.request<any>(`/api/admin/checkin/qr/${encodeURIComponent(qrCode)}`);
  }

  async generateQrCode(athleteId: number) {
    return this.request<any>(`/api/admin/checkin/${athleteId}/qr`, {
      method: 'POST',
    });
  }

  async confirmCheckin(athleteId: number) {
    return this.request<any>(`/api/admin/checkin/${athleteId}/confirm`, {
      method: 'POST',
    });
  }

  // ─── QR Reader / Checkin FER ───

  async getCheckinEstado(slug: string, inscripcionId: number) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/estado`);
  }

  async confirmarParticipacion(slug: string, inscripcionId: number) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar-participacion`, {
      method: 'POST',
    });
  }

  async confirmarPagoEfectivo(slug: string, inscripcionId: number) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/confirmar-pago-efectivo`, {
      method: 'POST',
    });
  }

  async getFerCompetitionAttempts(slug: string, query?: string) {
    const url = `/api/competiciones/${slug}/attempts${query || ''}`;
    return this.request<any>(url);
  }

  // ─── FER Lift Attempts ───

  async getFerOpeners(slug: string, inscripcionId: number) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/openers`);
  }

  async setFerOpeners(slug: string, inscripcionId: number, data: {
    sentadilla1: number; sentadilla2: number; sentadilla3: number;
    banca1: number; banca2: number; banca3: number;
    pesoMuerto1: number; pesoMuerto2: number; pesoMuerto3: number;
  }) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/openers`, {
      method: 'POST',
      body: data,
    });
  }

  // ─── Lifts ───

  async setOpeners(athleteId: number, data: { squatWeight: number; benchWeight: number; deadliftWeight: number }) {
    return this.request<any>(`/api/admin/athletes/${athleteId}/openers`, {
      method: 'POST',
      body: data,
    });
  }

  async getOpeners(athleteId: number) {
    return this.request<any>(`/api/admin/athletes/${athleteId}/openers`);
  }

  async updateAttempt(athleteId: number, liftType: string, attemptNumber: number, weight: number) {
    return this.request<any>(`/api/admin/athletes/${athleteId}/attempts/${liftType}/${attemptNumber}`, {
      method: 'PUT',
      body: { weight },
    });
  }

  async getAllAttempts(athleteId: number) {
    return this.request<any>(`/api/admin/athletes/${athleteId}/attempts`);
  }

  async getCompetitionAttempts() {
    return this.request<any>('/api/admin/attempts');
  }

  async getAuditLog(athleteId: number) {
    return this.request<any>(`/api/admin/athletes/${athleteId}/audit`);
  }

  // ─── FER Judge Votes ───

  async updateJudgeVote(slug: string, inscripcionId: number, liftType: string, attemptNumber: number, juezNumero: number, voto: boolean | null) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/attempt/${liftType}/${attemptNumber}/juez`, {
      method: 'PUT',
      body: { juezNumero, voto },
    });
  }

  async updateAttemptWeight(slug: string, inscripcionId: number, liftType: string, attemptNumber: number, weight: number) {
    return this.request<any>(`/api/competiciones/${slug}/checkin/${inscripcionId}/attempt/${liftType}/${attemptNumber}/weight`, {
      method: 'PUT',
      body: { weight },
    });
  }

  // ─── FER Inscripciones (Phase 1) ───

  /**
   * Build the export CSV URL with token for direct download.
   * Mirrors the signature in src/api/client.ts.
   */
  getExportCsvUrl(competicionId: number): string {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('gr_token='))?.split('=')[1];
    return `${this.baseUrl}/api/admin/competiciones/${competicionId}/inscripciones/export?token=${token}`;
  }

  async createAdminInscripcion(
    competicionId: number,
    data: any
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    return this.request<any>(
      `/api/admin/competiciones/${competicionId}/inscripciones`,
      { method: 'POST', body: data }
    );
  }

  async updateAdminInscripcion(
    competicionId: number,
    inscripcionId: number,
    data: any
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    return this.request<any>(
      `/api/admin/competiciones/${competicionId}/inscripciones/${inscripcionId}`,
      { method: 'PUT', body: data }
    );
  }

  async deleteAdminInscripcion(
    competicionId: number,
    inscripcionId: number
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    return this.request<any>(
      `/api/admin/competiciones/${competicionId}/inscripciones/${inscripcionId}`,
      { method: 'DELETE' }
    );
  }

  /**
   * List inscripciones with optional filters. Backed by InscripcionService.GetPaginatedAsync.
   * All 11 filter keys (5 legacy + 6 Phase 1) are supported.
   */
  async getAdminInscripciones(
    competicionId: number,
    params: InscripcionFilters = {}
  ): Promise<{ success: boolean; data?: { items: any[]; total: number; page: number; pageSize: number; totalPages: number }; message?: string }> {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    if (params.search) q.set('search', params.search);
    if (params.pagoConfirmado !== undefined) q.set('pagoConfirmado', String(params.pagoConfirmado));
    if (params.experiencia) q.set('experiencia', params.experiencia);
    if (params.modalidad) q.set('modalidad', params.modalidad);
    if (params.paymentMethod) q.set('paymentMethod', params.paymentMethod);
    // Phase 1: 6 new optional filters
    if (params.sexo != null) q.set('sexo', params.sexo);
    if (params.categoriaPeso != null) q.set('categoriaPeso', params.categoriaPeso);
    if (params.quiereHandler != null) q.set('quiereHandler', String(params.quiereHandler));
    if (params.quierePeakProgram != null) q.set('quierePeakProgram', String(params.quierePeakProgram));
    if (params.participacionConfirmada != null) q.set('participacionConfirmada', String(params.participacionConfirmada));
    if (params.hasCoupon != null) q.set('hasCoupon', String(params.hasCoupon));

    const qs = q.toString();
    return this.request<any>(
      `/api/admin/competiciones/${competicionId}/inscripciones${qs ? `?${qs}` : ''}`
    );
  }

  /**
   * Stats for the FER competicion dashboard. Backed by InscripcionService.GetStatsAsync.
   */
  async getAdminInscripcionStats(
    competicionId: number,
    _filters?: InscripcionFilters
  ): Promise<{ success: boolean; data?: InscripcionStatsDTO; message?: string }> {
    return this.request<any>(`/api/admin/competiciones/${competicionId}/inscripciones/stats`);
  }

  /**
   * Draw N winners from filtered pool. Backed by InscripcionService.RaffleAsync.
   * Backend route: POST /api/admin/competiciones/:id/inscripciones/raffle
   */
  async drawRaffleInscripciones(
    competicionId: number,
    body: RaffleRequest
  ): Promise<{ success: boolean; data?: RaffleResult; message?: string }> {
    return this.request<any>(
      `/api/admin/competiciones/${competicionId}/inscripciones/raffle`,
      { method: 'POST', body }
    );
  }
}

export const api = new ApiClient(API_URL);
