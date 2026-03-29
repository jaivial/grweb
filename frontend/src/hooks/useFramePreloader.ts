import { useEffect, useState, useRef } from 'react';

export interface UseFramePreloaderOptions {
  /**
   * Path to frames directory (relative to public folder)
   * Default: '/trophy'
   */
  framesPath?: string;
  /**
   * Total number of frames to load
   * Default: 1565 (based on trophy frames)
   */
  totalFrames?: number;
  /**
   * File extension for frames
   * Default: 'png'
   */
  fileExtension?: string;
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
 * Custom hook to preload image frames for animation
 * Loads frames progressively and tracks loading progress
 * 
 * @param options - Configuration options
 * @returns Object containing frames array and loading state
 */
export function useFramePreloader(
  options: UseFramePreloaderOptions = {}
): FramePreloaderResult {
  const {
    framesPath = '/trophy',
    totalFrames = 1565,
    fileExtension = 'png',
    batchSize = 10,
    batchDelay = 100,
  } = options;

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

    const loadFrame = (index: number): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const frameNumber = String(index + 1).padStart(6, '0');
        const src = `${framesPath}/frame_${frameNumber}.${fileExtension}`;

        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load frame ${frameNumber}`));
        img.src = src;
      });
    };

    const loadFramesInBatches = async () => {
      try {
        for (let i = 0; i < totalFrames; i += batchSize) {
          if (isCancelledRef.current) return;

          const batchPromises: Promise<HTMLImageElement>[] = [];
          const endIndex = Math.min(i + batchSize, totalFrames);

          for (let j = i; j < endIndex; j++) {
            batchPromises.push(loadFrame(j));
          }

          const batchFrames = await Promise.all(batchPromises);

          if (isCancelledRef.current) return;

          framesRef.current.push(...batchFrames);
          setLoadedCount(framesRef.current.length);

          // Small delay between batches to prevent overwhelming the browser
          if (i + batchSize < totalFrames && batchDelay > 0) {
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
  }, [framesPath, totalFrames, fileExtension, batchSize, batchDelay]);

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
