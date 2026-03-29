import type { ReactNode } from 'react';
import type { CardFooterProps } from '../types';

/**
 * CardFooter Component
 * 
 * Footer section for cards, typically used for actions.
 * 
 * @example
 * <CardFooter className="flex justify-end gap-3">
 *   <Button variant="ghost">Cancel</Button>
 *   <Button>Save</Button>
 * </CardFooter>
 */
export function CardFooter({
  className = '',
  children,
}: CardFooterProps): ReactNode {
  return (
    <div className={`mt-4 pt-4 border-t border-dark-border flex items-center gap-3 ${className}`}>
      {children}
    </div>
  );
}

export default CardFooter;