import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { FrameConfig, generateFrameUrls } from '@utils/frameSources';

// Test log - should appear immediately when this module loads
window.console.log('[FramePreloader] Module loaded');

export interface UseFramePreloaderOptions {
  /**
   * Frame source configuration (local or CDN)
   */
  frameSource: FrameConfig;
  /**
   * Number of frames to load in parallel (lower on mobile)
   * Default: 10
   */
  priorityBatchSize?: number;
  /**
   * Number of frames to load in parallel for background batch
   * Default: 6 (lower for mobile to prevent memory issues)
   */
  backgroundBatchSize?: number;
  /**
   * Delay between background batches in ms
   * Default: 50ms (gives GC time to clean up)
   */
  backgroundBatchDelay?: number;
}

export interface FramePreloaderResult {
  frames: HTMLImageElement[];
  loadedCount: number;
  totalFrames: number;
  isLoading: boolean;
  loadProgress: number;
  error: Error | null;
  getFrame?: (index: number) => HTMLImageElement | null;
}

/**
 * Creates a stable key from frameSource config for dependency comparison
 */
function getFrameSourceKey(config: FrameConfig): string {
  if (config.source === 'cdn') {
    return `cdn:${config.baseUrl}:${config.startFrame}:${config.endFrame}:${config.order}`;
  }
  return `local:${config.path}:${config.startFrame}:${config.endFrame}`;
}

/**
 * Custom hook to preload image frames for animation.
 *
 * Images are loaded directly from CDN URLs - browser HTTP cache handles
 * the actual data caching. We just manage Image objects in memory.
 *
 * @param options - Configuration options including frameSource
 * @returns Object containing frames array and loading state
 */
export function useFramePreloader(
  options: UseFramePreloaderOptions
): FramePreloaderResult {
  const {
    frameSource,
    priorityBatchSize = 10,
    backgroundBatchSize = 6, // Lower default for mobile
    backgroundBatchDelay = 50, // 50ms delay between batches for GC
  } = options;

  // Create stable key for frameSource to prevent infinite loops
  const frameSourceKey = getFrameSourceKey(frameSource);

  // Memoize URLs based on stable key
  const frameUrls = useMemo(() => generateFrameUrls(frameSource), [frameSourceKey]);
  const totalFrames = frameUrls.length;

  const [frames, setFrames] = useState<HTMLImageElement[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const framesRef = useRef<HTMLImageElement[]>([]);
  const isCancelledRef = useRef(false);

  // Debug logging
  const logMemory = useCallback((context: string, extra?: Record<string, unknown>) => {
    const prefix = '[FramePreloader:' + context + ']';
    const data = {
      framesInMemory: framesRef.current.length,
      totalFrames,
      ...extra,
    };

    const logFn = (context.includes('ERROR') || context.includes('WARN'))
      ? window.console.error.bind(window.console)
      : window.console.log.bind(window.console);
    logFn(prefix, data);
  }, [totalFrames]);

  useEffect(() => {
    isCancelledRef.current = false;
    framesRef.current = [];
    setFrames([]);
    setLoadedCount(0);
    setAttemptedCount(0);
    setIsLoading(true);
    setError(null);

    logMemory('START');

    const urls = frameUrls;
    const total = urls.length;

    // Load a single frame as Image element
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load frame: ${url}`));
        img.crossOrigin = 'anonymous';
        img.src = url;
      });
    };

    const loadFrames = async () => {
      try {
        // 1. Load priority frames first (needed for immediate display)
        const priorityCount = Math.min(priorityBatchSize, total);
        const priorityPromises: Promise<HTMLImageElement>[] = [];

        for (let i = 0; i < priorityCount; i++) {
          priorityPromises.push(loadImage(urls[i]));
        }

        const priorityResults = await Promise.allSettled(priorityPromises);
        const priorityFrames = priorityResults
          .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
          .map(r => r.value);

        if (isCancelledRef.current) return;

        framesRef.current = [...priorityFrames];
        setFrames([...priorityFrames]);
        setLoadedCount(priorityFrames.length);
        setAttemptedCount(priorityCount);

        logMemory('PRIORITY_LOADED', { loaded: priorityFrames.length });

        // If these are all the frames, we're done
        if (priorityCount >= total) {
          setIsLoading(false);
          logMemory('COMPLETE');
          return;
        }

        // 2. Background load remaining frames with throttling
        const remainingUrls = urls.slice(priorityCount);

        const loadBackground = async () => {
          for (let i = 0; i < remainingUrls.length; i += backgroundBatchSize) {
            if (isCancelledRef.current) return;

            const batchPromises: Promise<HTMLImageElement>[] = [];
            const endIndex = Math.min(i + backgroundBatchSize, remainingUrls.length);

            for (let j = i; j < endIndex; j++) {
              batchPromises.push(loadImage(remainingUrls[j]));
            }

            const batchResults = await Promise.allSettled(batchPromises);
            const batchFrames = batchResults
              .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
              .map(r => r.value);

            if (isCancelledRef.current) return;

            // Add to array (sparse array for memory efficiency)
            const startIdx = priorityCount + i;
            for (let k = 0; k < batchFrames.length; k++) {
              framesRef.current[startIdx + k] = batchFrames[k];
            }

            setAttemptedCount(prev => prev + batchFrames.length);
            setLoadedCount(framesRef.current.filter(Boolean).length);
            setFrames([...framesRef.current]);

            logMemory('BATCH_LOADED', {
              batchEnd: endIndex,
              totalLoaded: framesRef.current.filter(Boolean).length
            });

            // Delay between batches - gives browser GC time
            if (endIndex < remainingUrls.length && backgroundBatchDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, backgroundBatchDelay));
            }
          }

          if (!isCancelledRef.current) {
            setIsLoading(false);
            logMemory('COMPLETE');
          }
        };

        // Start background loading on next paint — non-blocking
        requestAnimationFrame(() => loadBackground());
      } catch (err) {
        if (!isCancelledRef.current) {
          setError(err instanceof Error ? err : new Error('Unknown error loading frames'));
          setIsLoading(false);
          logMemory('ERROR', { message: err instanceof Error ? err.message : 'Unknown error' });
        }
      }
    };

    loadFrames();

    const cleanup = () => {
      isCancelledRef.current = true;
      logMemory('CLEANUP', { framesCleared: framesRef.current.length });
      framesRef.current = [];
    };

    return cleanup;
  }, [frameSourceKey, frameUrls, priorityBatchSize, backgroundBatchSize, backgroundBatchDelay, logMemory]);

  const loadProgress = totalFrames > 0 ? attemptedCount / totalFrames : 0;

  // Get frame by index
  const getFrame = useCallback((index: number): HTMLImageElement | null => {
    if (index < 0 || index >= framesRef.current.length) {
      return null;
    }
    return framesRef.current[index] ?? null;
  }, []);

  return {
    frames,
    loadedCount,
    totalFrames,
    isLoading,
    loadProgress,
    error,
    getFrame,
  };
}
