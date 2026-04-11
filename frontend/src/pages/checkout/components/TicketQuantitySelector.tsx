import type { JSX } from 'react';
import { Button } from '@components/ui';
import { MinusIcon, PlusIcon } from '@components/ui/Icon';

interface TicketQuantitySelectorProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onQuantityChange: (quantity: number) => void;
  pricePerTicket: number;
  totalPrice: string;
  error?: string;
}

export function TicketQuantitySelector({
  quantity,
  onIncrement,
  onDecrement,
  onQuantityChange,
  pricePerTicket,
  totalPrice,
  error,
}: TicketQuantitySelectorProps): JSX.Element {
  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!isNaN(value)) {
      onQuantityChange(value);
    }
  };

  return (
    <div className="space-y-4" data-ui="ticket-quantity-selector">
      <div className="flex items-center justify-between" data-ui="ticket-selector-header">
        <label className="block text-sm font-medium text-gray-300" data-ui="ticket-selector-label">
          Number of Tickets
        </label>
        <span className="text-sm text-gray-500" data-ui="ticket-price-hint">
          {pricePerTicket} € per ticket
        </span>
      </div>

      <div className="flex items-center gap-4" data-ui="ticket-controls">
        <Button
          variant="secondary"
          size="md"
          onClick={onDecrement}
          disabled={quantity <= 1}
          aria-label="Decrease quantity"
          data-testid="ticket-decrement-btn"
        >
          <MinusIcon className="w-5 h-5" />
        </Button>

        <input
          type="number"
          value={quantity}
          onChange={handleInputChange}
          min="1"
          max="100"
          className="w-24 px-4 py-3 text-center bg-dark-surface border border-dark-border rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-red-accent focus:ring-1 focus:ring-red-accent transition-colors"
          data-testid="ticket-quantity-input"
        />

        <Button
          variant="secondary"
          size="md"
          onClick={onIncrement}
          disabled={quantity >= 100}
          aria-label="Increase quantity"
          data-testid="ticket-increment-btn"
        >
          <PlusIcon className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" data-ui="ticket-quick-select">
        {[1, 5, 10, 20, 50].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onQuantityChange(num)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              quantity === num
                ? 'bg-red-accent text-black font-medium'
                : 'bg-dark-surface text-gray-400 hover:bg-dark-border'
            }`}
            data-testid={`ticket-quick-${num}-btn`}
          >
            {num}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-500 text-sm" data-ui="ticket-quantity-error">{error}</p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-dark-border" data-ui="ticket-total-row">
        <span className="text-gray-400" data-ui="ticket-total-label">Total</span>
        <span className="text-2xl font-bold text-white" data-ui="ticket-total-value">{totalPrice}</span>
      </div>
    </div>
  );
}

export default TicketQuantitySelector;
