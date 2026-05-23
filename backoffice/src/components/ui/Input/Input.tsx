import type { ReactNode, ChangeEvent } from 'react';
import type { InputProps } from './types';
import { getInputClasses, getLabelClasses, getErrorClasses, getHintClasses, getIconWrapperClasses } from './utils/styles';

/**
 * Input Component
 * 
 * A reusable input component with label, error states, and icons.
 * 
 * @example
 * // Basic input
 * <Input label="Email" type="email" placeholder="you@example.com" />
 * 
 * @example
 * // Input with error
 * <Input label="Email" error="Invalid email address" />
 * 
 * @example
 * // Input with icons
 * <Input label="Search" leftIcon={<SearchIcon />} />
 */
export function Input({
  type = 'text',
  size = 'md',
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  isInvalid = false,
  isDisabled = false,
  fullWidth = true,
  className = '',
  ...props
}: InputProps): ReactNode {
  // Determine if there's an error
  const hasError = isInvalid || !!error;
  
  // Generate input classes
  const inputClasses = getInputClasses(
    size,
    hasError,
    isDisabled,
    !!leftIcon,
    !!rightIcon
  );

  // Container width class
  const containerWidth = fullWidth ? 'w-full' : 'w-auto';

  return (
    <div className={`${containerWidth}`} data-ui="input-container">
      {/* Label */}
      {label && (
        <label className={getLabelClasses(hasError)} data-ui="input-label">
          {label}
        </label>
      )}

      {/* Input wrapper */}
      <div className="relative" data-ui="input-wrapper">
        {/* Left icon */}
        {leftIcon && (
          <div className={getIconWrapperClasses('left')} data-ui="input-left-icon">
            {leftIcon}
          </div>
        )}

        {/* Input field */}
        <input
          type={type}
          className={`${inputClasses} ${className}`}
          disabled={isDisabled}
          aria-invalid={hasError}
          aria-describedby={error ? `${props.name}-error` : hint ? `${props.name}-hint` : undefined}
          data-testid="input"
          {...props}
        />

        {/* Right icon */}
        {rightIcon && (
          <div className={getIconWrapperClasses('right')} data-ui="input-right-icon">
            {rightIcon}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p id={`${props.name}-error`} className={getErrorClasses()} data-ui="input-error">
          {error}
        </p>
      )}

      {/* Hint text */}
      {hint && !error && (
        <p id={`${props.name}-hint`} className={getHintClasses()} data-ui="input-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export default Input;