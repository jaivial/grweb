import { signal } from '@preact/signals-react';
import { api } from '../utils/api';

export const participantCount = signal(0);

export async function fetchParticipantCount() {
  try {
    const response = await api.getParticipantCount();
    participantCount.value = response.count;
  } catch (error) {
    console.error('Failed to fetch participant count:', error);
  }
}
