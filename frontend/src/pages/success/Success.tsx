import type { JSX } from 'react';
import { 
  SuccessHeader, 
  PurchaseDetails, 
  NextSteps, 
  ShareButtons, 
  ActionButtons,
  LoadingState,
  ErrorState,
} from './components';
import { usePaymentStatus } from './hooks';

/**
 * Success Page
 * 
 * Displays confirmation after successful ticket purchase.
 * Shows purchase details, next steps, and sharing options.
 */
export function Success(): JSX.Element {
  const { isLoading, purchaseDetails, error } = usePaymentStatus();

  // Loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Error state
  if (error || !purchaseDetails) {
    return <ErrorState message={error || 'No purchase data found'} />;
  }

  // Success state
  return (
    <main className="min-h-screen bg-dark-base py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header with checkmark */}
        <SuccessHeader />

        {/* Purchase Details */}
        <PurchaseDetails details={purchaseDetails} />

        {/* Next Steps */}
        <NextSteps />

        {/* Share Buttons */}
        <ShareButtons ticketCount={purchaseDetails.ticketCount} />

        {/* Action Buttons */}
        <ActionButtons />
      </div>
    </main>
  );
}

export default Success;
