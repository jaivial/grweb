import { useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';

export interface TimePickerProps {
  value: string | null;
  onChange: (time: string | null) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  minuteStep?: number;
  placeholder?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function TimePicker({
  value,
  onChange,
  label,
  error,
  disabled = false,
  minuteStep = 5,
  placeholder = 'Seleccionar hora...',
  className = '',
}: TimePickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'hours' | 'minutes'>('hours');

  const parsedValue = useMemo(() => {
    if (!value) return { hours: null, minutes: null };
    const [h, m] = value.split(':').map(Number);
    return { hours: h, minutes: m };
  }, [value]);

  const selectedHours = parsedValue.hours;
  const selectedMinutes = parsedValue.minutes;

  const handleHourSelect = useCallback((hour: number) => {
    if (selectedMinutes !== null) {
      const timeStr = `${String(hour).padStart(2, '0')}:${String(selectedMinutes).padStart(2, '0')}`;
      onChange(timeStr);
      setIsOpen(false);
    } else {
      setView('minutes');
    }
  }, [selectedMinutes, onChange]);

  const handleMinuteSelect = useCallback((minute: number) => {
    if (selectedHours !== null) {
      const timeStr = `${String(selectedHours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      onChange(timeStr);
      setIsOpen(false);
    }
  }, [selectedHours, onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  }, [onChange]);

  const formatDisplayTime = useCallback((timeStr: string | null): string => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  }, []);

  return (
    <div className={`relative ${className}`} data-ui="time-picker">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-1.5" data-ui="timepicker-label">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-3 py-2.5 text-left bg-dark-surface border rounded-lg
          flex items-center justify-between gap-2 transition-colors
          focus:outline-none focus:ring-2 focus:ring-red-accent/50
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-600'}
          ${error ? 'border-red-500' : 'border-dark-border'}
          ${isOpen ? 'ring-2 ring-red-accent/50 border-red-accent' : ''}
        `}
        data-ui="timepicker-trigger"
      >
        <span className={value ? 'text-white' : 'text-gray-500'} data-ui="timepicker-value">
          {value ? formatDisplayTime(value) : placeholder}
        </span>
        
        <div className="flex items-center gap-1" data-ui="timepicker-actions">
          {value && (
            <span
              onClick={handleClear}
              className="text-gray-400 hover:text-white p-1 -mr-1"
              data-ui="timepicker-clear"
              role="button"
              tabIndex={-1}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 w-48 mt-1 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden"
          data-ui="timepicker-picker"
        >
          {/* View Toggle */}
          <div className="flex border-b border-dark-border" data-ui="timepicker-tabs">
            <button
              type="button"
              onClick={() => setView('hours')}
              className={`
                flex-1 py-2 text-sm font-medium transition-colors
                ${view === 'hours' ? 'text-red-accent border-b-2 border-red-accent' : 'text-gray-400 hover:text-white'}
              `}
              data-ui="timepicker-hours-tab"
            >
              {selectedHours !== null ? String(selectedHours).padStart(2, '0') : '--'}
            </button>
            <button
              type="button"
              onClick={() => setView('minutes')}
              className={`
                flex-1 py-2 text-sm font-medium transition-colors
                ${view === 'minutes' ? 'text-red-accent border-b-2 border-red-accent' : 'text-gray-400 hover:text-white'}
              `}
              data-ui="timepicker-minutes-tab"
            >
              :{selectedMinutes !== null ? String(selectedMinutes).padStart(2, '0') : '--'}
            </button>
          </div>

          {/* Scrollable Options */}
          <div className="h-48 overflow-y-auto p-2" data-ui="timepicker-options">
            {view === 'hours' ? (
              <div className="grid grid-cols-4 gap-1" data-ui="timepicker-hours-grid">
                {HOURS.map(hour => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => handleHourSelect(hour)}
                    className={`
                      py-2 text-sm rounded transition-colors
                      ${selectedHours === hour
                        ? 'bg-red-accent text-white'
                        : 'text-white hover:bg-dark-hover'}
                    `}
                    data-ui="timepicker-hour"
                    data-hour={hour}
                  >
                    {String(hour).padStart(2, '0')}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1" data-ui="timepicker-minutes-grid">
                {MINUTES.map(minute => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => handleMinuteSelect(minute)}
                    className={`
                      py-2 text-sm rounded transition-colors
                      ${selectedMinutes === minute
                        ? 'bg-red-accent text-white'
                        : 'text-white hover:bg-dark-hover'}
                    `}
                    data-ui="timepicker-minute"
                    data-minute={minute}
                  >
                    {String(minute).padStart(2, '0')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-500" data-ui="timepicker-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default TimePicker;
