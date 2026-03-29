import type { JSX } from 'react';
import { Spinner } from '@components/ui/Spinner';
import { Card } from '@components/ui/Card';

/**
 * Loading State Component
 * Displays loading indicator while fetching data
 */
export function LoadingState(): JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card variant="default" padding="xl" className="text-center">
        <Spinner size="xl" color="red-accent" className="mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">
          Loading...
        </h2>
        <p className="text-gray-400">
          Verifying your purchase
        </p>
      </Card>
    </div>
  );
}

export default LoadingState;
