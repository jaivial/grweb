import { useEffect, useState, useRef, useMemo } from 'react';
import { FrameConfig, generateFrameUrls, CdnFrameConfig, LocalFrameConfig } from '@utils/frameSources';

export interface SlidingWindowConfig {
  /** Enable sliding window cache mode */
  enabled: boolean;
  /** Size of the sliding window (default: 60) */
  windowSize?: number;
}

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
  /**
   * When enabled, use sliding window cache instead of preloading all frames.
   * In this mode, only the window around the current frame is cached.
   * Default: undefined (disabled)
   */
  slidingWindow?: SlidingWindowConfig;
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

function padFrame(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

function getFrameUrls(config: FrameConfig): string[] {
  if (config.source === 'cdn') {
    const cdnConfig = config as CdnFrameConfig;
    const baseUrl = cdnConfig.baseUrl ?? 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp';
    const start = cdnConfig.startFrame ?? 1;
    const end = cdnConfig.endFrame ?? 783;
    const order = cdnConfig.order ?? 'asc';
    const digits = cdnConfig.digits ?? 6;
    const urls: string[] = [];
    const minFrame = Math.min(start, end);
    const maxFrame = Math.max(start, end);
    if (order === 'desc') {
      for (let i = maxFrame; i >= minFrame; i--) {
        urls.push(`${baseUrl}/frame_${padFrame(i, digits)}.webp`);
      }
    } else {
      for (let i = minFrame; i <= maxFrame; i++) {
        urls.push(`${baseUrl}/frame_${padFrame(i, digits)}.webp`);
      }
    }
    return urls;
  }
  const localConfig = config as LocalFrameConfig;
  const path = localConfig.path ?? '/trophy';
  const start = localConfig.startFrame ?? 1;
  const end = localConfig.endFrame ?? 783;
  const digits = (config as unknown as { digits?: number }).digits ?? 6;
  const urls: string[] = [];
  for (let i = start; i <= end; i++) {
    urls.push(`${path}/frame_${padFrame(i, digits)}.webp`);
  }
  return urls;
}

/**
 * Custom hook to preload image frames for animation.
 *
 * Strategy (full preload mode):
 * 1. Priority batch: load via Image() elements — these display immediately but
 *    DON'T block the browser load event (only ~10 elements = negligible impact).
 * 2. Background batch: load via fetch() + blob URLs — completely non-blocking,
 *    never fires resource load events, page load event fires as soon as JS runs.
 *
 * Strategy (sliding window mode):
 * - Only caches a window of frames around the current frame.
 * - `isLoading` is true until the initial window is filled.
 * - `frames` is the ordered list of all frames (for indexing), but only
 *   cached frames are actually preloaded.
 * - Call `updateCache(frameIndex)` to move the window.
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
    slidingWindow,
  } = options;

  const isSlidingWindow = slidingWindow?.enabled ?? false;
  const windowSize = slidingWindow?.windowSize ?? 60;

  // Create stable key for frameSource to prevent infinite loops
  const frameSourceKey = getFrameSourceKey(frameSource);

  // Memoize URLs based on stable key
  const frameUrls = useMemo(() => generateFrameUrls(frameSource), [frameSourceKey]);
  const totalFrames = frameUrls.length;

  // Ordered list of all frames (indices 0..N-1 map to frame numbers via config)
  // In sliding window mode, this is just for count/indexing — actual images live in cacheRef
  const [frames, setFrames] = useState<HTMLImageElement[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Flat cache: Map<frameIndex (0-based), HTMLImageElement>
  const cacheRef = useRef(new Map<number, HTMLImageElement>());
  const framesRef = useRef<HTMLImageElement[]>([]);
  const isCancelledRef = useRef(false);

  // Exposed updateCache for sliding window mode — call this on frameIndex change
  // (Stored on window so callers can access it, but this hook manages its own state)
  const updateCache = useMemo(() => {
    if (!isSlidingWindow) return undefined;
    return (frameIndex: number) => {
      const halfWindow = Math.floor(windowSize / 2);
      const total = frameUrls.length;
      const windowStart = Math.max(0, frameIndex - halfWindow);
      const windowEnd = Math.min(total - 1, frameIndex + halfWindow);

      // Load frames in window that aren't cached yet
      for (let i = windowStart; i <= windowEnd; i++) {
        if (!cacheRef.current.has(i)) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = frameUrls[i];
          cacheRef.current.set(i, img);
        }
      }

      // Evict frames outside window
      for (const idx of cacheRef.current.keys()) {
        if (idx < windowStart || idx > windowEnd) {
          cacheRef.current.delete(idx);
        }
      }

      const cached = cacheRef.current.size;
      setLoadedCount(cached);

      // In sliding window mode, frames array is the ordered cached frames
      const cachedFrames = Array.from(cacheRef.current.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, img]) => img);
      framesRef.current = cachedFrames;
      setFrames(cachedFrames);
    };
  }, [isSlidingWindow, windowSize, frameUrls]);

  useEffect(() => {
    isCancelledRef.current = false;
    cacheRef.current.clear();
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
      try {
        const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(blobUrl);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            reject(new Error(`Failed to decode frame: ${url}`));
          };
          img.src = blobUrl;
        });
      } catch (err) {
        console.error('[useFramePreloader] fetch ERROR:', url, err);
        throw err;
      }
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

        if (isSlidingWindow) {
          // Sliding window mode: populate cacheRef with initial frames at 0-based indices
          // This aligns with updateCache which also uses 0-based keys
          for (let i = 0; i < priorityFrames.length; i++) {
            cacheRef.current.set(i, priorityFrames[i]);
          }
          const cachedFrames = Array.from(cacheRef.current.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, img]) => img);
          framesRef.current = cachedFrames;
          setFrames(cachedFrames);
          setLoadedCount(cachedFrames.length);
          setIsLoading(false);
          return;
        }

        // Full preload mode
        framesRef.current = [...priorityFrames];
        setFrames([...framesRef.current]);
        setLoadedCount(priorityFrames.length);

        // If these are all the frames, we're done
        if (priorityCount >= total) {
          setIsLoading(false);
          return;
        }

        // 2. Background load remaining frames via fetch() — completely non-blocking
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
        console.error('[useFramePreloader] loadFrames error:', err);
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
  }, [frameSourceKey, frameUrls, priorityBatchSize, backgroundBatchSize, backgroundBatchDelay, isSlidingWindow, windowSize]);

  const loadProgress = totalFrames > 0 ? loadedCount / totalFrames : 0;

  return {
    frames,
    loadedCount,
    totalFrames,
    isLoading,
    loadProgress,
    error,
    // Expose updateCache for sliding window consumers
    ...(isSlidingWindow && updateCache ? { updateCache: updateCache as (frameIndex: number) => void } : {}),
  } as FramePreloaderResult & { updateCache?: (frameIndex: number) => void };
}
