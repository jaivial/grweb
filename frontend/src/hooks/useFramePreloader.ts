import { useEffect, useState, useRef, useMemo } from 'react';
import { FrameConfig, generateFrameUrls } from '@utils/frameSources';

export interface UseFramePreloaderOptions {
  /**
   * Frame source configuration (local or CDN)
   */
  frameSource: FrameConfig;
  /**
   * Number of frames to load in parallel
   * Default: 10
   */
  batchSize?: number;
  /**
   * Delay between batches in ms
   * Default: 100
   */
  batchDelay?: number;
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
 * Custom hook to preload image frames for animation
 * Loads frames progressively and tracks loading progress
 * Supports both local and CDN sources
 * 
 * @param options - Configuration options including frameSource
 * @returns Object containing frames array and loading state
 */
export function useFramePreloader(
  options: UseFramePreloaderOptions
): FramePreloaderResult {
  const {
    frameSource,
    batchSize = 10,
    batchDelay = 100,
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

    const loadFrame = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load frame: ${url}`));
        img.src = url;
      });
    };

    const loadFramesInBatches = async () => {
      try {
        for (let i = 0; i < total; i += batchSize) {
          if (isCancelledRef.current) return;

          const batchPromises: Promise<HTMLImageElement>[] = [];
          const endIndex = Math.min(i + batchSize, total);

          for (let j = i; j < endIndex; j++) {
            batchPromises.push(loadFrame(urls[j]));
          }

          const batchFrames = await Promise.all(batchPromises);

          if (isCancelledRef.current) return;

          framesRef.current.push(...batchFrames);
          setLoadedCount(framesRef.current.length);

          // Small delay between batches to prevent overwhelming the browser
          if (i + batchSize < total && batchDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, batchDelay));
          }
        }

        if (!isCancelledRef.current) {
          setFrames([...framesRef.current]);
          setIsLoading(false);
        }
      } catch (err) {
        if (!isCancelledRef.current) {
          setError(err instanceof Error ? err : new Error('Unknown error loading frames'));
          setIsLoading(false);
        }
      }
    };

    loadFramesInBatches();

    return () => {
      isCancelledRef.current = true;
    };
  }, [frameSourceKey, frameUrls, batchSize, batchDelay]);

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
