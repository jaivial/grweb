import { useState, useCallback, type ReactNode } from 'react';
import type { JSX } from 'react';

export interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  disabled?: boolean;
}

export function Accordion({
  title,
  children,
  defaultOpen = false,
  className = '',
  disabled = false,
}: AccordionProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  return (
    <div className={`border border-dark-border rounded-lg overflow-hidden ${className}`} data-ui="accordion">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          w-full px-4 py-3 flex items-center justify-between bg-dark-surface
          transition-colors text-left
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-dark-hover cursor-pointer'}
        `}
        data-ui="accordion-trigger"
        aria-expanded={isOpen}
      >
        <span className="font-medium text-white" data-ui="accordion-title">
          {title}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          data-ui="accordion-chevron"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      <div
        className={`
          overflow-hidden transition-all duration-200 ease-in-out
          ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}
        `}
        data-ui="accordion-content"
      >
        <div className="p-4 bg-dark-base border-t border-dark-border">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Accordion;
