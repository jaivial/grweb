import { signal } from '@preact/signals-react';
import { api } from '../utils/api';

export const participantCount = signal(0);

export interface ConfirmedWinner {
  id: number;
  winnerName: string;
  winnerEmail: string;
  winnerInstagram: string;
  winnerTicketCount: number;
  drawDate: string;
  isConfirmed: boolean;
  participantId: number | null;
}

export const latestConfirmedWinner = signal<ConfirmedWinner | null>(null);

export async function fetchParticipantCount() {
  try {
    const response = await api.getParticipantCount();
    participantCount.value = response.count;
  } catch (error) {
    console.error('Failed to fetch participant count:', error);
  }
}

export async function fetchConfirmedWinner() {
  try {
    const response = await api.getConfirmedWinner();
    latestConfirmedWinner.value = response.data ?? null;
  } catch {
    latestConfirmedWinner.value = null;
  }
}
