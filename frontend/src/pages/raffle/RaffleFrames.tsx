import { FC, useMemo, useEffect, useState, useRef } from 'react';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { useFramePreloader } from '../../hooks/useFramePreloader';
import { BELT_FRAMES_CONFIG } from '../../utils/frameSources';

interface RaffleFramesProps {
  containerId: string;
}

export const RaffleFrames: FC<RaffleFramesProps> = ({ containerId }) => {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrameRef = useRef(-1);

  const { frames, isLoading: framesLoading, loadProgress } = useFramePreloader({
    frameSource: BELT_FRAMES_CONFIG,
    batchSize: 20,
    batchDelay: 50,
  });

  // Sync loading state
  useEffect(() => {
    setIsLoading(framesLoading);
  }, [framesLoading]);

  // Intersection observer for visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setHasBeenVisible(entry.intersectionRatio > 0.02);
      },
      {
        threshold: Array.from({ length: 100 }, (_, i) => i / 100),
      }
    );

    const element = document.getElementById(containerId);
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [containerId]);

  const { progress: scrollProgress } = useScrollProgress({
    totalVh: 200,
    smooth: true,
    smoothFactor: 0.15,
    sectionSelector: `#${containerId}`,
  });

  // Calculate frame index based on progress
  const frameIndex = useMemo(() => {
    const staticPauseStart = 1;

    if (scrollProgress <= 0) return 0;
    if (scrollProgress >= staticPauseStart) return frames.length - 1;

    const animationProgress = scrollProgress / staticPauseStart;
    const index = Math.floor(animationProgress * (frames.length - 1));

    return Math.max(0, Math.min(frames.length - 1, index));
  }, [scrollProgress, frames.length]);

  // Draw the current frame - fits within the constrained container
  const drawFrame = (index: number) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;

    const frame = frames[index];
    if (!frame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate size based on same formula as container: min(90vw, 900px) with 16:9 aspect
    const maxWidth = Math.min(window.innerWidth * 0.9, 900);
    const width = maxWidth;
    const height = width * (9 / 16);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frame, 0, 0, width, height);
  };

  // Effect to draw frame when index changes
  useEffect(() => {
    if (frames.length === 0) return;

    if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex;
      drawFrame(frameIndex);
    }
  }, [frameIndex, frames]);

  // Effect for resize
  useEffect(() => {
    if (frames.length > 0 && frameIndex >= 0) {
      drawFrame(frameIndex);
    }

    const handleResize = () => {
      if (frames.length > 0 && frameIndex >= 0) {
        drawFrame(frameIndex);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [frameIndex, frames]);

  const showCanvas = frames.length > 0;

  return (
    <>
      {/* Loading Overlay */}
      {isLoading && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black"
          data-component="LoadingOverlay"
        >
          <div className="text-center">
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-accent to-dark-red"
                style={{ width: (loadProgress * 100) + '%', transition: 'width 0.3s ease-out' }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              {Math.round(loadProgress * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* Frame Animation with constrained canvas and mask */}
      <div
        className="absolute inset-0 flex items-center justify-center z-0 pb-32"
        data-component="RaffleFramesWrapper"
      >
        {/* Mask container with explicit size - fade effect from center to edges */}
        <div
          className="relative overflow-hidden rounded-lg shadow-2xl"
          data-ui="frame-mask-container"
          style={{
            width: 'min(90vw, 900px)',
            height: 'auto',
            aspectRatio: '16/9',
            maskImage: 'radial-gradient(45% 52%, black 42%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(45% 52%, black 42%, transparent 100%)',
            maskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        >
          {/* Red accent glow behind canvas */}
          <div
            className="absolute -inset-2 bg-gradient-to-br from-dark-red/40 via-red-accent/20 to-dark-red/30 rounded-lg blur-md z-0"
            data-ui="frame-glow"
            aria-hidden
          />
          <canvas
            ref={canvasRef}
            className="relative z-10"
            style={{
              display: showCanvas ? 'block' : 'none',
              width: '100%',
              height: '100%',
            }}
          />
          {/* Edge fade overlay - dark borders on all 4 sides */}
          <div
            className="absolute inset-0 pointer-events-none z-20 rounded-lg"
            data-ui="canvas-edge-fade"
            style={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
            }}
            aria-hidden
          />
        </div>
      </div>
    </>
  );
};

export default RaffleFrames;
