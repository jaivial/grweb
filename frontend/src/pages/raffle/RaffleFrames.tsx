import { FC, useEffect, useState, useRef, useCallback } from 'react';
import { useFramePreloader } from '../../hooks/useFramePreloader';
import { BELT_FRAMES_CONFIG } from '../../utils/frameSources';

interface RaffleFramesProps {
  containerId: string;
}

export const RaffleFrames: FC<RaffleFramesProps> = ({ containerId }) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrameRef = useRef(-1);
  const rafRef = useRef<number | null>(null);

  const {
    frames,
    isLoading,
    loadProgress,
    totalFrames,
  } = useFramePreloader({
    frameSource: BELT_FRAMES_CONFIG,
    priorityBatchSize: 10,
  });

  // Simple scroll tracking
  useEffect(() => {
    let targetProgress = 0;
    let currentProgress = 0;

    const updateProgress = () => {
      const element = document.getElementById(containerId);
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const sectionHeight = rect.height;

      // Calculate how far we've scrolled through the section
      const scrollStart = rect.top + window.scrollY;
      const scrollEnd = scrollStart + sectionHeight - windowHeight;
      const currentScroll = window.scrollY;

      if (scrollEnd <= scrollStart) {
        targetProgress = 0;
      } else {
        targetProgress = Math.max(0, Math.min(1, (currentScroll - scrollStart) / (scrollEnd - scrollStart)));
      }
    };

    const animate = () => {
      currentProgress += (targetProgress - currentProgress) * 0.12;
      setScrollProgress(currentProgress);
      rafRef.current = requestAnimationFrame(animate);
    };

    const handleScroll = () => {
      updateProgress();
    };

    updateProgress();
    window.addEventListener('scroll', handleScroll, { passive: true });
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [containerId]);

  // Calculate frame index
  const frameIndex = Math.floor(scrollProgress * Math.max(0, totalFrames - 1));

  // Draw frame
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;

    const frame = frames[index];
    if (!frame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxWidth = Math.min(window.innerWidth * 0.9, 900);
    const width = maxWidth;
    const height = width * (9 / 16);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frame, 0, 0, width, height);
  }, [frames]);

  // Draw on frame change
  useEffect(() => {
    if (frames.length === 0) return;
    if (frameIndex === currentFrameRef.current) return;

    currentFrameRef.current = frameIndex;
    drawFrame(frameIndex);
  }, [frameIndex, frames, drawFrame]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (frames.length > 0 && currentFrameRef.current >= 0) {
        drawFrame(currentFrameRef.current);
      }
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [frames, drawFrame]);

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-accent to-dark-red"
                style={{ width: (loadProgress * 100) + '%', transition: 'width 0.3s ease-out' }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">{Math.round(loadProgress * 100)}%</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center z-0 pb-32">
        <div
          className="relative overflow-hidden rounded-lg shadow-2xl"
          style={{
            width: 'min(90vw, 900px)',
            height: 'auto',
            aspectRatio: '16/9',
            maskImage: 'radial-gradient(45% 52%, black 42%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(45% 52%, black 42%, transparent 100%)',
          }}
        >
          <div
            className="absolute -inset-2 bg-gradient-to-br from-dark-red/40 via-red-accent/20 to-dark-red/30 rounded-lg blur-md z-0"
            aria-hidden
          />
          <canvas
            ref={canvasRef}
            className="relative z-10"
            style={{
              display: frames.length > 0 ? 'block' : 'none',
              width: '100%',
              height: '100%',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none z-20 rounded-lg"
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
