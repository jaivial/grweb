// Success page types

export interface PurchaseDetails {
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  totalPaid: number;
  sessionId?: string;
}

export interface NextStep {
  icon: string;
  title: string;
  description: string;
}

export interface SocialShare {
  platform: 'instagram' | 'twitter' | 'facebook';
  url: string;
  message: string;
}

export interface SuccessState {
  isLoading: boolean;
  purchaseDetails: PurchaseDetails | null;
  error: string | null;
}

// Payment status hook state
export interface PaymentStatusState {
  isLoading: boolean;
  purchaseDetails: PurchaseDetails | null;
  error: string | null;
}
