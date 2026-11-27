/**
 * Confetti for a success: a short canvas burst over the page (1.6 s), then the canvas removes itself.
 * Browser only (SSR-safe) and silent when the person asked for reduced motion: the message is the real feedback.
 */
export function confetti(colores: string[] = ['#c42b3e', '#e6606b', '#f4f4f5', '#22c55e', '#f9a8d4'], duracion = 1600): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:80;pointer-events:none;width:100%;height:100%';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  // Two side bursts plus a small shower from the middle so it reads on a phone.
  const piezas = Array.from({ length: 140 }, (_, i) => {
    const lado = i % 2 ? 1 : -1;
    const desdeLado = i % 3 !== 0;
    return {
      x: desdeLado ? (lado < 0 ? 0 : ancho) : ancho / 2,
      y: desdeLado ? alto * 0.62 : alto * 0.4,
      vx: (Math.random() * 7 + 2) * lado * (desdeLado ? 1 : 0.4),
      vy: -(Math.random() * 9 + 5),
      w: Math.random() * 6 + 4,
      h: Math.random() * 4 + 3,
      giro: Math.random() * Math.PI,
      vGiro: (Math.random() - 0.5) * 0.3,
      color: colores[i % colores.length],
    };
  });
  const inicio = performance.now();
  const paso = (ahora: number) => {
    const t = ahora - inicio;
    const k = t / duracion;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.globalAlpha = k > 0.75 ? Math.max(0, 1 - (k - 0.75) / 0.25) : 1;
    for (const p of piezas) {
      p.vy += 0.22; // gravedad
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vGiro;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < duracion) requestAnimationFrame(paso);
    else canvas.remove();
  };
  requestAnimationFrame(paso);
}
