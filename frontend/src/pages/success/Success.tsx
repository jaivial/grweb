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

export function Success(): JSX.Element {
  const { isLoading, purchaseDetails, error } = usePaymentStatus();

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !purchaseDetails) {
    return <ErrorState message={error || 'No se encontraron datos de la compra'} />;
  }

  return (
    <main className="min-h-screen bg-dark-base py-16 px-4" data-ui="success-page">
      <div className="max-w-md mx-auto" data-ui="success-content">
        <SuccessHeader />
        <PurchaseDetails details={purchaseDetails} />
        <NextSteps />
        <ShareButtons ticketCount={purchaseDetails.ticketCount} />
        <ActionButtons />
      </div>
    </main>
  );
}

export default Success;
