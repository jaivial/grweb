import type { ReactNode } from 'react';
import type { CardBodyProps } from '../types';

/**
 * CardBody Component
 * 
 * Body section for cards with consistent spacing.
 * 
 * @example
 * <CardBody>
 *   <p>Card content goes here</p>
 * </CardBody>
 */
export function CardBody({
  className = '',
  children,
}: CardBodyProps): ReactNode {
  return (
    <div className={`text-gray-300 ${className}`}>
      {children}
    </div>
  );
}

export default CardBody;