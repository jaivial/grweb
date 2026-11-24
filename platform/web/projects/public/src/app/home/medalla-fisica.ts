import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Directive, ElementRef, PLATFORM_ID, afterNextRender, inject, input } from '@angular/core';
import { cdn } from '@grcup/ui';

/** Halo of each metal (Figma «Halo · Oro / Plata / Bronce»). */
const HALO = { gold: 'rgb(212 175 55 / 0.4)', silver: 'rgb(192 196 204 / 0.3)', bronze: 'rgb(200 131 90 / 0.35)' };

/**
 * Hanging medal with the physics of Figma page 79 («Medallas 3D · Podio»), as a damped pendulum around the top of the
 * ribbon: an idle wind F = A·sin(2πt/T + 2πφ) tuned to the target swing, a Y twist of ±8° (T 5.5 s), drag (spring
 * k 120 / c 12 towards the pointer, max 65°), release with the gesture's speed (clamped), a tap (< 6 px, < 200 ms)
 * gives an impulse of ~20°, and rest (|ω| < 0.05 for 1.2 s) brings the wind back with a 600 ms blend. Paused off
 * screen. prefers-reduced-motion: no wind and damping ×3 (still draggable). Without JS (server HTML) the CSS
 * «vaiven» keyframes of the section are the fallback; the directive replaces them once it runs. Only the medal disc
 * (bottom of the image, not the transparent ribbon box) is grabbed: the image stays pointer-events: none and the
 * hit test runs on document listeners, so the carousel and the text under the ribbons keep working.
 * (2D approximation of the R3F + Rapier spec: same parameters, no WebGL, no extra dependency.)
 * With `metal` + `cara` the disc becomes the 3D GLB (medalla-3d, lazy chunk loaded when the medal first shows up):
 * the image keeps only the ribbon and a canvas over the face draws the metal, which turns with the twist. Skipped with
 * reduced motion, Save-Data, ≤ 4 cores or no WebGL (the Figma image stays, as the spec's fallback).
 */
