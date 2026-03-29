/**
 * Checkout Page
 * 
 * Main checkout page for purchasing raffle tickets.
 */

import type { JSX } from 'react';
import { CheckoutForm, CheckoutErrorAlert } from './components';
import { useCheckoutForm } from './hooks';

export function Checkout(): JSX.Element {
  const {
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
    submitForm,
    clearError,
  } = useCheckoutForm();

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    submitForm();
  };

  return (
    <main className="min-h-screen bg-dark-base py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Enter the GR Cup Raffle
          </h1>
          <p className="text-gray-400">
            Fill out the form below to purchase your raffle tickets
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6">
            <CheckoutErrorAlert message={error} onDismiss={clearError} />
          </div>
        )}

        {/* Checkout Form */}
        <CheckoutForm
          formData={formData}
          totalAmount={totalAmount}
          isSubmitting={isSubmitting}
          fieldErrors={fieldErrors}
          onFieldChange={updateField}
          onIncrementTickets={incrementTickets}
          onDecrementTickets={decrementTickets}
          onTicketCountChange={setTicketCount}
          onInstagramConfirm={setInstagramConfirmed}
          onSubmit={handleSubmit}
        />

        {/* Help Text */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Need help? Contact us at support@grcup.com</p>
        </div>
      </div>
    </main>
  );
}

export default Checkout;
