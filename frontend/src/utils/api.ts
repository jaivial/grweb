const API_URL = import.meta.env.VITE_API_URL || '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
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

  async getStatistics(token: string) {
    return this.request<{
      totalParticipants: number;
      totalTickets: number;
      totalRevenue: number;
    }>('/api/admin/statistics', { token });
  }

  async getParticipants(token: string, page: number = 1, search?: string) {
    const params = new URLSearchParams({ page: page.toString() });
    if (search) params.append('search', search);
    
    return this.request<{
      participants: any[];
      totalCount: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/api/admin/participants?${params}`, { token });
  }

  async exportCsv(token: string) {
    const response = await fetch(`${this.baseUrl}/api/admin/export/csv`, {
      headers: { Authorization: `Bearer ${token}` },
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

  async drawWinner(token: string) {
    return this.request<any>('/api/admin/draw', { method: 'POST', token });
  }

  async confirmWinner(token: string, drawId: number) {
    return this.request<any>(`/api/admin/draw/${drawId}/confirm`, { method: 'POST', token });
  }

  async getDraws(token: string) {
    return this.request<any[]>('/api/admin/draws', { token });
  }

  async voidDraw(token: string, drawId: number) {
    return this.request<{ message: string }>(`/api/admin/draw/${drawId}`, {
      method: 'DELETE',
      token,
    });
  }

  // ─── Athletes (Inscripciones) ───

  async getAthletes(token: string, params: {
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
    }>(`/api/admin/athletes?${searchParams}`, { token });
  }

  async getAthlete(token: string, id: number) {
    return this.request<any>(`/api/admin/athletes/${id}`, { token });
  }

  async createAthlete(token: string, data: any) {
    return this.request<any>('/api/admin/athletes', {
      method: 'POST',
      body: data,
      token,
    });
  }

  async updateAthlete(token: string, id: number, data: any) {
    return this.request<any>(`/api/admin/athletes/${id}`, {
      method: 'PUT',
      body: data,
      token,
    });
  }

  async deleteAthlete(token: string, id: number) {
    return this.request<{ message?: string }>(`/api/admin/athletes/${id}`, {
      method: 'DELETE',
      token,
    });
  }

  // ─── Schedules (Horarios) ───

  async getSchedules(token: string, sexCategory?: string) {
    const params = sexCategory ? `?sexCategory=${sexCategory}` : '';
    return this.request<any[]>(`/api/admin/schedules${params}`, { token });
  }

  async getSchedule(token: string, id: number) {
    return this.request<any>(`/api/admin/schedules/${id}`, { token });
  }

  async createSchedule(token: string, data: any) {
    return this.request<any>('/api/admin/schedules', {
      method: 'POST',
      body: data,
      token,
    });
  }

  async updateSchedule(token: string, id: number, data: any) {
    return this.request<any>(`/api/admin/schedules/${id}`, {
      method: 'PUT',
      body: data,
      token,
    });
  }

  async deleteSchedule(token: string, id: number) {
    return this.request<{ message?: string }>(`/api/admin/schedules/${id}`, {
      method: 'DELETE',
      token,
    });
  }
}

export const api = new ApiClient(API_URL);
