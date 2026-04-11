import { FC, useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { useFramePreloader } from '../../hooks/useFramePreloader';
import { BELT_FRAMES_CONFIG } from '../../utils/frameSources';

interface RaffleFramesProps {
  containerId: string;
}

export const RaffleFrames: FC<RaffleFramesProps> = ({ containerId }) => {
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrameRef = useRef(-1);

  const { frames, isLoading: framesLoading, loadProgress } = useFramePreloader({
    frameSource: BELT_FRAMES_CONFIG,
    priorityBatchSize: 10,
    backgroundBatchSize: 32,
    backgroundBatchDelay: 0,
  });

  // Sync loading state
  useEffect(() => {
    setIsLoading(framesLoading);
  }, [framesLoading]);

  // DNS prefetch + preconnect for BunnyCDN to reduce latency
  useEffect(() => {
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://storage.bunnycdn.com';
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    const preconnectCdn = document.createElement('link');
    preconnectCdn.rel = 'preconnect';
    preconnectCdn.href = 'https://jaimedigitalstudio.b-cdn.net';
    preconnectCdn.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectCdn);

    const prefetch = document.createElement('link');
    prefetch.rel = 'dns-prefetch';
    prefetch.href = 'https://storage.bunnycdn.com';
    document.head.appendChild(prefetch);

    return () => {
      document.head.removeChild(preconnect);
      document.head.removeChild(preconnectCdn);
      document.head.removeChild(prefetch);
    };
  }, []);

  // Preload first few critical frames for immediate display
  useEffect(() => {
    const baseUrl = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp';
    const preloadFrames = [
      `${baseUrl}/frame_000001.webp`,
      `${baseUrl}/frame_000002.webp`,
      `${baseUrl}/frame_000003.webp`,
    ];

    preloadFrames.forEach((url) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }, []);

  const { progress: scrollProgress } = useScrollProgress({
    totalVh: 75,
    smooth: true,
    smoothFactor: 0.15,
    sectionSelector: `#${containerId}`,
  });

  const totalFrames = frames.length;

  // Scroll-to-frame speed multiplier — 1.2 means animation completes at ~83% scroll
  const scrollSpeed = 1;

  // Calculate frame index based on progress (0-based)
  const frameIndex = useMemo(() => {
    if (totalFrames === 0) return 0;
    if (scrollProgress <= 0) return 0;
    if (scrollProgress >= 1) return totalFrames - 1;

    const index = Math.floor(scrollProgress * scrollSpeed * (totalFrames - 1));
    return Math.max(0, Math.min(totalFrames - 1, index));
  }, [scrollProgress, totalFrames, scrollSpeed]);

  // Draw the current frame — fits within the constrained container
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
  }, [frames]);

  // Redraw when frameIndex changes OR when frames finish loading
  useEffect(() => {
    if (frameIndex !== currentFrameRef.current) {
      currentFrameRef.current = frameIndex;
    }
    if (frames[frameIndex]) {
      drawFrame(frameIndex);
    }
  }, [frameIndex, frames.length, drawFrame]);

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => {
      if (frames[frameIndex]) {
        drawFrame(frameIndex);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [frameIndex, frames, drawFrame]);

  const showCanvas = frames.length > 0;

  return (
    <>
      {/* Loading Overlay */}
      {isLoading && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black"
          data-component="LoadingOverlay"
        >
          <div className="text-center" data-ui="loading-text">
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden" data-ui="loading-bar">
              <div
                className="h-full bg-gradient-to-r from-red-accent to-dark-red"
                style={{ width: (loadProgress * 100) + '%', transition: 'width 0.3s ease-out' }}
                data-ui="loading-progress"
              />
            </div>
            <p className="text-gray-400 text-sm mt-2" data-ui="loading-percent">
              {Math.round(loadProgress * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* Frame Animation with constrained canvas */}
      <div
        className="absolute inset-0 flex items-center justify-center z-0 pb-32"
        data-component="RaffleFramesWrapper"
      >
        <div
          className="relative overflow-hidden rounded-lg shadow-2xl"
          data-ui="frame-mask-container"
          style={{
            width: 'min(90vw, 900px)',
            height: 'auto',
            aspectRatio: '16/9',
            maskImage: 'radial-gradient(48% 48% at 51% 51%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(48% 48% at 51% 51%, black 40%, transparent 100%)',
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
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
            data-ui="raffle-canvas"
          />
          {/* Edge fade overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-5 rounded-lg"
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
