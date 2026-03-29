import { signal, computed } from '@preact/signals-react';
import { api } from '../utils/api';

const TOKEN_KEY = 'gr_cup_token';

// Signals
export const token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
export const username = signal<string | null>(null);
export const isLoading = signal(false);
export const error = signal<string | null>(null);

// Computed
export const isAuthenticated = computed(() => token.value !== null);

// Actions
export async function login(user: string, pass: string) {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await api.login(user, pass);
    token.value = response.token;
    username.value = user;
    localStorage.setItem(TOKEN_KEY, response.token);
    return true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed';
    return false;
  } finally {
    isLoading.value = false;
  }
}

export function logout() {
  token.value = null;
  username.value = null;
  localStorage.removeItem(TOKEN_KEY);
}

export async function verifyAuth() {
  if (!token.value) return false;

  try {
    const response = await api.verifyToken(token.value);
    if (response.valid) {
      username.value = response.username;
      return true;
    } else {
      logout();
      return false;
    }
  } catch {
    logout();
    return false;
  }
}
