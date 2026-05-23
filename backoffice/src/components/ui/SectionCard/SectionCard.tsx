import type { ReactNode } from 'react';
import type { JSX } from 'react';

export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function SectionCard({
  title,
  description,
  icon,
  href,
  onClick,
  className = '',
  disabled = false,
}: SectionCardProps): JSX.Element {
  const content = (
    <div
      className={`
        group relative h-full p-4 xs:p-5 sm2:p-6 bg-dark-surface border border-dark-border rounded-xl xs:rounded-2xl
        transition-all duration-200 cursor-pointer
        hover:border-red-accent/50 hover:shadow-lg hover:shadow-red-accent/5
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      data-ui="section-card"
    >
      {/* Icon */}
      {icon && (
        <div className="mb-3 xs:mb-4 w-10 h-10 xs:w-12 xs:h-12 rounded-lg xs:rounded-xl bg-red-accent/10 flex items-center justify-center text-red-accent" data-ui="section-card-icon">
          {icon}
        </div>
      )}

      {/* Content */}
      <div data-ui="section-card-content">
        <h3 className="text-base xs:text-lg font-semibold text-white mb-1.5 xs:mb-2 group-hover:text-red-accent transition-colors" data-ui="section-card-title">
          {title}
        </h3>
        {description && (
          <p className="text-xs xs:text-sm text-gray-400" data-ui="section-card-description">
            {description}
          </p>
        )}
      </div>

      {/* Arrow indicator */}
      <div className="absolute top-4 xs:top-5 sm2:top-6 right-4 xs:right-5 sm2:right-6 text-gray-600 group-hover:text-red-accent transition-colors" data-ui="section-card-arrow">
        <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );

  if (href && !disabled) {
    return (
      <a href={href} className="block" data-ui="section-card-link">
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full text-left"
        data-ui="section-card-button"
      >
        {content}
      </button>
    );
  }

  return content;
}

export default SectionCard;
