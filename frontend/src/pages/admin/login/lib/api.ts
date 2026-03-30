// Authentication API client - cookie-based

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Sends login request to the API - cookie is set automatically by backend
 */
export async function login(username: string, password: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Important: receive Set-Cookie
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}

/**
 * Verifies the current cookie-based session
 */
export async function verifyToken(): Promise<{ username: string; valid: boolean }> {
  const response = await fetch(`${API_URL}/api/admin/verify`, {
    credentials: 'include', // Send cookie
  });

  if (!response.ok) {
    throw new Error('Token verification failed');
  }

  return response.json();
}

/**
 * Logs out by calling the backend to clear the cookie
 */
export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
