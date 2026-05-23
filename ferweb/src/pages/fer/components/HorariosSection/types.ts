import type { MotionValue } from 'framer-motion';
import type { Schedule, ScheduleGroupedByDate } from '../../../../types/api';

export interface ConsolidatedRow {
  sexCategory: 'Male' | 'Female';
  weightCategories: string[];
  startTime: string;
  endTime: string;
}

export interface SectionHeaderProps {
  // No props needed — self-contained
}

export interface LoadingSkeletonProps {
  // No props needed — self-contained
}

export interface EmptyStateProps {
  // No props needed — self-contained
}

export interface TimelineLineProps {
  progress: number;
  isLast: boolean;
}

export interface WeightCategoryChipProps {
  label: string;
  sexCategory: 'Male' | 'Female';
  index: number;
}

export interface ScheduleRowCardProps {
  row: ConsolidatedRow;
  index: number;
  total: number;
}

export interface DateBlockProps {
  group: ScheduleGroupedByDate;
  index: number;
  isLast: boolean;
  timelineProgress: MotionValue<number>;
}

export { type Schedule, type ScheduleGroupedByDate };
