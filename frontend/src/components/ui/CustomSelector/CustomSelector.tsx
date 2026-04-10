import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }, [options, searchTerm, searchable]);

  const selectedOption = useMemo(() => {
    return options.find(opt => opt.value === value);
  }, [options, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideContainer = containerRef.current && containerRef.current.contains(target);
      const isInsideDropdown = target instanceof Element && target.closest('[data-ui="selector-dropdown"]');

      if (!isInsideContainer && !isInsideDropdown) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      if (!isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.top + rect.height, left: rect.left, width: rect.width });
      }
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
        <label className="block text-sm font-medium text-white/80 mb-1.5" data-ui="selector-label">
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full px-4 py-3 min-h-[48px] text-left bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl
          flex items-center justify-between gap-3 transition-all duration-300
          focus:outline-none focus:ring-2 focus:ring-red-accent/30 focus:ring-offset-0
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10 hover:border-white/20'}
          ${error ? 'border-red-500/50' : ''}
          ${isOpen ? 'bg-white/10 border-red-accent/50 ring-2 ring-red-accent/30' : ''}
        `}
        data-ui="selector-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedOption ? 'text-white' : 'text-white/40'} data-ui="selector-value">
          {selectedOption?.label || placeholder}
        </span>

        <div className="flex items-center gap-2" data-ui="selector-actions">
          {allowClear && value && (
            <span
              onClick={handleClear}
              className="text-white/40 hover:text-white p-1 -mr-1 rounded-lg hover:bg-white/10 transition-colors"
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
            className={`w-4 h-4 text-white/50 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && createPortal(
        <div
          className="fixed z-[9999] bg-dark-card border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          data-ui="selector-dropdown"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
        >
          {searchable && (
            <div className="p-2 border-b border-white/10" data-ui="selector-search">
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-base text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50"
              />
            </div>
          )}

          <ul
            className="max-h-48 sm:max-h-60 overflow-y-auto"
            role="listbox"
            data-ui="selector-options"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-4 py-4 min-h-[48px] text-white/50 text-sm flex items-center" data-ui="selector-no-results">
                Sin resultados
              </li>
            ) : (
              filteredOptions.map((option, index) => (
                <li
                  key={String(option.value)}
                  onClick={() => handleSelect(option)}
                  className={`
                    px-4 py-3 min-h-[48px] cursor-pointer transition-all duration-200 flex items-center
                    ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10'}
                    ${option.value === value ? 'bg-red-accent/20 text-red-accent' : 'text-white'}
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
        </div>,
        document.body
      )}

      {error && (
        <p className="mt-1 text-sm text-red-400" data-ui="selector-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default CustomSelector;