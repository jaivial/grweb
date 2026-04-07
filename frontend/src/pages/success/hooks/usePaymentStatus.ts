import { useState, useEffect } from 'react';
import type { PurchaseDetails } from '../types';
import { api } from '../../../utils/api';

/**
 * Hook to retrieve purchase details from the backend using session_id.
 * Falls back to localStorage, then to an error state.
 */
export function usePaymentStatus() {
  const [isLoading, setIsLoading] = useState(true);
  const [purchaseDetails, setPurchaseDetails] = useState<PurchaseDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      // 1. Try session_id from URL (primary source)
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');

      if (sessionId) {
        try {
          const data = await api.getSessionDetails(sessionId);
          setPurchaseDetails({
            firstName: data.firstName,
            surname: data.surname,
            email: data.email,
            instagram: data.instagram,
            ticketCount: data.ticketCount,
            totalPaid: data.totalPaid,
            sessionId: data.sessionId,
          });
          return;
        } catch {
          // Backend fetch failed — fall through to localStorage
        }
      }

      // 2. Fallback: localStorage (from checkout form before redirect)
      const storedPurchase = localStorage.getItem('gr_cup_purchase_data');
      if (storedPurchase) {
        try {
          const parsed = JSON.parse(storedPurchase);
          if (parsed.firstName && parsed.email && parsed.ticketCount) {
            setPurchaseDetails({
              firstName: parsed.firstName,
              surname: parsed.surname || '',
              email: parsed.email,
              instagram: parsed.instagram || '',
              ticketCount: parsed.ticketCount,
              totalPaid: parsed.ticketCount * 0.50,
            });
            return;
          }
        } catch {
          // Parse failed — fall through
        }
      }

      setError('No se encontraron datos de la compra');
    };

    fetchDetails().finally(() => setIsLoading(false));
  }, []);
  return { isLoading, purchaseDetails, error };
}

/**
 * Saves purchase details to storage
 */
export function savePurchaseToStorage(details: PurchaseDetails): void {
  localStorage.setItem('gr_cup_purchase_data', JSON.stringify(details));
}

/**
 * Retrieves purchase details from storage
 */
export function getPurchaseFromStorage(): PurchaseDetails | null {
  const stored = localStorage.getItem('gr_cup_purchase_data');
  if (stored) {
    try {
      return JSON.parse(stored) as PurchaseDetails;
    } catch {
      return null;
    }
  }
  return null;
}
