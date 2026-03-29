import { useEffect, useRef, useState, useCallback, useMemo, FC } from 'react';

export interface SliderImage {
  src: string;
  alt?: string;
  caption?: string;
}

export interface AutoRotatingImageSliderProps {
  images: SliderImage[];
  autoRotateInterval?: number;
  pauseOnHover?: boolean;
  showDots?: boolean;
  showCaptions?: boolean;
  height?: number;
  className?: string;
  dataUi?: string;
}

/**
 * AutoRotatingImageSlider - A carousel-style automatic image slider
 * Features:
 * - One image visible at a time with smooth fade transitions
 * - Automatic rotation with configurable interval
 * - Pause on hover support
 * - Navigation dots
 * - Optional captions below each image
 * - Respects prefers-reduced-motion
 */
export const AutoRotatingImageSlider: FC<AutoRotatingImageSliderProps> = ({
  images,
  autoRotateInterval = 4000,
  pauseOnHover = true,
  showDots = true,
  showCaptions = true,
  height = 400,
  className = '',
  dataUi = 'auto-rotating-slider',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Visibility observer to pause when not visible
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setIsPaused(true);
        } else if (!pauseOnHover) {
          setIsPaused(false);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [pauseOnHover]);

  // Navigate to next image
  const goToNext = useCallback(() => {
    if (isTransitioning || images.length <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setTimeout(() => setIsTransitioning(false), 500);
  }, [isTransitioning, images.length]);

  // Navigate to specific image
  const goToIndex = useCallback((index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 500);
  }, [isTransitioning, currentIndex]);

  // Auto-rotation interval
  useEffect(() => {
    if (prefersReducedMotion || isPaused || images.length <= 1) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(goToNext, autoRotateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [prefersReducedMotion, isPaused, autoRotateInterval, goToNext, images.length]);

  // Mouse event handlers
  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  // Preload images
  useEffect(() => {
    let loaded = 0;
    const total = images.length;

    images.forEach((img) => {
      const image = new Image();
      image.onload = () => {
        loaded++;
        if (loaded >= total) setIsLoaded(true);
      };
      image.onerror = () => {
        loaded++;
        if (loaded >= total) setIsLoaded(true);
      };
      image.src = img.src;
    });

    if (total === 0) setIsLoaded(true);
  }, [images]);

  if (images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      data-ui={dataUi}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Image container with fade effect */}
      <div
        className="relative overflow-hidden rounded-lg"
        style={{ height: `${height}px` }}
        data-ui="slider-image-container"
      >
        {/* Placeholder background */}
        {!isLoaded && (
          <div
            className="absolute inset-0 bg-dark-base/50 animate-pulse"
            data-ui="slider-placeholder"
          />
        )}

        {/* Images */}
        <div className="absolute inset-0" data-ui="slider-images-wrapper">
          {images.map((image, index) => (
            <div
              key={`img-${index}`}
              className="absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: index === currentIndex ? 1 : 0,
                zIndex: index === currentIndex ? 1 : 0,
              }}
              data-ui={`slider-image-${index}`}
              aria-hidden={index !== currentIndex}
            >
              <img
                src={image.src}
                alt={image.alt || ''}
                className="w-full h-full object-cover"
                style={{ filter: 'contrast(1.05) saturate(0.9)' }}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                data-ui={`slider-img-${index}`}
              />
              {/* Edge fade overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                data-ui={`slider-edge-fade-${index}`}
                style={{
                  background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
                }}
                aria-hidden
              />
            </div>
          ))}
        </div>

        {/* Dark red glow behind current image */}
        <div
          className="absolute -inset-2 bg-gradient-to-br from-dark-red/20 via-red-accent/10 to-dark-red/20 rounded-lg blur-xl pointer-events-none"
          data-ui="slider-glow"
          aria-hidden
        />
      </div>

      {/* Navigation dots */}
      {showDots && images.length > 1 && (
        <div
          className="flex justify-center gap-3 mt-4"
          data-ui="slider-dots"
          role="tablist"
          aria-label="Image navigation"
        >
          {images.map((_, index) => (
            <button
              key={`dot-${index}`}
              onClick={() => goToIndex(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-red-accent scale-125 shadow-lg shadow-red-accent/50'
                  : 'bg-gray-600 hover:bg-gray-400'
              }`}
              style={{
                backgroundColor: index === currentIndex ? '#DC143C' : undefined,
              }}
              data-ui={`slider-dot-${index}`}
              role="tab"
              aria-selected={index === currentIndex}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Caption */}
      {showCaptions && currentImage?.caption && (
        <div
          className="text-center mt-4 px-4"
          data-ui="slider-caption-container"
        >
          <p
            className="text-sm sm:text-base md:text-lg"
            style={{
              fontFamily: '"Contrail One", sans-serif',
              letterSpacing: '0.02em',
              color: 'rgba(255, 255, 255, 0.9)',
              textTransform: 'uppercase',
              textShadow: '0 0 10px rgba(0, 0, 0, 0.8)',
            }}
            data-ui="slider-caption-text"
          >
            {currentImage.caption}
          </p>
        </div>
      )}

      {/* Paused indicator */}
      {isPaused && images.length > 1 && (
        <div
          className="absolute top-4 right-4 px-3 py-1 bg-dark-base/80 rounded text-xs"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: '#DC143C',
            letterSpacing: '0.05em',
          }}
          data-ui="slider-paused-indicator"
          aria-live="polite"
        >
          PAUSADO
        </div>
      )}
    </div>
  );
};

export default AutoRotatingImageSlider;
