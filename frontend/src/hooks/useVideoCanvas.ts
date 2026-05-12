import { useEffect, useRef, useState, useCallback } from 'react';
import { applyColorGrade, applyBlendOverlay } from '@/utils/colorGrading';
import type { ColorGradeConfig, BlendOverlayConfig } from '@/utils/colorGrading';

export interface UseVideoCanvasOptions {
  src: string;
  poster?: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  progress: number;
  colorGrade?: ColorGradeConfig;
  blendOverlay?: BlendOverlayConfig;
  paused?: boolean;
}

export interface UseVideoCanvasReturn {
  isReady: boolean;
  isError: boolean;
  duration: number;
}

export function useVideoCanvas({
  src,
  poster,
  canvasRef,
  progress,
  colorGrade,
  blendOverlay,
  paused = false,
}: UseVideoCanvasOptions): UseVideoCanvasReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number>(0);
  const [isReady, setIsReady] = useState(false);
  const [isError, setIsError] = useState(false);
  const [duration, setDuration] = useState(0);
  const lastTimeRef = useRef(-1);
  const seekingRef = useRef(false);
  const isVisibleRef = useRef(false);

  // Setup video element
  useEffect(() => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = src;

    const onLoaded = () => {
      setDuration(video.duration);
      setIsReady(true);
    };

    const onError = () => {
      setIsError(true);
    };

    const onSeeked = () => {
      seekingRef.current = false;
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
    video.addEventListener('seeked', onSeeked);
    video.load();

    videoRef.current = video;

    return () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      video.removeEventListener('seeked', onSeeked);
      video.pause();
      video.removeAttribute('src');
      video.load();
      videoRef.current = null;
    };
  }, [src]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting && videoRef.current) {
          videoRef.current.preload = 'auto';
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  // Draw poster on error
  useEffect(() => {
    if (!isError || !poster || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, w, h);
    };
    img.src = poster;
  }, [isError, poster, canvasRef]);

  // RAF render loop
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isReady || isError || paused) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetTime = progress * duration;
    const timeDiff = Math.abs(targetTime - video.currentTime);

    // Seek if difference is noticeable
    if (timeDiff > 0.03 && !seekingRef.current) {
      seekingRef.current = true;
      video.currentTime = targetTime;
    }

    // Only redraw when frame actually changed
    if (seekingRef.current || Math.abs(video.currentTime - lastTimeRef.current) < 0.001) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    lastTimeRef.current = video.currentTime;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);

    // Color grading
    if (colorGrade) {
      const imageData = ctx.getImageData(0, 0, w * dpr, h * dpr);
      applyColorGrade(imageData, colorGrade);
      ctx.putImageData(imageData, 0, 0);
    }

    // Blend overlay
    if (blendOverlay) {
      applyBlendOverlay(ctx, blendOverlay, w, h);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [canvasRef, isReady, isError, paused, progress, duration, colorGrade, blendOverlay]);

  useEffect(() => {
    if (paused || !isReady) return;

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame, paused, isReady]);

  return { isReady, isError, duration };
}
