import { useState, useCallback, useEffect, useMemo } from 'react';
import type { JSX, FC } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Tabs, Button, CustomSelector, DatePicker, TimePicker, Modal } from '../../../components/ui';
import { useSchedule } from './hooks/useSchedule';
import type { Schedule, ScheduleFormData, ScheduleGroupedByDate } from '../../../types/schedule';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../../constants/categories';
import { api } from '../../../utils/api';

const SEX_TABS = [
  { id: 'Female', label: 'Mujeres' },
  { id: 'Male', label: 'Hombres' },
];

const CONTENT_TABS = [
  { id: 'manage', label: 'Gestionar horarios' },
  { id: 'preview', label: 'Vista previa' },
];

// Helper functions for preview (same as SchedulesSection)
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatTime = (timeStr: string): string => {
  return timeStr.substring(0, 5);
};

// Schedule row component for preview
interface ScheduleRowProps {
  sexCategory: 'Male' | 'Female';
  weightCategories: string[];
  startTime: string;
  endTime: string;
  isLast?: boolean;
}

const ScheduleRow: FC<ScheduleRowProps> = ({
  sexCategory,
  weightCategories,
  startTime,
  endTime,
  isLast = false,
}) => {
  const sexLabel = sexCategory === 'Male' ? 'Masculino' : 'Femenino';
  const weightDisplay = weightCategories.length > 0 ? weightCategories.map(w => w + ' KG').join(', ') : '-';

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_max-content] sm:grid-cols-3 gap-x-4 gap-y-2 sm:gap-y-0 py-3 px-4"
      data-ui="preview-schedule-row"
      style={{
        borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Sex Category */}
      <div className="flex items-center gap-2" data-ui="row-sex">
        <div
          className="w-1.5 h-1.5 rounded-full"
          data-ui="row-sex-dot"
          style={{
            background: 'rgba(220, 20, 60, 0.6)',
            boxShadow: '0 0 10px rgba(220, 20, 60, 0.5)',
          }}
          aria-hidden
        />
        <span
          className="text-sm md:text-base lg:text-lg"
          data-ui="row-sex-text"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            fontWeight: 400,
            letterSpacing: '0.02em',
            color: sexCategory === 'Male' ? 'rgba(220, 20, 60, 0.9)' : 'rgba(220, 20, 60, 0.7)',
            textTransform: 'uppercase',
          }}
        >
          {sexLabel}
        </span>
      </div>

      {/* Weight Categories */}
      <div className="flex items-center" data-ui="row-weight">
        <span
          className="text-sm md:text-base lg:text-lg"
          data-ui="row-weight-text"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            fontWeight: 400,
            letterSpacing: '0.02em',
            color: 'rgba(255, 255, 255, 0.85)',
            textTransform: 'uppercase',
          }}
        >
          {weightDisplay}
        </span>
      </div>

      {/* Time Range */}
      <div className="flex items-center" data-ui="row-time">
        <span
          className="text-sm md:text-base lg:text-lg"
          data-ui="row-time-text"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            fontWeight: 400,
            letterSpacing: '0.02em',
            color: 'rgba(255, 255, 255, 0.9)',
          }}
        >
          {formatTime(startTime)} - {formatTime(endTime)}
        </span>
      </div>
    </div>
  );
};

// Date block component for preview
interface DateBlockProps {
  date: string;
  schedules: Schedule[];
}

