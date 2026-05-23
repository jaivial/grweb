import type { JSX } from 'react';
import type { ButtonProps } from './types';
import { getButtonClasses, getIconClasses, getSpinnerSize } from './utils/styles';
import { Spinner } from '../Spinner';

/**
 * Button Component
 * 
 * A reusable button component with multiple variants, sizes, and states.
 * Supports loading states, icons, and disabled states.
 * 
 * @example
 * // Primary button
 * <Button variant="primary" size="lg">Get Started</Button>
 * 
 * @example
 * // Button with loading state
 * <Button variant="secondary" isLoading={isSubmitting}>Submit</Button>
 * 
 * @example
 * // Button with icons
 * <Button variant="outline" leftIcon={<Icon name="arrow-left" />}>Back</Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  isDisabled = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  children,
  className = '',
  class: classAlt = '',
  type = 'button',
  onClick,
  key,
  'aria-label': ariaLabel,
}: ButtonProps): JSX.Element {
  // Generate button classes
  const buttonClasses = getButtonClasses(
    variant,
    size,
    isDisabled || disabled,
    isLoading,
    fullWidth
  );

  // Get icon size
  const iconSize = getIconClasses(size);
  const spinnerSize = getSpinnerSize(size);

  // Combine classes
  const combinedClasses = `${buttonClasses} ${className} ${classAlt}`.trim();

  return (
    <button
      type={type}
      className={combinedClasses}
      disabled={isDisabled || disabled || isLoading}
      onClick={onClick}
      key={key}
      aria-label={ariaLabel}
      data-testid="button"
    >
      {/* Loading spinner */}
      {isLoading && (
        <Spinner size={spinnerSize} className="mr-2" data-ui="button-spinner" />
      )}

      {/* Left icon */}
      {leftIcon && !isLoading && (
        <span className={iconSize} data-ui="button-left-icon">{leftIcon}</span>
      )}

      {/* Button text */}
      <span data-ui="button-text">{children}</span>

      {/* Right icon */}
      {rightIcon && !isLoading && (
        <span className={iconSize} data-ui="button-right-icon">{rightIcon}</span>
      )}
    </button>
  );
}

export default Button;
