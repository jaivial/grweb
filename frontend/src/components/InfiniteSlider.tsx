import { useEffect, useRef, useState, useCallback, useMemo, FC } from 'react';
import { useCdnImage } from '@hooks/useCdnImage';

export interface SliderImage {
  src: string;
  alt?: string;
  href?: string;
  title?: string;
}

export interface InfiniteSliderProps {
  images: SliderImage[];
  speed?: number;
  direction?: 'left' | 'right';
  height?: number;
  gap?: number;
  fadeSize?: number;
  fadeColor?: string;
  pauseOnHover?: boolean;
  className?: string;
}

const CdnImg: FC<{ src: string; alt?: string; title?: string; height: number; gap: number }> = ({ src, alt, title, height, gap }) => {
  const resolvedSrc = useCdnImage(src);
  return (
    <img
      src={resolvedSrc}
      alt={alt || ''}
      title={title}
      className="h-full w-auto object-contain select-none pointer-events-none flex-shrink-0"
      style={{ height: `${height}px`, marginRight: `${gap}px` }}
      loading="eager"
      decoding="async"
      draggable={false}
      data-ui="slider-cdn-img"
    />
  );
};

export const InfiniteSlider: FC<InfiniteSliderProps> = ({
  images,
  speed = 50,
  direction = 'left',
  height = 48,
  gap = 48,
  fadeSize = 60,
  fadeColor = '#0a0a0a',
  pauseOnHover = true,
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [setWidth, setSetWidth] = useState(0);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const measureSet = () => {
      if (!trackRef.current) return;
      const setEl = trackRef.current.querySelector('[data-ui="slider-set-1"]') as HTMLElement;
      if (setEl) {
        setSetWidth(setEl.offsetWidth);
      }
    };

    measureSet();
    window.addEventListener('resize', measureSet);
    return () => window.removeEventListener('resize', measureSet);
  }, [images, gap, height]);

  const duration = useMemo(() => {
    if (setWidth === 0) return '20s';
    const timeInSeconds = setWidth / speed;
    return `${Math.max(5, timeInSeconds)}s`;
  }, [setWidth, speed]);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
  }, []);

  const animationStyle = useMemo(() => ({
    '--slider-duration': duration,
    '--slider-direction': direction === 'left' ? 'normal' : 'reverse',
    '--slider-fade-size': `${fadeSize}px`,
    '--slider-fade-color': fadeColor,
  } as React.CSSProperties), [duration, direction, fadeSize, fadeColor]);

  const renderImage = useCallback((img: SliderImage, index: number) => {
    const content = <CdnImg src={img.src} alt={img.alt} title={img.title} height={height} gap={gap} />;

    if (img.href) {
      return (
        <a
          key={`img-${index}`}
          href={img.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center no-underline hover:opacity-80 transition-opacity"
          data-testid={`slider-link-${index}`}
        >
          {content}
        </a>
      );
    }

    return (
      <div
        key={`img-${index}`}
        className="flex-shrink-0 flex items-center"
        data-ui={`slider-item-${index}`}
      >
        {content}
      </div>
    );
  }, [height, gap]);

  if (images.length === 0) return null;

  const allImages = [...images, ...images];

  return (
    <div
      className={`relative overflow-hidden select-none w-full ${className}`}
      style={animationStyle}
      data-ui="infinite-slider"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-full pointer-events-none z-10"
        style={{
          background: `linear-gradient(to right, var(--slider-fade-color) 0%, transparent 100%)`,
          maxWidth: `${fadeSize}px`,
        }}
        data-ui="slider-fade-left"
        aria-hidden
      />

      <div
        className="absolute right-0 top-0 bottom-0 w-full pointer-events-none z-10"
        style={{
          background: `linear-gradient(to left, var(--slider-fade-color) 0%, transparent 100%)`,
          maxWidth: `${fadeSize}px`,
        }}
        data-ui="slider-fade-right"
        aria-hidden
      />

      <div
        ref={trackRef}
        className="flex items-center"
        data-ui="slider-track"
      >
        <div
          className={`flex items-center slider-animate ${isPaused || prefersReducedMotion ? 'slider-paused' : ''}`}
          data-ui="slider-set-1"
        >
          {allImages.map((img, i) => renderImage(img, i))}
        </div>
      </div>

      <style>{`
        @keyframes sliderScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .slider-animate {
          animation: sliderScroll var(--slider-duration) linear infinite;
          animation-direction: var(--slider-direction);
          will-change: transform;
        }

        .slider-paused {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .slider-animate {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default InfiniteSlider;
