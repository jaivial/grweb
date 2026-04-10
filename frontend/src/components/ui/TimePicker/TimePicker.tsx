import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { JSX } from 'react';
import {
  WheelPicker,
  WheelPickerWrapper,
  type WheelPickerOption,
} from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';

export interface TimePickerProps {
  value: string | null;
  onChange: (time: string | null) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  minuteStep?: number;
  placeholder?: string;
  className?: string;
  /** Earliest allowed time in "HH:MM" format. Options before this are disabled. */
  minTime?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function buildMinuteOptions(step: number): WheelPickerOption<number>[] {
  const minutes: number[] = [];
  for (let m = 0; m < 60; m += step) minutes.push(m);
  return minutes.map(m => ({ value: m, label: String(m).padStart(2, '0') }));
}

const pickerClassNames = {
  optionItem: 'text-white/40 data-rwp-highlight:text-white font-mono',
  highlightWrapper: 'bg-white/10 rounded-lg',
  highlightItem: 'text-white font-semibold',
};

export function TimePicker({
  value,
  onChange,
  label,
  error,
  disabled = false,
  minuteStep = 5,
  placeholder = 'Seleccionar hora...',
  className = '',
  minTime,
}: TimePickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const minuteOptions = useMemo(() => buildMinuteOptions(minuteStep), [minuteStep]);

  const parsed = useMemo(() => {
    if (!value) return { hours: 0, minutes: 0 };
    const [h, m] = value.split(':').map(Number);
    return { hours: h, minutes: m };
  }, [value]);

  const parsedMin = useMemo(() => {
    if (!minTime) return null;
    const [h, m] = minTime.split(':').map(Number);
    return { hours: h, minutes: m };
  }, [minTime]);

  // Filter hours: disable those before minTime hour
  const filteredHourOptions: WheelPickerOption<number>[] = useMemo(() => {
    if (!parsedMin) return HOURS.map(h => ({ value: h, label: String(h).padStart(2, '0') }));
    return HOURS.map(h => ({
      value: h,
      label: String(h).padStart(2, '0'),
      disabled: h < parsedMin.hours,
    }));
  }, [parsedMin]);

  // Filter minutes: only disable when the selected hour equals minTime hour
  const filteredMinuteOptions: WheelPickerOption<number>[] = useMemo(() => {
    if (!parsedMin || parsed.hours > parsedMin.hours) return minuteOptions;
    if (parsed.hours < parsedMin.hours) {
      // All minutes invalid — shouldn't happen if hour constraint works, but disable all
      return minuteOptions.map(m => ({ ...m, disabled: true }));
    }
    // Same hour as min — disable minutes before min minute
    return minuteOptions.map(m => ({
      ...m,
      disabled: m.value < parsedMin.minutes,
    }));
  }, [parsedMin, parsed.hours, minuteOptions]);

  const handleHourChange = useCallback((hour: number) => {
    if (parsedMin && hour < parsedMin.hours) return;
    const m = value ? value.split(':')[1] : '00';
    onChange(`${String(hour).padStart(2, '0')}:${m}`);
  }, [value, onChange, parsedMin]);

  const handleMinuteChange = useCallback((minute: number) => {
    if (parsedMin && parsed.hours === parsedMin.hours && minute < parsedMin.minutes) return;
    const h = value ? value.split(':')[0] : '00';
    onChange(`${h}:${String(minute).padStart(2, '0')}`);
  }, [value, onChange, parsedMin, parsed.hours]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const formatDisplayTime = useCallback((timeStr: string | null): string => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`} data-ui="time-picker">
      {label && (
        <label className="block text-sm font-medium text-white/80 mb-1.5" data-ui="timepicker-label">
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!disabled) setIsOpen(true); }}
        disabled={disabled}
        className={`
          w-full px-4 py-3 min-h-[48px] text-left bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl
          flex items-center justify-between gap-3 transition-all duration-300
          focus:outline-none focus:ring-2 focus:ring-red-accent/30 focus:ring-offset-0
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10 hover:border-white/20'}
          ${error ? 'border-red-500/50' : ''}
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

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          data-ui="timepicker-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div
            className="bg-dark-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-4 sm:p-4 w-[85vw] max-w-xs sm:w-64 sm:max-w-none"
            data-ui="timepicker-picker"
          >
            <WheelPickerWrapper className="w-full sm:w-64 rounded-lg border border-white/10 bg-transparent" >
              <WheelPicker<number>
                options={filteredHourOptions}
                value={parsed.hours}
                onValueChange={handleHourChange}
                infinite
                optionItemHeight={40}
                classNames={{
                  ...pickerClassNames,
                  optionItem: 'text-3xl sm:text-base text-white/40 font-mono',
                  highlightItem: 'text-3xl sm:text-base text-white font-semibold',
                }}
              />
              <div className="flex items-center justify-center px-1 text-white/60 text-2xl sm:text-lg font-bold" data-ui="timepicker-separator">:</div>
              <WheelPicker<number>
                options={filteredMinuteOptions}
                value={parsed.minutes}
                onValueChange={handleMinuteChange}
                infinite
                optionItemHeight={40}
                classNames={{
                  ...pickerClassNames,
                  optionItem: 'text-3xl sm:text-base text-white/40 font-mono',
                  highlightItem: 'text-3xl sm:text-base text-white font-semibold',
                }}
              />
            </WheelPickerWrapper>

            <div className="flex justify-end mt-3 pt-3 border-t border-white/10">
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
        </div>,
        document.body
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
