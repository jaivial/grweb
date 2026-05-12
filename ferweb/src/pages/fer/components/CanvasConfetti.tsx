import { FC, useRef, useEffect, useCallback } from 'react';
import { FER_COLORS } from '../constants';

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  scaleX: number;
  scaleDir: number;
  w: number;
  h: number;
  color: string;
  shape: 'rect' | 'circle' | 'streamer';
  life: number;
  maxLife: number;
}

interface CanvasConfettiProps {
  isActive: boolean;
  duration?: number;
  pieceCount?: number;
  colors?: string[];
  origin?: { x: number; y: number };
  className?: string;
}

const DEFAULT_COLORS = [FER_COLORS.accent, FER_COLORS.gold, FER_COLORS.purple, FER_COLORS.green];

function spawnBurst(
  count: number,
  colors: string[],
  originX: number,
  originY: number,
  canvasW: number,
  canvasH: number
): ConfettiPiece[] {
  const shapes: ConfettiPiece['shape'][] = ['rect', 'rect', 'circle', 'streamer'];
  const pieces: ConfettiPiece[] = [];

  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
    const speed = 8 + Math.random() * 14;
    const maxLife = 120 + Math.random() * 80;

    pieces.push({
      x: originX + (Math.random() - 0.5) * 60,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      scaleX: 1,
      scaleDir: Math.random() > 0.5 ? 1 : -1,
      w: 4 + Math.random() * 6,
      h: 3 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      life: maxLife,
      maxLife,
    });
  }

  return pieces;
}

export const CanvasConfetti: FC<CanvasConfettiProps> = ({
  isActive,
  duration = 3500,
  pieceCount = 400,
  colors = DEFAULT_COLORS,
  origin,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const piecesRef = useRef<ConfettiPiece[]>([]);
  const startTimeRef = useRef<number>(0);
  const spawnedRef = useRef(false);

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    piecesRef.current = [];
    spawnedRef.current = false;
  }, []);

  useEffect(() => {
    if (!isActive) {
      stopAnimation();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const originX = origin?.x ?? w / 2;
    const originY = origin?.y ?? h * 0.85;

    if (!spawnedRef.current) {
      piecesRef.current = spawnBurst(pieceCount, colors, originX, originY, w, h);
      startTimeRef.current = performance.now();
      spawnedRef.current = true;
    }

    const gravity = 0.18;
    const airResistance = 0.985;
    const maxDuration = duration;

    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed > maxDuration) {
        stopAnimation();
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pieces = piecesRef.current;
      let alive = false;

      for (const p of pieces) {
        p.life--;
        if (p.life <= 0) continue;
        alive = true;

        p.vy += gravity;
        p.vx *= airResistance;
        p.vy *= airResistance;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        // 3D tumble via scaleX oscillation
        p.scaleX += p.scaleDir * 0.04;
        if (p.scaleX > 1 || p.scaleX < -1) p.scaleDir *= -1;

        const alpha = Math.min(1, p.life / (p.maxLife * 0.3));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.scale(p.scaleX, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        switch (p.shape) {
          case 'circle':
            ctx.beginPath();
            ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'streamer':
            ctx.beginPath();
            ctx.moveTo(-p.w / 2, -p.h / 2);
            ctx.quadraticCurveTo(p.w, 0, -p.w / 2, p.h / 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = p.color;
            ctx.stroke();
            break;
          default: // rect
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }

        ctx.restore();
      }

      if (alive) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        stopAnimation();
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, duration, pieceCount, colors, origin, stopAnimation]);

  return (
    <canvas
      ref={canvasRef}
      data-ui="fer-canvas-confetti"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
};
