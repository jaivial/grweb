import type { ReactNode } from 'react';
import type { JSX } from 'react';

export interface TableColumn<T = any> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
  sticky?: boolean;
}

export interface ResponsiveTableProps<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function ResponsiveTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No hay datos',
  onRowClick,
  className = '',
}: ResponsiveTableProps<T>): JSX.Element {
  if (isLoading) {
    return (
      <div className="overflow-hidden" data-ui="responsive-table">
        <div className="overflow-x-auto">
          <table className={`w-full ${className}`}>
            <thead className="bg-dark-surface border-b border-dark-border" data-ui="table-header">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider ${col.className || ''}`}
                    data-ui="table-header-cell"
                    data-column={col.key}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-ui="table-body">
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-dark-border">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3" data-ui="table-cell">
                      <div className="h-4 bg-dark-hover rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="overflow-hidden" data-ui="responsive-table">
        <div className="overflow-x-auto">
          <table className={`w-full ${className}`}>
            <thead className="bg-dark-surface border-b border-dark-border" data-ui="table-header">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider ${col.className || ''}`}
                    data-ui="table-header-cell"
                    data-column={col.key}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <div className="text-center py-12 text-gray-500" data-ui="table-empty">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden" data-ui="responsive-table">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full ${className}`}>
          <thead className="bg-dark-surface border-b border-dark-border sticky top-0 z-10" data-ui="table-header">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider ${col.className || ''} ${col.sticky ? 'sticky left-0 bg-dark-surface' : ''}`}
                  data-ui="table-header-cell"
                  data-column={col.key}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border" data-ui="table-body">
            {data.map(item => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={`hover:bg-dark-hover/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                data-ui="table-row"
                data-item-id={keyExtractor(item)}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm text-white ${col.className || ''} ${col.sticky ? 'sticky left-0 bg-dark-base' : ''}`}
                    data-ui="table-cell"
                    data-column={col.key}
                  >
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4" data-ui="table-mobile-cards">
        {data.map(item => (
          <div
            key={keyExtractor(item)}
            onClick={() => onRowClick?.(item)}
            className={`bg-dark-surface border border-dark-border rounded-lg p-4 ${onRowClick ? 'cursor-pointer hover:border-red-accent/50' : ''}`}
            data-ui="table-mobile-card"
            data-item-id={keyExtractor(item)}
          >
            {columns.map((col, index) => (
              <div key={col.key} className="flex justify-between py-1" data-ui="table-mobile-row">
                {index === 0 && col.render ? col.render(item) : (
                  <>
                    <span className="text-xs text-gray-500 uppercase">{col.header}</span>
                    <span className="text-sm text-white text-right">
                      {col.render ? col.render(item) : item[col.key]}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ResponsiveTable;
