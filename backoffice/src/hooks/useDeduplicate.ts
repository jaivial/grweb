import type { Schedule, ScheduleGroupedByDate } from '../types/schedule';

export type { Schedule, ScheduleGroupedByDate } from '../types/schedule';

/**
 * Flattens grouped schedule data from the API into a flat array,
 * then deduplicates by the combination of sex + weight + date + time.
 */
export function deduplicateSchedules(grouped: ScheduleGroupedByDate[]): Schedule[] {
  const flat: Schedule[] = grouped.flatMap(g => g.schedules);

  const seen = new Set<string>();
  return flat.filter(s => {
    const key = `${s.sexCategory}-${s.weightCategory}-${s.date}-${s.startTime}-${s.endTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
