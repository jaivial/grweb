import { FC, useEffect, useRef, useMemo, useState } from 'react';

const LAST_FRAME_SRC = '/trophy/frame_000001.png';
const STATIC_FRAME_PAUSE = 0.05; // Reduced static pause duration (5% of scroll)
const ANIMATION_START = 0.04; // Frame animation starts at 4% progress

const ANIMATION_END = 0.80; // Frame animation ends at 80% progress

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
  const animationStart = ANIMATION_START;
  const animationEnd = staticPauseStart;
  // First frame is the static final frame
  const firstFrame = useMemo(() => {
    return frames.length > 0 ? frames[0] : null;
  }, [frames]);

  const frameIndex = useMemo(() => {
    // If not animating, return first frame
    if (!isAnimating) {
      return 0;
    }
    
    // Animation starts at 0.04 (FRAME_ANIMATION phase start) and ends at 0.80
    const animationStart = 0.04;
    const animationEnd = staticPauseStart;
    
    // If before animation starts, show first frame
    if (progress < animationStart) {
      return 0;
    }
    
    // If after animation ends, show last frame
    if (progress >= animationEnd) {
      return frames.length - 1;
    }
    
    // Normalize progress within animation range (0 to 1)
    const animationProgress = (progress - animationStart) / (animationEnd - animationStart);
    
    // Map to frame index (0 to frames.length - 1)
    const index = Math.floor(animationProgress * (frames.length - 1));
    
    return Math.max(0, Math.min(frames.length - 1, index));
  }, [progress, frames.length, isAnimating, staticPauseStart]);

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

  const showStaticFrame = !isAnimating || progress < animationStart || progress >= staticPauseStart;
  const showCanvas = isAnimating && progress >= animationStart && progress < staticPauseStart && frames.length > 0;
  const showLoading = frames.length === 0 && !staticFrameLoaded;

  const containerClassName = 'absolute inset-0 ' + className;

  return (
    <div className={containerClassName} data-component="FrameAnimator">
      {showStaticFrame && (
        <img
          src={firstFrame ? firstFrame.src : LAST_FRAME_SRC}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          data-component="FrameBackground"
          onLoad={() => setStaticFrameLoaded(true)}
        />
      )}

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
