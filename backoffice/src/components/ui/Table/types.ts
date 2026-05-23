import type { JSX } from 'react';

// Column definition for table
export interface TableColumn<T = any> {
  key: string;
  header: string;
  render?: (item: T, index: number) => JSX.Element | string | number;
  class?: string;
  headerClass?: string;
  sortable?: boolean;
  width?: string;
}

// Table component props
export interface TableProps<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  onRowClick?: (item: T, index: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  class?: string;
  variant?: 'default' | 'striped' | 'bordered' | 'compact';
  showHeader?: boolean;
  stickyHeader?: boolean;
}

// Table header props
export interface TableHeaderProps {
  columns: TableColumn[];
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  class?: string;
  showHeader?: boolean;
  stickyHeader?: boolean;
}

// Table body props
export interface TableBodyProps {
  columns: TableColumn[];
  data: any[];
  onRowClick?: (item: any, index: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  class?: string;
  variant?: 'default' | 'striped' | 'bordered' | 'compact';
}

// Table row props
export interface TableRowProps {
  item: any;
  index: number;
  columns: TableColumn[];
  onClick?: () => void;
  isEven?: boolean;
  class?: string;
  variant?: 'default' | 'striped' | 'bordered' | 'compact';
}

// Table cell props
export interface TableCellProps {
  value: any;
  render?: (item: any) => JSX.Element | string | number;
  class?: string;
}

// Pagination props
export interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  class?: string;
}
