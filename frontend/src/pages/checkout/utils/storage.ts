/**
 * Checkout Storage Utilities
 * 
 * LocalStorage operations for checkout data persistence.
 */

import { StoredPurchaseData, STORAGE_KEYS } from '../types';

/**
 * Saves purchase data to localStorage
 */
export function savePurchaseData(data: Omit<StoredPurchaseData, 'timestamp'>): void {
  try {
    const purchaseData: StoredPurchaseData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.PURCHASE_DATA, JSON.stringify(purchaseData));
  } catch (error) {
    console.error('Failed to save purchase data:', error);
  }
}

/**
 * Retrieves purchase data from localStorage
 */
export function getPurchaseData(): StoredPurchaseData | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PURCHASE_DATA);
    if (!data) return null;
    
    const parsed: StoredPurchaseData = JSON.parse(data);
    
    // Check if data is older than 24 hours
    const isExpired = Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000;
    if (isExpired) {
      clearPurchaseData();
      return null;
    }
    
    return parsed;
  } catch (error) {
    console.error('Failed to retrieve purchase data:', error);
    return null;
  }
}

/**
 * Clears purchase data from localStorage
 */
export function clearPurchaseData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PURCHASE_DATA);
  } catch (error) {
    console.error('Failed to clear purchase data:', error);
  }
}

/**
 * Checks if purchase data exists
 */
export function hasPurchaseData(): boolean {
  return getPurchaseData() !== null;
}

/**
 * Gets remaining time until purchase data expires
 */
export function getPurchaseDataExpiry(): number | null {
  const data = getPurchaseData();
  if (!data) return null;
  
  const expiryTime = data.timestamp + 24 * 60 * 60 * 1000;
  const remaining = expiryTime - Date.now();
  
  return remaining > 0 ? remaining : 0;
}
