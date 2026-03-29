import { useState, useEffect } from 'react';
import type { PurchaseDetails } from '../types';

const STORAGE_KEY = 'gr_cup_purchase';

/**
 * Hook to retrieve and manage purchase details from storage
 */
export function usePaymentStatus() {
  const [isLoading, setIsLoading] = useState(true);
  const [purchaseDetails, setPurchaseDetails] = useState<PurchaseDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Retrieve purchase details from localStorage
    const storedPurchase = localStorage.getItem(STORAGE_KEY);
    
    if (storedPurchase) {
      try {
        const parsed = JSON.parse(storedPurchase) as PurchaseDetails;
        
        // Validate required fields
        if (parsed.firstName && parsed.email && parsed.ticketCount && parsed.totalPaid) {
          setPurchaseDetails(parsed);
        } else {
          setError('Invalid purchase data');
        }
      } catch (err) {
        setError('Failed to parse purchase data');
      }
    } else {
      // Try to get from URL parameters (session_id)
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      
      if (sessionId) {
        // In production, you would verify the session with the backend
        // For now, create a basic entry
        setPurchaseDetails({
          firstName: 'Participant',
          surname: '',
          email: 'N/A',
          instagram: '@grcup',
          ticketCount: 1,
          totalPaid: 0.50,
          sessionId,
        });
      } else {
        setError('No purchase data found');
      }
    }
    
    setIsLoading(false);
  }, []);

  /**
   * Clear purchase data from storage
   */
  const clearPurchaseData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPurchaseDetails(null);
  };

  return {
    isLoading,
    purchaseDetails,
    error,
    clearPurchaseData,
  };
}

/**
 * Saves purchase details to storage
 */
export function savePurchaseToStorage(details: PurchaseDetails): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
}

/**
 * Retrieves purchase details from storage
 */
export function getPurchaseFromStorage(): PurchaseDetails | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as PurchaseDetails;
    } catch {
      return null;
    }
  }
  return null;
}
