import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { participantCount, latestConfirmedWinner } from '../stores/participants';
import type { ConfirmedWinner } from '../stores/participants';

const API_URL = import.meta.env.VITE_API_URL || '';

export function useSignalR() {
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_URL}/hubs/participants`)
      .withAutomaticReconnect()
      .build();

    connection.on('ParticipantCountUpdated', (count: number) => {
      participantCount.value = count;
    });

    connection.on('WinnerAnnounced', (winner: ConfirmedWinner) => {
      latestConfirmedWinner.value = winner;
    });

    connection.start()
      .then(() => console.log('SignalR connected'))
      .catch(() => {});

    connectionRef.current = connection;

    return () => {
      connection.stop();
    };
  }, []);

  return connectionRef.current;
}
