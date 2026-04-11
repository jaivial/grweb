import type { ReactNode, ChangeEvent } from 'react';
import type { CheckboxProps } from '../types';

/**
 * Checkbox Component
 * 
 * A reusable checkbox component with label and error states.
 * 
 * @example
 * // Basic checkbox
 * <Checkbox label="I agree to terms" />
 * 
 * @example
 * // Checkbox with change handler
 * <Checkbox label="Subscribe" checked={isChecked} onChange={setIsChecked} />
 */
export function Checkbox({
  label,
  checked = false,
  onChange,
  isDisabled = false,
  error,
  name,
  value,
  className = '',
}: CheckboxProps): ReactNode {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    onChange?.(target.checked);
  };

  return (
    <div className={`flex items-start gap-3 ${className}`} data-ui="checkbox">
      {/* Hidden actual checkbox */}
      <input
        type="checkbox"
        id={name}
        name={name}
        value={value}
        checked={checked}
        onChange={handleChange}
        disabled={isDisabled}
        className="sr-only peer"
        aria-invalid={!!error}
        data-testid="checkbox-input"
      />

      {/* Custom checkbox visual */}
      <label
        htmlFor={name}
        className={`
          flex items-center gap-2
          cursor-pointer
          select-none
          text-sm
          text-gray-300
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
          peer-focus-visible:ring-2
          peer-focus-visible:ring-red-accent/50
          peer-focus-visible:ring-offset-2
          peer-focus-visible:ring-offset-dark-base
        `}
        data-ui="checkbox-label"
      >
        {/* Checkbox box */}
        <span
          className={`
            w-5 h-5
            flex items-center justify-center
            border-2 rounded-lg
            transition-all duration-200
            ${checked
              ? 'bg-red-accent border-red-accent'
              : 'bg-transparent border-dark-border hover:border-red-accent/50'
            }
            ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
          data-ui="checkbox-box"
        >
          {/* Checkmark */}
          {checked && (
            <svg
              className="w-3.5 h-3.5 text-dark-base"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="3"
              data-ui="checkbox-checkmark"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </span>

        {/* Label text */}
        <span className="flex-1" data-ui="checkbox-label-text">{label}</span>
      </label>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400 mt-1" data-ui="checkbox-error">{error}</p>
      )}
    </div>
  );
}

export default Checkbox;