import { useState, useCallback } from 'react';
import { token } from '../../../../stores/auth';
import { api } from '../../../../utils/api';
import {
  schedules,
  schedulesLoading,
  schedulesError,
  schedulesSexTab,
  setSchedules,
  setSchedulesLoading,
  setSchedulesError,
  setSchedulesSexTab,
  addSchedule,
  updateSchedule as updateScheduleInStore,
  removeSchedule,
} from '../../../../stores/schedulesStore';
import type { Schedule, ScheduleFormData, ScheduleGroupedByDate } from '../../../../types/schedule';

function flattenGroupedData(grouped: ScheduleGroupedByDate[]): Schedule[] {
  return grouped.flatMap(group => group.schedules);
}

import type { Signal } from '@preact/signals';

interface UseScheduleReturn {
  schedules: Schedule[];
  isLoading: boolean;
  error: string | null;
  activeTab: 'Male' | 'Female';
  fetchSchedules: () => Promise<void>;
  createSchedule: (data: ScheduleFormData) => Promise<Schedule>;
  updateSchedule: (id: number, data: ScheduleFormData) => Promise<Schedule>;
  deleteSchedule: (id: number) => Promise<void>;
  setTab: (tab: 'Male' | 'Female') => void;
  refresh: () => Promise<void>;
  // Expose signals for reactive subscription in the component
  schedulesSignal: Signal<Schedule[]>;
  isLoadingSignal: Signal<boolean>;
  errorSignal: Signal<string | null>;
}

export function useSchedule(): UseScheduleReturn {
  const [activeTab, setActiveTabState] = useState<'Male' | 'Female'>(schedulesSexTab.value);

  const fetchSchedules = useCallback(async () => {
    if (!token.value) return;
    
    setSchedulesLoading(true);
    setSchedulesError(null);

    try {
      const response = await api.getSchedules();
      // Backend returns ScheduleGroupedByDate[], flatten to Schedule[] for the store
      const flat = Array.isArray(response) && response.length > 0 && 'schedules' in response[0]
        ? flattenGroupedData(response as ScheduleGroupedByDate[])
        : (response as Schedule[]);
      setSchedules(flat);
    } catch (err) {
      setSchedulesError(err instanceof Error ? err.message : 'Error al cargar horarios');
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  const createSchedule = useCallback(async (data: ScheduleFormData): Promise<Schedule> => {
    if (!token.value) throw new Error('No autenticado');
    
    const schedule = await api.createSchedule(data);
    addSchedule(schedule);
    return schedule;
  }, []);

  const updateSchedule = useCallback(async (id: number, data: ScheduleFormData): Promise<Schedule> => {
    if (!token.value) throw new Error('No autenticado');
    
    const schedule = await api.updateSchedule(id, data);
    updateScheduleInStore(schedule);
    return schedule;
  }, []);

  const deleteSchedule = useCallback(async (id: number): Promise<void> => {
    if (!token.value) throw new Error('No autenticado');
    
    await api.deleteSchedule(id);
    removeSchedule(id);
  }, []);

  const setTab = useCallback((tab: 'Male' | 'Female') => {
    setActiveTabState(tab);
    setSchedulesSexTab(tab);
  }, []);

  const refresh = useCallback(async () => {
    await fetchSchedules();
  }, [fetchSchedules]);

  return {
    schedules: schedules.value,
    isLoading: schedulesLoading.value,
    error: schedulesError.value,
    activeTab,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    setTab,
    refresh,
    schedulesSignal: schedules,
    isLoadingSignal: schedulesLoading,
    errorSignal: schedulesError,
  };
}
