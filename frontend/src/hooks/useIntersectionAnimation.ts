import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

export interface UseIntersectionAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export interface UseIntersectionAnimationReturn {
  ref: RefObject<HTMLElement | null>;
  isVisible: boolean;
  hasBeenVisible: boolean;
}

/**
 * Hook for triggering animations when an element enters the viewport
 * using Intersection Observer API.
 */
export function useIntersectionAnimation(
  options: UseIntersectionAnimationOptions = {}
): UseIntersectionAnimationReturn {
  const { threshold = 0.1, rootMargin = '0px', triggerOnce = true } = options;
  
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    const visible = entry.intersectionRatio >= threshold;
    
    setIsVisible(visible);
    
    if (visible && !hasBeenVisible) {
      setHasBeenVisible(true);
    }
    
    // If not triggerOnce, toggle visibility based on intersection
    if (!triggerOnce) {
      setIsVisible(visible);
    }
  }, [threshold, triggerOnce, hasBeenVisible]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleIntersection, {
      threshold: Array.from({ length: 11 }, (_, i) => i / 10),
      rootMargin,
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersection, rootMargin]);

  return { ref: ref as RefObject<HTMLElement | null>, isVisible, hasBeenVisible };
}

/**
 * Hook for staggered animation of child elements
 */
export function useStaggeredIntersection(
  itemCount: number,
  options: UseIntersectionAnimationOptions & { staggerDelay?: number } = {}
): UseStaggeredIntersectionReturn {
  const { threshold = 0.1, rootMargin = '0px', staggerDelay = 100, triggerOnce = true } = options;
  
  const containerRef = useRef<HTMLElement | null>(null);
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const [containerVisible, setContainerVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setContainerVisible(entry.isIntersecting);
        
        if (entry.isIntersecting && triggerOnce) {
          // Trigger staggered animation
          const timers: NodeJS.Timeout[] = [];
          for (let i = 0; i < itemCount; i++) {
            const timer = setTimeout(() => {
              setVisibleItems(prev => new Set([...prev, i]));
            }, i * staggerDelay);
            timers.push(timer);
          }
          
          // Disconnect after triggering if triggerOnce
          observer.disconnect();
          
          return () => timers.forEach(clearTimeout);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(container);

    return () => observer.disconnect();
  }, [itemCount, staggerDelay, threshold, rootMargin, triggerOnce]);

  return { 
    containerRef: containerRef as RefObject<HTMLElement | null>, 
    visibleItems,
    containerVisible 
  };
}

export interface UseStaggeredIntersectionReturn {
  containerRef: RefObject<HTMLElement | null>;
  visibleItems: Set<number>;
  containerVisible: boolean;
}
