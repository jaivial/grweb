import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrIcon, GrLogo } from '@grcup/ui';

const FRAMES = 313;
const frameUrl = (i: number) => `https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_${String(i + 1).padStart(4, '0')}.webp`;

/**
 * Scroll-driven trophy intro (Figma page 04 «Storyboard hero», v7 «Skip intro» 44 px).
 * 313 WebP frames from the CDN drawn on a canvas while the 500 vh section scrolls; frames load progressively
 * (first ones, then a coarse pass, then the rest) and the nearest loaded frame is shown meanwhile.
 * With prefers-reduced-motion the section is one screen with the final frame.
 */
@Component({
  selector: 'gr-hero-trophy',
  imports: [GrIcon, GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '[style.height]': 'reduced() ? "100dvh" : "500vh"' },
  template: `
    <div class="sticky top-0 h-dvh overflow-hidden bg-bg-deep" [style.background-image]="'url(' + poster + ')'" style="background-size: cover; background-position: center">
      <canvas #canvas class="absolute inset-0 size-full" aria-hidden="true"></canvas>
      <div class="pointer-events-none absolute inset-0" style="background: radial-gradient(80% 60% at 50% 40%, transparent 0%, rgb(14 12 13 / 0.55) 70%, rgb(14 12 13 / 0.95) 100%)"></div>
      <div class="absolute inset-x-0 top-[18%] flex flex-col items-center px-5 text-center transition-opacity duration-300 md:top-[22%]" [style.opacity]="titleOpacity()">
        <gr-logo [height]="60" />
        <h1 class="mt-5 text-display-m text-shadow-[0_2px_20px_rgb(0_0_0/0.8)] md:text-display-xl">Los ganadores nunca se rinden</h1>
        @if (meta()) { <p class="mt-4 text-mono-xs text-text-secondary">{{ meta() }}</p> }
      </div>
      @if (!reduced()) {
        <div class="absolute inset-x-0 bottom-24 flex flex-col items-center gap-2 text-mono-xs text-text-tertiary transition-opacity md:bottom-12" [style.opacity]="titleOpacity()">
          Desliza<gr-icon name="arrow-down" [size]="16" class="animate-bounce" />
        </div>
        <button type="button" (click)="skip()" [class.invisible]="finished()" class="absolute right-5 bottom-6 inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong bg-bg-base/70 px-4 text-label-s backdrop-blur-[20px] hover:border-text-muted md:right-8 xl:right-[120px]">
          Saltar intro<gr-icon name="arrow-down" [size]="16" />
        </button>
        @if (loaded() < 1) {
          <div class="absolute inset-x-0 top-0 h-0.5 bg-white/5" role="progressbar" aria-label="Cargando animación" [attr.aria-valuenow]="loadedPct()"><div class="h-full bg-accent transition-[width]" [style.width.%]="loaded() * 100"></div></div>
        }
      }
    </div>
  `,
})
export class HeroTrophy {
  /** "25 JULIO 2026 · ALMUSSAFES · VALENCIA" */
  readonly meta = input('');
  /** Emits true once the intro has been scrolled through (the navbar shows from then on). */
  readonly done = output<boolean>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly poster = frameUrl(0);
  protected readonly reduced = signal(false);
  protected readonly loaded = signal(0);
  protected readonly titleOpacity = signal(1);
  protected readonly finished = signal(false);
  protected readonly loadedPct = computed(() => Math.round(this.loaded() * 100));

  private frames: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
  private progress = 0;
  private shown = 0;
  private drawn = -1;
  private raf = 0;
  private wasDone = false;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!this.browser) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.reduced.set(reduced);
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (!ctx) return;
      const resize = () => {
        const c = this.canvas().nativeElement;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(c.clientWidth * dpr);
        c.height = Math.round(c.clientHeight * dpr);
        this.drawn = -1;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(this.canvas().nativeElement);
      if (reduced) {
        this.load([FRAMES - 1], () => this.draw(ctx, FRAMES - 1));
        this.done.emit(true);
      } else {
        this.preload(() => (this.drawn = -1));
        const loop = () => {
          this.measure();
          this.shown += (this.progress - this.shown) * 0.15; // smoothing (same as the current site)
          const idx = Math.round(this.shown * (FRAMES - 1));
          this.draw(ctx, idx);
          this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
      }
      destroy.onDestroy(() => {
        cancelAnimationFrame(this.raf);
        ro.disconnect();
      });
    });
  }

  private measure(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    this.progress = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    this.titleOpacity.set(Math.max(0, 1 - this.progress / 0.22));
    const isDone = this.progress > 0.97 || r.bottom < window.innerHeight * 0.5;
    if (isDone !== this.wasDone) {
      this.wasDone = isDone;
      this.finished.set(isDone);
      this.done.emit(isDone);
    }
  }

  private draw(ctx: CanvasRenderingContext2D, want: number): void {
    let idx = -1;
    for (let d = 0; d < FRAMES; d++) {
      if (this.frames[want - d]) { idx = want - d; break; }
      if (this.frames[want + d]) { idx = want + d; break; }
    }
    if (idx < 0 || idx === this.drawn) return;
    const img = this.frames[idx]!;
    const { width: cw, height: ch } = ctx.canvas;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    this.drawn = idx;
  }

  /** First frames → every 8th → the rest, 6 requests at a time. */
  private preload(onFrame: () => void): void {
    const order: number[] = [0, 1, 2, 3, 4];
    for (let i = 8; i < FRAMES; i += 8) order.push(i);
    for (let i = 5; i < FRAMES; i++) if (!order.includes(i)) order.push(i);
    this.load(order, onFrame);
  }

  private load(order: number[], onFrame: () => void): void {
    let next = 0, done = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++];
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        if (img.naturalWidth) this.frames[i] = img;
        this.loaded.set(++done / order.length);
        onFrame();
        pump();
      };
      img.src = frameUrl(i);
    };
    for (let k = 0; k < 6; k++) pump();
  }

  protected skip(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    // Land exactly at the start of the next section (it reserves room for the navbar).
    window.scrollTo({ top: window.scrollY + r.bottom, behavior: this.reduced() ? 'auto' : 'smooth' });
  }
}
