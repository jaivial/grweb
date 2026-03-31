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
      <div className="w-full min-w-0 overflow-x-auto" data-ui="responsive-table">
        <table className={`w-full ${className}`}>
          <thead className="bg-white/5 border-b border-white/10" data-ui="table-header">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
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
              <tr key={i} className="border-b border-white/5">
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3" data-ui="table-cell">
                    <div className="h-4 bg-white/5 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full min-w-0 overflow-x-auto" data-ui="responsive-table">
        <table className={`w-full ${className}`}>
          <thead className="bg-white/5 border-b border-white/10" data-ui="table-header">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
                  data-ui="table-header-cell"
                  data-column={col.key}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="text-center py-12 text-white/40" data-ui="table-empty">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-x-auto" data-ui="responsive-table">
      {/* Desktop Table */}
      <table className={`w-full ${className}`}>
        <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10" data-ui="table-header">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider whitespace-nowrap ${col.className || ''} ${col.sticky ? 'sticky left-0 bg-white/5 z-20 backdrop-blur-sm' : ''}`}
                data-ui="table-header-cell"
                data-column={col.key}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5" data-ui="table-body">
          {data.map(item => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={`hover:bg-white/5 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              data-ui="table-row"
              data-item-id={keyExtractor(item)}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-xs text-white whitespace-nowrap truncate max-w-[200px] ${col.className || ''} ${col.sticky ? 'sticky left-0 bg-dark-base/50 z-10 backdrop-blur-sm' : ''}`}
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
  );
}

export default ResponsiveTable;