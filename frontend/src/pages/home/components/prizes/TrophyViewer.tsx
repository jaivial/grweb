import { Suspense, lazy, memo, useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { useIntersectionObserver } from '@hooks/useIntersectionObserver';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { getMedalFallbackReason } from '@components/medals/medalCapability';
import { createLogger } from '@utils/logger';
import { TROPHY_FALLBACK_IMAGE, TROPHY_GLB } from './medals.config';

const TrophyCanvas = lazy(() => import('./TrophyCanvas'));
const log = createLogger('trophy');

export interface TrophyViewerProps {
  /** Accessible description of the trophy (the canvas itself is aria-hidden). */
  alt: string;
  dataUi: string;
}

/**
 * Rotating 3D trophy (GLB, ~12 s per turn, no controls). The front render is shown while the
 * chunk/GLB load and stays if WebGL is missing, save-data / low-end devices, or the GLB fails.
 * One light canvas per card, mounted only once near the viewport and rendering only while visible
 * (frameloop 'never' otherwise); with prefers-reduced-motion it draws a fixed pose.
 */
export const TrophyViewer = memo(function TrophyViewer({ alt, dataUi }: TrophyViewerProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Reduced motion keeps the 3D pose; only WebGL/save-data/low-end gate the canvas.
  const fallbackReason = useMemo(() => getMedalFallbackReason(false), []);
  const near = useIntersectionObserver({ rootMargin: '100% 0px', threshold: 0, triggerOnce: true });
  const visible = useIntersectionObserver({ threshold: 0 });
  const { ref: nearRef } = near;
  const { ref: visibleRef } = visible;
  const setRef = useCallback((node: Element | null) => {
    nearRef(node);
    visibleRef(node);
  }, [nearRef, visibleRef]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback((error: Error) => {
    log.warn('3D trophy failed, static fallback', error);
    setFailed(true);
  }, []);

  const useCanvas = !fallbackReason && !failed && near.isIntersecting;
  const showImage = !useCanvas || !ready;

  return (
    <div ref={setRef} className="relative h-full w-full" data-ui={dataUi} data-mode={useCanvas ? (ready ? '3d' : '3d-loading') : 'static'}>
      {useCanvas && (
        <div className="absolute inset-0" data-ui={`${dataUi}-canvas-wrapper`}>
          <ErrorBoundary fallback={null} onError={handleError}>
            <Suspense fallback={null}>
              <TrophyCanvas url={TROPHY_GLB} active={visible.isIntersecting} spin={!reducedMotion} onReady={handleReady} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      <img
        src={TROPHY_FALLBACK_IMAGE}
        alt={alt}
        className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300 motion-reduce:transition-none ${showImage ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-ui={`${dataUi}-fallback-image`}
      />
    </div>
  );
});
