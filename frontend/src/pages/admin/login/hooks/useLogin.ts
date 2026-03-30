import { useState, useCallback } from 'react';
import type { LoginCredentials, ValidationError } from '../types';
import { validateLoginForm, getFieldError } from '../utils/validators';
import { login as loginApi, verifyToken } from '../lib/api';

/**
 * Hook for handling login logic
 */
export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Login handler
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    // Reset states
    setError(null);
    setErrors([]);

    // Validate form
    const validationErrors = validateLoginForm(credentials.username, credentials.password);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return false;
    }

    // Set loading state
    setIsLoading(true);

    try {
      // Call API
      await loginApi(credentials.username, credentials.password);
      
      // Success
      setIsAuthenticated(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      // Handle error
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, []);

  /**
   * Logout handler
   */
  const logout = useCallback(async () => {
    await import('../lib/api').then(m => m.logout());
    setIsAuthenticated(false);
    setError(null);
  }, []);

  /**
   * Clear error handler
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear field error
   */
  const clearFieldError = useCallback((field: string) => {
    setErrors(prev => prev.filter(e => e.field !== field));
  }, []);

  /**
   * Verify existing token on mount
   */
  const verifyExistingToken = useCallback(async (): Promise<boolean> => {
    try {
      const result = await verifyToken();
      if (result.valid) {
        setIsAuthenticated(true);
        return true;
      }
    } catch {
      // Token is invalid, continue as not authenticated
    }
    return false;
  }, []);

  return {
    isLoading,
    error,
    errors,
    isAuthenticated,
    login,
    logout,
    clearError,
    clearFieldError,
    verifyExistingToken,
    getFieldError: (field: string) => getFieldError(errors, field),
  };
}
