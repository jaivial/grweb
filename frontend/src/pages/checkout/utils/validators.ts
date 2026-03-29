/**
 * Checkout Validators
 * 
 * Validation functions for checkout form data.
 */

import { CheckoutFormData, MIN_TICKETS, MAX_TICKETS } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates the checkout form data
 */
export function validateCheckoutForm(data: CheckoutFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // First name validation
  if (!data.firstName || data.firstName.trim().length < 2) {
    errors.firstName = 'First name must be at least 2 characters';
  } else if (data.firstName.length > 50) {
    errors.firstName = 'First name must be less than 50 characters';
  }

  // Surname validation
  if (!data.surname || data.surname.trim().length < 2) {
    errors.surname = 'Surname must be at least 2 characters';
  } else if (data.surname.length > 50) {
    errors.surname = 'Surname must be less than 50 characters';
  }

  // Email validation
  if (!data.email || data.email.trim().length === 0) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(data.email)) {
    errors.email = 'Please enter a valid email address';
  }

  // Instagram validation
  if (!data.instagram || data.instagram.trim().length === 0) {
    errors.instagram = 'Instagram username is required';
  } else if (!isValidInstagramHandle(data.instagram)) {
    errors.instagram = 'Please enter a valid Instagram username (without @)';
  }

  // Ticket count validation
  if (data.ticketCount < MIN_TICKETS) {
    errors.ticketCount = `Minimum ${MIN_TICKETS} ticket required`;
  } else if (data.ticketCount > MAX_TICKETS) {
    errors.ticketCount = `Maximum ${MAX_TICKETS} tickets per transaction`;
  }

  // Instagram follow confirmation
  if (!data.instagramConfirmed) {
    errors.instagramConfirmed = 'You must follow @grstrength on Instagram';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates Instagram handle format
 */
export function isValidInstagramHandle(handle: string): boolean {
  // Remove @ if present
  const cleanHandle = handle.replace(/^@/, '');
  // Instagram username: letters, numbers, underscores, periods (3-30 chars)
  const instagramRegex = /^[a-zA-Z0-9._]{3,30}$/;
  return instagramRegex.test(cleanHandle);
}

/**
 * Sanitizes Instagram handle
 */
export function sanitizeInstagramHandle(handle: string): string {
  // Remove @ and trim whitespace
  return handle.replace(/^@/, '').trim().toLowerCase();
}

/**
 * Validates ticket count
 */
export function isValidTicketCount(count: number): boolean {
  return count >= MIN_TICKETS && count <= MAX_TICKETS && Number.isInteger(count);
}

/**
 * Gets error message for a field
 */
export function getFieldError(errors: Record<string, string>, field: string): string | undefined {
  return errors[field];
}

/**
 * Checks if any field has errors
 */
export function hasAnyErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0;
}
