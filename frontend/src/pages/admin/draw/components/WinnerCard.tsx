/**
 * Winner Card Component
 * 
 * Displays the current winner with details.
 */

import type { JSX } from 'react';
import { Draw } from '../types';
import { Badge, Button } from '@components/ui';
import { InstagramIcon, TicketIcon } from '@components/ui/Icon';

interface WinnerCardProps {
  draw: Draw;
  onConfirm: () => void;
  onReDraw: () => void;
  isConfirming: boolean;
}

export function WinnerCard({ draw, onConfirm, onReDraw, isConfirming }: WinnerCardProps): JSX.Element {
  return (
    <div className="bg-gradient-to-br from-red-accent/10 to-dark-red/10 rounded-2xl p-8 border border-red-accent/30">
      {/* Trophy Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-r from-red-accent to-dark-red flex items-center justify-center">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        </div>
      </div>

      {/* Winner Info */}
      <div className="text-center mb-6">
        <Badge variant="success" className="mb-4">
          Winner Selected
        </Badge>
        <h2 className="text-3xl font-bold text-white mb-2">
          {draw.winnerName}
        </h2>
        <p className="text-gray-400">
          {draw.winnerEmail}
        </p>
      </div>

      {/* Details */}
      <div className="flex justify-center gap-6 mb-8">
        <div className="flex items-center gap-2 text-gray-300">
          <InstagramIcon className="w-5 h-5" />
          <span>@{draw.winnerInstagram}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-300">
          <TicketIcon className="w-5 h-5" />
          <span>{draw.winnerTicketCount} tickets</span>
        </div>
      </div>

      {/* Draw Date */}
      <p className="text-center text-gray-500 text-sm mb-6">
        Drawn on {new Date(draw.drawDate).toLocaleString()}
      </p>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        {draw.isConfirmed ? (
          <Badge variant="primary">Winner Confirmed</Badge>
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={onConfirm}
              disabled={isConfirming}
            >
              {isConfirming ? 'Confirming...' : 'Confirm Winner'}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={onReDraw}
              disabled={isConfirming}
            >
              Re-Draw
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default WinnerCard;
