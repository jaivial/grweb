/**
 * Search Bar Component
 * 
 * Search input for filtering participants.
 */

import type { JSX } from 'react';
import { SearchIcon } from '@components/ui/Icon';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
}

export function SearchBar({ 
  value, 
  onChange, 
  placeholder = "Search participants...",
  isLoading 
}: SearchBarProps): JSX.Element {
  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-accent transition-colors"
        disabled={isLoading}
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin w-5 h-5 border-2 border-red-accent border-t-transparent rounded-full"></div>
        </div>
      )}
    </div>
  );
}

export default SearchBar;
