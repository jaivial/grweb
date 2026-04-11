import { FC, useEffect, useState, useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { useCdnImage } from '@hooks/useCdnImage';

export interface SchedulesSectionProps {
  className?: string;
}

// Types matching backend API response
interface Schedule {
  id: number;
  sexCategory: 'Male' | 'Female';
  weightCategory: string;
  startTime: string;
  endTime: string;
}

interface ScheduleGroupedByDate {
  date: string;
  schedules: Schedule[];
}

// API URL
const API_URL = import.meta.env.VITE_API_URL || '';

// Format date to Spanish locale
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

// Parse time string (HH:mm) to display format
const formatTime = (timeStr: string): string => {
  return timeStr.substring(0, 5);
};

/**
 * Background Image - Same style as WeightCategoriesSection
 */
const BackgroundImage: FC<{ src: string }> = ({ src }) => {
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform rotate-3"
      data-ui="background-image-container"
      aria-hidden
      style={{
        width: 'clamp(300px, 50vw, 600px)',
      }}
    >
      <div
        className="relative overflow-hidden rounded-lg"
        data-ui="background-image-wrapper"
        style={{
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
          maskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
        }}
      >
        <div
          className="absolute -inset-2 bg-gradient-to-br from-dark-red/40 via-red-accent/20 to-dark-red/30 rounded-lg blur-md"
          data-ui="background-image-glow"
          aria-hidden
        />
        <img
          src={src}
          alt=""
          className="w-full h-auto object-cover"
          data-ui="background-image"
          style={{
            filter: 'contrast(1.05) saturate(0.85) brightness(0.7)',
          }}
          loading="eager"
          decoding="async"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          data-ui="background-image-edge-fade"
          style={{
            background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
          }}
          aria-hidden
        />
      </div>
    </div>
  );
};

/**
 * Loading Skeleton
 */
