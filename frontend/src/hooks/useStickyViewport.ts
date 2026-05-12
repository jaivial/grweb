import { useEffect, useRef, useState } from 'react';

interface UseStickyViewportOptions {
  containerId: string;
  isMobileBreakpoint?: number;
}

interface UseStickyViewportReturn {
  viewportStyle: React.CSSProperties;
  viewportClassName: string;
  isFixed: boolean;
}

export function useStickyViewport({
  containerId,
  isMobileBreakpoint = 768,
}: UseStickyViewportOptions): UseStickyViewportReturn {
  const [isFixed, setIsFixed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${isMobileBreakpoint - 1}px)`);
    const checkMobile = () => {
      setIsMobile(mql.matches);
    };
    checkMobile();
    mql.addEventListener('change', checkMobile);
    return () => mql.removeEventListener('change', checkMobile);
  }, [isMobileBreakpoint]);

  useEffect(() => {
    if (!isMobile || prefersReducedMotion.current) return;

    const container = document.getElementById(containerId);
    if (!container) return;
    containerRef.current = container;

    const onScroll = () => {
      const rect = container.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const isInSection = rect.top <= 0 && rect.bottom >= viewportH;
      setIsFixed(isInSection);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [containerId, isMobile]);

  const viewportClassName = isMobile && isFixed
    ? 'fixed top-0 left-0 right-0 h-screen overflow-hidden transition-opacity duration-500'
    : 'sticky top-0 h-screen overflow-hidden transition-opacity duration-500';

  const viewportStyle: React.CSSProperties = isMobile && isFixed
    ? { position: 'fixed', top: 0, left: 0, right: 0, height: '100vh', zIndex: 1, willChange: 'transform' }
    : { willChange: 'transform' };

  return { viewportStyle, viewportClassName, isFixed };
}
