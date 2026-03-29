/**
 * Draw History Component
 * 
 * Displays the history of all draws.
 */

import type { JSX } from 'react';
import { Draw } from '../types';
import { Badge, Button } from '@components/ui';
import { DeleteIcon } from '@components/ui/Icon';

interface DrawHistoryProps {
  draws: Draw[];
  onVoidDraw: (drawId: number) => void;
}

export function DrawHistory({ draws, onVoidDraw }: DrawHistoryProps): JSX.Element {
  if (draws.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No draws have been made yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-border">
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Winner</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Email</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Instagram</th>
            <th className="text-center py-3 px-4 text-gray-400 font-medium">Tickets</th>
            <th className="text-center py-3 px-4 text-gray-400 font-medium">Status</th>
            <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {draws.map((draw) => (
            <tr 
              key={draw.id} 
              className="border-b border-dark-border hover:bg-dark-surface/50 transition-colors"
            >
              <td className="py-3 px-4">
                <span className="text-gray-300 text-sm">
                  {new Date(draw.drawDate).toLocaleString()}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="text-white font-medium">
                  {draw.winnerName}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="text-gray-400">{draw.winnerEmail}</span>
              </td>
              <td className="py-3 px-4">
                <a 
                  href={`https://instagram.com/${draw.winnerInstagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-accent hover:underline"
                >
                  @{draw.winnerInstagram}
                </a>
              </td>
              <td className="py-3 px-4 text-center">
                <Badge variant="primary">{draw.winnerTicketCount}</Badge>
              </td>
              <td className="py-3 px-4 text-center">
                {draw.isConfirmed ? (
                  <Badge variant="success">Confirmed</Badge>
                ) : (
                  <Badge variant="warning">Pending</Badge>
                )}
              </td>
              <td className="py-3 px-4 text-right">
                {!draw.isConfirmed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVoidDraw(draw.id)}
                  >
                    <DeleteIcon className="w-4 h-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DrawHistory;
