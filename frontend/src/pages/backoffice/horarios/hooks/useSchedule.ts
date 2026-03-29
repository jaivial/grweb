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
import type { Schedule, ScheduleFormData } from '../../../../types/schedule';

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
}

export function useSchedule(): UseScheduleReturn {
  const [activeTab, setActiveTabState] = useState<'Male' | 'Female'>(schedulesSexTab.value);

  const fetchSchedules = useCallback(async () => {
    if (!token.value) return;
    
    setSchedulesLoading(true);
    setSchedulesError(null);

    try {
      const response = await api.getSchedules(token.value);
      setSchedules(response);
    } catch (err) {
      setSchedulesError(err instanceof Error ? err.message : 'Error al cargar horarios');
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  const createSchedule = useCallback(async (data: ScheduleFormData): Promise<Schedule> => {
    if (!token.value) throw new Error('No autenticado');
    
    const schedule = await api.createSchedule(token.value, data);
    addSchedule(schedule);
    return schedule;
  }, []);

  const updateSchedule = useCallback(async (id: number, data: ScheduleFormData): Promise<Schedule> => {
    if (!token.value) throw new Error('No autenticado');
    
    const schedule = await api.updateSchedule(token.value, id, data);
    updateScheduleInStore(schedule);
    return schedule;
  }, []);

  const deleteSchedule = useCallback(async (id: number): Promise<void> => {
    if (!token.value) throw new Error('No autenticado');
    
    await api.deleteSchedule(token.value, id);
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
  };
}
