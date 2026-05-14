/**
 * Application Constants
 *
 * Global constants used throughout the application.
 */

export const API_URL = import.meta.env.VITE_API_URL || '';
export const API_TIMEOUT = 30000;

export const TICKET_PRICE_EUR = 0.50;
export const MIN_TICKETS = 1;
export const MAX_TICKETS = 100;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_EXPORT_RECORDS = 10000;

export const STORAGE_KEYS = {
  TOKEN: 'fer_token',
  PURCHASE_DATA: 'fer_purchase_data',
  UI_PREFERENCES: 'fer_ui_preferences',
} as const;

export const SOCIAL_LINKS = {
  INSTAGRAM: 'https://instagram.com/ferentrenamiento',
  INSTAGRAM_HANDLE: '@ferentrenamiento',
  WEBSITE: 'https://fer.menustudioai.com',
} as const;

export const ANIMATION = {
  FAST: 150,
  BASE: 300,
  SLOW: 500,
  STAGGER: 100,
} as const;

export const REFRESH_INTERVAL = {
  DASHBOARD_STATS: 30000,
  PARTICIPANT_COUNT: 10000,
} as const;

export const DRAW_CONFIG = {
  TOKEN_EXPIRY_HOURS: 24,
  CONFIRMATION_REQUIRED: true,
  WEIGHTED_SELECTION: true,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  AUTH_ERROR: 'Authentication failed. Please login again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  PAYMENT_ERROR: 'Payment failed. Please try again.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
} as const;

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful!',
  PAYMENT_SUCCESS: 'Payment successful!',
  DRAW_SUCCESS: 'Winner drawn successfully!',
  CONFIRM_SUCCESS: 'Winner confirmed!',
  EXPORT_SUCCESS: 'Export started!',
} as const;

export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  INSTAGRAM: /^[a-zA-Z0-9._]{3,30}$/,
  NAME: /^[a-zA-Z\s'-]{2,50}$/,
  PASSWORD: /^.{8,}$/,
} as const;

export const SEO = {
  SITE_NAME: 'FER CUP II',
  SITE_URL: 'https://fer.menustudioai.com',
  DEFAULT_DESCRIPTION: 'Entérate del FER CUP y participa en el sorteo.',
  DEFAULT_KEYWORDS: 'FER, Powerlifting, Sorteo, Evento',
  TWITTER_HANDLE: '',
} as const;
