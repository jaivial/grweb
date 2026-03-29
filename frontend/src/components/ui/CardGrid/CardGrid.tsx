import type { ReactNode } from 'react';
import type { JSX } from 'react';

export interface CardGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

const gridClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

export function CardGrid({
  children,
  columns = 3,
  className = '',
}: CardGridProps): JSX.Element {
  return (
    <div className={`grid ${gridClasses[columns]} gap-4 ${className}`} data-ui="card-grid">
      {children}
    </div>
  );
}

export default CardGrid;