const LoadingSkeleton: FC = () => {
  return (
    <div className="space-y-8" data-ui="loading-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={`skeleton-${i}`} className="space-y-4" data-ui={`skeleton-date-${i}`}>
          <div
            className="h-8 w-48 rounded shimmer-line"
            data-ui={`skeleton-date-header-${i}`}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
            }}
          />
          <div className="space-y-2" data-ui="skeleton-rows">
            {[1, 2, 3].map((j) => (
              <div
                key={`skeleton-row-${i}-${j}`}
                className="h-12 rounded-lg shimmer-line"
                data-ui={`skeleton-row-${i}-${j}`}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <style>{`
        .shimmer-line {
          animation: shimmerPulse 1.5s ease-in-out infinite;
        }
        @keyframes shimmerPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

/**
 * Empty State
 */
const EmptyState: FC = () => {
  return (
    <div
      className="flex flex-col items-center justify-center py-16"
      data-ui="empty-state"
    >
      <CalendarClock
        className="w-16 h-16 mb-6"
        data-ui="empty-icon"
        style={{
          color: 'rgba(220, 20, 60, 1)',
          strokeWidth: 1.5,
        }}
      />
      <div
        className="text-2xl md:text-3xl mb-4"
        data-ui="empty-title"
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
        data-ui="empty-subtitle"
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

/**
 * Schedule Row Component
 */
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
      className="grid grid-cols-[minmax(0,1fr)_max-content] min-[640px]:grid-cols-[max-content_2fr_auto] gap-x-4 gap-y-2 min-[640px]:gap-y-0 py-3 px-4"
      data-ui="schedule-row"
      style={{
        borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Sex + Weight stacked on mobile, side-by-side on sm+ */}
      <div className="flex flex-col min-[640px]:contents" data-ui="row-category">
        {/* Sex Category */}
        <div className="flex items-center gap-2" data-ui="row-sex">
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
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
              lineHeight: '1.2',
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
              lineHeight: '1.2',
            }}
          >
            {weightDisplay}
          </span>
        </div>
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

/**
 * Date Block Component
 */
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
      data-ui="date-block"
      data-date={date}
    >
      {/* Date Header */}
      <div
        className="mb-4"
        data-ui="date-header"
      >
        <h3
          className="text-xl md:text-2xl lg:text-3xl"
          data-ui="date-title"
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
          data-ui="date-underline"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
          }}
        />
      </div>

      {/* Table Header */}
      <div
        className="grid grid-cols-[minmax(0,1fr)_max-content] min-[640px]:grid-cols-3 gap-x-4 gap-y-2 min-[640px]:gap-y-0 py-2 px-4 mb-2"
        data-ui="table-header"
      >
        <span
          className="text-xs md:text-sm uppercase"
          data-ui="header-sex"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: 'rgba(220, 20, 60, 0.7)',
            letterSpacing: '0.1em',
          }}
        >
          Categoría
        </span>
        <span
          className="hidden min-[640px]:flex text-xs md:text-sm uppercase"
          data-ui="header-weight"
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
          data-ui="header-time"
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
        data-ui="table-body"
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

/**
 * SchedulesSection Component
 */
export const SchedulesSection: FC<SchedulesSectionProps> = ({ className = '' }) => {
  const [schedules, setSchedules] = useState<ScheduleGroupedByDate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(true);
  const bgImageSrc = useCdnImage('https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2023%20mar%202026%2C%2000_43_58.png');

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        // Check if schedules are published
        const pubResp = await fetch(`${API_URL}/api/schedules/published`);
        if (pubResp.ok) {
          const pubData = await pubResp.json();
          setIsPublished(pubData.published);
          if (!pubData.published) {
            setIsLoading(false);
            return;
          }
        }

        const response = await fetch(`${API_URL}/api/schedules`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSchedules(data);
      } catch {
        // Silent fail - show empty state
        setSchedules([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedules();
  }, []);

  const headerStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.05em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
  };

  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{
        minHeight: '80vh',
        background: '#0a0a0a',
        paddingTop: '40px',
        paddingBottom: '120px',
      }}
      id="schedules"
      data-section="schedules"
      data-ui="schedules-section"
    >
      {/* Background Image - only show when there are schedules */}
      {!isLoading && schedules.length > 0 && <BackgroundImage src={bgImageSrc} />}

      {/* Semi-opacity dark overlay - darker for new image */}
      <div
        className="absolute inset-0 pointer-events-none"
        data-ui="section-dark-overlay"
        style={{ zIndex: 1, background: 'rgba(10, 10, 10, 0.75)' }}
        aria-hidden
      />

      {/* Fade overlay - Top */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        data-ui="fade-overlay-top"
        style={{ zIndex: 5, background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Fade overlay - Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        data-ui="fade-overlay-bottom"
        style={{ zIndex: 5, background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Fade overlay - Left */}
      <div
        className="absolute top-0 bottom-0 left-0 w-24 md:w-32 pointer-events-none"
        data-ui="fade-overlay-left"
        style={{ zIndex: 5, background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Fade overlay - Right */}
      <div
        className="absolute top-0 bottom-0 right-0 w-24 md:w-32 pointer-events-none"
        data-ui="fade-overlay-right"
        style={{ zIndex: 5, background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Content Container */}
      <div className="relative z-20 max-w-5xl mx-auto px-8 md:px-16 lg:px-24" data-ui="section-content">

        {/* Section Header */}
        <div
          className="text-center mb-16"
          data-ui="section-header"
        >
          <h2
            className="text-3xl md:text-4xl lg:text-5xl"
            data-ui="section-title"
            style={headerStyle}
          >
            Horarios
          </h2>
          {/* Subtle underline */}
          <div
            className="mt-4 mx-auto w-24 h-px"
            data-ui="section-underline"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)',
            }}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : !isPublished || schedules.length === 0 ? (
          <EmptyState />
        ) : (
          <div data-ui="schedules-list">
            {schedules.map((group) => (
              <DateBlock
                key={group.date}
                date={group.date}
                schedules={group.schedules}
              />
            ))}
          </div>
        )}
      </div>

      {/* Background glow effects */}
      <div
        className="absolute top-1/3 left-1/4 w-96 h-96 bg-red-accent/3 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-left"
        aria-hidden
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-dark-red/4 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-right"
        aria-hidden
      />
    </section>
  );
};

export default SchedulesSection;
