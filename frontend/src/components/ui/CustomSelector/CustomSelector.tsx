import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { JSX } from 'react';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectorProps<T = string> {
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  searchable?: boolean;
  allowClear?: boolean;
  className?: string;
}

export function CustomSelector<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  label,
  error,
  disabled = false,
  searchable = false,
  allowClear = true,
  className = '',
}: CustomSelectorProps<T>): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }, [options, searchTerm, searchable]);

  // Selected option
  const selectedOption = useMemo(() => {
    return options.find(opt => opt.value === value);
  }, [options, value]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) setSearchTerm('');
    }
  }, [disabled, isOpen]);

  const handleSelect = useCallback((option: SelectOption<T>) => {
    if (!option.disabled) {
      onChange(option.value);
      setIsOpen(false);
      setSearchTerm('');
    }
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    } else if (e.key === 'Enter' && filteredOptions.length === 1) {
      handleSelect(filteredOptions[0]);
    }
  }, [filteredOptions, handleSelect]);

  return (
    <div ref={containerRef} className={`relative ${className}`} data-ui="custom-selector">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-1.5" data-ui="selector-label">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full px-3 py-2.5 text-left bg-dark-surface border rounded-lg
          flex items-center justify-between gap-2 transition-colors
          focus:outline-none focus:ring-2 focus:ring-red-accent/50
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-600'}
          ${error ? 'border-red-500' : 'border-dark-border'}
          ${isOpen ? 'ring-2 ring-red-accent/50 border-red-accent' : ''}
        `}
        data-ui="selector-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedOption ? 'text-white' : 'text-gray-500'} data-ui="selector-value">
          {selectedOption?.label || placeholder}
        </span>
        
        <div className="flex items-center gap-1" data-ui="selector-actions">
          {allowClear && value && (
            <span
              onClick={handleClear}
              className="text-gray-400 hover:text-white p-1 -mr-1"
              data-ui="selector-clear"
              role="button"
              tabIndex={-1}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden"
          data-ui="selector-dropdown"
        >
          {searchable && (
            <div className="p-2 border-b border-dark-border" data-ui="selector-search">
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className="w-full px-3 py-2 bg-dark-base border border-dark-border rounded text-white placeholder-gray-500 focus:outline-none focus:border-red-accent"
              />
            </div>
          )}
          
          <ul
            className="max-h-60 overflow-y-auto"
            role="listbox"
            data-ui="selector-options"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-gray-500 text-sm" data-ui="selector-no-results">
                Sin resultados
              </li>
            ) : (
              filteredOptions.map((option, index) => (
                <li
                  key={String(option.value)}
                  onClick={() => handleSelect(option)}
                  className={`
                    px-3 py-2 cursor-pointer transition-colors
                    ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-dark-hover'}
                    ${option.value === value ? 'bg-red-accent/10 text-red-accent' : 'text-white'}
                  `}
                  role="option"
                  aria-selected={option.value === value}
                  data-ui="selector-option"
                  data-option-index={index}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-500" data-ui="selector-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default CustomSelector;
