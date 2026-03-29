import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseScrollMotionOptions {
  /** Initial direction for the animation: 'up', 'down', 'left', 'right' */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Distance in pixels to animate from */
  distance?: number;
  /** Duration of enter animation in ms */
  enterDuration?: number;
  /** Duration of exit animation in ms */
  exitDuration?: number;
  /** Whether to trigger only once (stay visible after first enter) */
  triggerOnce?: boolean;
  /** Easing function name */
  easing?: string;
  /** Initial visibility state */
  initialVisible?: boolean;
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Threshold for intersection */
  threshold?: number;
}

export interface ScrollMotionState {
  opacity: number;
  transform: string;
}

export interface UseScrollMotionReturn {
  /** Ref callback to attach to the element */
  ref: (node: HTMLDivElement | null) => void;
  /** Whether the element is currently visible/animating in */
  isVisible: boolean;
  /** Whether the element has been intersected at least once */
  hasEntered: boolean;
  /** Current animation state for direct use */
  motionState: ScrollMotionState;
  /** Reset to re-trigger the animation */
  reset: () => void;
}

/**
 * Custom hook for scroll-triggered fade and movement animations
 * Uses Intersection Observer for enter/exit detection with configurable
 * slide directions and distances.
 * 
 * @param options - Configuration options for the animation
 * @returns Object with ref callback and animation state
 */
export function useScrollMotion(
  options: UseScrollMotionOptions = {}
): UseScrollMotionReturn {
  const {
    direction = 'up',
    distance = 50,
    enterDuration = 600,
    exitDuration = 400,
    triggerOnce = false,
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
    initialVisible = false,
    rootMargin = '-50px',
    threshold = 0,
  } = options;

  const [isVisible, setIsVisible] = useState(initialVisible);
  const [hasEntered, setHasEntered] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredRef = useRef(false);

  // Calculate transform offset based on direction
  const getOffset = useCallback((multiplier: number) => {
    const offset = distance * multiplier;
    switch (direction) {
      case 'up':
        return `translateY(${offset}px)`;
      case 'down':
        return `translateY(${-offset}px)`;
      case 'left':
        return `translateX(${offset}px)`;
      case 'right':
        return `translateX(${-offset}px)`;
      default:
        return `translateY(${offset}px)`;
    }
  }, [direction, distance]);

  // Calculate current motion state
  const getMotionState = useCallback((visible: boolean, entered: boolean): ScrollMotionState => {
    // Check for reduced motion preference
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return { opacity: 1, transform: 'none' };
    }

    if (visible || (triggerOnce && entered)) {
      return { opacity: 1, transform: 'none' };
    }

    return { opacity: 0, transform: getOffset(1) };
  }, [getOffset, triggerOnce]);

  const [motionState, setMotionState] = useState<ScrollMotionState>(() =>
    getMotionState(initialVisible, false)
  );

  // Reset function
  const reset = useCallback(() => {
    if (triggerOnce) return; // Can't reset if triggerOnce is enabled
    hasTriggeredRef.current = false;
    setHasEntered(false);
    setIsVisible(false);
    setMotionState({ opacity: 0, transform: getOffset(1) });
  }, [triggerOnce, getOffset]);

  // Intersection Observer effect
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasIntersecting = entry.isIntersecting;
        const intersectionRatio = entry.intersectionRatio;

        // Check if within threshold
        const meetsThreshold = threshold === 0 || intersectionRatio >= threshold;

        if (wasIntersecting && meetsThreshold) {
          // Element entered viewport
          setIsVisible(true);
          if (!hasTriggeredRef.current) {
            setHasEntered(true);
            hasTriggeredRef.current = true;
          }
        } else if (!triggerOnce) {
          // Element exited viewport (only if not triggerOnce)
          setIsVisible(false);
        }
      },
      {
        root: null,
        rootMargin,
        threshold: [0, threshold].filter((v, i, arr) => v !== arr[i - 1] || i === 0),
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold, triggerOnce]);

  // Animate state changes
  useEffect(() => {
    const targetState = getMotionState(isVisible, hasEntered);

    setMotionState(targetState);

    // If element needs animation, apply inline styles for smooth transition
    const element = elementRef.current;
    if (element) {
      const duration = isVisible ? enterDuration : exitDuration;
      element.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;
    }
  }, [isVisible, hasEntered, enterDuration, exitDuration, easing, getMotionState]);

  // Ref callback
  const ref = useCallback((node: HTMLDivElement | null) => {
    elementRef.current = node;
  }, []);

  return {
    ref,
    isVisible,
    hasEntered,
    motionState,
    reset,
  };
}

export default useScrollMotion;
