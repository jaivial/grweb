import type { JSX } from 'react';
import type { TableProps, TableColumn } from './types';

/**
 * Table Component
 * 
 * A flexible data table component with sorting and pagination support.
 * 
 * @example
 * const columns = [
 *   { key: 'name', header: 'Name' },
 *   { key: 'email', header: 'Email', render: (item) => <a href={`mailto:${item.email}`}>{item.email}</a> },
 * ];
 * 
 * <Table columns={columns} data={users} onRowClick={handleRowClick} />
 */
export function Table<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  isLoading = false,
  emptyMessage = 'No data available',
  class: className = '',
  variant = 'default',
  showHeader = true,
  stickyHeader = false,
}: TableProps<T>): JSX.Element {
  // Loading state
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className={`w-full ${className}`}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={getHeaderCellClasses()}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className={getCellClasses(variant)}>
                    <div className="h-4 bg-gray-700 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-dark-border">
      <table className={`w-full ${className}`}>
        {/* Header */}
        {showHeader && (
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${getHeaderCellClasses()} ${col.headerClass || ''} ${col.width || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        )}

        {/* Body */}
        <tbody>
          {data.map((item, index) => (
            <tr
              key={index}
              className={`${getRowClasses(index % 2 === 0, !!onRowClick, variant)} ${
                onRowClick ? 'cursor-pointer hover:bg-red-accent/10 transition-colors' : ''
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`${getCellClasses(variant)} ${col.class || ''}`}>
                  {col.render
                    ? col.render(item, index)
                    : item[col.key] !== undefined
                    ? String(item[col.key])
                    : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getHeaderCellClasses(): string {
  return 'px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider bg-dark-base border-b border-dark-border';
}

function getCellClasses(variant: string): string {
  return [
    'px-4 py-3',
    'text-sm',
    variant === 'bordered' ? 'border border-dark-border' : 'border-b border-dark-border',
  ].join(' ');
}

function getRowClasses(isEven: boolean, hasClick: boolean, variant?: string): string {
  return [
    isEven ? 'bg-dark-surface' : 'bg-dark-base',
    variant === 'bordered' ? 'border border-dark-border' : 'border-b border-dark-border',
  ].join(' ');
}

export default Table;
