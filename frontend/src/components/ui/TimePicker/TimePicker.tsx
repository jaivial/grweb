import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  const [activeColumn, setActiveColumn] = useState<'hours' | 'minutes'>('hours');
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);

  const parsedValue = useMemo(() => {
    if (!value) return { hours: null, minutes: null };
    const [h, m] = value.split(':').map(Number);
    return { hours: h, minutes: m };
  }, [value]);

  const selectedHours = parsedValue.hours;
  const selectedMinutes = parsedValue.minutes;

  // Scroll selected option into view
  useEffect(() => {
    if (isOpen && activeColumn === 'hours' && hoursRef.current) {
      const selected = hoursRef.current.querySelector('[data-selected="true"]');
      if (selected) {
        selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    if (isOpen && activeColumn === 'minutes' && minutesRef.current) {
      const selected = minutesRef.current.querySelector('[data-selected="true"]');
      if (selected) {
        selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [isOpen, activeColumn, selectedHours, selectedMinutes]);

  const handleHourSelect = useCallback((hour: number) => {
    if (selectedMinutes !== null) {
      const timeStr = `${String(hour).padStart(2, '0')}:${String(selectedMinutes).padStart(2, '0')}`;
      onChange(timeStr);
      setIsOpen(false);
    } else {
      setActiveColumn('minutes');
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

  const handleHoursScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    const itemHeight = 44;
    const newHour = Math.round(scrollTop / itemHeight);
    const clampedHour = Math.max(0, Math.min(23, newHour));
    if (clampedHour !== selectedHours && !selectedHours) {
      // Preview selection during scroll
    }
  }, [selectedHours]);

  const handleMinutesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    const itemHeight = 44;
    const newMinute = Math.round(scrollTop / itemHeight);
    const clampedMinute = Math.min(55, newMinute - (newMinute % 5));
  }, []);

  return (
    <div className={`relative ${className}`} data-ui="time-picker">
      {label && (
        <label className="block text-sm font-medium text-white/80 mb-1.5" data-ui="timepicker-label">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-3 min-h-[48px] text-left bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl
          flex items-center justify-between gap-3 transition-all duration-300
          focus:outline-none focus:ring-2 focus:ring-red-accent/30 focus:ring-offset-0
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10 hover:border-white/20'}
          ${error ? 'border-red-500/50' : ''}
          ${isOpen ? 'bg-white/10 border-red-accent/50 ring-2 ring-red-accent/30' : ''}
        `}
        data-ui="timepicker-trigger"
      >
        <span className={value ? 'text-white' : 'text-white/40'} data-ui="timepicker-value">
          {value ? formatDisplayTime(value) : placeholder}
        </span>

        <div className="flex items-center gap-2" data-ui="timepicker-actions">
          {value && (
            <span
              onClick={handleClear}
              className="text-white/40 hover:text-white p-1 -mr-1 rounded-lg hover:bg-white/10 transition-colors"
              data-ui="timepicker-clear"
              role="button"
              tabIndex={-1}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 w-64 bottom-[calc(100%+8px)] bg-dark-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          data-ui="timepicker-picker"
        >
          {/* iOS-style wheel picker */}
          <div className="flex h-52">
            {/* Hours column */}
            <div className="flex-1 relative">
              <div
                ref={hoursRef}
                className="h-full overflow-y-auto scrollbar-hide py-[60px]"
                onScroll={handleHoursScroll}
                data-ui="timepicker-hours-scroll"
              >
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    onClick={() => handleHourSelect(hour)}
                    className={`
                      h-11 flex items-center justify-center text-lg cursor-pointer transition-all duration-200
                      ${selectedHours === hour
                        ? 'text-white font-semibold scale-110'
                        : 'text-white/50 hover:text-white/80'}
                    `}
                    data-ui="timepicker-hour"
                    data-hour={hour}
                    data-selected={selectedHours === hour ? 'true' : 'false'}
                  >
                    {String(hour).padStart(2, '0')}
                  </div>
                ))}
              </div>
              {/* Selection indicator */}
              <div className="absolute inset-x-0 top-[60px] h-11 bg-white/10 rounded-lg pointer-events-none" data-ui="timepicker-hours-indicator" />
            </div>

            {/* Divider */}
            <div className="w-px bg-white/10" data-ui="timepicker-divider" />

            {/* Minutes column */}
            <div className="flex-1 relative">
              <div
                ref={minutesRef}
                className="h-full overflow-y-auto scrollbar-hide py-[60px]"
                onScroll={handleMinutesScroll}
                data-ui="timepicker-minutes-scroll"
              >
                {MINUTES.map(minute => (
                  <div
                    key={minute}
                    onClick={() => handleMinuteSelect(minute)}
                    className={`
                      h-11 flex items-center justify-center text-lg cursor-pointer transition-all duration-200
                      ${selectedMinutes === minute
                        ? 'text-white font-semibold scale-110'
                        : 'text-white/50 hover:text-white/80'}
                    `}
                    data-ui="timepicker-minute"
                    data-minute={minute}
                    data-selected={selectedMinutes === minute ? 'true' : 'false'}
                  >
                    {String(minute).padStart(2, '0')}
                  </div>
                ))}
              </div>
              {/* Selection indicator */}
              <div className="absolute inset-x-0 top-[60px] h-11 bg-white/10 rounded-lg pointer-events-none" data-ui="timepicker-minutes-indicator" />
            </div>
          </div>

          {/* Done button */}
          <div className="flex justify-end p-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm font-medium text-red-accent hover:text-red-accent/80 transition-colors"
              data-ui="timepicker-done"
            >
              Hecho
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-400" data-ui="timepicker-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default TimePicker;