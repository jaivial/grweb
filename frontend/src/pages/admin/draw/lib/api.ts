/**
 * Draw API Integration
 * 
 * API client for draw operations.
 */

import { api } from '@utils/api';
import { Draw } from '../types';

/**
 * Performs a random draw
 */
export async function performDraw(token: string): Promise<Draw> {
  return api.drawWinner(token);
}

/**
 * Confirms a winner
 */
export async function confirmWinner(token: string, drawId: number): Promise<Draw> {
  return api.confirmWinner(token, drawId);
}

/**
 * Gets draw history
 */
export async function getDrawHistory(token: string): Promise<Draw[]> {
  return api.getDraws(token);
}

/**
 * Voids a draw
 */
export async function voidDraw(token: string, drawId: number): Promise<void> {
  await api.voidDraw(token, drawId);
}
