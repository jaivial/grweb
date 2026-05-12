import type { ConsolidatedRow } from './types';
import type { Schedule } from '../../../../types/api';

export const formatTime = (timeStr: string): string => timeStr.substring(0, 5);

export const formatDateEs = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

export const consolidateScheduleRows = (schedules: Schedule[]): ConsolidatedRow[] => {
  const rows: ConsolidatedRow[] = [];
  const sorted = [...schedules].sort((a, b) => {
    if (a.sexCategory !== b.sexCategory) return a.sexCategory === 'Male' ? -1 : 1;
    return a.startTime.localeCompare(b.startTime);
  });
  for (const s of sorted) {
    const last = rows[rows.length - 1];
    if (
      last &&
      last.sexCategory === s.sexCategory &&
      last.startTime === s.startTime &&
      last.endTime === s.endTime
    ) {
      if (!last.weightCategories.includes(s.weightCategory)) {
        last.weightCategories.push(s.weightCategory);
        last.weightCategories.sort();
      }
    } else {
      rows.push({
        sexCategory: s.sexCategory,
        weightCategories: [s.weightCategory],
        startTime: s.startTime,
        endTime: s.endTime,
      });
    }
  }
  return rows;
};

export const getSexLabel = (sexCategory: 'Male' | 'Female'): string =>
  sexCategory === 'Male' ? 'Masculino' : 'Femenino';

export const getSexColor = (sexCategory: 'Male' | 'Female', colors: Record<string, string>): string =>
  sexCategory === 'Male' ? colors.accent : colors.gold;
