import { useRef, useCallback, useState } from 'react';

export interface UseSlidingWindowCacheOptions {
  baseUrl: string;
  /** 1-based frame number for URL generation */
  startFrame: number;
  /** 1-based frame number for URL generation */
  endFrame: number;
  windowSize?: number;
  digits?: number;
}

export interface SlidingWindowCacheResult {
  /** Map of 0-based frame index -> HTMLImageElement */
  cache: Map<number, HTMLImageElement>;
  /** Triggers re-render when cache changes */
  cachedCount: number;
  /** Move sliding window to this 0-based frame index */
  updateCache: (frameIndex: number) => void;
  preloadRange: (start: number, end: number) => void;
  evictOutside: (start: number, end: number) => void;
  isInCache: (frameIndex: number) => boolean;
  isInitialWindowReady: boolean;
}

function padFrame(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

/**
 * Sliding window cache for frame animations.
 * Internally uses 0-based indices to match consumer's frameIndex.
 * Converts to 1-based frame numbers only when building URLs via padFrame.
 */
export function useSlidingWindowCache(
  options: UseSlidingWindowCacheOptions
): SlidingWindowCacheResult {
  const {
    baseUrl,
    startFrame,
    endFrame,
    windowSize = 60,
    digits = 6,
  } = options;

  const cacheRef = useRef(new Map<number, HTMLImageElement>());
  const [cachedCount, setCachedCount] = useState(0);
  const [isInitialWindowReady, setIsInitialWindowReady] = useState(false);

  const totalFrames = endFrame - startFrame + 1;

  const loadImage = useCallback(
    (frameIndex: number): Promise<HTMLImageElement> => {
      const frameNumber = startFrame + frameIndex;
      console.log('[useSlidingWindowCache] loadImage: loading frame', frameIndex, '(url frame:', frameNumber, ')');
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          console.log('[useSlidingWindowCache] loadImage: SUCCESS loaded frame', frameIndex);
          cacheRef.current.set(frameIndex, img);
          setCachedCount(cacheRef.current.size);
          if (cacheRef.current.size >= Math.min(windowSize, totalFrames)) {
            setIsInitialWindowReady(true);
          }
          resolve(img);
        };
        img.onerror = () => {
          console.log('[useSlidingWindowCache] loadImage: FAILED frame', frameIndex);
          reject(new Error(`Failed to load frame index: ${frameIndex}`));
        };
        img.crossOrigin = 'anonymous';
        img.src = `${baseUrl}/frame_${padFrame(frameNumber, digits)}.webp`;
      });
    },
    [baseUrl, digits, windowSize, startFrame, totalFrames]
  );

  const updateCache = useCallback(
    (frameIndex: number) => {
      console.log('[useSlidingWindowCache] updateCache called with frameIndex:', frameIndex);
      const halfWindow = Math.floor(windowSize / 2);
      const windowStart = Math.max(0, frameIndex - halfWindow);
      const windowEnd = Math.min(totalFrames - 1, frameIndex + halfWindow);
      console.log('[useSlidingWindowCache] window:', windowStart, '-', windowEnd, '| current cache size:', cacheRef.current.size);

      for (let i = windowStart; i <= windowEnd; i++) {
        if (!cacheRef.current.has(i)) {
          console.log('[useSlidingWindowCache] Loading frame index:', i);
          loadImage(i).catch(() => {});
        }
      }

      for (const idx of cacheRef.current.keys()) {
        if (idx < windowStart || idx > windowEnd) {
          cacheRef.current.delete(idx);
        }
      }
      setCachedCount(cacheRef.current.size);
    },
    [windowSize, totalFrames, loadImage]
  );

  const preloadRange = useCallback(
    (start: number, end: number) => {
      const clampedStart = Math.max(0, start);
      const clampedEnd = Math.min(totalFrames - 1, end);
      for (let i = clampedStart; i <= clampedEnd; i++) {
        if (!cacheRef.current.has(i)) {
          loadImage(i).catch(() => {});
        }
      }
    },
    [totalFrames, loadImage]
  );

  const evictOutside = useCallback((start: number, end: number) => {
    for (const idx of cacheRef.current.keys()) {
      if (idx < start || idx > end) {
        cacheRef.current.delete(idx);
      }
    }
    setCachedCount(cacheRef.current.size);
  }, []);

  const isInCache = useCallback((frameIndex: number): boolean => {
    return cacheRef.current.has(frameIndex);
  }, []);

  return {
    cache: cacheRef.current,
    cachedCount,
    updateCache,
    preloadRange,
    evictOutside,
    isInCache,
    isInitialWindowReady,
  };
}
