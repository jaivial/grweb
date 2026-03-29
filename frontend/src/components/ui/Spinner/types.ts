// Spinner size types
export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

// Spinner component props
export interface SpinnerProps {
  size?: SpinnerSize;
  color?: 'red-accent' | 'dark-red' | 'white';
  className?: string;
}

// Spinner size configurations
export const spinnerSizes: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

// Spinner color configurations
export const spinnerColors: Record<string, string> = {
  'red-accent': 'border-red-accent border-t-transparent',
  'dark-red': 'border-dark-red border-t-transparent',
  'white': 'border-white border-t-transparent',
};