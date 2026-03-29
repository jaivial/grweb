import type { JSX } from 'react';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Icon } from '@components/ui/Icon';

/**
 * Error State Component
 * Displays error message with retry option
 */
export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card variant="default" padding="xl" className="text-center max-w-md">
        {/* Error icon */}
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <Icon name="x" size="2xl" color="red" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2">
          Oops!
        </h2>
        
        <p className="text-gray-400 mb-6">
          {message || 'Something went wrong. Please try again.'}
        </p>
        
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = '/checkout';
            }}
          >
            Try Again
          </Button>
          
          <Button
            variant="ghost"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Return Home
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default ErrorState;
