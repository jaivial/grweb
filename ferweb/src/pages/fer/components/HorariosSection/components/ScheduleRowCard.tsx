import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, User } from 'lucide-react';
import { FER_COLORS } from '../../../constants';
import { formatTime, getSexLabel, getSexColor } from '../helpers';
import { WeightCategoryChip } from './WeightCategoryChip';
import type { ScheduleRowCardProps } from '../types';

export function ScheduleRowCard({ row, index, total }: ScheduleRowCardProps) {
  const sexLabel = useMemo(() => getSexLabel(row.sexCategory), [row.sexCategory]);
  const sexColor = useMemo(() => getSexColor(row.sexCategory, FER_COLORS), [row.sexCategory]);

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 16, scale: 0.97 },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.4, ease: [0.25, 0.25, 0.25, 0.75], delay: index * 0.06 },
      },
    }),
    [index]
  );

  const cardStyle = useMemo(
    () => ({
      backgroundColor: FER_COLORS.bgCard,
      border: `1px solid ${FER_COLORS.accent}18`,
      boxShadow: `0 2px 16px rgba(0,0,0,0.12), inset 0 1px 0 ${FER_COLORS.accent}08`,
    }),
    []
  );

  const hoverStyle = useMemo(
    () => ({
      border: `1px solid ${sexColor}40`,
      boxShadow: `0 4px 24px rgba(0,0,0,0.18), 0 0 20px ${sexColor}15, inset 0 1px 0 ${FER_COLORS.accent}12`,
    }),
    [sexColor]
  );

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      whileHover={hoverStyle}
      className="p-4 sm:p-5 rounded-2xl transition-colors duration-200"
      style={cardStyle}
      data-ui={`horarios-row-card-${index}`}
    >
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6"
        data-ui={`horarios-row-inner-${index}`}
      >
        {/* Time — prominent hero element */}
        <div
          className="flex items-center gap-2.5 sm:min-w-[160px] sm:flex-shrink-0"
          data-ui={`horarios-row-time-block-${index}`}
        >
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: `${FER_COLORS.gold}10`,
              border: `1px solid ${FER_COLORS.gold}20`,
            }}
            data-ui={`horarios-row-time-icon-bg-${index}`}
          >
            <Clock
              size={18}
              style={{ color: FER_COLORS.gold }}
              data-ui={`horarios-row-clock-icon-${index}`}
            />
          </div>
          <div
            className="flex flex-col"
            data-ui={`horarios-row-time-values-${index}`}
          >
            <span
              className="text-lg sm:text-xl font-display font-bold tabular-nums leading-tight"
              style={{ color: FER_COLORS.glow }}
              data-ui={`horarios-row-time-start-${index}`}
            >
              {formatTime(row.startTime)}
            </span>
            <span
              className="text-[10px] sm:text-xs font-medium uppercase tracking-widest"
              style={{ color: FER_COLORS.textMuted }}
              data-ui={`horarios-row-time-range-${index}`}
            >
              a {formatTime(row.endTime)}
            </span>
          </div>
        </div>

        {/* Divider on desktop */}
        <div
          className="hidden sm:block w-px h-10 flex-shrink-0"
          style={{ backgroundColor: `${FER_COLORS.accent}25` }}
          data-ui={`horarios-row-divider-${index}`}
          aria-hidden="true"
        />

        {/* Sex category */}
        <div
          className="flex items-center gap-2 flex-shrink-0"
          data-ui={`horarios-row-sex-${index}`}
        >
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${sexColor}12`,
              border: `1px solid ${sexColor}20`,
            }}
            data-ui={`horarios-row-sex-badge-${index}`}
          >
            <User
              size={15}
              style={{ color: sexColor }}
              data-ui={`horarios-row-sex-icon-${index}`}
            />
          </div>
          <span
            className="text-sm font-semibold tracking-wide"
            style={{ color: sexColor }}
            data-ui={`horarios-row-sex-label-${index}`}
          >
            {sexLabel}
          </span>
        </div>

        {/* Weight category chips */}
        <div
          className="flex flex-wrap gap-2 flex-1"
          data-ui={`horarios-row-chips-${index}`}
        >
          {row.weightCategories.map((wc, ci) => (
            <WeightCategoryChip
              key={`${wc}-${ci}`}
              label={wc}
              sexCategory={row.sexCategory}
              index={ci}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
