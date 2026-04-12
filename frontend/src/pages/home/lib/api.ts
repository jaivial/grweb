// API client for Home page

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Fetches the current participant count from the API
 */
export async function fetchParticipantCount(): Promise<number> {
  try {
    const response = await fetch(`${API_URL}/api/participants/count`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.count || 0;
  } catch {
    return 0;
  }
}

/**
 * Polls for participant count updates
 */
export function createParticipantCountPoller(
  onUpdate: (count: number) => void,
  interval: number = 30000
): {
  start: () => void;
  stop: () => void;
} {
  let intervalId: number | null = null;

  return {
    start: () => {
      if (intervalId) return;
      
      // Initial fetch
      fetchParticipantCount()
        .then(onUpdate)
        .catch(console.error);

      // Set up polling
      intervalId = window.setInterval(async () => {
        try {
          const count = await fetchParticipantCount();
          onUpdate(count);
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, interval);
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

/**
 * Health check for API
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/participants/count`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