@Directive({ selector: '[grMedalla]', host: { class: 'pointer-events-none select-none' } })
export class MedallaFisica {
  /** Idle swing (degrees), period (s) and phase (0–1) of page 79's table. */
  readonly amp = input(4);
  readonly periodo = input(3.2);
  readonly fase = input(0);
  /** GLB of the disc and its face [x, y, w, h] in the px of the Figma frame `ancho` px wide (= the image). */
  readonly metal = input<'gold' | 'silver' | 'bronze' | null>(null);
  readonly cara = input<readonly [number, number, number, number] | null>(null);
  readonly ancho = input(300);

  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroy = inject(DestroyRef);
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    afterNextRender(() => {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.style.animation = 'none';
      el.querySelectorAll('img').forEach((i) => (i.draggable = false));
      const rad = Math.PI / 180;
      const w0 = (2 * Math.PI) / this.periodo();
      const c = reduced ? 4.8 : 1.6; // decay to rest in ≈ 3 s (×3 with reduced motion)
      const fuerza = this.amp() * rad * c * w0; // steady swing at resonance = F / (c·ω0)
      const max = 65 * rad;
      let th = 0, w = 0, viento = reduced ? 0 : 1, quieto = 0, escala = 1, hover = false;
      let drag: { x0: number; y0: number; t0: number; px: number; py: number } | null = null;
      let t = 0, antes = 0, raf = 0, visible = false;
      let disco: ((giro: number) => void) | null = null, pedido = false, vivo = true;
      let ro: ResizeObserver | undefined;

      const cargar3d = async () => {
        pedido = true;
        const metal = this.metal(), cara = this.cara();
        const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
        if (reduced || !metal || !cara || nav.connection?.saveData || (nav.hardwareConcurrency ?? 8) <= 4 || !('WebGL2RenderingContext' in window)) return;
        try {
          const { medalla3d } = await import('./medalla-3d');
          const m = await medalla3d(cdn(`/models/medals/${metal}.glb`));
          if (!vivo) return;
          const [x, y, w, h] = cara;
          const img = el.querySelector('img');
          let k = 1;
          const colocar = () => {
            k = el.offsetWidth / this.ancho();
            Object.assign(m.canvas.style, { left: x * k + 'px', top: y * k + 'px', width: w * k + 'px', height: h * k + 'px' });
            // the image keeps the ribbon and fades out over the tab of the disc: its baked medal and halo are hidden
            // under the canvas with no hard edge (a soft mask, not a clip)
            if (img) {
              const m = `linear-gradient(#000 ${(y - h * 0.08) * k}px, transparent ${(y + h * 0.18) * k}px)`;
              img.style.maskImage = m;
              img.style.webkitMaskImage = m;
            }
          };
          m.canvas.setAttribute('aria-hidden', 'true');
          Object.assign(m.canvas.style, { position: 'absolute', filter: `drop-shadow(0 0 ${Math.round(w / 10)}px ${HALO[metal]})` });
          colocar();
          m.pintar(w * k, h * k, 0);
          el.appendChild(m.canvas);
          disco = (giro) => m.pintar(w * k, h * k, giro);
          ro = new ResizeObserver(colocar);
          ro.observe(el);
        } catch {
          // no WebGL context or GLB: the image stays
        }
      };

      const pivote = () => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top };
      };
      /** The disc: central 70 % of the width, the bottom «width × 0.7» of the image. */
      const enDisco = (x: number, y: number) => {
        const r = el.getBoundingClientRect();
        return x > r.left + r.width * 0.15 && x < r.right - r.width * 0.15 && y < r.bottom && y > r.bottom - r.width * 0.7;
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
        // the metal turns a bit more than the ribbon so the reflections travel across the face
        disco?.(giro * 3 * rad);
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
        if (!visible || drag || !enDisco(e.clientX, e.clientY)) return;
        drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), px: e.clientX, py: e.clientY };
        viento = 0;
        document.documentElement.style.cursor = 'grabbing';
        document.documentElement.style.userSelect = 'none';
      };
      const mueve = (e: PointerEvent) => {
        if (!drag) {
          if (visible && e.pointerType === 'mouse') hover = enDisco(e.clientX, e.clientY);
          return;
        }
        drag.px = e.clientX;
        drag.py = e.clientY;
      };
      const arriba = (e: PointerEvent, cancelado = false) => {
        if (!drag) return;
        const tap = !cancelado && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6 && performance.now() - drag.t0 < 200;
        drag = null;
        document.documentElement.style.cursor = '';
        document.documentElement.style.userSelect = '';
        if (tap) {
          // impulse at the touched side: ~20° swing (a bit less on phones, as the spec's 2.4 vs 1.6)
          const lado = e.clientX < pivote().x ? 1 : -1;
          w = lado * 20 * rad * w0 * (innerWidth < 1024 ? 0.7 : 1);
        } else {
          w = Math.max(-8, Math.min(8, w));
        }
        quieto = 0;
      };
      // a touch pan cancels the pointer: the medal is released without the tap impulse and the page scrolls
      const cancela = (e: PointerEvent) => arriba(e, true);
      const sube = (e: PointerEvent) => arriba(e);
      document.addEventListener('pointerdown', abajo, { passive: true });
      document.addEventListener('pointermove', mueve, { passive: true });
      document.addEventListener('pointerup', sube, { passive: true });
      document.addEventListener('pointercancel', cancela, { passive: true });
      const io = new IntersectionObserver((es) => {
        visible = es.some((x) => x.isIntersecting);
        if (visible && !pedido) void cargar3d();
        if (visible) arrancar();
        else parar();
      });
      io.observe(el);
      destroy.onDestroy(() => {
        vivo = false;
        ro?.disconnect();
        parar();
        io.disconnect();
        document.removeEventListener('pointerdown', abajo);
        document.removeEventListener('pointermove', mueve);
        document.removeEventListener('pointerup', sube);
        document.removeEventListener('pointercancel', cancela);
      });
    });
  }
}
