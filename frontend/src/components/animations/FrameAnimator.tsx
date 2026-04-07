import { FC, useEffect, useRef, useMemo, useState, useCallback } from 'react';

// Test log - should appear immediately when this module loads
window.console.log('[FrameAnimator] Module loaded');

const ANIMATION_START = 0.0;

export interface EdgeFadeOverlay {
  background?: string;
  maxWidth?: string;
  margin?: string;
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  width?: string;
  height?: string;
}

export interface FrameAnimatorProps {
  frames: HTMLImageElement[];
  progress: number;
  isAnimating: boolean;
  staticPauseStart: number;
  className?: string;
  maxWidth?: number;
  aspectRatio?: number;
  edgeFadeOverlay?: EdgeFadeOverlay | null;
  /** On-demand frame getter - enables memory-efficient loading */
  getFrame?: (index: number) => HTMLImageElement | null;
  /** Preload frames around an index */
  preloadAround?: (centerIndex: number) => void;
  /** Total frames available (when using getFrame) */
  totalFrames?: number;
}

export const FrameAnimator: FC<FrameAnimatorProps> = ({
  frames,
  progress,
  isAnimating,
  staticPauseStart,
  className = '',
  maxWidth = Infinity,
  aspectRatio,
  edgeFadeOverlay,
  getFrame,
  preloadAround,
  totalFrames,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrameRef = useRef(-1);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 9999
  );

  // Debug logging - uses window.console to prevent stripping
  const logFrame = (context: string, data?: Record<string, unknown>) => {
    const prefix = '[FrameAnimator:' + context + ']';
    window.console.log(prefix, {
      framesAvailable: frames.length,
      totalFrames,
      progress: typeof progress === 'number' ? progress.toFixed(3) : progress,
      isAnimating,
      windowWidth,
      usingGetFrame: !!getFrame,
      ...data
    });
  };

  // Log initial state
  useEffect(() => {
    logFrame('MOUNT', { maxWidth, aspectRatio });
    return () => logFrame('UNMOUNT');
  }, []);

  // Use totalFrames if provided, otherwise use frames.length
  const effectiveTotal = totalFrames ?? frames.length;

  // Get frame - use getFrame function if available, otherwise array access
  const getFrameByIndex = useCallback((index: number): HTMLImageElement | null => {
    if (getFrame) {
      return getFrame(index);
    }
    return frames[index] ?? null;
  }, [frames, getFrame]);

  // Combined resize handler
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      // Redraw current frame after resize
      if (effectiveTotal > 0 && currentFrameRef.current >= 0 && isAnimating) {
        requestAnimationFrame(() => {
          if (currentFrameRef.current >= 0) {
            drawFrameInternal(currentFrameRef.current, window.innerWidth);
          }
        });
      }
    };

    const drawFrameInternal = (index: number, currentWidth: number) => {
      const canvas = canvasRef.current;
      if (!canvas || effectiveTotal === 0) return;

      const frame = getFrameByIndex(index);
      if (!frame) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = Math.min(currentWidth, maxWidth);
      const height = aspectRatio ? width / aspectRatio : width / (frame.width / frame.height);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(frame, 0, 0, width, height);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [effectiveTotal, maxWidth, aspectRatio, isAnimating, getFrameByIndex]);

  const frameIndex = useMemo(() => {
    const animationEnd = staticPauseStart;

    if (progress <= 0) return 0;
    if (progress >= animationEnd) return effectiveTotal - 1;

    const animationProgress = progress / animationEnd;
    const index = Math.floor(animationProgress * (effectiveTotal - 1));

    return Math.max(0, Math.min(effectiveTotal - 1, index));
  }, [progress, effectiveTotal, staticPauseStart]);

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas || effectiveTotal === 0) {
      logFrame('DRAW_SKIP', { reason: 'no_canvas_or_no_frames', index });
      return;
    }

    const frame = getFrameByIndex(index);
    if (!frame) {
      logFrame('DRAW_SKIP', { reason: 'frame_not_loaded', index, usingGetFrame: !!getFrame });
      // Frame not loaded yet - trigger preload
      if (preloadAround) {
        preloadAround(index);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.min(windowWidth, maxWidth);
    const height = aspectRatio ? width / aspectRatio : width / (frame.width / frame.height);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frame, 0, 0, width, height);
  }, [effectiveTotal, maxWidth, aspectRatio, windowWidth, getFrameByIndex, preloadAround]);

  // Preload frames around current position
  useEffect(() => {
    if (preloadAround && isAnimating && frameIndex >= 0) {
      preloadAround(frameIndex);
    }
  }, [frameIndex, isAnimating, preloadAround]);

  useEffect(() => {
    if (effectiveTotal === 0) return;
    if (!isAnimating) {
      logFrame('STOPPED', { effectiveTotal });
      return;
    }

    if (currentFrameRef.current === -1) {
      currentFrameRef.current = frameIndex;
      logFrame('FIRST_FRAME', { index: frameIndex });
      drawFrame(frameIndex);
    } else if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex;
      logFrame('FRAME_CHANGE', { index: frameIndex, prev: currentFrameRef.current });
      drawFrame(frameIndex);
    }
  }, [frameIndex, effectiveTotal, isAnimating, drawFrame]);

  const showCanvas = effectiveTotal > 0;
  const canvasWidth = Math.min(windowWidth, maxWidth);
  const canvasHeight = aspectRatio ? canvasWidth / aspectRatio : canvasWidth;

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      data-component="FrameAnimator"
      style={{
        maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        maskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: showCanvas ? 'block' : 'none',
          width: canvasWidth + 'px',
          height: canvasHeight + 'px',
        }}
      />
      {edgeFadeOverlay && (
        <div
          className="absolute pointer-events-none"
          data-ui="canvas-edge-fade"
          style={{
            inset: '0',
            ...edgeFadeOverlay,
          }}
          aria-hidden
        />
      )}
    </div>
  );
};
