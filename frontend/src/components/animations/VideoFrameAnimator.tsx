import { FC, useEffect, useRef, useState } from 'react';

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

export interface VideoFrameAnimatorProps {
  progress: number;
  isAnimating: boolean;
  className?: string;
  maxWidth?: number;
  aspectRatio?: number;
  edgeFadeOverlay?: EdgeFadeOverlay | null;
  src?: string;
}

const VIDEO_SRC = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/trophy_hero_60fps_hq_reversed.mp4';

export const VideoFrameAnimator: FC<VideoFrameAnimatorProps> = ({
  progress,
  isAnimating,
  className = '',
  maxWidth = Infinity,
  aspectRatio,
  edgeFadeOverlay,
  src = VIDEO_SRC,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 9999
  );
  const videoDurationRef = useRef(0);

  // Create video element once on mount
  useEffect(() => {
    console.log('[VideoFrameAnimator] useEffect mount');

    // Create video element if not exists
    if (!videoRef.current) {
      console.log('[VideoFrameAnimator] creating video element');
      videoRef.current = document.createElement('video');
      videoRef.current.src = VIDEO_SRC;
      videoRef.current.preload = 'auto';
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.loop = false;

      videoRef.current.onloadedmetadata = () => {
        console.log('[VideoFrameAnimator] metadata loaded, duration:', videoRef.current?.duration);
        if (videoRef.current) {
          videoDurationRef.current = videoRef.current.duration;
          setIsVideoReady(true);
        }
      };

      videoRef.current.oncanplaythrough = () => {
        console.log('[VideoFrameAnimator] can play through');
      };

      videoRef.current.onerror = () => {
        console.error('[VideoFrameAnimator] error:', videoRef.current?.error);
      };

      videoRef.current.onseeked = () => {
        console.log('[VideoFrameAnimator] seeked');
        drawFrame();
      };
    }

    // Create canvas if not exists
    if (!canvasRef.current && containerRef.current) {
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      containerRef.current.appendChild(canvas);
      canvasRef.current = canvas;
      console.log('[VideoFrameAnimator] canvas created');
    }

    return () => {
      console.log('[VideoFrameAnimator] cleanup');
    };
  }, []);

  // Track window width
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw frame function
  const drawFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isVideoReady) {
      console.log('[VideoFrameAnimator] drawFrame skipped, ready:', isVideoReady);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.min(windowWidth, maxWidth);
    const height = aspectRatio ? width / aspectRatio : width * (16 / 9);

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);
    console.log('[VideoFrameAnimator] drew frame, time:', video.currentTime.toFixed(3));
  };

  // Seek video on progress change
  useEffect(() => {
    if (!videoRef.current || !isVideoReady) return;

    const duration = videoDurationRef.current;
    if (duration <= 0) return;

    const targetTime = progress * duration;
    videoRef.current.currentTime = targetTime;
    console.log('[VideoFrameAnimator] seek to', targetTime.toFixed(3));
  }, [progress, isVideoReady]);

  const canvasWidth = Math.min(windowWidth, maxWidth);
  const canvasHeight = aspectRatio ? canvasWidth / aspectRatio : canvasWidth;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      data-component="VideoFrameAnimator"
      style={{
        maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        maskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    >
      {/* Loading placeholder */}
      {!isVideoReady && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            width: canvasWidth + 'px',
            height: canvasHeight + 'px',
          }}
          data-ui="video-loading-placeholder"
        >
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

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
