/**
 * Ticket Quantity Selector Component
 * 
 * Allows users to select the number of raffle tickets to purchase.
 */

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
  // Handle manual input change
  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!isNaN(value)) {
      onQuantityChange(value);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-300">
          Number of Tickets
        </label>
        <span className="text-sm text-gray-500">
          {pricePerTicket} € per ticket
        </span>
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center gap-4">
        {/* Decrement Button */}
        <Button
          variant="secondary"
          size="md"
          onClick={onDecrement}
          disabled={quantity <= 1}
          aria-label="Decrease quantity"
        >
          <MinusIcon className="w-5 h-5" />
        </Button>

        {/* Quantity Input */}
        <input
          type="number"
          value={quantity}
          onChange={handleInputChange}
          min="1"
          max="100"
          className="w-24 px-4 py-3 text-center bg-dark-surface border border-dark-border rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-red-accent focus:ring-1 focus:ring-red-accent transition-colors"
        />

        {/* Increment Button */}
        <Button
          variant="secondary"
          size="md"
          onClick={onIncrement}
          disabled={quantity >= 100}
          aria-label="Increase quantity"
        >
          <PlusIcon className="w-5 h-5" />
        </Button>
      </div>

      {/* Quick Select Buttons */}
      <div className="flex flex-wrap gap-2">
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
          >
            {num}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}

      {/* Total Price */}
      <div className="flex items-center justify-between pt-4 border-t border-dark-border">
        <span className="text-gray-400">Total</span>
        <span className="text-2xl font-bold text-white">{totalPrice}</span>
      </div>
    </div>
  );
}

export default TicketQuantitySelector;
