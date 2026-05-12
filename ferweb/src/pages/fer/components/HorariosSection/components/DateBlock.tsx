import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { FER_COLORS } from '../../../constants';
import { formatDateEs, consolidateScheduleRows } from '../helpers';
import { TimelineLine } from './TimelineLine';
import { ScheduleRowCard } from './ScheduleRowCard';
import type { DateBlockProps } from '../types';

export function DateBlock({ group, index, isLast, timelineProgress }: DateBlockProps) {
  const rows = useMemo(
    () => consolidateScheduleRows(group.schedules),
    [group.schedules]
  );

  const formattedDate = useMemo(
    () => formatDateEs(group.date),
    [group.date]
  );

  const blockVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 24 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: 'easeOut', delay: index * 0.12 },
      },
    }),
    [index]
  );

  const dotBorderColor = useMemo(
    () =>
      `${FER_COLORS.gold}${Math.min(Math.round(timelineProgress * 200 + 60), 255)
        .toString(16)
        .padStart(2, '0')}`,
    [timelineProgress]
  );

  const dotGlow = useMemo(
    () => `0 0 16px ${FER_COLORS.gold}${Math.round(timelineProgress * 60).toString(16).padStart(2, '0')}`,
    [timelineProgress]
  );

  return (
    <motion.div
      variants={blockVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className="relative pl-9 sm:pl-12"
      data-ui={`horarios-date-block-${index}`}
    >
      <TimelineLine progress={timelineProgress} isLast={isLast} />

      {/* Timeline dot */}
      <div
        className="absolute left-0 top-1 w-[26px] h-[26px] rounded-full flex items-center justify-center"
        style={{
          backgroundColor: FER_COLORS.bgCard,
          border: `2px solid ${dotBorderColor}`,
          boxShadow: dotGlow,
        }}
        data-ui={`horarios-timeline-dot-${index}`}
      >
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: FER_COLORS.gold,
            opacity: 0.5 + timelineProgress * 0.5,
            boxShadow: `0 0 8px ${FER_COLORS.gold}${Math.round(timelineProgress * 80).toString(16).padStart(2, '0')}`,
          }}
          data-ui={`horarios-timeline-dot-inner-${index}`}
        />
      </div>

      {/* Date content */}
      <div data-ui={`horarios-date-content-${index}`}>
        {/* Date header */}
        <div
          className="flex items-center gap-3 mb-6"
          data-ui={`horarios-date-header-${index}`}
        >
          <Calendar
            size={20}
            style={{ color: FER_COLORS.gold }}
            data-ui={`horarios-date-calendar-icon-${index}`}
          />
          <h3
            className="text-xl sm:text-2xl lg:text-3xl font-display font-bold capitalize"
            style={{ color: FER_COLORS.text }}
            data-ui={`horarios-date-title-${index}`}
          >
            {formattedDate}
          </h3>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${FER_COLORS.accent}30, transparent)`,
            }}
            data-ui={`horarios-date-divider-${index}`}
            aria-hidden="true"
          />
        </div>

        {/* Schedule rows */}
        <div
          className="space-y-3 sm:space-y-4"
          data-ui={`horarios-date-rows-${index}`}
        >
          {rows.map((row, ri) => (
            <ScheduleRowCard
              key={`${row.sexCategory}-${row.startTime}-${ri}`}
              row={row}
              index={ri}
              total={rows.length}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
