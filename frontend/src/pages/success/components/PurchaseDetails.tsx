import type { JSX } from 'react';
import type { PurchaseDetails } from '../types';
import { formatPrice, formatTicketCount, formatFullName, formatInstagram } from '../utils/formatters';

interface PurchaseDetailsProps {
  details: PurchaseDetails;
}

export function PurchaseDetails({ details }: PurchaseDetailsProps): JSX.Element {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 mb-6" data-ui="purchase-details">
      <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4" data-ui="purchase-details-title">
        Resumen
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between" data-ui="purchase-row-tickets">
          <span className="text-sm text-white/50">Boletos</span>
          <span className="text-sm font-medium text-white">{formatTicketCount(details.ticketCount)}</span>
        </div>

        <div className="flex items-center justify-between" data-ui="purchase-row-name">
          <span className="text-sm text-white/50">Nombre</span>
          <span className="text-sm font-medium text-white">{formatFullName(details.firstName, details.surname)}</span>
        </div>

        <div className="flex items-center justify-between" data-ui="purchase-row-instagram">
          <span className="text-sm text-white/50">Instagram</span>
          <span className="text-sm font-medium text-white">{formatInstagram(details.instagram)}</span>
        </div>

        <div className="pt-3 mt-1 border-t border-white/5 flex items-center justify-between" data-ui="purchase-row-total">
          <span className="text-sm text-white/50">Total</span>
          <span className="text-lg font-bold text-white">{formatPrice(details.totalPaid)}</span>
        </div>
      </div>
    </div>
  );
}

export default PurchaseDetails;
