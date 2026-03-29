import type { JSX } from 'react';
import type { PurchaseDetails } from '../types';
import { Card } from '@components/ui/Card';
import { Icon } from '@components/ui/Icon';
import { formatPrice, formatTicketCount, formatFullName, formatInstagram } from '../utils/formatters';

interface PurchaseDetailsProps {
  details: PurchaseDetails;
}

/**
 * Purchase Details Component
 * Displays the summary of the purchase
 */
export function PurchaseDetails({ details }: PurchaseDetailsProps): JSX.Element {
  return (
    <Card variant="default" padding="lg" className="mb-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        <Icon name="ticket" color="red-accent" size="md" />
        Your Purchase
      </h3>
      
      <div className="space-y-4">
        {/* Tickets */}
        <div className="flex items-center justify-between py-3 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-accent/10 flex items-center justify-center">
              <Icon name="ticket" color="red-accent" size="sm" />
            </div>
            <span className="text-gray-300">Tickets</span>
          </div>
          <span className="text-white font-semibold">
            {formatTicketCount(details.ticketCount)}
          </span>
        </div>

        {/* Name */}
        <div className="flex items-center justify-between py-3 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-dark-red/10 flex items-center justify-center">
              <Icon name="user" color="dark-red" size="sm" />
            </div>
            <span className="text-gray-300">Name</span>
          </div>
          <span className="text-white font-semibold">
            {formatFullName(details.firstName, details.surname)}
          </span>
        </div>

        {/* Instagram */}
        <div className="flex items-center justify-between py-3 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
              <Icon name="instagram" color="pink" size="sm" />
            </div>
            <span className="text-gray-300">Instagram</span>
          </div>
          <span className="text-white font-semibold">
            {formatInstagram(details.instagram)}
          </span>
        </div>

        {/* Total Paid */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Icon name="dollar" color="green" size="sm" />
            </div>
            <span className="text-gray-300">Total Paid</span>
          </div>
          <span className="text-2xl font-bold text-red-accent">
            {formatPrice(details.totalPaid)}
          </span>
        </div>
      </div>
    </Card>
  );
}

export default PurchaseDetails;
