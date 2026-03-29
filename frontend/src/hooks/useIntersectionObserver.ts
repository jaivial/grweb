import { useEffect, useRef, useState } from 'react';

export interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export interface IntersectionObserverResult {
  ref: (node: Element | null) => void;
  isIntersecting: boolean;
  intersectionRatio: number;
  entry: IntersectionObserverEntry | null;
}

/**
 * Custom hook for Intersection Observer API
 * Used to detect when elements enter/exit the viewport
 * 
 * @param options - Intersection Observer configuration
 * @returns Object containing ref callback and intersection state
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): IntersectionObserverResult {
  const {
    threshold = 0.02, // Default to 2% (98% out of view)
    root = null,
    rootMargin = '0px',
    triggerOnce = false,
  } = options;

  const [isIntersecting, setIsIntersecting] = useState(false);
  const [intersectionRatio, setIntersectionRatio] = useState(0);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const elementRef = useRef<Element | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // If triggerOnce is true and already triggered, don't observe again
    if (triggerOnce && hasTriggeredRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (triggerOnce && hasTriggeredRef.current) return;

        setIsIntersecting(entry.isIntersecting);
        setIntersectionRatio(entry.intersectionRatio);
        setEntry(entry);

        if (entry.isIntersecting && triggerOnce) {
          hasTriggeredRef.current = true;
        }
      },
      {
        threshold,
        root,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, triggerOnce]);

  const ref = (node: Element | null) => {
    elementRef.current = node;
  };

  return {
    ref,
    isIntersecting,
    intersectionRatio,
    entry,
  };
}
