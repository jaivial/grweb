import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import type { JSX } from 'react';

export interface OrderByOption {
  value: string;
  label: string;
}

interface OrderByDropdownProps {
  options: OrderByOption[];
  value: string;
  direction: 'asc' | 'desc';
  onValueChange: (value: string) => void;
  onDirectionChange: (direction: 'asc' | 'desc') => void;
  label?: string;
}

export function OrderByDropdown({
  options,
  value,
  direction,
  onValueChange,
  onDirectionChange,
  label = 'Ordenar por',
}: OrderByDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleSelect = useCallback((optionValue: string) => {
    onValueChange(optionValue);
    setIsOpen(false);
  }, [onValueChange]);

  const handleDirectionToggle = useCallback(() => {
    onDirectionChange(direction === 'asc' ? 'desc' : 'asc');
  }, [direction, onDirectionChange]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm text-white/60 mb-1.5">{label}</label>
      )}
      <div className="flex gap-0">
        <button
          type="button"
          onClick={handleToggle}
          className="flex-1 flex items-center justify-between gap-2 px-4 py-3 min-h-[48px] text-sm bg-white/5 backdrop-blur-xl border border-white/10 rounded-l-xl text-white hover:bg-white/[0.08] transition-colors"
          data-ui="order-by-dropdown-trigger"
        >
          <span className={selectedOption ? 'text-white' : 'text-white/40'}>
            {selectedOption?.label || 'Seleccionar...'}
          </span>
          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={handleDirectionToggle}
          className="flex items-center justify-center px-3 min-h-[48px] bg-white/5 backdrop-blur-xl border border-l-0 border-white/10 rounded-r-xl text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          data-ui="order-by-direction-btn"
          title={direction === 'asc' ? 'Ascendente' : 'Descendente'}
        >
          <ArrowUpDown className={`w-4 h-4 transition-transform ${direction === 'desc' ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute z-50 bottom-full mb-1 w-full bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          data-ui="order-by-dropdown-menu"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/5 ${
                opt.value === value ? 'text-red-accent bg-white/5' : 'text-white/70'
              }`}
              data-ui={`order-by-option-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrderByDropdown;
