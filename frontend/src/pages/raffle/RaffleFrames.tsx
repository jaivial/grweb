import { FC, useEffect, useRef, useState, useCallback } from 'react';
import { useScrollProgress } from '../../hooks/useScrollProgress';

const VIDEO_SRC = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/belt/belt_hero_60fps_hq.mp4';

interface RaffleFramesProps {
  containerId: string;
}

export const RaffleFrames: FC<RaffleFramesProps> = ({ containerId }) => {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoDurationRef = useRef(0);
  const lastTimeRef = useRef(-1);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 9999
  );

  // Track window width
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    smooth: false,
    smoothFactor: 0.15,
    sectionSelector: `#${containerId}`,
  });

  // Draw current video frame to canvas
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isVideoLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxWidth = Math.min(windowWidth * 0.9, 900);
    const width = maxWidth;
    const height = width * (9 / 16);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);
  }, [isVideoLoaded, windowWidth]);

  // Sync video currentTime with scroll progress — seek directly on scroll
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoLoaded) return;

    const duration = videoDurationRef.current;
    if (duration <= 0) return;

    const targetTime = scrollProgress * duration;
    video.currentTime = targetTime;
    lastTimeRef.current = targetTime;
    drawFrame();
  }, [scrollProgress, isVideoLoaded, drawFrame]);

  // Redraw on seeked (fallback after decode)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSeeked = () => drawFrame();
    video.addEventListener('seeked', handleSeeked);
    return () => video.removeEventListener('seeked', handleSeeked);
  }, [drawFrame]);

  // Draw on resize
  useEffect(() => {
    if (isVideoLoaded) drawFrame();
  }, [windowWidth, isVideoLoaded, drawFrame]);

  // Initial draw when video loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      videoDurationRef.current = video.duration;
      setIsVideoLoaded(true);
      video.currentTime = 0;
      lastTimeRef.current = 0;
    };

    const handleCanPlayThrough = () => {
      setIsVideoLoaded(true);
      drawFrame();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
    };
  }, [drawFrame]);

  return (
    <>
      {/* Loading Overlay */}
      {!isVideoLoaded && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black"
          data-component="LoadingOverlay"
        >
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-red-accent/30 border-t-red-accent rounded-full animate-spin" />
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

          {/* Hidden video element — canvas draws the visible output */}
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            preload="auto"
            muted
            playsInline
            loop={false}
            style={{ display: 'none' }}
            aria-hidden
          />

          <canvas
            ref={canvasRef}
            className="relative z-10"
            style={{
              display: isVideoLoaded ? 'block' : 'none',
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
