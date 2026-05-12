import { useState, useCallback, useEffect } from 'react';
import api from '../../../../../api/client';
import type { ScheduleGroupedByDate } from '../../../../../types/api';

export interface UseSchedulesResult {
  schedules: ScheduleGroupedByDate[];
  isLoading: boolean;
  isPublished: boolean;
}

export function useSchedules(): UseSchedulesResult {
  const [schedules, setSchedules] = useState<ScheduleGroupedByDate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(true);

  const fetchSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const pubResult = await api.isSchedulesPublished('fer');
      const published = (pubResult as any).published;
      if (published === false) {
        setIsPublished(false);
        setIsLoading(false);
        return;
      }
      const result = await api.getPublicSchedules('fer');
      if (Array.isArray(result)) {
        setSchedules(result as any);
      } else if ((result as any).success !== false && (result as any).data) {
        setSchedules((result as any).data);
      }
    } catch {
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return { schedules, isLoading, isPublished };
}
