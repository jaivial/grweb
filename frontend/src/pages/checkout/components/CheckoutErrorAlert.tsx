import type { JSX } from 'react';
import { AlertIcon } from '@components/ui/Icon';

interface CheckoutErrorAlertProps {
  message: string;
  onDismiss?: () => void;
}

export function CheckoutErrorAlert({ message, onDismiss }: CheckoutErrorAlertProps): JSX.Element {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3" data-ui="checkout-error-alert">
      <AlertIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1" data-ui="checkout-error-content">
        <h4 className="text-red-500 font-semibold mb-1" data-ui="checkout-error-title">Checkout Error</h4>
        <p className="text-red-400 text-sm" data-ui="checkout-error-message">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-400 transition-colors"
          aria-label="Dismiss error"
          data-testid="checkout-error-dismiss-btn"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="checkout-error-dismiss-icon">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default CheckoutErrorAlert;
