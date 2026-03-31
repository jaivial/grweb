import { FC, useEffect, useRef, useMemo, useState } from 'react';

const ANIMATION_START = 0.04;

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
  const currentFrameRef = useRef(0);
  const [staticFrameLoaded, setStaticFrameLoaded] = useState(false);

  const frameIndex = useMemo(() => {
    const animationStart = ANIMATION_START;
    const animationEnd = staticPauseStart;

    if (progress < animationStart) return 0;
    if (progress >= animationEnd) return frames.length - 1;

    const animationProgress = (progress - animationStart) / (animationEnd - animationStart);
    const index = Math.floor(animationProgress * (frames.length - 1));

    return Math.max(0, Math.min(frames.length - 1, index));
  }, [progress, frames.length, staticPauseStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    if (!isAnimating) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = frames[frameIndex];
    if (!frame) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const imageAspect = frame.width / frame.height;
    const canvasAspect = width / height;

    let drawWidth = 0;
    let drawHeight = 0;
    let drawX = 0;
    let drawY = 0;

    if (imageAspect > canvasAspect) {
      drawHeight = height;
      drawWidth = height * imageAspect;
      drawX = (width - drawWidth) / 2;
      drawY = 0;
    } else {
      drawWidth = width;
      drawHeight = width / imageAspect;
      drawX = 0;
      drawY = (height - drawHeight) / 2;
    }

    ctx.drawImage(frame, drawX, drawY, drawWidth, drawHeight);
    currentFrameRef.current = frameIndex;
  }, [frameIndex, frames, isAnimating]);

  useEffect(() => {
    if (!isAnimating) return;

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && frames.length > 0) {
        const frame = frames[frameIndex];
        if (frame) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const dpr = window.devicePixelRatio || 1;
            const width = window.innerWidth;
            const height = window.innerHeight;

            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';

            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            const imageAspect = frame.width / frame.height;
            const canvasAspect = width / height;

            let drawWidth = 0;
            let drawHeight = 0;
            let drawX = 0;
            let drawY = 0;

            if (imageAspect > canvasAspect) {
              drawHeight = height;
              drawWidth = height * imageAspect;
              drawX = (width - drawWidth) / 2;
              drawY = 0;
            } else {
              drawWidth = width;
              drawHeight = width / imageAspect;
              drawX = 0;
              drawY = (height - drawHeight) / 2;
            }

            ctx.drawImage(frame, drawX, drawY, drawWidth, drawHeight);
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [frameIndex, frames, isAnimating]);

  const showCanvas = frames.length > 0;
  const showLoading = frames.length === 0 && !staticFrameLoaded;

  const containerClassName = 'absolute inset-0 ' + className;

  return (
    <div className={containerClassName} data-component="FrameAnimator">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          display: showCanvas ? 'block' : 'none',
          objectFit: 'cover',
        }}
      />

      {showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-base" data-component="FrameLoading">
          <div className="text-center">
            <div className="inline-block w-12 h-12 border-4 border-red-accent border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400 text-sm">Loading frames...</p>
          </div>
        </div>
      )}
    </div>
  );
};
