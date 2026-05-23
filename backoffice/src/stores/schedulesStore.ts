import { signal, computed } from '@preact/signals-react';
import type { Schedule, ScheduleGroupedByDate } from '../types/schedule';

// Schedules list state
export const schedules = signal<Schedule[]>([]);
export const schedulesGroupedByDate = signal<ScheduleGroupedByDate[]>([]);
export const schedulesLoading = signal(false);
export const schedulesError = signal<string | null>(null);

// Selected sex category tab
export const schedulesSexTab = signal<'Male' | 'Female'>('Female');

// Selected schedule for editing
export const selectedSchedule = signal<Schedule | null>(null);

// Actions
export function setSchedules(data: Schedule[]) {
  schedules.value = data;
}

export function setSchedulesGroupedByDate(data: ScheduleGroupedByDate[]) {
  schedulesGroupedByDate.value = data;
}

export function setSchedulesLoading(loading: boolean) {
  schedulesLoading.value = loading;
}

export function setSchedulesError(error: string | null) {
  schedulesError.value = error;
}

export function setSchedulesSexTab(tab: 'Male' | 'Female') {
  schedulesSexTab.value = tab;
}

export function setSelectedSchedule(schedule: Schedule | null) {
  selectedSchedule.value = schedule;
}

export function addSchedule(schedule: Schedule) {
  schedules.value = [...schedules.value, schedule].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime);
  });
}

export function updateSchedule(updated: Schedule) {
  schedules.value = schedules.value
    .map(s => s.id === updated.id ? updated : s)
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
}

export function removeSchedule(id: number) {
  schedules.value = schedules.value.filter(s => s.id !== id);
}
