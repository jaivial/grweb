/**
 * Draw Page Types
 * 
 * Type definitions for the admin draw winner page.
 */

export interface Draw {
  id: number;
  winnerEmail: string;
  winnerName: string;
  winnerInstagram: string;
  winnerTicketCount: number;
  drawDate: string;
  isConfirmed: boolean;
  notes?: string;
}

export interface DrawState {
  currentDraw: Draw | null;
  drawHistory: Draw[];
  isDrawing: boolean;
  isLoading: boolean;
  isConfirming: boolean;
  showConfirmModal: boolean;
  error: string | null;
}
