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
  /**
   * CSS selector or element ref for the section to track
   * If not provided, uses totalVh to calculate based on scroll position
   */
  sectionSelector?: string;
  /**
   * Section ID for identifying this scroll section
   * Used when multiple sections need independent tracking
   */
  sectionId?: string;
}

export interface ScrollProgressResult {
  progress: number; // 0 to 1
  scrollY: number;
  direction: 'up' | 'down' | null;
  sectionTop: number;
  sectionBottom: number;
  sectionHeight: number;
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
    sectionSelector,
  } = options;

  const [progress, setProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const [sectionTop, setSectionTop] = useState(0);
  const [sectionBottom, setSectionBottom] = useState(0);
  const [sectionHeight, setSectionHeight] = useState(0);

  const lastScrollYRef = useRef(0);
  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const sectionBoundsRef = useRef({ sectionTopPosition: 0, sectionHeight: 0 });

  // Calculate section boundaries - stores in ref for immediate access
  const updateSectionBounds = useCallback(() => {
    let sectionTopPosition = 0;
    let sectionHeightValue: number;

    if (sectionSelector) {
      // Find the section element and use its actual position
      const sectionEl = document.querySelector(sectionSelector) as HTMLElement | null;
      if (sectionEl) {
        sectionTopPosition = sectionEl.offsetTop;
        sectionHeightValue = sectionEl.offsetHeight;
        
        // Store in ref for immediate access during scroll
        sectionBoundsRef.current = { sectionTopPosition, sectionHeight: sectionHeightValue };
        
        // Update state for UI purposes
        setSectionTop(sectionTopPosition);
        setSectionBottom(sectionTopPosition + sectionHeightValue);
        setSectionHeight(sectionHeightValue);
        
        return { sectionTopPosition, sectionHeight: sectionHeightValue };
      } else {
        // Fallback to calculated height
        const vh = window.innerHeight;
        sectionHeightValue = vh * (totalVh / 100);
        sectionBoundsRef.current = { sectionTopPosition: 0, sectionHeight: sectionHeightValue };
        return sectionBoundsRef.current;
      }
    } else {
      // Original behavior: assume section starts at page top
      const vh = window.innerHeight;
      sectionHeightValue = vh * (totalVh / 100);
      sectionBoundsRef.current = { sectionTopPosition: 0, sectionHeight: sectionHeightValue };
      return sectionBoundsRef.current;
    }
  }, [totalVh, sectionSelector]);

  // Update progress based on scroll position - uses ref for immediate values
  const updateProgress = useCallback(() => {
    const currentScrollY = window.scrollY;
    
    // Use ref values for immediate access (no stale closures)
    const { sectionTopPosition, sectionHeight } = sectionBoundsRef.current;

    // Determine scroll direction
    if (currentScrollY > lastScrollYRef.current) {
      setDirection('down');
    } else if (currentScrollY < lastScrollYRef.current) {
      setDirection('up');
    }

    lastScrollYRef.current = currentScrollY;
    setScrollY(currentScrollY);

    // Handle edge case where sectionHeight is 0
    if (sectionHeight <= 0) {
      return;
    }

    // Calculate progress (0 to 1) within the section
    const scrollWithinSection = currentScrollY - sectionTopPosition;
    let normalizedProgress = scrollWithinSection / sectionHeight;

    // Clamp progress between 0 and 1
    normalizedProgress = Math.max(0, Math.min(1, normalizedProgress));

    // Store target and update current
    targetProgressRef.current = normalizedProgress;
    
    if (!smooth) {
      currentProgressRef.current = normalizedProgress;
      setProgress(normalizedProgress);
    }
  }, [smooth]);

  // Smooth animation loop - uses refs for immediate values
  const animateSmoothProgress = useCallback(() => {
    const target = targetProgressRef.current;
    const current = currentProgressRef.current;
    const diff = target - current;

    if (Math.abs(diff) > 0.0001) {
      currentProgressRef.current += diff * smoothFactor;
      setProgress(currentProgressRef.current);
      rafIdRef.current = requestAnimationFrame(animateSmoothProgress);
    } else {
      currentProgressRef.current = target;
      setProgress(target);
      rafIdRef.current = null;
    }
  }, [smoothFactor]);

  // Scroll event handler
  const handleScroll = useCallback(() => {
    updateProgress();

    if (smooth && !rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(animateSmoothProgress);
    }
  }, [updateProgress, smooth, animateSmoothProgress]);

  // Setup scroll listener
  useEffect(() => {
    // Initialize bounds
    updateSectionBounds();

    // Initial progress calculation
    updateProgress();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', () => {
      updateSectionBounds();
      updateProgress();
    }, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateSectionBounds);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [handleScroll, updateSectionBounds, updateProgress]);

  return {
    progress,
    scrollY,
    direction,
    sectionTop,
    sectionBottom,
    sectionHeight,
  };
}
