/**
 * Table variant styles
 */
export const tableVariants = {
  default: '',
  striped: '[&>tbody>tr:nth-child(odd)]:bg-dark-surface [&>tbody>tr:nth-child(even)]:bg-dark-base',
  bordered: '[&>tbody>tr]:border [&>tbody>tr]:border-dark-border',
  compact: '[&>tbody>tr]:py-2 [&>thead>tr]:py-2',
};

/**
 * Gets cell classes based on variant
 */
export function getCellClasses(variant: string): string {
  return [
    'px-4 py-3',
    'text-sm',
    variant === 'bordered' ? 'border border-dark-border' : 'border-b border-dark-border',
    variant === 'compact' ? 'py-2' : 'py-3',
  ].join(' ');
}

/**
 * Gets header cell classes
 */
export function getHeaderCellClasses(): string {
  return [
    'px-4 py-3',
    'text-left',
    'text-xs',
    'font-semibold',
    'text-gray-400',
    'uppercase',
    'tracking-wider',
    'bg-dark-base',
    'border-b border-dark-border',
  ].join(' ');
}

/**
 * Gets row classes
 */
export function getRowClasses(
  isEven: boolean,
  onClick?: () => void,
  variant?: string
): string {
  const classes = [
    isEven ? 'bg-dark-surface' : 'bg-dark-base',
    onClick ? 'cursor-pointer hover:bg-red-accent/10 transition-colors' : '',
    variant === 'bordered' ? 'border border-dark-border' : 'border-b border-dark-border',
  ].filter(Boolean).join(' ');

  return classes;
}

/**
 * Gets pagination button classes
 */
export function getPaginationButtonClasses(isActive: boolean, isDisabled: boolean): string {
  return [
    'px-3 py-1.5',
    'text-sm',
    'font-medium',
    'rounded-lg',
    'transition-all duration-200',
    isDisabled
      ? 'text-gray-500 cursor-not-allowed opacity-50'
      : isActive
      ? 'bg-red-accent text-white'
      : 'text-gray-300 hover:bg-white/10 hover:text-white',
  ].join(' ');
}

/**
 * Generates page numbers for pagination
 */
export function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 7
): (number | string)[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  // Always show first page
  pages.push(1);

  // Calculate start and end for middle pages
  let start = Math.max(2, currentPage - halfVisible);
  let end = Math.min(totalPages - 1, currentPage + halfVisible);

  // Adjust if at the start
  if (currentPage <= halfVisible) {
    end = maxVisible - 2;
  }

  // Adjust if at the end
  if (currentPage > totalPages - halfVisible) {
    start = totalPages - maxVisible + 3;
  }

  // Add ellipsis at start if needed
  if (start > 2) {
    pages.push('...');
  }

  // Add middle pages
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis at end if needed
  if (end < totalPages - 1) {
    pages.push('...');
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}
