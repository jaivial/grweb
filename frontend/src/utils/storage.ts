/**
 * Storage Utilities
 * 
 * LocalStorage and sessionStorage operations.
 */

import { STORAGE_KEYS } from './constants';
import { parseJSON } from './helpers';

/**
 * Get item from localStorage
 */
export function getStorageItem<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return parseJSON(item, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Set item in localStorage
 */
export function setStorageItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
    return false;
  }
}

/**
 * Remove item from localStorage
 */
export function removeStorageItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all items from localStorage
 */
export function clearStorage(): boolean {
  try {
    localStorage.clear();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if storage item exists
 */
export function hasStorageItem(key: string): boolean {
  return localStorage.getItem(key) !== null;
}

// Auth Token
export function getToken(): string | null {
  return getStorageItem<string | null>(STORAGE_KEYS.TOKEN, null);
}

export function setToken(token: string): boolean {
  return setStorageItem(STORAGE_KEYS.TOKEN, token);
}

export function removeToken(): boolean {
  return removeStorageItem(STORAGE_KEYS.TOKEN);
}

// Purchase Data
export function getPurchaseData<T>(): T | null {
  return getStorageItem<T | null>(STORAGE_KEYS.PURCHASE_DATA, null);
}

export function setPurchaseData<T>(data: T): boolean {
  return setStorageItem(STORAGE_KEYS.PURCHASE_DATA, data);
}

export function removePurchaseData(): boolean {
  return removeStorageItem(STORAGE_KEYS.PURCHASE_DATA);
}

// UI Preferences
export interface UIPreferences {
  sidebarCollapsed?: boolean;
  theme?: 'light' | 'dark';
  lastVisitedPath?: string;
}

export function getUIPreferences(): UIPreferences {
  return getStorageItem<UIPreferences>(STORAGE_KEYS.UI_PREFERENCES, {});
}

export function setUIPreferences(preferences: UIPreferences): boolean {
  const current = getUIPreferences();
  return setStorageItem(STORAGE_KEYS.UI_PREFERENCES, { ...current, ...preferences });
}

// Session Storage
export function getSessionItem<T>(key: string, fallback: T): T {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) return fallback;
    return parseJSON(item, fallback);
  } catch {
    return fallback;
  }
}

export function setSessionItem<T>(key: string, value: T): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeSessionItem(key: string): boolean {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Expiry helpers
export interface StoredDataWithExpiry<T> {
  value: T;
  timestamp: number;
}

export function getStorageItemWithExpiry<T>(
  key: string,
  expiryHours: number = 24
): T | null {
  const item = getStorageItem<StoredDataWithExpiry<T> | null>(key, null);
  if (!item) return null;

  const expiryTime = item.timestamp + expiryHours * 60 * 60 * 1000;
  if (Date.now() > expiryTime) {
    removeStorageItem(key);
    return null;
  }

  return item.value;
}

export function setStorageItemWithExpiry<T>(key: string, value: T): boolean {
  const item: StoredDataWithExpiry<T> = {
    value,
    timestamp: Date.now(),
  };
  return setStorageItem(key, item);
}
