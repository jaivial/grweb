import { useMemo } from 'react';
import { FER_COLORS } from '../../../constants';
import type { TimelineLineProps } from '../types';

export function TimelineLine({ progress, isLast }: TimelineLineProps) {
  const lineStyle = useMemo(
    () => ({
      background: `linear-gradient(180deg, ${FER_COLORS.gold}${Math.round(progress * 100).toString(16).padStart(2, '0')}, ${FER_COLORS.accent}${Math.round(progress * 50).toString(16).padStart(2, '0')})`,
    }),
    [progress]
  );

  if (isLast) return null;

  return (
    <div
      className="absolute left-[13px] top-[40px] bottom-0 w-[2px]"
      style={{ backgroundColor: `${FER_COLORS.accent}15` }}
      data-ui="horarios-timeline-line-track"
    >
      <div
        className="w-full rounded-full transition-all duration-500"
        style={lineStyle}
        data-ui="horarios-timeline-line-fill"
      />
    </div>
  );
}
