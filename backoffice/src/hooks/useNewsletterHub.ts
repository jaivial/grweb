import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import type { NewsletterProgress } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL || '';

interface NewsletterHubHandlers {
  onProgress?: (progress: NewsletterProgress) => void;
  onHistoryChanged?: () => void;
}

/**
 * Subscribes to the newsletter SignalR hub for a competition.
 * Receives live batch-send progress and history-changed notifications.
 * Re-subscribes whenever the competition changes.
 */
export function useNewsletterHub(competicionId: number | null, handlers: NewsletterHubHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (competicionId == null) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_URL}/hubs/newsletter`)
      .withAutomaticReconnect()
      .build();

    connection.on('NewsletterSendProgress', (progress: NewsletterProgress) => {
      handlersRef.current.onProgress?.(progress);
    });

    connection.on('NewsletterHistoryChanged', () => {
      handlersRef.current.onHistoryChanged?.();
    });

    const join = () => connection.invoke('JoinCompetition', competicionId).catch(() => {});
    connection.onreconnected(join);

    connection
      .start()
      .then(join)
      .catch(() => {});

    return () => {
      connection.stop();
    };
  }, [competicionId]);
}
