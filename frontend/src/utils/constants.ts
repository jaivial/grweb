/**
 * Application Constants
 * 
 * Global constants used throughout the application.
 */

// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || '';
export const API_TIMEOUT = 30000; // 30 seconds

// Stripe Configuration
export const TICKET_PRICE_EUR = 0.50;
export const MIN_TICKETS = 1;
export const MAX_TICKETS = 100;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_EXPORT_RECORDS = 10000;

// Storage Keys
export const STORAGE_KEYS = {
  TOKEN: 'gr_cup_token',
  PURCHASE_DATA: 'gr_cup_purchase_data',
  UI_PREFERENCES: 'gr_cup_ui_preferences',
} as const;

// Admin Credentials (default - should be changed in production)
export const DEFAULT_ADMIN = {
  USERNAME: 'admin',
  PASSWORD: 'strongpassword',
} as const;

// Social Links
export const SOCIAL_LINKS = {
  GR_STRENGTH_INSTAGRAM: 'https://instagram.com/grstrength',
  GR_STRENGTH_INSTAGRAM_HANDLE: '@grstrength',
  GR_CUP_WEBSITE: 'https://grcup.com',
} as const;

// Animation Durations (ms)
export const ANIMATION = {
  FAST: 150,
  BASE: 300,
  SLOW: 500,
  STAGGER: 100,
} as const;

// Refresh Intervals (ms)
export const REFRESH_INTERVAL = {
  DASHBOARD_STATS: 30000, // 30 seconds
  PARTICIPANT_COUNT: 10000, // 10 seconds
} as const;

// Draw Configuration
export const DRAW_CONFIG = {
  TOKEN_EXPIRY_HOURS: 24,
  CONFIRMATION_REQUIRED: true,
  WEIGHTED_SELECTION: true,
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  AUTH_ERROR: 'Authentication failed. Please login again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  PAYMENT_ERROR: 'Payment failed. Please try again.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful!',
  PAYMENT_SUCCESS: 'Payment successful!',
  DRAW_SUCCESS: 'Winner drawn successfully!',
  CONFIRM_SUCCESS: 'Winner confirmed!',
  EXPORT_SUCCESS: 'Export started!',
} as const;

// Validation Patterns
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  INSTAGRAM: /^[a-zA-Z0-9._]{3,30}$/,
  NAME: /^[a-zA-Z\s'-]{2,50}$/,
  PASSWORD: /^.{8,}$/,
} as const;

// SEO Configuration
export const SEO = {
  SITE_NAME: 'GR Cup Raffle',
  SITE_URL: 'https://grcup.com',
  DEFAULT_DESCRIPTION: 'Enter the GR Cup Powerlifting Championship Raffle and win amazing prizes!',
  DEFAULT_KEYWORDS: 'GR Cup, Raffle, Powerlifting, Contest, Giveaway',
  TWITTER_HANDLE: '@grstrength',
} as const;
