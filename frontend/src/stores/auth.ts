import { signal, computed } from '@preact/signals-react';
import { deleteCookie } from '../utils/cookies';

const COOKIE_NAME = 'gr_cup_token';

// Signals - token is set to truthy value when authenticated, null when not
export const token = signal<string | null>(null);
export const username = signal<string | null>(null);
export const isLoading = signal(false);
export const error = signal<string | null>(null);

// Computed - authenticated if token is truthy
export const isAuthenticated = computed(() => token.value !== null);

// Verify authentication with backend - sends cookie automatically with fetch
export async function verifyAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include' // Cookie is sent automatically (HttpOnly, not readable by JS)
    });
    if (response.ok) {
      const data = await response.json();
      token.value = 'authenticated'; // Set truthy value
      username.value = data.username || null;
      return true;
    }
    // Clear cookie on failure (logout API will clear it server-side)
    token.value = null;
    return false;
  } catch {
    token.value = null;
    return false;
  }
}

export function logout() {
  token.value = null;
  username.value = null;
  // Call logout endpoint to clear the HttpOnly cookie
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

// Login function - calls API and sets cookie
export async function login(user: string, pass: string): Promise<boolean> {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: user, password: pass }),
    });

    if (response.ok) {
      // Cookie is set by backend (HttpOnly, can't read from JS)
      // Set token to truthy value to indicate authenticated
      token.value = 'authenticated';
      isLoading.value = false;
      return true;
    } else {
      error.value = 'Login Failed';
      isLoading.value = false;
      return false;
    }
  } catch (err) {
    error.value = 'Network error';
    isLoading.value = false;
    return false;
  }
}
