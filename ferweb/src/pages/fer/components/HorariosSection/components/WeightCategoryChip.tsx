import { useMemo } from 'react';
import { FER_COLORS } from '../../../constants';
import { getSexColor } from '../helpers';
import type { WeightCategoryChipProps } from '../types';

export function WeightCategoryChip({ label, sexCategory, index }: WeightCategoryChipProps) {
  const color = useMemo(() => getSexColor(sexCategory, FER_COLORS), [sexCategory]);
  const displayLabel = useMemo(() => {
    let result = label;
    if (!result.startsWith('-')) result = `-${result}`;
    if (!result.endsWith('kg')) result = `${result}kg`;
    return result;
  }, [label]);

  return (
    <span
      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap"
      style={{
        backgroundColor: `${color}12`,
        border: `1px solid ${color}25`,
        color: FER_COLORS.text,
      }}
      data-ui={`horarios-weight-chip-${index}`}
    >
      {displayLabel}
    </span>
  );
}
