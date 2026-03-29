import { useEffect, useRef, useState, useCallback } from 'react';

export interface UseScrollProgressOptions {
  /**
   * Total height of the scrollable section in vh units
   * Default: 400 (400vh)
   */
  totalVh?: number;
  /**
   * Enable smooth interpolation for scroll values
   * Default: true
   */
  smooth?: boolean;
  /**
   * Smoothing factor (0-1, lower = smoother but more lag)
   * Default: 0.1
   */
  smoothFactor?: number;
}

export interface ScrollProgressResult {
  progress: number; // 0 to 1
  scrollY: number;
  direction: 'up' | 'down' | null;
  sectionTop: number;
  sectionBottom: number;
}

/**
 * Custom hook to track scroll progress within a section
 * Returns normalized progress (0-1) as user scrolls through the section
 * 
 * @param options - Configuration options
 * @returns Object containing scroll progress and related state
 */
export function useScrollProgress(
  options: UseScrollProgressOptions = {}
): ScrollProgressResult {
  const {
    totalVh = 400,
    smooth = true,
    smoothFactor = 0.1,
  } = options;

  const [progress, setProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const [sectionTop, setSectionTop] = useState(0);
  const [sectionBottom, setSectionBottom] = useState(0);

  const lastScrollYRef = useRef(0);
  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  // Calculate section boundaries
  const calculateBoundaries = useCallback(() => {
    const vh = window.innerHeight;
    const sectionHeight = vh * (totalVh / 100);
    const sectionTopPosition = 0; // Assuming section starts at top
    const sectionBottomPosition = sectionHeight;

    setSectionTop(sectionTopPosition);
    setSectionBottom(sectionBottomPosition);

    return { sectionTopPosition, sectionBottomPosition, sectionHeight };
  }, [totalVh]);

  // Update progress based on scroll position
  const updateProgress = useCallback(() => {
    const currentScrollY = window.scrollY;
    const { sectionTopPosition, sectionHeight } = calculateBoundaries();

    // Determine scroll direction
    if (currentScrollY > lastScrollYRef.current) {
      setDirection('down');
    } else if (currentScrollY < lastScrollYRef.current) {
      setDirection('up');
    }

    lastScrollYRef.current = currentScrollY;
    setScrollY(currentScrollY);

    // Calculate progress (0 to 1) within the section
    const scrollWithinSection = currentScrollY - sectionTopPosition;
    let normalizedProgress = scrollWithinSection / sectionHeight;

    // Clamp progress between 0 and 1
    normalizedProgress = Math.max(0, Math.min(1, normalizedProgress));

    if (smooth) {
      targetProgressRef.current = normalizedProgress;
    } else {
      currentProgressRef.current = normalizedProgress;
      setProgress(normalizedProgress);
    }
  }, [calculateBoundaries, smooth]);

  // Smooth animation loop
  const animateSmoothProgress = useCallback(() => {
    const target = targetProgressRef.current;
    const current = currentProgressRef.current;
    const diff = target - current;

    if (Math.abs(diff) > 0.001) {
      currentProgressRef.current += diff * smoothFactor;
      setProgress(currentProgressRef.current);
      rafIdRef.current = requestAnimationFrame(animateSmoothProgress);
    } else {
      currentProgressRef.current = target;
      setProgress(target);
      rafIdRef.current = null;
    }
  }, [smoothFactor]);

  // Scroll event handler with RAF optimization
  const handleScroll = useCallback(() => {
    updateProgress();

    if (smooth && !rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(animateSmoothProgress);
    }
  }, [updateProgress, smooth, animateSmoothProgress]);

  // Setup scroll listener
  useEffect(() => {
    calculateBoundaries();
    updateProgress();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', calculateBoundaries);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', calculateBoundaries);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [handleScroll, calculateBoundaries, updateProgress]);

  return {
    progress,
    scrollY,
    direction,
    sectionTop,
    sectionBottom,
  };
}
