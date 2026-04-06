import { FC, useEffect, useRef, useState, useCallback } from 'react';

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
  /** Scroll progress within the animation range (0-1) */
  progress: number;
  /** Whether the animation is currently active */
  isAnimating: boolean;
  className?: string;
  maxWidth?: number;
  aspectRatio?: number;
  edgeFadeOverlay?: EdgeFadeOverlay | null;
  /** Path to the video file */
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 9999
  );
  const videoDurationRef = useRef(0);
  const lastTimeRef = useRef(-1);

  // Track window width
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw current video frame to canvas
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isVideoLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.min(windowWidth, maxWidth);
    const height = aspectRatio ? width / aspectRatio : width / (video.videoWidth / video.videoHeight);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);
  }, [isVideoLoaded, windowWidth, maxWidth, aspectRatio]);

  // Sync video currentTime with scroll progress — seek directly on scroll
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isAnimating || !isVideoLoaded) return;

    const duration = videoDurationRef.current;
    if (duration <= 0) return;

    const targetTime = progress * duration;
    video.currentTime = targetTime;
    lastTimeRef.current = targetTime;
    drawFrame();
  }, [progress, isAnimating, isVideoLoaded, drawFrame]);

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
      // Draw first frame
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

  const canvasWidth = Math.min(windowWidth, maxWidth);
  const canvasHeight = aspectRatio ? canvasWidth / aspectRatio : canvasWidth;

  return (
    <div
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
      {/* Hidden video element — canvas draws the visible output */}
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        muted
        playsInline
        loop={false}
        style={{ display: 'none' }}
        aria-hidden
      />

      <canvas
        ref={canvasRef}
        style={{
          display: isVideoLoaded ? 'block' : 'none',
          width: canvasWidth + 'px',
          height: canvasHeight + 'px',
        }}
      />

      {/* Loading placeholder — shown until video loads */}
      {!isVideoLoaded && (
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
