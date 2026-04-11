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
    <main className="min-h-screen bg-dark-base py-12 px-4" data-ui="checkout-page">
      <div className="max-w-2xl mx-auto" data-ui="checkout-container">
        <div className="text-center mb-8" data-ui="checkout-header">
          <h1 className="text-3xl font-bold text-white mb-2" data-ui="checkout-title">
            Enter the GR Cup Raffle
          </h1>
          <p className="text-gray-400" data-ui="checkout-subtitle">
            Fill out the form below to purchase your raffle tickets
          </p>
        </div>

        {error && (
          <div className="mb-6" data-ui="checkout-error-wrapper">
            <CheckoutErrorAlert message={error} onDismiss={clearError} />
          </div>
        )}

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

        <div className="mt-8 text-center text-gray-500 text-sm" data-ui="checkout-help">
          <p data-ui="checkout-help-text">Need help? Contact us at support@grcup.com</p>
        </div>
      </div>
    </main>
  );
}

export default Checkout;
