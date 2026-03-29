// Authentication API client

const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'gr_cup_admin_token';

/**
 * Sends login request to the API
 */
export async function login(username: string, password: string): Promise<{ token: string }> {
  const response = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  
  // Store token in localStorage
  localStorage.setItem(TOKEN_KEY, data.token);
  
  return data;
}

/**
 * Verifies the current token
 */
export async function verifyToken(): Promise<{ username: string; valid: boolean }> {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (!token) {
    throw new Error('No token found');
  }

  const response = await fetch(`${API_URL}/api/admin/verify`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('Token verification failed');
  }

  return response.json();
}

/**
 * Gets the stored token
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Removes the stored token
 */
export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Checks if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

/**
 * Gets authorization header
 */
export function getAuthHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
