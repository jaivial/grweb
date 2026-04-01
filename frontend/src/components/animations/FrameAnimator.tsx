import { FC, useEffect, useRef, useMemo, useState, useCallback } from 'react';

const ANIMATION_START = 0.0;

export interface FrameAnimatorProps {
  frames: HTMLImageElement[];
  progress: number;
  isAnimating: boolean;
  staticPauseStart: number;
  className?: string;
}

export const FrameAnimator: FC<FrameAnimatorProps> = ({
  frames,
  progress,
  isAnimating,
  staticPauseStart,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrameRef = useRef(-1);
  const [staticFrameLoaded, setStaticFrameLoaded] = useState(false);

  // Calculate frame index based on progress
  const frameIndex = useMemo(() => {
    const animationEnd = staticPauseStart;

    if (progress <= 0) return 0;
    if (progress >= animationEnd) return frames.length - 1;

    const animationProgress = progress / animationEnd;
    const index = Math.floor(animationProgress * (frames.length - 1));

    return Math.max(0, Math.min(frames.length - 1, index));
  }, [progress, frames.length, staticPauseStart]);

  // Draw the current frame
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;

    const frame = frames[index];
    if (!frame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const imageAspect = frame.width / frame.height;
    const height = width / imageAspect;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frame, 0, 0, width, height);
  }, [frames]);

  // Effect to draw frame when index changes
  useEffect(() => {
    if (frames.length === 0) return;
    if (!isAnimating) return;
    
    if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex;
      drawFrame(frameIndex);
    }
  }, [frameIndex, frames, isAnimating, drawFrame]);

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
  }, [frameIndex, frames, isAnimating, drawFrame]);

  const showCanvas = frames.length > 0;

  return (
    <div
      className={`relative ${className}`}
      data-component="FrameAnimator"
    >
      {/* Canvas container - no built-in mask */}
      <div className="relative w-screen h-auto">
        <canvas
          ref={canvasRef}
          style={{
            display: showCanvas ? 'block' : 'none',
          }}
        />
      </div>
    </div>
  );
};
