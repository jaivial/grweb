import { FC, useRef, useState } from 'react';
import { useMotionValueEvent } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { useVideoCanvas } from '@/hooks/useVideoCanvas';
import type { ColorGradeConfig, BlendOverlayConfig } from '@/utils/colorGrading';
import type { EdgeFadeOverlay } from './FrameAnimator';

export interface VideoCanvasProps {
  src: string;
  poster?: string;
  progress: number | MotionValue<number>;
  className?: string;
  colorGrade?: ColorGradeConfig;
  blendOverlay?: BlendOverlayConfig;
  maskStyle?: React.CSSProperties;
  edgeFadeOverlay?: EdgeFadeOverlay | null;
  paused?: boolean;
}

export const VideoCanvas: FC<VideoCanvasProps> = ({
  src,
  poster,
  progress,
  className = '',
  colorGrade,
  blendOverlay,
  maskStyle,
  edgeFadeOverlay,
  paused = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isMotionValue = typeof progress === 'object' && progress !== null && 'get' in progress;

  const [resolvedProgress, setResolvedProgress] = useState(() => {
    if (isMotionValue) return (progress as MotionValue<number>).get();
    return progress as number;
  });

  useMotionValueEvent(
    isMotionValue ? (progress as MotionValue<number>) : null as unknown as MotionValue<number>,
    'change',
    (v: number) => setResolvedProgress(v),
  );

  const { isReady, isError } = useVideoCanvas({
    src,
    poster,
    canvasRef,
    progress: resolvedProgress,
    colorGrade,
    blendOverlay,
    paused,
  });

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      data-ui="video-canvas"
      style={{
        maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
        maskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        ...maskStyle,
      }}
    >
      <canvas
        ref={canvasRef}
        data-ui="video-canvas-element"
        aria-hidden="true"
        style={{
          display: isReady || isError ? 'block' : 'none',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {!isReady && !isError && (
        <div
          className="absolute inset-0"
          data-ui="video-canvas-loading"
          style={{
            background: 'linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%)',
          }}
          aria-hidden="true"
        />
      )}

      {edgeFadeOverlay && (
        <div
          className="absolute pointer-events-none"
          data-ui="video-canvas-edge-fade"
          style={{ inset: '0', ...edgeFadeOverlay }}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
