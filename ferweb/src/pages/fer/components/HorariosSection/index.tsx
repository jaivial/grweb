import { useMemo, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { FER_COLORS } from '../../constants';
import { useSchedules, useReducedMotion } from './hooks';
import { SectionHeader, LoadingSkeleton, EmptyState, DateBlock } from './components';

export function HorariosSection() {
  const { schedules, isLoading, isPublished } = useSchedules();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const timelineProgress = useTransform(
    scrollYProgress,
    prefersReducedMotion ? [0, 0.1] : [0.1, 0.5],
    prefersReducedMotion ? [1, 1] : [0, 1]
  );

  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15, delayChildren: 0.2 },
      },
    }),
    []
  );

  const content = useMemo(() => {
    if (isLoading) return <LoadingSkeleton />;
    if (!isPublished || schedules.length === 0) return <EmptyState />;
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        data-ui="horarios-schedules-list"
      >
        {schedules.map((group, i) => (
          <DateBlock
            key={group.date}
            group={group}
            index={i}
            isLast={i === schedules.length - 1}
            timelineProgress={timelineProgress}
          />
        ))}
      </motion.div>
    );
  }, [isLoading, isPublished, schedules, containerVariants, timelineProgress]);

  return (
    <section
      ref={containerRef}
      className="relative py-20 sm:py-28 px-4 overflow-hidden"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="horarios-section"
    >
      {/* Dot grid background texture */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${FER_COLORS.text} 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
        data-ui="horarios-section-grid"
      />

      {/* Subtle radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse, ${FER_COLORS.gold}08 0%, transparent 65%)`,
        }}
        aria-hidden="true"
        data-ui="horarios-section-glow"
      />

      <div className="max-w-6xl mx-auto relative z-10" data-ui="horarios-section-container">
        <SectionHeader />
        {content}
      </div>
    </section>
  );
}

export default HorariosSection;
