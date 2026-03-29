/**
 * Checkout API Integration
 * 
 * API client for checkout page operations.
 */

import { api } from '../../../utils/api';
import { PurchaseRequest, PurchaseResponse } from '../types';

/**
 * Creates a Stripe checkout session for ticket purchase
 */
export async function createCheckoutSession(
  purchaseData: PurchaseRequest
): Promise<PurchaseResponse> {
  const response = await api.buyTickets(purchaseData);
  return {
    sessionId: response.sessionId,
    url: response.url,
  };
}

/**
 * Gets the Stripe publishable key
 */
export async function getStripePublishableKey(): Promise<string> {
  const response = await api.getStripeConfig();
  return response.publishableKey;
}

/**
 * Redirects to Stripe checkout
 */
export function redirectToCheckout(url: string): void {
  window.location.href = url;
}

/**
 * Validates purchase request before sending to API
 */
export function validatePurchaseRequest(data: PurchaseRequest): string[] {
  const errors: string[] = [];
  
  if (!data.firstName || data.firstName.trim().length < 2) {
    errors.push('First name is required');
  }
  
  if (!data.surname || data.surname.trim().length < 2) {
    errors.push('Surname is required');
  }
  
  if (!data.email || !data.email.includes('@')) {
    errors.push('Valid email is required');
  }
  
  if (!data.instagram || data.instagram.trim().length < 3) {
    errors.push('Instagram username is required');
  }
  
  if (data.ticketCount < 1 || data.ticketCount > 100) {
    errors.push('Ticket count must be between 1 and 100');
  }
  
  return errors;
}
