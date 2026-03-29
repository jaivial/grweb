import { useEffect, useRef, useState, useCallback, useMemo, FC } from 'react';

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

/**
 * InfiniteSlider - A custom hand-crafted infinite automatic image slider
 * Features:
 * - Smooth CSS-based infinite scrolling
 * - Automatic direction control
 * - Pause on hover support
 * - Edge fade effects
 * - Respects prefers-reduced-motion
 * - Performance optimized with will-change
 */
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
  const [loaded, setLoaded] = useState(false);
  const [imageCount, setImageCount] = useState(0);

  // Wait for images to load
  useEffect(() => {
    if (!trackRef.current) return;
    
    const imgs = trackRef.current.querySelectorAll('img');
    if (imgs.length === 0) {
      setLoaded(true);
      setImageCount(images.length);
      return;
    }

    let remaining = imgs.length;
    const handleLoad = () => {
      remaining--;
      if (remaining === 0) {
        setLoaded(true);
        setImageCount(images.length);
      }
    };

    imgs.forEach((img) => {
      if ((img as HTMLImageElement).complete) {
        handleLoad();
      } else {
        img.addEventListener('load', handleLoad, { once: true });
        img.addEventListener('error', handleLoad, { once: true });
      }
    });

    return () => {
      imgs.forEach((img) => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleLoad);
      });
    };
  }, [images]);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Calculate animation duration based on speed
  const duration = useMemo(() => {
    if (imageCount === 0) return '20s';
    // Speed is pixels per second, calculate time to scroll one set
    const totalWidth = imageCount * (height + gap);
    const timeInSeconds = totalWidth / speed;
    return `${Math.max(10, timeInSeconds)}s`;
  }, [speed, height, gap, imageCount]);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
  }, []);

  const animationStyle = useMemo(() => ({
    '--slider-duration': duration,
    '--slider-direction': direction === 'left' ? 'normal' : 'reverse',
    '--slider-gap': `${gap}px`,
    '--slider-height': `${height}px`,
    '--slider-fade-size': `${fadeSize}px`,
    '--slider-fade-color': fadeColor,
  } as React.CSSProperties), [duration, direction, gap, height, fadeSize, fadeColor]);

  const trackStyle = useMemo(() => ({
    gap: `${gap}px`,
  } as React.CSSProperties), [gap]);

  // Render a single image item
  const renderImage = useCallback((img: SliderImage, index: number) => {
    const content = (
      <img
        src={img.src}
        alt={img.alt || ''}
        title={img.title}
        className="h-full w-auto object-contain select-none pointer-events-none"
        style={{ height: `${height}px` }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );

    if (img.href) {
      return (
        <a
          key={`img-${index}`}
          href={img.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center no-underline hover:opacity-80 transition-opacity"
          data-ui={`slider-link-${index}`}
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
  }, [height]);

  if (images.length === 0) return null;

  return (
    <div
      className={`relative overflow-hidden select-none w-full ${className}`}
      style={animationStyle}
      data-ui="infinite-slider"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-full pointer-events-none z-10"
        style={{
          background: `linear-gradient(to right, var(--slider-fade-color) 0%, transparent 100%)`,
          maxWidth: `${fadeSize}px`,
        }}
        data-ui="slider-fade-left"
        aria-hidden
      />
      
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-0 w-full pointer-events-none z-10"
        style={{
          background: `linear-gradient(to left, var(--slider-fade-color) 0%, transparent 100%)`,
          maxWidth: `${fadeSize}px`,
        }}
        data-ui="slider-fade-right"
        aria-hidden
      />

      {/* Slider track */}
      <div
        ref={trackRef}
        className="flex items-center"
        style={trackStyle}
        data-ui="slider-track"
      >
        {/* First set of images */}
        <div
          className={`flex items-center ${loaded ? 'slider-animate' : ''} ${isPaused || prefersReducedMotion ? 'slider-paused' : ''}`}
          style={trackStyle}
          data-ui="slider-set-1"
        >
          {images.map((img, i) => renderImage(img, i))}
        </div>

        {/* Duplicate set for seamless loop */}
        <div
          className={`flex items-center ${loaded ? 'slider-animate' : ''} ${isPaused || prefersReducedMotion ? 'slider-paused' : ''}`}
          style={trackStyle}
          aria-hidden
          data-ui="slider-set-2"
        >
          {images.map((img, i) => renderImage(img, i + images.length))}
        </div>
      </div>

      {/* CSS for animation - injected once */}
      <style>{`
        @keyframes sliderScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(-50% - (var(--slider-gap) / 2)));
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
