import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';

/**
 * Error Alert Component
 * Displays error messages
 */
export function ErrorAlert({ message, onDismiss }: { 
  message: string; 
  onDismiss?: () => void; 
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 animate-slide-up">
      {/* Error icon */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
        <Icon name="warning" size="sm" color="red" />
      </div>
      
      {/* Message */}
      <div className="flex-1">
        <p className="text-red-400 text-sm">{message}</p>
      </div>
      
      {/* Dismiss button */}
      {onDismiss && (
        <button 
          onClick={onDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
          aria-label="Dismiss error"
        >
          <Icon name="x" size="sm" />
        </button>
      )}
    </div>
  );
}

export default ErrorAlert;
