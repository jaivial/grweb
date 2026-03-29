/**
 * Participants Table Component
 * 
 * Displays participants data in a table format.
 */

import type { JSX } from 'react';
import { Participant } from '../types';
import { Badge } from '@components/ui';

interface ParticipantsTableProps {
  participants: Participant[];
  isLoading?: boolean;
}

export function ParticipantsTable({ participants, isLoading }: ParticipantsTableProps): JSX.Element {
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-border">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Email</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Instagram</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">Tickets</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Total Paid</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="border-b border-dark-border animate-pulse">
                <td className="py-3 px-4"><div className="h-4 bg-dark-border rounded w-24"></div></td>
                <td className="py-3 px-4"><div className="h-4 bg-dark-border rounded w-32"></div></td>
                <td className="py-3 px-4"><div className="h-4 bg-dark-border rounded w-20"></div></td>
                <td className="py-3 px-4 text-center"><div className="h-4 bg-dark-border rounded w-8 mx-auto"></div></td>
                <td className="py-3 px-4 text-right"><div className="h-4 bg-dark-border rounded w-16 ml-auto"></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No participants found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-border">
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Email</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Instagram</th>
            <th className="text-center py-3 px-4 text-gray-400 font-medium">Tickets</th>
            <th className="text-right py-3 px-4 text-gray-400 font-medium">Total Paid</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr 
              key={participant.id} 
              className="border-b border-dark-border hover:bg-dark-surface/50 transition-colors"
            >
              <td className="py-3 px-4">
                <span className="text-white font-medium">
                  {participant.firstName} {participant.surname}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="text-gray-400">{participant.email}</span>
              </td>
              <td className="py-3 px-4">
                <a 
                  href={`https://instagram.com/${participant.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-accent hover:underline"
                >
                  @{participant.instagram}
                </a>
              </td>
              <td className="py-3 px-4 text-center">
                <Badge variant="primary">{participant.ticketCount}</Badge>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-white font-semibold">
                  €{participant.totalPaid.toFixed(2)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ParticipantsTable;
