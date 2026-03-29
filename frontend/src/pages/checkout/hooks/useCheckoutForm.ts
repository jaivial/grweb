/**
 * Checkout Form Hook
 * 
 * Manages checkout form state and validation.
 */

import { useState, useCallback, useMemo } from 'react';
import { CheckoutFormData, CheckoutState } from '../types';
import { validateCheckoutForm } from '../utils/validators';
import { calculateTotal, formatTotalDisplay } from '../utils/formatters';
import { savePurchaseData } from '../utils/storage';
import { createCheckoutSession, redirectToCheckout } from '../lib/api';

const INITIAL_FORM_DATA: CheckoutFormData = {
  firstName: '',
  surname: '',
  instagram: '',
  email: '',
  ticketCount: 1,
  instagramConfirmed: false,
};

export interface UseCheckoutFormReturn {
  // State
  formData: CheckoutFormData;
  isSubmitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  
  // Computed
  totalAmount: string;
  
  // Actions
  updateField: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
  incrementTickets: () => void;
  decrementTickets: () => void;
  setTicketCount: (count: number) => void;
  setInstagramConfirmed: (confirmed: boolean) => void;
  validateForm: () => boolean;
  submitForm: () => Promise<boolean>;
  clearError: () => void;
  resetForm: () => void;
}

export function useCheckoutForm(): UseCheckoutFormReturn {
  const [formData, setFormData] = useState<CheckoutFormData>(INITIAL_FORM_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Computed total amount
  const totalAmount = useMemo(() => {
    return formatTotalDisplay(formData.ticketCount);
  }, [formData.ticketCount]);

  // Update a single field
  const updateField = useCallback(<K extends keyof CheckoutFormData>(
    field: K,
    value: CheckoutFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [fieldErrors]);

  // Increment ticket count
  const incrementTickets = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      ticketCount: Math.min(prev.ticketCount + 1, 100),
    }));
  }, []);

  // Decrement ticket count
  const decrementTickets = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      ticketCount: Math.max(prev.ticketCount - 1, 1),
    }));
  }, []);

  // Set specific ticket count
  const setTicketCount = useCallback((count: number) => {
    setFormData(prev => ({
      ...prev,
      ticketCount: Math.max(1, Math.min(count, 100)),
    }));
  }, []);

  // Set Instagram confirmation
  const setInstagramConfirmed = useCallback((confirmed: boolean) => {
    setFormData(prev => ({ ...prev, instagramConfirmed: confirmed }));
  }, []);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const result = validateCheckoutForm(formData);
    setFieldErrors(result.errors);
    return result.isValid;
  }, [formData]);

  // Submit form
  const submitForm = useCallback(async (): Promise<boolean> => {
    // Validate form first
    if (!validateForm()) {
      setError('Please fix the errors in the form');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Save purchase data to localStorage for webhook processing
      savePurchaseData({
        firstName: formData.firstName.trim(),
        surname: formData.surname.trim(),
        email: formData.email.trim().toLowerCase(),
        instagram: formData.instagram.trim().replace(/^@/, ''),
        ticketCount: formData.ticketCount,
      });

      // Create Stripe checkout session
      const { url } = await createCheckoutSession({
        firstName: formData.firstName.trim(),
        surname: formData.surname.trim(),
        email: formData.email.trim().toLowerCase(),
        instagram: formData.instagram.trim().replace(/^@/, ''),
        ticketCount: formData.ticketCount,
      });

      // Redirect to Stripe checkout
      redirectToCheckout(url);
      return true;
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start checkout. Please try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateForm]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setError(null);
    setFieldErrors({});
  }, []);

  return {
    formData,
    isSubmitting,
    error,
    fieldErrors,
    totalAmount,
    updateField,
    incrementTickets,
    decrementTickets,
    setTicketCount,
    setInstagramConfirmed,
    validateForm,
    submitForm,
    clearError,
    resetForm,
  };
}
