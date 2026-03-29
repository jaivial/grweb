import type { Sex } from './athlete';

// Schedule interface
export interface Schedule {
  id: number;
  sexCategory: Sex;
  weightCategory: string;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
}

// Schedule form data for creating/updating
export interface ScheduleFormData {
  sexCategory: Sex;
  weightCategory: string;
  date: string;
  startTime: string;
  endTime: string;
}

// Schedule grouped by date for preview
export interface ScheduleGroupedByDate {
  date: string;
  schedules: Schedule[];
}

// Schedule response
export interface ScheduleResponse {
  dates: ScheduleGroupedByDate[];
}
