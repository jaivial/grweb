import { useState, useEffect, useRef, useCallback } from 'react';

interface UseNavbarVisibilityResult {
  isVisible: boolean;
}

export function useNavbarVisibility(heroId: string): UseNavbarVisibilityResult {
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry) {
        setIsVisible(entry.intersectionRatio < 0.2);
      }
    },
    []
  );

  useEffect(() => {
    if (!heroId) return;

    const tryObserve = () => {
      const element = document.getElementById(heroId);
      if (!element) {
        timeoutRef.current = window.setTimeout(tryObserve, 150);
        return;
      }

      observerRef.current = new IntersectionObserver(handleIntersection, {
        threshold: [0.2],
      });

      observerRef.current.observe(element);
    };

    tryObserve();

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      observerRef.current?.disconnect();
    };
  }, [heroId, handleIntersection]);

  return { isVisible };
}
