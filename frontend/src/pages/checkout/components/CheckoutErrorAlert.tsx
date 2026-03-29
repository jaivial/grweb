/**
 * Checkout Error Alert Component
 * 
 * Displays error messages for the checkout form.
 */

import type { JSX } from 'react';
import { AlertIcon } from '@components/ui/Icon';

interface CheckoutErrorAlertProps {
  message: string;
  onDismiss?: () => void;
}

export function CheckoutErrorAlert({ message, onDismiss }: CheckoutErrorAlertProps): JSX.Element {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
      <AlertIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h4 className="text-red-500 font-semibold mb-1">Checkout Error</h4>
        <p className="text-red-400 text-sm">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-400 transition-colors"
          aria-label="Dismiss error"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default CheckoutErrorAlert;
