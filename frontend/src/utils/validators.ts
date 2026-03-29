/**
 * Validators
 * 
 * Validation utility functions used throughout the application.
 */

import { VALIDATION_PATTERNS } from './constants';

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return VALIDATION_PATTERNS.EMAIL.test(email);
}

/**
 * Validate Instagram handle format
 */
export function isValidInstagramHandle(handle: string): boolean {
  const cleanHandle = handle.replace(/^@/, '');
  return VALIDATION_PATTERNS.INSTAGRAM.test(cleanHandle);
}

/**
 * Validate name format
 */
export function isValidName(name: string): boolean {
  return VALIDATION_PATTERNS.NAME.test(name);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): boolean {
  return VALIDATION_PATTERNS.PASSWORD.test(password);
}

/**
 * Validate ticket count
 */
export function isValidTicketCount(count: number, min: number = 1, max: number = 100): boolean {
  return Number.isInteger(count) && count >= min && count <= max;
}

/**
 * Validate required field
 */
export function isRequired(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0;
}

/**
 * Validate minimum length
 */
export function hasMinLength(value: string, minLength: number): boolean {
  return value !== null && value !== undefined && value.length >= minLength;
}

/**
 * Validate maximum length
 */
export function hasMaxLength(value: string, maxLength: number): boolean {
  return value !== null && value !== undefined && value.length <= maxLength;
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Get validation error message for a field
 */
export function getFieldError(
  field: string,
  value: string | number | null | undefined,
  rules: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    email?: boolean;
    instagram?: boolean;
    url?: boolean;
    phone?: boolean;
    min?: number;
    max?: number;
  }
): string | null {
  const stringValue = String(value ?? '');

  // Required check
  if (rules.required && !isRequired(stringValue)) {
    return `${field} is required`;
  }

  // Skip other validations if empty and not required
  if (!stringValue) return null;

  // Min length check
  if (rules.minLength && !hasMinLength(stringValue, rules.minLength)) {
    return `${field} must be at least ${rules.minLength} characters`;
  }

  // Max length check
  if (rules.maxLength && !hasMaxLength(stringValue, rules.maxLength)) {
    return `${field} must be at most ${rules.maxLength} characters`;
  }

  // Email check
  if (rules.email && !isValidEmail(stringValue)) {
    return `Please enter a valid email address`;
  }

  // Instagram check
  if (rules.instagram && !isValidInstagramHandle(stringValue)) {
    return `Please enter a valid Instagram username`;
  }

  // URL check
  if (rules.url && !isValidUrl(stringValue)) {
    return `Please enter a valid URL`;
  }

  // Phone check
  if (rules.phone && !isValidPhoneNumber(stringValue)) {
    return `Please enter a valid phone number`;
  }

  // Min number check
  if (rules.min !== undefined && Number(value) < rules.min) {
    return `${field} must be at least ${rules.min}`;
  }

  // Max number check
  if (rules.max !== undefined && Number(value) > rules.max) {
    return `${field} must be at most ${rules.max}`;
  }

  return null;
}

/**
 * Validate form data against a schema
 */
export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    email?: boolean;
    instagram?: boolean;
    url?: boolean;
    phone?: boolean;
    min?: number;
    max?: number;
    custom?: (value: any) => string | null;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateForm<T extends Record<string, any>>(
  data: T,
  schema: ValidationSchema
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const error = getFieldError(field, value, rules);

    if (error) {
      errors[field] = error;
    }

    // Custom validation
    if (!error && rules.custom) {
      const customError = rules.custom(value);
      if (customError) {
        errors[field] = customError;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Sanitize Instagram handle
 */
export function sanitizeInstagramHandle(handle: string): string {
  return handle.replace(/^@/, '').trim().toLowerCase();
}

/**
 * Sanitize email
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sanitize name
 */
export function sanitizeName(name: string): string {
  return name.trim();
}

/**
 * Sanitize phone number
 */
export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Validate checkbox is checked
 */
export function isCheckboxChecked(checked: boolean, message: string = 'This field is required'): string | null {
  return checked ? null : message;
}
