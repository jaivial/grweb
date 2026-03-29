import { useState, useEffect, useRef, useCallback } from 'react';

export interface FramePreloadOptions {
  folder: string;
  totalFrames: number;
  startFrame?: number;
  priority?: boolean;
}

export interface FrameCache {
  [frameNumber: number]: string; // base64 or blob URL
}

export interface PreloadProgress {
  loaded: number;
  total: number;
  percentage: number;
  isComplete: boolean;
}

/**
 * Preloads frames progressively as they are needed
 */
export function useFramePreloader(
  options: FramePreloadOptions,
  currentFrame: number
) {
  const [progress, setProgress] = useState<PreloadProgress>({
    loaded: 0,
    total: options.totalFrames,
    percentage: 0,
    isComplete: false,
  });
  
  const [cache, setCache] = useState<FrameCache>({});
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  
  const loadingRef = useRef<Set<number>>(new Set());
  const cacheRef = useRef<FrameCache>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort controller for cleanup
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  /**
   * Loads a single frame
   */
  const loadFrame = useCallback(async (frameNumber: number): Promise<string | null> => {
    // Check cache first
    if (cacheRef.current[frameNumber]) {
      return cacheRef.current[frameNumber];
    }

    // Check if already loading
    if (loadingRef.current.has(frameNumber)) {
      return null;
    }

    loadingRef.current.add(frameNumber);

    try {
      const paddedNumber = String(frameNumber).padStart(3, '0');
      const src = `/${options.folder}/${paddedNumber}.jpg`;
      
      // For images, we'll use the path directly
      // In a real implementation, you might preload as blob
      cacheRef.current[frameNumber] = src;
      loadingRef.current.delete(frameNumber);

      return src;
    } catch (error) {
      loadingRef.current.delete(frameNumber);
      console.error(`Failed to load frame ${frameNumber}:`, error);
      return null;
    }
  }, [options.folder]);

  /**
   * Preloads frames around the current frame
   */
  const preloadFrames = useCallback(async (centerFrame: number, range: number = 5) => {
    const startFrame = Math.max(1, centerFrame - range);
    const endFrame = Math.min(options.totalFrames, centerFrame + range);

    const loadPromises: Promise<void>[] = [];

    for (let i = startFrame; i <= endFrame; i++) {
      loadPromises.push(
        loadFrame(i).then(() => {
          setCache({ ...cacheRef.current });
          setProgress(prev => ({
            ...prev,
            loaded: Object.keys(cacheRef.current).length,
            percentage: Math.round((Object.keys(cacheRef.current).length / options.totalFrames) * 100),
          }));
        })
      );
    }

    await Promise.all(loadPromises);
  }, [loadFrame, options.totalFrames]);

  // Update current frame when it changes
  useEffect(() => {
    const paddedNumber = String(currentFrame).padStart(3, '0');
    const src = `/${options.folder}/${paddedNumber}.jpg`;
    setCurrentSrc(src);

    // Preload nearby frames
    preloadFrames(currentFrame, 5);
  }, [currentFrame, options.folder, preloadFrames]);

  // Mark as complete when all frames are loaded
  useEffect(() => {
    if (Object.keys(cacheRef.current).length >= options.totalFrames) {
      setProgress(prev => ({
        ...prev,
        isComplete: true,
      }));
    }
  }, [cache, options.totalFrames]);

  return {
    currentSrc,
    cache,
    progress,
    loadFrame,
    preloadFrames,
  };
}

/**
 * Generates frame URL from folder and frame number
 */
export function getFrameUrl(folder: string, frameNumber: number, totalFrames: number): string {
  const paddedNumber = String(frameNumber).padStart(String(totalFrames).length, '0');
  return `/${folder}/${paddedNumber}.jpg`;
}

/**
 * Preloads all frames in a folder
 */
export async function preloadAllFrames(
  folder: string,
  totalFrames: number,
  onProgress?: (loaded: number, total: number) => void
): Promise<FrameCache> {
  const cache: FrameCache = {};

  for (let i = 1; i <= totalFrames; i++) {
    const paddedNumber = String(i).padStart(3, '0');
    cache[i] = `/${folder}/${paddedNumber}.jpg`;
    onProgress?.(i, totalFrames);

    // Yield to prevent blocking
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return cache;
}
