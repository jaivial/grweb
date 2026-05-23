import type { ValidationResult } from '../types';

/**
 * Email validation regex pattern
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Instagram username validation regex
 * Allows alphanumeric, underscores, periods, but no spaces
 */
const INSTAGRAM_REGEX = /^@[a-zA-Z0-9._]{1,30}$/;

/**
 * URL validation regex pattern
 */
const URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

/**
 * Phone number validation regex (international format)
 */
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

/**
 * Validates email address
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === '') {
    return { isValid: false, error: 'Email is required' };
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  return { isValid: true };
}

/**
 * Validates Instagram username
 */
export function validateInstagram(username: string): ValidationResult {
  if (!username || username.trim() === '') {
    return { isValid: false, error: 'Instagram username is required' };
  }

  // Add @ if not present
  const formattedUsername = username.trim().startsWith('@') 
    ? username.trim() 
    : `@${username.trim()}`;

  if (!INSTAGRAM_REGEX.test(formattedUsername)) {
    return { isValid: false, error: 'Please enter a valid Instagram username' };
  }

  return { isValid: true };
}

/**
 * Validates name (first or last name)
 */
export function validateName(name: string, fieldName: string = 'Name'): ValidationResult {
  if (!name || name.trim() === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: `${fieldName} must be at least 2 characters` };
  }

  if (name.trim().length > 50) {
    return { isValid: false, error: `${fieldName} must be less than 50 characters` };
  }

  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(name.trim())) {
    return { isValid: false, error: `${fieldName} contains invalid characters` };
  }

  return { isValid: true };
}

/**
 * Validates phone number
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone || phone.trim() === '') {
    return { isValid: false, error: 'Phone number is required' };
  }

  // Remove spaces and dashes for validation
  const cleanedPhone = phone.replace(/[\s-]/g, '');

  if (!PHONE_REGEX.test(cleanedPhone)) {
    return { isValid: false, error: 'Please enter a valid phone number' };
  }

  return { isValid: true };
}

/**
 * Validates URL
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim() === '') {
    return { isValid: false, error: 'URL is required' };
  }

  if (!URL_REGEX.test(url.trim())) {
    return { isValid: false, error: 'Please enter a valid URL' };
  }

  return { isValid: true };
}

/**
 * Validates required field
 */
export function validateRequired(value: string, fieldName: string = 'This field'): ValidationResult {
  if (!value || value.trim() === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  return { isValid: true };
}

/**
 * Validates minimum length
 */
export function validateMinLength(value: string, minLength: number, fieldName: string = 'This field'): ValidationResult {
  if (!value || value.trim() === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (value.trim().length < minLength) {
    return { isValid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }

  return { isValid: true };
}

/**
 * Validates maximum length
 */
export function validateMaxLength(value: string, maxLength: number, fieldName: string = 'This field'): ValidationResult {
  if (value && value.length > maxLength) {
    return { isValid: false, error: `${fieldName} must be less than ${maxLength} characters` };
  }

  return { isValid: true };
}

/**
 * Validates number range
 */
export function validateNumberRange(value: number, min: number, max: number, fieldName: string = 'Value'): ValidationResult {
  if (isNaN(value)) {
    return { isValid: false, error: `${fieldName} must be a number` };
  }

  if (value < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}` };
  }

  if (value > max) {
    return { isValid: false, error: `${fieldName} must be less than ${max}` };
  }

  return { isValid: true };
}

/**
 * Validates ticket count
 */
export function validateTicketCount(count: number): ValidationResult {
  if (isNaN(count) || count < 1) {
    return { isValid: false, error: 'Minimum 1 ticket required' };
  }

  if (count > 100) {
    return { isValid: false, error: 'Maximum 100 tickets per transaction' };
  }

  return { isValid: true };
}
