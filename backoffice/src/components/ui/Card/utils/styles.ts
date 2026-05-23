import type { CardVariant, CardPadding } from '../types';

/**
 * Card variant styles
 */
export const cardVariants: Record<CardVariant, string> = {
  default: 'bg-dark-surface border-dark-border',
  elevated: 'bg-dark-surface border-dark-border shadow-xl',
  outlined: 'bg-transparent border-dark-border',
  gradient: 'bg-gradient-to-br from-dark-surface to-dark-base border-dark-border',
};

/**
 * Card glow styles
 */
export const cardGlowStyles = {
  none: '',
  red: 'shadow-red-accent/20',
  dark: 'shadow-dark-red/20',
  blue: 'shadow-blue-500/20',
  orange: 'shadow-orange-500/20',
};

/**
 * Hover transition styles
 */
export const cardHoverStyles = `
  transition-all duration-300 ease-out
  hover:scale-[1.02] hover:shadow-xl
`;

/**
 * Clickable cursor styles
 */
export const cardClickableStyles = `
  cursor-pointer
  active:scale-[0.98]
`;

/**
 * Gets padding classes based on padding prop
 */
export function getPaddingClasses(padding: CardPadding): string {
  const paddingMap: Record<CardPadding, string> = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  };
  return paddingMap[padding];
}

/**
 * Gets border classes for card
 */
export function getBorderClasses(variant: CardVariant): string {
  const borderMap: Record<CardVariant, string> = {
    default: 'border',
    elevated: 'border',
    outlined: 'border-2',
    gradient: 'border',
  };
  return borderMap[variant];
}

/**
 * Gets rounded classes for card
 */
export function getRoundedClasses(): string {
  return 'rounded-2xl';
}

/**
 * Generates complete card classes based on props
 */
export function getCardClasses(
  variant: CardVariant,
  padding: CardPadding,
  hover: boolean,
  glow: 'none' | 'blue' | 'orange',
  isClickable: boolean
): string {
  const classes = [
    cardVariants[variant],
    getPaddingClasses(padding),
    getBorderClasses(variant),
    getRoundedClasses(),
    glow !== 'none' ? cardGlowStyles[glow] : '',
    hover ? cardHoverStyles : '',
    isClickable ? cardClickableStyles : '',
  ].filter(Boolean).join(' ');

  return classes;
}
