import { useCallback } from 'react';
import type { JSX } from 'react';
import { Button } from '../../../../components/ui';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  isLoading?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPrevPage,
  onNextPage,
  isLoading = false,
}: PaginationProps): JSX.Element {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePageClick = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  }, [totalPages, onPageChange]);

  const getVisiblePages = useCallback((): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const delta = 1;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }

    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="flex flex-col xs:flex-row items-center justify-between gap-3 xs:gap-4 px-4 py-3 xs:py-4 border-t border-white/10" data-ui="pagination">
      <div className="text-xs xs:text-sm text-white/50 order-2 xs:order-1" data-ui="pagination-info">
        Mostrando {startItem} - {endItem} de {totalItems}
      </div>

      <div className="flex items-center gap-1 order-1 xs:order-2" data-ui="pagination-controls">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevPage}
          disabled={currentPage === 1 || isLoading}
          className="min-w-[40px] min-h-[40px] px-1.5 xs:px-2 text-white/50 hover:text-white hover:bg-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>

        {getVisiblePages().map((page, index) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1.5 xs:px-2 text-white/30 text-sm">...</span>
          ) : (
            <button
              key={page}
              onClick={() => handlePageClick(page)}
              disabled={isLoading}
              className={`
                min-w-[36px] xs:min-w-[40px] min-h-[36px] xs:min-h-[40px] px-1.5 xs:px-2 rounded-xl text-xs xs:text-sm font-medium transition-all duration-200
                ${page === currentPage
                  ? 'bg-red-accent text-white shadow-lg shadow-red-accent/20'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {page}
            </button>
          )
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onNextPage}
          disabled={currentPage === totalPages || isLoading}
          className="min-w-[40px] min-h-[40px] px-1.5 xs:px-2 text-white/50 hover:text-white hover:bg-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

export default Pagination;