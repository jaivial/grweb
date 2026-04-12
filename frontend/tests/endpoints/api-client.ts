/**
 * API Client for Backend Endpoint Tests
 * 
 * Provides authenticated HTTP client for testing backend endpoints.
 * Uses the same cookie-based auth as e2e tests.
 */

const API_URL = process.env.API_URL || 'http://localhost:5006';

const TEST_CREDENTIALS = {
  username: 'jaime@hotmail.com',
  password: 'test123123',
};

export interface ApiClient {
  get(path: string): Promise<Response>;
  post(path: string, data?: unknown): Promise<Response>;
  put(path: string, data?: unknown): Promise<Response>;
  patch(path: string, data?: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
  postForm(path: string, formData: FormData): Promise<Response>;
  putForm(path: string, formData: FormData): Promise<Response>;
  setCookie(cookie: string): void;
}

/**
 * Creates an authenticated API client
 */
export async function createApiClient(): Promise<ApiClient> {
  let authCookie = '';

  // Login to get cookie
  const loginResponse = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_CREDENTIALS),
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`);
  }

  // Extract cookie from Set-Cookie header
  const setCookieHeader = loginResponse.headers.get('set-cookie');
  if (setCookieHeader) {
    const match = setCookieHeader.match(/gr_cup_token=([^;]+)/);
    if (match) {
      authCookie = match[1];
    }
  }

  const client: ApiClient = {
    setCookie(cookie: string) {
      authCookie = cookie;
    },

    async get(path: string): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        credentials: 'include',
        headers: authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {},
      });
    },

    async post(path: string, data?: unknown): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {}),
        },
        credentials: 'include',
        body: data ? JSON.stringify(data) : undefined,
      });
    },

    async put(path: string, data?: unknown): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {}),
        },
        credentials: 'include',
        body: data ? JSON.stringify(data) : undefined,
      });
    },

    async patch(path: string, data?: unknown): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {}),
        },
        credentials: 'include',
        body: data ? JSON.stringify(data) : undefined,
      });
    },

    async delete(path: string): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        method: 'DELETE',
        headers: authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {},
        credentials: 'include',
      });
    },

    async postForm(path: string, formData: FormData): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {},
        credentials: 'include',
        body: formData,
      });
    },

    async putForm(path: string, formData: FormData): Promise<Response> {
      return fetch(`${API_URL}${path}`, {
        method: 'PUT',
        headers: authCookie ? { Cookie: `gr_cup_token=${authCookie}` } : {},
        credentials: 'include',
        body: formData,
      });
    },
  };

  return client;
}

export { API_URL, TEST_CREDENTIALS };
