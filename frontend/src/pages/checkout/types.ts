/**
 * Checkout Page Types
 * 
 * Type definitions for the checkout page.
 */

export interface CheckoutFormData {
  firstName: string;
  surname: string;
  instagram: string;
  email: string;
  ticketCount: number;
  instagramConfirmed: boolean;
}

export interface CheckoutState {
  formData: CheckoutFormData;
  isSubmitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

export interface PurchaseRequest {
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
}

export interface PurchaseResponse {
  sessionId: string;
  url: string;
}

export interface StoredPurchaseData {
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  timestamp: number;
}

export const CHECKOUT_STORAGE_KEY = 'gr_cup_purchase_data';
export const TICKET_PRICE_EUR = 0.50;
export const MIN_TICKETS = 1;
export const MAX_TICKETS = 100;

export const STORAGE_KEYS = {
  PURCHASE_DATA: 'gr_cup_purchase_data',
} as const;

export const SOCIAL_LINKS = {
  GR_STRENGTH_INSTAGRAM: 'https://instagram.com/grstrength',
  GR_STRENGTH_INSTAGRAM_HANDLE: '@grstrength',
} as const;
