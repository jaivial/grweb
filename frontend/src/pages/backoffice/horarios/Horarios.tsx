import { useState, useCallback, useEffect, useMemo } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Tabs, Button, CustomSelector, DatePicker, TimePicker, Modal, ResponsiveTable } from '../../../components/ui';
import { useSchedule } from './hooks/useSchedule';
import type { Schedule, ScheduleFormData } from '../../../types/schedule';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../../constants/categories';

const SEX_TABS = [
  { id: 'Female', label: 'Mujeres' },
  { id: 'Male', label: 'Hombres' },
];

const CONTENT_TABS = [
  { id: 'manage', label: 'Gestionar horarios' },
  { id: 'preview', label: 'Vista previa' },
];

export function Horarios(): JSX.Element {
  const [activeSexTab, setActiveSexTab] = useState<'Male' | 'Female'>('Female');
  const [activeContentTab, setActiveContentTab] = useState('manage');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  
  const {
    schedules,
    isLoading,
    error,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    setTab,
    refresh,
  } = useSchedule();

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleSexTabChange = useCallback((tabId: string) => {
    setActiveSexTab(tabId as 'Male' | 'Female');
    setTab(tabId as 'Male' | 'Female');
  }, [setTab]);

  const handleAddSchedule = useCallback(async (data: ScheduleFormData) => {
    await createSchedule(data);
    setIsAddModalOpen(false);
  }, [createSchedule]);

  const handleUpdateSchedule = useCallback(async (data: ScheduleFormData) => {
    if (editingSchedule) {
      await updateSchedule(editingSchedule.id, data);
      setEditingSchedule(null);
    }
  }, [editingSchedule, updateSchedule]);

  const handleDeleteSchedule = useCallback(async (id: number) => {
    await deleteSchedule(id);
  }, [deleteSchedule]);

  // Get categories for current sex
  const categories = activeSexTab === 'Female' ? WOMEN_CATEGORIES : MEN_CATEGORIES;

  // Get schedules for current sex
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => s.sexCategory === activeSexTab);
  }, [schedules, activeSexTab]);

  // Group by date for preview
  const schedulesByDate = useMemo(() => {
    const grouped: Record<string, Schedule[]> = {};
    filteredSchedules.forEach(schedule => {
      if (!grouped[schedule.date]) {
        grouped[schedule.date] = [];
      }
      grouped[schedule.date].push(schedule);
    });
    // Sort each group by start time
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });
    return grouped;
  }, [filteredSchedules]);

  const previewColumns = useMemo(() => [
    { key: 'time', header: 'Hora', render: (s: Schedule) => (
      <span className="font-mono">{s.startTime} - {s.endTime}</span>
    )},
    { key: 'category', header: 'Categoría', render: (s: Schedule) => (
      <span className="font-medium">{s.weightCategory} kg</span>
    )},
    { key: 'actions', header: 'Acciones', className: 'text-right', render: (s: Schedule) => (
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setEditingSchedule(s)}>Editar</Button>
        <Button size="sm" variant="ghost" onClick={() => handleDeleteSchedule(s.id)} className="text-red-400 hover:text-red-300">Eliminar</Button>
      </div>
    )},
  ], [handleDeleteSchedule]);

  return (
    <BackofficeLayout>
      <div className="p-4 lg:p-8" data-ui="horarios-page">
        {/* Header */}
        <div className="mb-6" data-ui="page-header">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Horarios</h1>
          <p className="text-gray-400">Configura los horarios de las categorías por día de competición</p>
        </div>

        {/* Sex Tabs */}
        <Tabs
          tabs={SEX_TABS}
          activeTab={activeSexTab}
          onChange={handleSexTabChange}
          className="mb-4"
        />

        {/* Content Tabs */}
        <Tabs
          tabs={CONTENT_TABS}
          activeTab={activeContentTab}
          onChange={setActiveContentTab}
          className="mb-6"
        />

        {/* Manage Tab */}
        {activeContentTab === 'manage' && (
          <div className="space-y-4" data-ui="manage-tab">
            <div className="flex justify-end">
              <Button onClick={() => setIsAddModalOpen(true)}>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Añadir horario
              </Button>
            </div>

            {/* Schedule rows by category */}
            {categories.map(category => {
              const categorySchedules = filteredSchedules.filter(s => s.weightCategory === category);
              return (
                <div
                  key={category}
                  className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden"
                  data-ui="category-schedule"
                  data-category={category}
                >
                  <div className="px-4 py-3 bg-dark-hover border-b border-dark-border" data-ui="category-header">
                    <h3 className="font-semibold text-white">{category} kg</h3>
                    <p className="text-sm text-gray-500">
                      {categorySchedules.length} horario{categorySchedules.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  {categorySchedules.length === 0 ? (
                    <div className="p-4 text-center text-gray-500" data-ui="no-schedules">
                      Sin horarios configurados
                    </div>
                  ) : (
                    <div className="divide-y divide-dark-border" data-ui="schedule-list">
                      {categorySchedules.map(schedule => (
                        <div key={schedule.id} className="p-4 flex items-center justify-between" data-ui="schedule-item">
                          <div className="flex items-center gap-4" data-ui="schedule-info">
                            <div className="text-center px-3 py-1 bg-dark-hover rounded-lg">
                              <div className="text-xs text-gray-500 uppercase">
                                {new Date(schedule.date).toLocaleDateString('es-ES', { weekday: 'short' })}
                              </div>
                              <div className="text-lg font-bold text-white">
                                {new Date(schedule.date).getDate()}
                              </div>
                            </div>
                            <div>
                              <div className="font-mono text-white">{schedule.startTime} - {schedule.endTime}</div>
                              <div className="text-sm text-gray-500">
                                {new Date(schedule.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long' })}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2" data-ui="schedule-actions">
                            <Button size="sm" variant="ghost" onClick={() => setEditingSchedule(schedule)}>Editar</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteSchedule(schedule.id)} className="text-red-400 hover:text-red-300">Eliminar</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Preview Tab */}
        {activeContentTab === 'preview' && (
          <div className="space-y-6" data-ui="preview-tab">
            {Object.keys(schedulesByDate).length === 0 ? (
              <div className="text-center py-12 text-gray-500" data-ui="no-schedules">
                No hay horarios configurados para esta categoría
              </div>
            ) : (
              Object.entries(schedulesByDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, dateSchedules]) => (
                  <div
                    key={date}
                    className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden"
                    data-ui="preview-day"
                  >
                    <div className="px-4 py-3 bg-dark-hover border-b border-dark-border" data-ui="preview-day-header">
                      <h3 className="font-semibold text-white">
                        {new Date(date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </h3>
                    </div>
                    <div className="p-4">
                      <div className="space-y-3" data-ui="preview-schedule-list">
                        {dateSchedules
                          .sort((a, b) => a.startTime.localeCompare(b.startTime))
                          .map(schedule => (
                            <div
                              key={schedule.id}
                              className="flex items-center gap-4 p-3 bg-dark-base rounded-lg border border-dark-border"
                              data-ui="preview-schedule-item"
                            >
                              <div className="font-mono text-red-accent font-bold min-w-[100px]">
                                {schedule.startTime} - {schedule.endTime}
                              </div>
                              <div className="flex-1">
                                <span className="text-white font-medium">{schedule.weightCategory} kg</span>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${
                                schedule.sexCategory === 'Female' 
                                  ? 'bg-pink-500/20 text-pink-400' 
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {schedule.sexCategory === 'Female' ? 'Mujer' : 'Hombre'}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
      {isAddModalOpen && (
        <ScheduleFormModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddSchedule}
          sexCategory={activeSexTab}
          isLoading={isLoading}
        />
      )}

      {/* Edit Schedule Modal */}
      {editingSchedule && (
        <ScheduleFormModal
          isOpen={true}
          onClose={() => setEditingSchedule(null)}
          onSubmit={handleUpdateSchedule}
          initialData={editingSchedule}
          sexCategory={activeSexTab}
          isLoading={isLoading}
        />
      )}
    </BackofficeLayout>
  );
}

interface ScheduleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ScheduleFormData) => Promise<void>;
  initialData?: Schedule;
  sexCategory: 'Male' | 'Female';
  isLoading?: boolean;
}

function ScheduleFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  sexCategory,
  isLoading = false,
}: ScheduleFormModalProps): JSX.Element {
  const [formData, setFormData] = useState<ScheduleFormData>({
    sexCategory: initialData?.sexCategory || sexCategory,
    weightCategory: initialData?.weightCategory || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    startTime: initialData?.startTime || '09:00',
    endTime: initialData?.endTime || '10:00',
  });

  useEffect(() => {
    setFormData({
      sexCategory: initialData?.sexCategory || sexCategory,
      weightCategory: initialData?.weightCategory || '',
      date: initialData?.date || new Date().toISOString().split('T')[0],
      startTime: initialData?.startTime || '09:00',
      endTime: initialData?.endTime || '10:00',
    });
  }, [initialData, sexCategory]);

  const categoryOptions = useMemo(() => {
    const categories = sexCategory === 'Female' ? WOMEN_CATEGORIES : MEN_CATEGORIES;
    return categories.map(c => ({ value: c, label: `${c} kg` }));
  }, [sexCategory]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  }, [formData, onSubmit]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Editar horario' : 'Añadir horario'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4" data-ui="schedule-form">
        <CustomSelector
          label="Categoría de peso *"
          options={categoryOptions}
          value={formData.weightCategory}
          onChange={(v) => setFormData(prev => ({ ...prev, weightCategory: v || '' }))}
          placeholder="Seleccionar categoría"
        />

        <DatePicker
          label="Fecha *"
          value={formData.date}
          onChange={(v) => setFormData(prev => ({ ...prev, date: v || '' }))}
        />

        <div className="grid grid-cols-2 gap-4">
          <TimePicker
            label="Hora de inicio"
            value={formData.startTime}
            onChange={(v) => setFormData(prev => ({ ...prev, startTime: v || '09:00' }))}
          />

          <TimePicker
            label="Hora de fin"
            value={formData.endTime}
            onChange={(v) => setFormData(prev => ({ ...prev, endTime: v || '10:00' }))}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-dark-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {initialData ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default Horarios;
