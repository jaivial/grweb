import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { JSX } from 'react';

export interface DatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  className?: string;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function DatePicker({
  value,
  onChange,
  label,
  error,
  disabled = false,
  minDate,
  maxDate,
  placeholder = 'Seleccionar fecha...',
  className = '',
}: DatePickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    return new Date();
  });

  const currentValue = useMemo(() => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, [value]);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: Array<{ date: Date | null; disabled: boolean }> = [];

    for (let i = 0; i < startingDay; i++) {
      days.push({ date: null, disabled: true });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      let disabled = false;

      if (minDate) {
        const min = new Date(minDate);
        disabled = date < min;
      }
      if (!disabled && maxDate) {
        const max = new Date(maxDate);
        disabled = date > max;
      }

      days.push({ date, disabled });
    }

    return days;
  }, [viewDate, minDate, maxDate]);

  const isSelected = useCallback((date: Date): boolean => {
    if (!currentValue) return false;
    return (
      date.getDate() === currentValue.getDate() &&
      date.getMonth() === currentValue.getMonth() &&
      date.getFullYear() === currentValue.getFullYear()
    );
  }, [currentValue]);

  const isToday = useCallback((date: Date): boolean => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }, []);

  const handlePrevMonth = useCallback(() => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    onChange(formatted);
    setIsOpen(false);
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideContainer = containerRef.current && containerRef.current.contains(target);
      const isInsideDropdown = target instanceof Element && target.closest('[data-ui="datepicker-calendar"]');

      if (!isInsideContainer && !isInsideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenToggle = useCallback((e: React.MouseEvent) => {
    if (!disabled) {
      if (!isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom - 530, left: rect.left, width: rect.width });
      }
      setIsOpen(!isOpen);
    }
  }, [disabled, isOpen]);

  const formatDisplayDate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`} data-ui="date-picker">
      {label && (
        <label className="block text-sm font-medium text-white/80 mb-1.5" data-ui="datepicker-label">
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpenToggle}
        disabled={disabled}
        className={`
          w-full px-4 py-3 min-h-[48px] text-left bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl
          flex items-center justify-between gap-3 transition-all duration-300
          focus:outline-none focus:ring-2 focus:ring-red-accent/30 focus:ring-offset-0
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10 hover:border-white/20'}
          ${error ? 'border-red-500/50' : ''}
          ${isOpen ? 'bg-white/10 border-red-accent/50 ring-2 ring-red-accent/30' : ''}
        `}
        data-ui="datepicker-trigger"
      >
        <span className={value ? 'text-white' : 'text-white/40'} data-ui="datepicker-value">
          {value ? formatDisplayDate(value) : placeholder}
        </span>

        <div className="flex items-center gap-2" data-ui="datepicker-actions">
          {value && (
            <span
              onClick={handleClear}
              className="text-white/40 hover:text-white p-1 -mr-1 rounded-lg hover:bg-white/10 transition-colors"
              data-ui="datepicker-clear"
              role="button"
              tabIndex={-1}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </button>

      {isOpen && createPortal(
        <div
          className="fixed z-[9999] bg-dark-card border border-white/10 rounded-2xl shadow-2xl p-4"
          data-ui="datepicker-calendar"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
        >
          {/* Month/Year Navigation */}
          <div className="flex items-center justify-between mb-4" data-ui="datepicker-nav">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              data-ui="datepicker-prev"
            >
              <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <span className="font-medium text-white" data-ui="datepicker-month-year">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              data-ui="datepicker-next"
            >
              <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2" data-ui="datepicker-day-headers">
            {DAYS.map(day => (
              <div key={day} className="text-center text-xs text-white/40 py-2 font-medium" data-ui="datepicker-day-header">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1" data-ui="datepicker-days">
            {calendarDays.map((item, index) => (
              <div key={index} className="aspect-square" data-ui="datepicker-day-cell">
                {item.date && (
                  <button
                    type="button"
                    onClick={() => !item.disabled && handleSelectDate(item.date!)}
                    disabled={item.disabled}
                    className={`
                      w-full h-full min-w-[36px] min-h-[36px] flex items-center justify-center text-sm rounded-xl
                      transition-all duration-200
                      ${item.disabled ? 'text-white/20 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
                      ${isSelected(item.date) ? 'bg-red-accent text-white shadow-lg' : 'text-white'}
                      ${isToday(item.date) && !isSelected(item.date) ? 'border border-white/20' : ''}
                    `}
                    data-ui="datepicker-day"
                    data-date={item.date.toISOString()}
                  >
                    {item.date.getDate()}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ,
        document.body
      )}

      {error && (
        <p className="mt-1 text-sm text-red-400" data-ui="datepicker-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default DatePicker;