const DateBlock: FC<DateBlockProps> = ({ date, schedules }) => {
  // Group schedules by sex and time slot to consolidate rows
  const consolidatedRows = useMemo(() => {
    const rows: Array<{
      sexCategory: 'Male' | 'Female';
      weightCategories: string[];
      startTime: string;
      endTime: string;
    }> = [];

    // Sort schedules by sex, then start time
    const sorted = [...schedules].sort((a, b) => {
      if (a.sexCategory !== b.sexCategory) {
        return a.sexCategory === 'Male' ? -1 : 1;
      }
      return a.startTime.localeCompare(b.startTime);
    });

    // Group consecutive same-sex, same-time entries
    for (const schedule of sorted) {
      const lastRow = rows[rows.length - 1];
      if (
        lastRow &&
        lastRow.sexCategory === schedule.sexCategory &&
        lastRow.startTime === schedule.startTime &&
        lastRow.endTime === schedule.endTime
      ) {
        // Consolidate into same row
        if (!lastRow.weightCategories.includes(schedule.weightCategory)) {
          lastRow.weightCategories.push(schedule.weightCategory);
          lastRow.weightCategories.sort();
        }
      } else {
        rows.push({
          sexCategory: schedule.sexCategory,
          weightCategories: [schedule.weightCategory],
          startTime: schedule.startTime,
          endTime: schedule.endTime,
        });
      }
    }

    return rows;
  }, [schedules]);

  return (
    <div
      className="mb-8 last:mb-0"
      data-ui="preview-date-block"
      data-date={date}
    >
      {/* Date Header */}
      <div className="mb-4" data-ui="preview-date-header">
        <h3
          className="text-xl md:text-2xl lg:text-3xl"
          data-ui="preview-date-title"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            fontWeight: 400,
            letterSpacing: '0.05em',
            color: '#ffffff',
            textTransform: 'uppercase',
            textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
          }}
        >
          {formatDate(date)}
        </h3>
        <div
          className="mt-2 h-px"
          data-ui="preview-date-underline"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
          }}
        />
      </div>

      {/* Table Header */}
      <div
        className="grid grid-cols-[minmax(0,1fr)_max-content] sm:grid-cols-3 gap-x-4 gap-y-2 sm:gap-y-0 py-2 px-4 mb-2"
        data-ui="preview-table-header"
      >
        <span
          className="text-xs md:text-sm uppercase"
          data-ui="preview-header-sex"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: 'rgba(220, 20, 60, 0.7)',
            letterSpacing: '0.1em',
          }}
        >
          Categoría
        </span>
        <span
          className="hidden sm:flex text-xs md:text-sm uppercase"
          data-ui="preview-header-weight"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: 'rgba(220, 20, 60, 0.7)',
            letterSpacing: '0.1em',
          }}
        >
          Peso
        </span>
        <span
          className="text-xs md:text-sm uppercase sm:justify-self-end"
          data-ui="preview-header-time"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: 'rgba(220, 20, 60, 0.7)',
            letterSpacing: '0.1em',
          }}
        >
          Horario
        </span>
      </div>

      {/* Table Body */}
      <div
        className="rounded-lg overflow-hidden"
        data-ui="preview-table-body"
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        {consolidatedRows.map((row, index) => (
          <ScheduleRow
            key={`${row.sexCategory}-${row.startTime}-${index}`}
            sexCategory={row.sexCategory}
            weightCategories={row.weightCategories}
            startTime={row.startTime}
            endTime={row.endTime}
            isLast={index === consolidatedRows.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

// Loading skeleton for preview
const PreviewLoadingSkeleton: FC = () => {
  return (
    <div className="space-y-8" data-ui="preview-loading-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={`preview-skeleton-${i}`} className="space-y-4" data-ui={`preview-skeleton-date-${i}`}>
          <div
            className="h-8 w-48 rounded shimmer-line"
            data-ui={`preview-skeleton-date-header-${i}`}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
            }}
          />
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div
                key={`preview-skeleton-row-${i}-${j}`}
                className="h-12 rounded-lg shimmer-line"
                data-ui={`preview-skeleton-row-${i}-${j}`}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Empty state for preview
const PreviewEmptyState: FC = () => {
  return (
    <div
      className="flex flex-col items-center justify-center py-16"
      data-ui="preview-empty-state"
    >
      <svg
        className="w-16 h-16 mb-6"
        data-ui="preview-empty-icon"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        style={{
          color: 'rgba(220, 20, 60, 1)',
          strokeWidth: 1.5,
        }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div
        className="text-2xl md:text-3xl mb-4"
        data-ui="preview-empty-title"
        style={{
          fontFamily: '"Contrail One", sans-serif',
          color: 'rgba(255, 255, 255, 0.6)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Próximamente
      </div>
      <div
        className="text-sm md:text-base text-center"
        data-ui="preview-empty-subtitle"
        style={{
          fontFamily: '"Contrail One", sans-serif',
          color: 'rgba(255, 255, 255, 0.4)',
          letterSpacing: '0.05em',
        }}
      >
        Los horarios de la competición se publicarán pronto
      </div>
    </div>
  );
};

export function Horarios(): JSX.Element {
  const [activeSexTab, setActiveSexTab] = useState<'Male' | 'Female'>('Female');
  const [activeContentTab, setActiveContentTab] = useState('manage');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // Schedules published toggle
  const [schedulesPublished, setSchedulesPublished] = useState(true);
  const [schedulesPublishedLoading, setSchedulesPublishedLoading] = useState(true);
  const [schedulesPublishedSaving, setSchedulesPublishedSaving] = useState(false);
  const [toggleSuccess, setToggleSuccess] = useState(false);

  // Preview state for public schedules view
  const [previewSchedules, setPreviewSchedules] = useState<ScheduleGroupedByDate[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  
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
    const fetchPublishedConfig = async () => {
      try {
        const config = await api.getSchedulesPublishedConfig();
        setSchedulesPublished(config.value);
      } catch {
        // default to true
      } finally {
        setSchedulesPublishedLoading(false);
      }
    };
    fetchPublishedConfig();
  }, []);

  // Fetch public schedules for preview
  useEffect(() => {
    const fetchPreviewSchedules = async () => {
      setPreviewLoading(true);
      try {
        const data = await api.getPublicSchedules();
        setPreviewSchedules(data);
      } catch {
        setPreviewSchedules([]);
      } finally {
        setPreviewLoading(false);
      }
    };

    if (activeContentTab === 'preview') {
      fetchPreviewSchedules();
    }
  }, [activeContentTab]);

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

  const handleTogglePublished = useCallback(async () => {
    try {
      setSchedulesPublishedSaving(true);
      await api.updateSchedulesPublishedConfig({ value: !schedulesPublished });
      setSchedulesPublished(prev => !prev);
      setToggleSuccess(true);
      setTimeout(() => setToggleSuccess(false), 3000);
    } catch {
      // revert state silently
    } finally {
      setSchedulesPublishedSaving(false);
    }
  }, [schedulesPublished]);

  // Get categories for current sex
  const categories = activeSexTab === 'Female' ? WOMEN_CATEGORIES : MEN_CATEGORIES;

  // Get schedules for current sex
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => s.sexCategory === activeSexTab);
  }, [schedules, activeSexTab]);

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="horarios-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2">Horarios</h1>
          <p className="text-sm xs:text-base text-white/50">Configura los horarios de las categorías por día de competición</p>
        </div>

        {/* Publish Toggle Card */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-4 xs:p-6 mb-4" data-ui="publish-toggle-card">
          <div className="flex items-center justify-between" data-ui="publish-toggle-row">
            <div data-ui="publish-toggle-info">
              <h2 className="text-base xs:text-lg font-semibold text-white mb-0.5">
                Horarios publicados
              </h2>
              <p className="text-xs xs:text-sm text-gray-400">
                Activa la publicación de los horarios en la página web
              </p>
            </div>
            <button
              onClick={handleTogglePublished}
              disabled={schedulesPublishedSaving}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                schedulesPublished ? 'bg-red-accent' : 'bg-gray-600'
              } ${schedulesPublishedSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-ui="publish-toggle-button"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                  schedulesPublished ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {toggleSuccess && (
            <div className="mt-3 text-xs text-green-400" data-ui="publish-toggle-success">
              Estado guardado correctamente
            </div>
          )}
        </div>

        {/* Sex Tabs */}
        <div className="overflow-x-auto -mx-3 xs:-mx-4 px-3 xs:px-4 mb-4">
          <Tabs
            tabs={SEX_TABS}
            activeTab={activeSexTab}
            onChange={handleSexTabChange}
            className="mb-0"
          />
        </div>

        {/* Content Tabs */}
        <div className="overflow-x-auto -mx-3 xs:-mx-4 px-3 xs:px-4 mb-4 xs:mb-6">
          <Tabs
            tabs={CONTENT_TABS}
            activeTab={activeContentTab}
            onChange={setActiveContentTab}
            className="mb-0"
          />
        </div>

        {/* Manage Tab */}
        {activeContentTab === 'manage' && (
          <div className="space-y-3 xs:space-y-4" data-ui="manage-tab">
            <div className="flex justify-end">
              <Button
                leftIcon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
                onClick={() => setIsAddModalOpen(true)}
                className="min-h-[44px] bg-red-accent/90 hover:bg-red-accent text-white border-0 shadow-lg shadow-red-accent/20"
              >
                <span className="hidden xs:inline">Añadir horario</span>
                <span className="xs:hidden">Añadir</span>
              </Button>
            </div>

            {/* Schedule rows by category */}
            {categories.map(category => {
              const categorySchedules = filteredSchedules.filter(s => s.weightCategory === category);
              return (
                <div
                  key={category}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
                  data-ui="category-schedule"
                  data-category={category}
                >
                  <div className="px-3 xs:px-4 py-2.5 xs:py-3 bg-white/5 border-b border-white/10" data-ui="category-header">
                    <h3 className="font-semibold text-white text-sm xs:text-base">{category} kg</h3>
                    <p className="text-xs xs:text-sm text-white/50">
                      {categorySchedules.length} horario{categorySchedules.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {categorySchedules.length === 0 ? (
                    <div className="p-4 text-center text-white/40 text-sm" data-ui="no-schedules">
                      Sin horarios configurados
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5" data-ui="schedule-list">
                      {categorySchedules.map(schedule => (
                        <div key={schedule.id} className="p-3 xs:p-4 flex flex-col xs:flex-row xs:items-center justify-between gap-3" data-ui="schedule-item">
                          <div className="flex items-center gap-3 xs:gap-4" data-ui="schedule-info">
                            <div className="text-center px-2.5 xs:px-3 py-1.5 xs:py-1 bg-white/5 rounded-xl min-w-[50px] xs:min-w-[60px]">
                              <div className="text-xs text-white/50 uppercase">
                                {new Date(schedule.date).toLocaleDateString('es-ES', { weekday: 'short' })}
                              </div>
                              <div className="text-base xs:text-lg font-bold text-white">
                                {new Date(schedule.date).getDate()}
                              </div>
                            </div>
                            <div>
                              <div className="font-mono text-white text-sm xs:text-base">{formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}</div>
                              <div className="text-xs xs:text-sm text-white/50">
                                {new Date(schedule.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long' })}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 xs:flex-none" data-ui="schedule-actions">
                            <Button size="sm" variant="ghost" onClick={() => setEditingSchedule(schedule)} className="min-h-[36px] xs:min-h-[40px] px-2 xs:px-3 text-white/60 hover:text-white hover:bg-white/10 gap-1"><Pencil className="w-4 h-4" /> Editar</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteSchedule(schedule.id)} className="text-red-400/80 hover:text-red-300 min-h-[36px] xs:min-h-[40px] px-2 xs:px-3 gap-1"><Trash2 className="w-4 h-4" /> Eliminar</Button>
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
          <div className="bg-dark-darker/50 rounded-2xl border border-white/10 p-4 xs:p-6 lg:p-8" data-ui="preview-container">
            {/* Section Header */}
            <div className="text-center mb-8" data-ui="preview-section-header">
              <h2
                className="text-2xl md:text-3xl lg:text-4xl"
                data-ui="preview-section-title"
                style={{
                  fontFamily: '"Contrail One", sans-serif',
                  fontWeight: 400,
                  letterSpacing: '0.05em',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
                }}
              >
                Horarios
              </h2>
              {/* Subtle underline */}
              <div
                className="mt-4 mx-auto w-24 h-px"
                data-ui="preview-section-underline"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)',
                }}
              />
            </div>

            {/* Content */}
            {previewLoading ? (
              <PreviewLoadingSkeleton />
            ) : previewSchedules.length === 0 ? (
              <PreviewEmptyState />
            ) : (
              <div data-ui="preview-schedules-list">
                {previewSchedules.map((group) => (
                  <DateBlock
                    key={group.date}
                    date={group.date}
                    schedules={group.schedules}
                  />
                ))}
              </div>
            )}

            {/* Background glow effects */}
            <div
              className="absolute top-1/3 left-1/4 w-96 h-96 bg-red-accent/3 rounded-full blur-3xl pointer-events-none -z-10"
              data-ui="preview-bg-glow-left"
              aria-hidden
            />
            <div
              className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-dark-red/4 rounded-full blur-3xl pointer-events-none -z-10"
              data-ui="preview-bg-glow-right"
              aria-hidden
            />
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
      <form onSubmit={handleSubmit} className="space-y-5" data-ui="schedule-form">
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

        <div className="flex flex-col xs:flex-row justify-end gap-3 pt-4 border-t border-white/10">
          <Button type="button" variant="ghost" onClick={onClose} className="min-h-[44px] text-white/60 hover:text-white hover:bg-white/10">
            Cancelar
          </Button>
          <Button type="submit" isLoading={isLoading} className="min-h-[44px] bg-red-accent/90 hover:bg-red-accent text-white border-0 shadow-lg shadow-red-accent/20">
            {initialData ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default Horarios;
