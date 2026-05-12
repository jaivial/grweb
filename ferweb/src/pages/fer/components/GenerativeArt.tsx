import { FC, useRef, useEffect, useMemo } from 'react';
import { FER_COLORS } from '../constants';

interface GenerativeArtProps {
  className?: string;
  palette?: string[];
}

// Simple Perlin-like noise using sine combinations
function noise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.8 + t * 0.3) * 0.3 +
    Math.sin(y * 0.6 + t * 0.5) * 0.3 +
    Math.sin((x + y) * 0.5 + t * 0.2) * 0.2 +
    Math.sin(Math.sqrt(x * x + y * y) * 0.4 - t * 0.4) * 0.2
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export const GenerativeArt: FC<GenerativeArtProps> = ({
  className = '',
  palette,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const colors = useMemo(
    () =>
      (palette ?? [FER_COLORS.accent, FER_COLORS.purple, FER_COLORS.gold]).map(hexToRgb),
    [palette]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    let w = parent.clientWidth;
    let h = parent.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        w = parent.clientWidth;
        h = parent.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }, 150);
    };
    window.addEventListener('resize', handleResize);

    // Draw static gradient for reduced-motion
    if (reducedMotion) {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      const [c0] = colors;
      const [c1] = colors.length > 1 ? colors : colors;
      const [c2] = colors.length > 2 ? [colors[2]] : [colors[0]];
      grad.addColorStop(0, `rgba(${c0[0]}, ${c0[1]}, ${c0[2]}, 0.6)`);
      grad.addColorStop(0.5, `rgba(${c1[0]}, ${c1[1]}, ${c1[2]}, 0.6)`);
      grad.addColorStop(1, `rgba(${c2[0]}, ${c2[1]}, ${c2[2]}, 0.6)`);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return () => window.removeEventListener('resize', handleResize);
    }

    // Render at lower resolution for performance
    const scale = 4;
    const rw = Math.ceil(w / scale);
    const rh = Math.ceil(h / scale);
    const offscreen = document.createElement('canvas');
    offscreen.width = rw;
    offscreen.height = rh;
    const offCtx = offscreen.getContext('2d')!;
    const imgData = offCtx.createImageData(rw, rh);

    // Small overlay particles
    const overlayParticles = Array.from({ length: 30 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: 1 + Math.random() * 2,
      speed: 0.1 + Math.random() * 0.3,
      opacity: 0.2 + Math.random() * 0.3,
    }));

    let time = 0;
    let mouse = { x: w / 2, y: h / 2 };

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.parentElement?.addEventListener('mousemove', handleMove, { passive: true });

    const animate = () => {
      time += 0.012;
      const data = imgData.data;

      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const x = px / rw;
          const y = py / rh;

          // Mouse distortion
          const mx = mouse.x / w;
          const my = mouse.y / h;
          const distToMouse = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
          const mouseInfluence = Math.max(0, 1 - distToMouse * 2.5) * 0.15;

          const n1 = noise(x * 3, y * 3, time);
          const n2 = noise(x * 2 + 5, y * 2 + 3, time * 0.7);
          const n3 = noise(x * 4 + 10, y * 4 + 7, time * 1.3);

          const blend = (n1 + 1) / 2 + mouseInfluence;
          const blend2 = (n2 + 1) / 2;
          const blend3 = (n3 + 1) / 2;

          const idx = Math.floor(blend * (colors.length - 0.01));
          const idx2 = Math.floor(blend2 * (colors.length - 0.01));
          const c0 = colors[idx % colors.length];
          const c1 = colors[idx2 % colors.length];

          const t = blend3;
          const r = c0[0] * (1 - t) + c1[0] * t;
          const g = c0[1] * (1 - t) + c1[1] * t;
          const b = c0[2] * (1 - t) + c1[2] * t;

          const i = (py * rw + px) * 4;
          data[i] = Math.round(r);
          data[i + 1] = Math.round(g);
          data[i + 2] = Math.round(b);
          data[i + 3] = 180;
        }
      }

      offCtx.putImageData(imgData, 0, 0);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Draw mesh gradient scaled up with smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, 0, w, h);

      // Overlay particles
      for (const p of overlayParticles) {
        p.y -= p.speed;
        if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = FER_COLORS.text;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
      canvas.parentElement?.removeEventListener('mousemove', handleMove);
      clearTimeout(resizeTimer);
    };
  }, [colors]);

  return (
    <canvas
      ref={canvasRef}
      data-ui="fer-generative-art"
      className={`w-full h-full ${className}`}
      aria-hidden="true"
    />
  );
};
