import type { ReactNode, KeyboardEvent } from 'react';
import type { CardProps } from './types';
import { getCardClasses } from './utils/styles';

/**
 * Card Component
 * 
 * A container component with various styling options.
 * 
 * @example
 * // Default card
 * <Card>
 *   <h2>Title</h2>
 *   <p>Content</p>
 * </Card>
 * 
 * @example
 * // Elevated card with glow
 * <Card variant="elevated" glow="blue" padding="lg">
 *   Content
 * </Card>
 * 
 * @example
 * // Clickable card
 * <Card hover onClick={handleClick}>
 *   Click me
 * </Card>
 */
export function Card({
  variant = 'default',
  padding = 'md',
  hover = false,
  glow = 'none',
  className = '',
  children,
  onClick,
}: CardProps): ReactNode {
  const isClickable = !!onClick;
  const cardClasses = getCardClasses(
    variant,
    padding,
    hover,
    glow,
    isClickable
  );

  const combinedClasses = `${cardClasses} ${className}`.trim();

  return (
    <div
      className={combinedClasses}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
    >
      {children}
    </div>
  );
}

export default Card;