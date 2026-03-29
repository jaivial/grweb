import type { ValidationError } from '../types';

/**
 * Validates username field
 */
export function validateUsername(username: string): ValidationError | null {
  if (!username || username.trim() === '') {
    return { field: 'username', message: 'Username is required' };
  }
  
  if (username.length < 3) {
    return { field: 'username', message: 'Username must be at least 3 characters' };
  }
  
  if (username.length > 50) {
    return { field: 'username', message: 'Username must be less than 50 characters' };
  }
  
  return null;
}

/**
 * Validates password field
 */
export function validatePassword(password: string): ValidationError | null {
  if (!password || password === '') {
    return { field: 'password', message: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { field: 'password', message: 'Password must be at least 6 characters' };
  }
  
  return null;
}

/**
 * Validates entire login form
 */
export function validateLoginForm(username: string, password: string): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const usernameError = validateUsername(username);
  if (usernameError) errors.push(usernameError);
  
  const passwordError = validatePassword(password);
  if (passwordError) errors.push(passwordError);
  
  return errors;
}

/**
 * Gets error for a specific field
 */
export function getFieldError(errors: ValidationError[], field: string): string | undefined {
  const error = errors.find(e => e.field === field);
  return error?.message;
}

/**
 * Checks if form has any errors
 */
export function hasErrors(errors: ValidationError[]): boolean {
  return errors.length > 0;
}
