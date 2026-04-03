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
    }>('/api/admin/statistics');
  }

  async getParticipants(page: number = 1, search?: string) {
    const params = new URLSearchParams({ page: page.toString() });
    if (search) params.append('search', search);

    return this.request<{
      participants: any[];
      totalCount: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/api/admin/participants?${params}`);
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

  async getSchedules(sexCategory?: string) {
    const params = sexCategory ? `?sexCategory=${sexCategory}` : '';
    return this.request<any[]>(`/api/admin/schedules${params}`);
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

  async getPublicSchedules() {
    return this.request<any[]>('/api/schedules');
  }

  async isSchedulesPublished() {
    return this.request<{ published: boolean }>('/api/schedules/published');
  }

  async getSchedulesPublishedConfig() {
    return this.request<{ value: boolean; dateModified: string | null }>('/api/admin/schedules/published-config');
  }

  async updateSchedulesPublishedConfig(data: { value: boolean }) {
    return this.request<{ value: boolean; dateModified: string }>('/api/admin/schedules/published-config', {
      method: 'PUT',
      body: data,
    });
  }

  async getConfirmedWinner() {
    return this.request<{ success: boolean; data: any | null }>('/api/winner');
  }
}

export const api = new ApiClient(API_URL);
