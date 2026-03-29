import type { CSSProperties, ReactNode } from 'react';

// Card variant types
export type CardVariant = 'default' | 'elevated' | 'outlined' | 'gradient';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

// Card component props
export interface CardProps {
  variant?: CardVariant;
  padding?: CardPadding;
  hover?: boolean;
  glow?: 'none' | 'blue' | 'orange';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
}

// Card header props
export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

// Card body props
export interface CardBodyProps {
  className?: string;
  children?: ReactNode;
}

// Card footer props
export interface CardFooterProps {
  className?: string;
  children?: ReactNode;
}

// Card padding configurations
export const cardPaddingSizes: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  xl: 'p-10',
};