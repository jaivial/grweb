import type { JSX } from 'react';
import type { TablePaginationProps } from '../types';
import { generatePageNumbers, getPaginationButtonClasses } from '../utils/styles';
import { Icon } from '../../Icon';

/**
 * TablePagination Component
 * 
 * Pagination controls for tables.
 * 
 * @example
 * <TablePagination
 *   currentPage={1}
 *   totalPages={10}
 *   totalItems={100}
 *   itemsPerPage={10}
 *   onPageChange={setPage}
 * />
 */
export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  class: className = '',
}: TablePaginationProps): JSX.Element {
  // Calculate showing range
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers
  const pages = generatePageNumbers(currentPage, totalPages);

  // Don't render if only one page
  if (totalPages <= 1) {
    return (
      <div className={`flex items-center justify-between px-4 py-3 border-t border-dark-border ${className}`} data-ui="table-pagination">
        <p className="text-sm text-gray-400" data-ui="pagination-info">
          Showing {startItem} to {endItem} of {totalItems} results
        </p>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-t border-dark-border ${className}`} data-ui="table-pagination">
      {/* Results info */}
      <p className="text-sm text-gray-400" data-ui="pagination-info">
        Showing {startItem} to {endItem} of {totalItems} results
      </p>

      {/* Page navigation */}
      <div className="flex items-center gap-1" data-ui="pagination-controls">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`p-2 rounded-lg transition-colors ${
            currentPage === 1
              ? 'text-gray-500 cursor-not-allowed opacity-50'
              : 'text-gray-300 hover:bg-white/10 hover:text-white'
          }`}
          aria-label="Previous page"
          data-testid="pagination-prev-btn"
        >
          <Icon name="chevron-left" size="sm" />
        </button>

        {/* Page numbers */}
        {pages.map((page, index) =>
          typeof page === 'number' ? (
            <button
              key={`page-${index}`}
              onClick={() => onPageChange(page)}
              className={getPaginationButtonClasses(currentPage === page, false)}
              data-testid={`pagination-page-${page}`}
            >
              {page}
            </button>
          ) : (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-500" data-ui="pagination-ellipsis">
              {page}
            </span>
          )
        )}

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`p-2 rounded-lg transition-colors ${
            currentPage === totalPages
              ? 'text-gray-500 cursor-not-allowed opacity-50'
              : 'text-gray-300 hover:bg-white/10 hover:text-white'
          }`}
          aria-label="Next page"
          data-testid="pagination-next-btn"
        >
          <Icon name="chevron-right" size="sm" />
        </button>
      </div>
    </div>
  );
}

export default TablePagination;
