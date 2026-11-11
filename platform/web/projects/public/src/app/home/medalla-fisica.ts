import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Directive, ElementRef, PLATFORM_ID, afterNextRender, inject, input } from '@angular/core';

/**
 * Hanging medal with the physics of Figma page 79 («Medallas 3D · Podio»), as a damped pendulum around the top of the
 * ribbon: an idle wind F = A·sin(2πt/T + 2πφ) tuned to the target swing, a Y twist of ±8° (T 5.5 s), drag (spring
 * k 120 / c 12 towards the pointer, max 65°), release with the gesture's speed (clamped), a tap (< 6 px, < 200 ms)
 * gives an impulse of ~20°, and rest (|ω| < 0.05 for 1.2 s) brings the wind back with a 600 ms blend. Paused off
 * screen. prefers-reduced-motion: no wind and damping ×3 (still draggable). Without JS (server HTML) the CSS
 * «vaiven» keyframes of the section are the fallback; the directive replaces them once it runs.
 * (2D approximation of the R3F + Rapier spec: same parameters, no WebGL, no extra dependency.)
 */
@Directive({ selector: 'img[grMedalla]', host: { class: 'pointer-events-auto cursor-grab touch-pan-y select-none' } })
export class MedallaFisica {
  /** Idle swing (degrees), period (s) and phase (0–1) of page 79's table. */
  readonly amp = input(4);
  readonly periodo = input(3.2);
  readonly fase = input(0);

  constructor() {
    const el = inject(ElementRef<HTMLImageElement>).nativeElement as HTMLImageElement;
    const destroy = inject(DestroyRef);
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    afterNextRender(() => {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.style.animation = 'none';
      el.draggable = false;
      const rad = Math.PI / 180;
      const w0 = (2 * Math.PI) / this.periodo();
      const c = reduced ? 4.8 : 1.6; // decay to rest in ≈ 3 s (×3 with reduced motion)
      const fuerza = this.amp() * rad * c * w0; // steady swing at resonance = F / (c·ω0)
      const max = 65 * rad;
      let th = 0, w = 0, viento = reduced ? 0 : 1, quieto = 0, escala = 1, hover = false;
      let drag: { x0: number; y0: number; t0: number; px: number; py: number } | null = null;
      let t = 0, antes = 0, raf = 0, visible = false;

      const pivote = () => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top };
      };
      const paso = (ahora: number) => {
        const dt = Math.min(0.033, (ahora - (antes || ahora)) / 1000);
        antes = ahora;
        t += dt;
        let a: number;
        if (drag) {
          const p = pivote();
          const meta = Math.max(-max, Math.min(max, Math.atan2(p.x - drag.px, drag.py - p.y)));
          a = 120 * (meta - th) - 12 * w;
        } else {
          a = -w0 * w0 * Math.sin(th) - c * w + viento * fuerza * Math.sin(w0 * t + 2 * Math.PI * this.fase());
          if (!reduced && viento < 1) {
            quieto = Math.abs(w) < 0.05 ? quieto + dt : 0;
            if (quieto > 1.2) viento = Math.min(1, viento + dt / 0.6);
          }
        }
        w += a * dt;
        th = Math.max(-max, Math.min(max, th + w * dt));
        escala += ((hover || drag ? 1.04 : 1) - escala) * Math.min(1, dt * 12);
        const giro = reduced ? 0 : 8 * Math.sin((2 * Math.PI * t) / 5.5 + 2 * Math.PI * this.fase());
        el.style.transform = `perspective(900px) rotate(${th}rad) rotateY(${giro}deg) scale(${escala})`;
        raf = requestAnimationFrame(paso);
      };
      const arrancar = () => {
        if (raf || !visible) return;
        antes = 0;
        raf = requestAnimationFrame(paso);
      };
      const parar = () => {
        cancelAnimationFrame(raf);
        raf = 0;
      };

      const abajo = (e: PointerEvent) => {
        drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), px: e.clientX, py: e.clientY };
        viento = 0;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
      };
      const mueve = (e: PointerEvent) => {
        if (!drag) return;
        drag.px = e.clientX;
        drag.py = e.clientY;
      };
      const arriba = (e: PointerEvent) => {
        if (!drag) return;
        const tap = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6 && performance.now() - drag.t0 < 200;
        drag = null;
        el.style.cursor = '';
        if (tap) {
          // impulse at the touched side: ~20° swing (a bit less on phones, as the spec's 2.4 vs 1.6)
          const lado = e.clientX < pivote().x ? 1 : -1;
          w = lado * 20 * rad * w0 * (innerWidth < 1024 ? 0.7 : 1);
        } else {
          w = Math.max(-8, Math.min(8, w));
        }
        quieto = 0;
      };
      el.addEventListener('pointerdown', abajo);
      el.addEventListener('pointermove', mueve);
      el.addEventListener('pointerup', arriba);
      el.addEventListener('pointercancel', arriba);
      el.addEventListener('pointerenter', () => (hover = true));
      el.addEventListener('pointerleave', () => (hover = false));
      el.addEventListener('dragstart', (e) => e.preventDefault());
      const io = new IntersectionObserver((es) => {
        visible = es.some((x) => x.isIntersecting);
        if (visible) arrancar();
        else parar();
      });
      io.observe(el);
      destroy.onDestroy(() => {
        parar();
        io.disconnect();
      });
    });
  }
}
