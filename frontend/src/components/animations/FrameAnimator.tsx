import { FC, useEffect, useRef, useMemo, useState, useCallback } from 'react';

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
  maskStyle?: React.CSSProperties;
  /** Enable sliding window mode with this window size. When set, frames are cached around current frame. */
  windowSize?: number;
  /** Update function from useFramePreloader sliding window mode */
  updateCache?: (frameIndex: number) => void;
  /** Direct cache map (from useSlidingWindowCache). When provided, used instead of frames[index]. */
  cache?: Map<number, HTMLImageElement>;
  /** Scroll-to-frame speed multiplier. Higher = faster playback (finishes in less scroll distance). Default: 1 */
  scrollSpeed?: number;
}

export const FrameAnimator: FC<FrameAnimatorProps> = ({
  frames,
  progress,
  isAnimating,
  staticPauseStart,
  className = '',
  maxWidth = Infinity,
  aspectRatio,
  maskStyle,
  edgeFadeOverlay,
  windowSize,
  updateCache,
  cache,
  scrollSpeed = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrameRef = useRef(-1);
  const [staticFrameLoaded, setStaticFrameLoaded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 9999
  );

  // Track window width for responsive side fades
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate frame index based on progress + speed multiplier
  const frameIndex = useMemo(() => {
    const animationEnd = staticPauseStart;
    const effectiveProgress = Math.min(progress * scrollSpeed, 1);

    if (effectiveProgress <= 0) return 0;
    if (effectiveProgress >= animationEnd) return frames.length - 1;

    const animationProgress = effectiveProgress / animationEnd;
    const index = Math.floor(animationProgress * (frames.length - 1));

    return Math.max(0, Math.min(frames.length - 1, index));
  }, [progress, frames.length, staticPauseStart, scrollSpeed]);

  // Draw the current frame
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const frame = cache ? cache.get(index) : frames[index];
    if (!frame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.min(windowWidth, maxWidth);
    const frameAspect = frame.width && frame.height ? frame.width / frame.height : 16 / 9;
    const height = aspectRatio ? width / aspectRatio : width / frameAspect;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frame, 0, 0, width, height);
  }, [frames, cache, maxWidth, aspectRatio, windowWidth]);

  // Effect to draw frame when index changes or when frames become available
  useEffect(() => {
    if (!isAnimating) return;

    // In sliding window mode, always update cache (even if frames.length === 0)
    if (windowSize && updateCache) {
      updateCache(frameIndex);
    }

    if (frames.length === 0) return;

    if (currentFrameRef.current === -1) {
      // Initial draw when animating starts
      currentFrameRef.current = frameIndex;
      drawFrame(frameIndex);
    } else if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex;
      drawFrame(frameIndex);
    }
  }, [frameIndex, isAnimating, drawFrame, windowSize, updateCache]);

  // Separate effect: redraw when frames become available (sliding window first fill)
  useEffect(() => {
    if (frames.length === 0) return;
    if (!isAnimating) return;
    // frames just became available — draw current frame
    if (currentFrameRef.current === -1) {
      currentFrameRef.current = frameIndex;
      drawFrame(frameIndex);
    }
  }, [frames.length, isAnimating, frameIndex, drawFrame]);

  // Effect for resize
  useEffect(() => {
    if (!isAnimating) return;

    const handleResize = () => {
      if (frames.length > 0 && frameIndex >= 0) {
        drawFrame(frameIndex);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [frameIndex, frames, isAnimating, drawFrame, windowWidth]);

  const showCanvas = frames.length > 0;
  const canvasWidth = Math.min(windowWidth, maxWidth);
  const canvasHeight = aspectRatio ? canvasWidth / aspectRatio : canvasWidth;

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      data-component="FrameAnimator"
      style={{
        height: '100dvh',
        width: '100%',
        maxWidth: maxWidth + 'px',
        maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        maskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        ...maskStyle,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: showCanvas ? 'block' : 'none',
          width: canvasWidth + 'px',
          height: 'auto',
          maxHeight: '100dvh',
          objectFit: 'contain',
        }}
      />
      {/* Edge fade overlay */}
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
