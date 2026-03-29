/**
 * Checkout Formatters
 * 
 * Formatting functions for checkout page display values.
 */

import { TICKET_PRICE_EUR } from '../types';

/**
 * Formats price in EUR
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Calculates total price based on ticket count
 */
export function calculateTotal(ticketCount: number): number {
  return ticketCount * TICKET_PRICE_EUR;
}

/**
 * Formats ticket count with plural handling
 */
export function formatTicketCount(count: number): string {
  return count === 1 ? '1 ticket' : `${count} tickets`;
}

/**
 * Formats total display string
 */
export function formatTotalDisplay(ticketCount: number): string {
  const total = calculateTotal(ticketCount);
  return formatPrice(total);
}

/**
 * Formats Instagram handle for display
 */
export function formatInstagramHandle(handle: string): string {
  const cleanHandle = handle.replace(/^@/, '');
  return `@${cleanHandle}`;
}

/**
 * Formats a name with capitalization
 */
export function formatName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formats email for display (masked)
 */
export function formatEmailMasked(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return email;
  
  const maskedLocal = localPart.length > 2 
    ? localPart[0] + '***' + localPart[localPart.length - 1]
    : localPart;
  
  return `${maskedLocal}@${domain}`;
}

/**
 * Formats phone number (if needed)
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}
