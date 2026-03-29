/**
 * Checkout Form Component
 * 
 * Form for collecting participant information.
 */

import type { JSX } from 'react';
import { Input } from '@components/ui';
import { TicketQuantitySelector } from './TicketQuantitySelector';
import { CheckoutFormData } from '../types';

interface CheckoutFormProps {
  formData: CheckoutFormData;
  totalAmount: string;
  isSubmitting: boolean;
  fieldErrors: Record<string, string>;
  onFieldChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
  onIncrementTickets: () => void;
  onDecrementTickets: () => void;
  onTicketCountChange: (count: number) => void;
  onInstagramConfirm: (confirmed: boolean) => void;
  onSubmit: (e: Event) => void;
}

export function CheckoutForm({
  formData,
  totalAmount,
  isSubmitting,
  fieldErrors,
  onFieldChange,
  onIncrementTickets,
  onDecrementTickets,
  onTicketCountChange,
  onInstagramConfirm,
  onSubmit,
}: CheckoutFormProps): JSX.Element {
  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Ticket Quantity */}
      <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
        <TicketQuantitySelector
          quantity={formData.ticketCount}
          onIncrement={onIncrementTickets}
          onDecrement={onDecrementTickets}
          onQuantityChange={onTicketCountChange}
          pricePerTicket={0.5}
          totalPrice={totalAmount}
          error={fieldErrors.ticketCount}
        />
      </div>

      {/* Personal Information */}
      <div className="bg-dark-surface rounded-xl p-6 border border-dark-border space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Your Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* First Name */}
          <Input
            label="First Name"
            type="text"
            value={formData.firstName}
            onChange={(e) => onFieldChange('firstName', (e.target as HTMLInputElement).value)}
            placeholder="John"
            error={fieldErrors.firstName}
            disabled={isSubmitting}
            required
          />

          {/* Surname */}
          <Input
            label="Surname"
            type="text"
            value={formData.surname}
            onChange={(e) => onFieldChange('surname', (e.target as HTMLInputElement).value)}
            placeholder="Doe"
            error={fieldErrors.surname}
            disabled={isSubmitting}
            required
          />
        </div>

        {/* Email */}
        <Input
          label="Email Address"
          type="email"
          value={formData.email}
          onChange={(e) => onFieldChange('email', (e.target as HTMLInputElement).value)}
          placeholder="john.doe@example.com"
          error={fieldErrors.email}
          disabled={isSubmitting}
          required
        />

        {/* Instagram */}
        <Input
          label="Instagram Username"
          type="text"
          value={formData.instagram}
          onChange={(e) => onFieldChange('instagram', (e.target as HTMLInputElement).value)}
          placeholder="johndoe"
          error={fieldErrors.instagram}
          disabled={isSubmitting}
          prefix="@"
          required
        />
      </div>

      {/* Instagram Follow Confirmation */}
      <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="instagram-confirm"
            checked={formData.instagramConfirmed}
            onChange={(e) => onInstagramConfirm((e.target as HTMLInputElement).checked)}
            disabled={isSubmitting}
            className="mt-1 w-5 h-5 rounded border-dark-border bg-dark-base text-red-accent focus:ring-red-accent focus:ring-offset-0 cursor-pointer"
          />
          <label for="instagram-confirm" className="flex-1 cursor-pointer">
            <span className="text-gray-300">
              I confirm that I follow{' '}
              <a 
                href="https://instagram.com/grstrength" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-red-accent hover:underline"
              >
                @grstrength
              </a>{' '}
              on Instagram
            </span>
            {fieldErrors.instagramConfirmed && (
              <p className="text-red-500 text-sm mt-1">{fieldErrors.instagramConfirmed}</p>
            )}
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 px-6 bg-gradient-to-r from-red-accent to-dark-red text-white font-bold text-lg rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Processing...
          </span>
        ) : (
          `Pay ${totalAmount}`
        )}
      </button>

      {/* Security Notice */}
      <p className="text-center text-gray-500 text-sm">
        <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Secure payment powered by Stripe
      </p>
    </form>
  );
}

export default CheckoutForm;
