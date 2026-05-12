import { FC, useRef, useEffect, useCallback, useMemo } from 'react';
import { FER_COLORS } from '../constants';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  shape: 'circle' | 'diamond' | 'star';
}

interface CanvasParticlesProps {
  particleCount?: number;
  connectionDistance?: number;
  enableMouseInteraction?: boolean;
  className?: string;
}

const COLORS = [FER_COLORS.accent, FER_COLORS.gold, FER_COLORS.purple, FER_COLORS.glow];
const CELL_SIZE = 80;

function createParticle(w: number, h: number): Particle {
  const shapes: Particle['shape'][] = ['circle', 'circle', 'circle', 'diamond', 'star'];
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3 - 0.15,
    size: 1.5 + Math.random() * 3.5,
    opacity: 0.1 + Math.random() * 0.35,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: shapes[Math.floor(Math.random() * shapes.length)],
  };
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.stroke();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.6, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.6, y);
  ctx.closePath();
  ctx.fill();
}

export const CanvasParticles: FC<CanvasParticlesProps> = ({
  particleCount = 200,
  connectionDistance = 80,
  enableMouseInteraction = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const reducedMotionRef = useRef(false);

  const isMobile = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 768, []);
  const effectiveCount = isMobile ? Math.min(particleCount, 80) : particleCount;
  const showConnections = !isMobile;

  const initParticles = useCallback((w: number, h: number) => {
    particlesRef.current = Array.from({ length: effectiveCount }, () => createParticle(w, h));
  }, [effectiveCount]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => { reducedMotionRef.current = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = isMobile ? Math.min(window.devicePixelRatio || 1, 1.5) : window.devicePixelRatio || 1;

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      sizeRef.current = { w, h };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };

    resize();
    initParticles(sizeRef.current.w, sizeRef.current.h);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        initParticles(sizeRef.current.w, sizeRef.current.h);
      }, 150);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimer);
    };
  }, [initParticles, isMobile]);

  useEffect(() => {
    if (!enableMouseInteraction) return;
    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleLeave = () => { mouseRef.current = { x: -1000, y: -1000 }; };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseleave', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseleave', handleLeave);
    };
  }, [enableMouseInteraction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = isMobile ? Math.min(window.devicePixelRatio || 1, 1.5) : window.devicePixelRatio || 1;
    const connDist = connectionDistance;
    const connDistSq = connDist * connDist;

    const animate = () => {
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;
      const reduced = reducedMotionRef.current;

      // Build spatial grid
      const gridCols = Math.ceil(w / CELL_SIZE) + 1;
      const gridRows = Math.ceil(h / CELL_SIZE) + 1;
      const grid = new Map<number, number[]>();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;

          // Mouse repulsion
          if (enableMouseInteraction) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 10000 && distSq > 1) {
              const dist = Math.sqrt(distSq);
              p.vx += (dx / dist) * 0.02;
              p.vy += (dy / dist) * 0.02;
            }
          }

          // Dampen velocity
          p.vx *= 0.99;
          p.vy *= 0.99;

          // Wrap around
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        }

        const cx = Math.floor(p.x / CELL_SIZE);
        const cy = Math.floor(p.y / CELL_SIZE);
        const key = cy * gridCols + cx;
        let cell = grid.get(key);
        if (!cell) { cell = []; grid.set(key, cell); }
        cell.push(i);
      }

      // Draw connections
      if (showConnections) {
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const cx = Math.floor(p.x / CELL_SIZE);
          const cy = Math.floor(p.y / CELL_SIZE);

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const key = (cy + dy) * gridCols + (cx + dx);
              const cell = grid.get(key);
              if (!cell) continue;

              for (const j of cell) {
                if (j <= i) continue;
                const q = particles[j];
                const ddx = p.x - q.x;
                const ddy = p.y - q.y;
                const distSq = ddx * ddx + ddy * ddy;
                if (distSq < connDistSq) {
                  const alpha = (1 - Math.sqrt(distSq) / connDist) * 0.15;
                  ctx.strokeStyle = `rgba(203, 213, 225, ${alpha})`;
                  ctx.beginPath();
                  ctx.moveTo(p.x, p.y);
                  ctx.lineTo(q.x, q.y);
                  ctx.stroke();
                }
              }
            }
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;

        switch (p.shape) {
          case 'diamond':
            drawDiamond(ctx, p.x, p.y, p.size);
            break;
          case 'star':
            ctx.lineWidth = 0.8;
            drawStar(ctx, p.x, p.y, p.size);
            break;
          default:
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Glow orbs
      const orb1X = w * 0.5;
      const orb1Y = h * 0.25;
      const grad1 = ctx.createRadialGradient(orb1X, orb1Y, 0, orb1X, orb1Y, 300);
      grad1.addColorStop(0, 'rgba(139, 149, 165, 0.12)');
      grad1.addColorStop(1, 'rgba(139, 149, 165, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      const orb2X = w * 0.25;
      const orb2Y = h * 0.75;
      const grad2 = ctx.createRadialGradient(orb2X, orb2Y, 0, orb2X, orb2Y, 200);
      grad2.addColorStop(0, 'rgba(201, 205, 212, 0.08)');
      grad2.addColorStop(1, 'rgba(201, 205, 212, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [connectionDistance, showConnections, enableMouseInteraction, isMobile]);

  return (
    <canvas
      ref={canvasRef}
      data-ui="fer-canvas-particles"
      className={`pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
};
