/**
 * Draw Hook
 * 
 * Manages draw state and operations.
 */

import { useState, useCallback, useEffect } from 'react';
import { token } from '@stores/auth';
import { performDraw, confirmWinner, getDrawHistory, voidDraw } from '../lib/api';
import { Draw } from '../types';

export interface UseDrawReturn {
  // State
  currentDraw: Draw | null;
  drawHistory: Draw[];
  isDrawing: boolean;
  isLoading: boolean;
  isConfirming: boolean;
  showConfirmModal: boolean;
  error: string | null;

  // Actions
  drawWinner: () => Promise<void>;
  handleConfirmWinner: () => Promise<void>;
  handleVoidDraw: (drawId: number) => Promise<void>;
  setShowConfirmModal: (show: boolean) => void;
  clearError: () => void;
  refreshHistory: () => Promise<void>;
}

export function useDraw(): UseDrawReturn {
  const [currentDraw, setCurrentDraw] = useState<Draw | null>(null);
  const [drawHistory, setDrawHistory] = useState<Draw[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load draw history
  const loadHistory = useCallback(async () => {
    const currentToken = token.value;
    if (!currentToken) {
      setError('Not authenticated');
      return;
    }

    try {
      const history = await getDrawHistory(currentToken);
      setDrawHistory(history);
    } catch (err) {
      console.error('Failed to load draw history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load draw history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (token.value) {
      loadHistory();
    } else {
      setIsLoading(false);
    }
  }, [loadHistory]);

  // Perform draw
  const drawWinner = useCallback(async () => {
    const currentToken = token.value;
    if (!currentToken) {
      setError('Not authenticated');
      return;
    }

    setIsDrawing(true);
    setError(null);

    try {
      const draw = await performDraw(currentToken);
      setCurrentDraw(draw);
      setShowConfirmModal(true);
      await loadHistory();
    } catch (err) {
      console.error('Failed to draw winner:', err);
      setError(err instanceof Error ? err.message : 'No participants available for draw');
    } finally {
      setIsDrawing(false);
    }
  }, [loadHistory]);

  // Confirm winner
  const handleConfirmWinner = useCallback(async () => {
    if (!currentDraw || !token.value) return;

    setIsConfirming(true);
    setError(null);

    try {
      const confirmed = await confirmWinner(token.value, currentDraw.id);
      setCurrentDraw(confirmed);
      setShowConfirmModal(false);
      await loadHistory();
    } catch (err) {
      console.error('Failed to confirm winner:', err);
      setError(err instanceof Error ? err.message : 'Failed to confirm winner');
    } finally {
      setIsConfirming(false);
    }
  }, [currentDraw, loadHistory]);

  // Void draw
  const handleVoidDraw = useCallback(async (drawId: number) => {
    if (!token.value) return;

    try {
      await voidDraw(token.value, drawId);
      setCurrentDraw(null);
      await loadHistory();
    } catch (err) {
      console.error('Failed to void draw:', err);
      setError(err instanceof Error ? err.message : 'Failed to void draw');
    }
  }, [loadHistory]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    currentDraw,
    drawHistory,
    isDrawing,
    isLoading,
    isConfirming,
    showConfirmModal,
    error,
    drawWinner,
    handleConfirmWinner,
    handleVoidDraw,
    setShowConfirmModal,
    clearError,
    refreshHistory: loadHistory,
  };
}
