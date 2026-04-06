import { useEffect, useState, useRef, useMemo } from 'react';
import { FrameConfig, generateFrameUrls } from '@utils/frameSources';

export interface UseFramePreloaderOptions {
  /**
   * Frame source configuration (local or CDN)
   */
  frameSource: FrameConfig;
  /**
   * Number of frames to load in parallel for priority batch
   * Default: 10
   */
  priorityBatchSize?: number;
  /**
   * Number of frames to load in parallel for background batch
   * Default: 32
   */
  backgroundBatchSize?: number;
  /**
   * Delay between background batches in ms (0 = no delay)
   * Default: 0
   */
  backgroundBatchDelay?: number;
}

export interface FramePreloaderResult {
  frames: HTMLImageElement[];
  loadedCount: number;
  totalFrames: number;
  isLoading: boolean;
  loadProgress: number; // 0 to 1
  error: Error | null;
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
 * Strategy:
 * 1. Priority batch: load via Image() elements — these display immediately but
 *    DON'T block the browser load event (only ~10 elements = negligible impact).
 * 2. Background batch: load via fetch() + blob URLs — completely non-blocking,
 *    never fires resource load events, page load event fires as soon as JS runs.
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
    backgroundBatchSize = 32,
    backgroundBatchDelay = 0,
  } = options;

  // Create stable key for frameSource to prevent infinite loops
  const frameSourceKey = getFrameSourceKey(frameSource);

  // Memoize URLs based on stable key
  const frameUrls = useMemo(() => generateFrameUrls(frameSource), [frameSourceKey]);
  const totalFrames = frameUrls.length;

  const [frames, setFrames] = useState<HTMLImageElement[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const framesRef = useRef<HTMLImageElement[]>([]);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    isCancelledRef.current = false;
    framesRef.current = [];
    setFrames([]);
    setLoadedCount(0);
    setIsLoading(true);
    setError(null);

    const urls = frameUrls;
    const total = urls.length;

    // Load a single frame as an Image element (displays immediately)
    const loadImageElement = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load frame: ${url}`));
        img.crossOrigin = 'anonymous';
        img.src = url;
      });
    };

    // Load a single frame as a blob URL via fetch (non-blocking, never blocks load event)
    const loadFetchBlob = async (url: string): Promise<HTMLImageElement> => {
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // Revoke blob URL after decode to free memory
          URL.revokeObjectURL(blobUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error(`Failed to decode frame: ${url}`));
        };
        img.src = blobUrl;
      });
    };

    const loadFrames = async () => {
      try {
        const priorityCount = Math.min(priorityBatchSize, total);

        // 1. Load priority frames via Image() — they display immediately
        const priorityPromises: Promise<HTMLImageElement>[] = [];
        for (let i = 0; i < priorityCount; i++) {
          priorityPromises.push(loadImageElement(urls[i]));
        }
        const priorityFrames = await Promise.all(priorityPromises);

        if (isCancelledRef.current) return;

        framesRef.current = [...priorityFrames];
        setFrames([...framesRef.current]);
        setLoadedCount(priorityFrames.length);

        // If these are all the frames, we're done
        if (priorityCount >= total) {
          setIsLoading(false);
          return;
        }

        // 2. Background load remaining frames via fetch() — completely non-blocking
        // fetch() doesn't register as a resource load, so page load event fires
        // as soon as JS finishes executing, not after all images download.
        const remainingUrls = urls.slice(priorityCount);

        const loadBackground = async () => {
          for (let i = 0; i < remainingUrls.length; i += backgroundBatchSize) {
            if (isCancelledRef.current) return;

            const batchPromises: Promise<HTMLImageElement>[] = [];
            const endIndex = Math.min(i + backgroundBatchSize, remainingUrls.length);

            for (let j = i; j < endIndex; j++) {
              batchPromises.push(loadFetchBlob(remainingUrls[j]));
            }

            const batchFrames = await Promise.all(batchPromises);

            if (isCancelledRef.current) return;

            framesRef.current.push(...batchFrames);
            setLoadedCount(framesRef.current.length);
            setFrames([...framesRef.current]);

            if (endIndex < remainingUrls.length && backgroundBatchDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, backgroundBatchDelay));
            }
          }

          if (!isCancelledRef.current) {
            setIsLoading(false);
          }
        };

        // Start background loading on next paint — non-blocking
        requestAnimationFrame(() => loadBackground());
      } catch (err) {
        if (!isCancelledRef.current) {
          setError(err instanceof Error ? err : new Error('Unknown error loading frames'));
          setIsLoading(false);
        }
      }
    };

    loadFrames();

    return () => {
      isCancelledRef.current = true;
    };
  }, [frameSourceKey, frameUrls, priorityBatchSize, backgroundBatchSize, backgroundBatchDelay]);

  const loadProgress = totalFrames > 0 ? loadedCount / totalFrames : 0;

  return {
    frames,
    loadedCount,
    totalFrames,
    isLoading,
    loadProgress,
    error,
  };
}
