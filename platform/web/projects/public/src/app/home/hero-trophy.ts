import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrIcon, GrLogo } from '@grcup/ui';

const FRAMES = 313;
const frameUrl = (i: number) => `https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_${String(i + 1).padStart(4, '0')}.webp`;

/** Scroll timeline of Figma page 04 «Hero · Storyboard scroll» (the previous web's animation, same thresholds). */
const T = { textoFuera: [0.12, 0.21], humo: [0.01, 0.12], frames: [0.04, 0.667], nubes: [0.567, 0.667] } as const;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const tramo = (p: number, [a, b]: readonly [number, number]) => Math.min(1, Math.max(0, (p - a) / (b - a)));

/**
 * «Smoke (aprox. WebGL)» of Figma: six puffs (radial grey 32 % → 12 % → 0, blur 80) placed on the 1440×900 frame.
 * `dx` is the sideways drift while the smoke clears (the previous web's clouds drift the same way).
 */
const PUFFS = [
  { x: -336, y: -161, w: 1104, h: 773, dx: 0.5 },
  { x: 582, y: -163, w: 852, h: 596, dx: -0.8 },
  { x: 106, y: 116, w: 1083, h: 758, dx: 0.7 },
  { x: -310, y: 408, w: 764, h: 535, dx: -1.5 },
  { x: 876, y: 387, w: 696, h: 487, dx: 1.3 },
  { x: 427, y: -211, w: 731, h: 512, dx: 0.8 },
].map((p) => ({ left: (p.x / 1440) * 100, top: (p.y / 900) * 100, width: (p.w / 1440) * 100, height: (p.h / 900) * 100, dx: p.dx }));

/**
 * Scroll-driven hero (Figma 04): preload with the trophy icon, smoke intro with the title, the 313 trophy frames
 * (contained, 2:3, with the radial vignette and the red glow of the storyboard), clouds and fog entering, and the
 * hand-over to «Campeonato». Frames load progressively (first ones, every 8th, the rest) and the nearest loaded frame
 * is drawn meanwhile. With prefers-reduced-motion the section is one screen: smoke, title and the last frame.
 */
@Component({
  selector: 'gr-hero-trophy',
  imports: [GrIcon, GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '[style.height]': 'reduced() ? "100dvh" : "500vh"' },
  template: `
    <div class="sticky top-0 h-dvh overflow-hidden bg-bg-base">
      <!-- «Fondo»: grey at the top while the smoke is on screen (Figma intro), base later -->
      <div class="absolute inset-0 bg-[linear-gradient(180deg,#3a3435_0%,#252021_65%,#141112_100%)]" [style.opacity]="humo()"></div>
      <!-- Trophy: 2:3 box, 80 % of the height, red glow behind and the radial vignette of the storyboard -->
      <div class="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.35),transparent)]" [style.opacity]="trofeo()"></div>
      <div class="absolute top-[6.4%] left-1/2 aspect-[2/3] h-[80%] max-w-[92vw] -translate-x-1/2" [style.opacity]="trofeo()">
        <canvas #canvas class="size-full" aria-hidden="true"></canvas>
        <div class="absolute inset-0 bg-[radial-gradient(closest-side,transparent_42%,#141112_100%)]"></div>
      </div>
      <!-- Smoke of the intro (clears and drifts away) -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true" [style.opacity]="humo()">
        @for (p of puffs; track $index) {
          <span class="absolute rounded-full bg-[radial-gradient(closest-side,rgb(138_138_138/0.32),rgb(90_90_90/0.12)_60%,transparent)] blur-[80px] will-change-transform"
            [style.left.%]="p.left" [style.top.%]="p.top" [style.width.%]="p.width" [style.height.%]="p.height"
            [style.transform]="'translate(' + p.dx * desvio() * 30 + '%, ' + -desvio() * 35 + '%)'"></span>
        }
      </div>
      <!-- Clouds and fog entering from below (56.7 → 66.7 %) and the next section's title -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true" [style.opacity]="nubes()" [style.transform]="'translateY(' + (1 - nubes()) * 40 + '%)'">
        @for (p of puffs; track $index) {
          <span class="absolute rounded-full bg-[radial-gradient(closest-side,rgb(138_138_138/0.32),rgb(90_90_90/0.12)_60%,transparent)] blur-[80px]"
            [style.left.%]="p.left" [style.top.%]="p.top + 30" [style.width.%]="p.width" [style.height.%]="p.height"></span>
        }
      </div>
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[linear-gradient(180deg,rgb(58_58_58/0)_0%,rgb(42_42_42/0.85)_50%,#141112_100%)]" [style.opacity]="nubes()"></div>
      <div class="pointer-events-none absolute inset-x-0 top-[68%] flex flex-col items-center gap-3 px-5 text-center" [style.opacity]="siguiente()">
        <gr-logo [height]="44" />
        <p class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)]">Campeonato de powerlifting</p>
      </div>
      <!-- Bottom fade (300 px, base) -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] bg-[linear-gradient(180deg,transparent,#141112)]"></div>
      <!-- Intro text: logo, tagline and date · place -->
      <div class="absolute inset-x-0 top-[30%] flex flex-col items-center gap-4 px-5 text-center transition-opacity duration-700 md:top-[31%] md:gap-5" [style.opacity]="texto()">
        <img [src]="logo" alt="GR Strength Cup" class="h-11 w-auto select-none md:h-[97px]" draggable="false" fetchpriority="high" />
        <h1 class="text-display-m [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-hero">{{ titulo() || 'Los ganadores nunca se rinden' }}</h1>
        @if (metaPartes().length) {
          <p class="flex flex-wrap items-center justify-center gap-2.5 text-label-xs text-text-secondary">
            @for (m of metaPartes(); track $index) { @if ($index) { <span class="size-1 rounded-full bg-accent" aria-hidden="true"></span> }<span>{{ m }}</span> }
          </p>
        }
      </div>
      @if (!reduced()) {
        <div class="absolute inset-x-0 bottom-[110px] flex flex-col items-center gap-2 text-label-xs text-text-tertiary transition-opacity duration-500 md:bottom-[70px]" [style.opacity]="pista()">
          Desliza<gr-icon name="arrow-down" [size]="18" class="animate-bounce text-text-muted" />
        </div>
        <button type="button" (click)="skip()" [class.invisible]="finished()"
          class="absolute bottom-8 left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-pill border border-white/15 bg-white/8 px-4 text-label-s backdrop-blur-[20px] hover:border-white/30 md:right-[120px] md:bottom-9 md:left-auto md:translate-x-0">
          Saltar intro<gr-icon name="arrow-down" [size]="16" />
        </button>
        <!-- «Hero preload»: trophy icon, bar and percentage while the first frames arrive -->
        @if (precarga()) {
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg-base transition-opacity duration-500" [style.opacity]="precargaFuera() ? 0 : 1"
            role="progressbar" aria-label="Cargando la animación" [attr.aria-valuenow]="criticoPct()" aria-valuemin="0" aria-valuemax="100">
            <img src="/img/home/trofeo.webp" alt="" class="h-[70px] w-20 animate-pulse object-contain" />
            <div class="h-2 w-64 overflow-hidden rounded-pill bg-bg-surface"><div class="h-full rounded-pill bg-[linear-gradient(90deg,#0e0c0d,#a82334)] transition-[width] duration-300" [style.width.%]="criticoPct()"></div></div>
            <p class="text-body-xs text-text-tertiary">{{ criticoPct() }} %</p>
          </div>
        }
      }
    </div>
  `,
})
export class HeroTrophy {
  /** "25 JULIO 2026 · ALMUSSAFES · VALENCIA" */
  readonly meta = input('');
  /** Title from the CMS (section «hero»). */
  readonly titulo = input('');
  /** Emits true once the intro has been scrolled through (the navbar shows from then on). */
  readonly done = output<boolean>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly puffs = PUFFS;
  protected readonly reduced = signal(false);
  protected readonly finished = signal(false);
  /** Share of the frames the preload waits for (the first 12 of the loading order). */
  protected readonly criticoPct = signal(0);
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';
  /** Preload overlay: shown until the first frames are in (never longer than 4 s), then fades out. */
  protected readonly precarga = signal(true);
  protected readonly precargaFuera = signal(false);
  private readonly p = signal(0);
  private readonly aparecido = signal(false);
  protected readonly metaPartes = computed(() => (this.meta() || '').split(' · ').filter(Boolean));
  // values of the timeline for the current (smoothed) progress
  protected readonly texto = computed(() => (this.aparecido() ? 1 - ease(tramo(this.p(), T.textoFuera)) : 0));
  protected readonly pista = computed(() => (this.aparecido() && this.p() < 0.05 ? 1 : 0));
  protected readonly humo = computed(() => (this.reduced() ? 1 : 1 - ease(tramo(this.p(), T.humo)) * 0.85));
  protected readonly desvio = computed(() => ease(tramo(this.p(), T.humo)));
  protected readonly trofeo = computed(() => (this.reduced() ? 0.35 : Math.min(1, tramo(this.p(), [0.03, 0.1]))));
  protected readonly nubes = computed(() => ease(tramo(this.p(), T.nubes)));
  protected readonly siguiente = computed(() => ease(tramo(this.p(), [0.6, 0.667])) * (1 - tramo(this.p(), [0.75, 0.85])));

  private frames: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
  private progress = 0;
  private shown = 0;
  private drawn = -1;
  private raf = 0;
  private wasDone = false;
  private step = 1;
  private io?: IntersectionObserver;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!this.browser) return;
      setTimeout(() => this.aparecido.set(true), 300);
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
      const fin = () => { this.precargaFuera.set(true); setTimeout(() => this.precarga.set(false), 500); };
      const tope = setTimeout(fin, 4000);
      if (reduced) {
        this.load([FRAMES - 1], () => { this.draw(ctx, FRAMES - 1); fin(); });
        this.done.emit(true);
      } else {
        // Phones and Save-Data connections get one frame in three (~3.7 MB instead of ~11 MB): the nearest
        // loaded frame is drawn, so the motion stays smooth at small sizes.
        const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
        this.step = window.innerWidth < 768 || conn?.saveData ? 3 : 1;
        const criticos = 12;
        let n = 0;
        this.preload(() => {
          this.drawn = -1;
          this.criticoPct.set(Math.min(100, Math.round((++n / criticos) * 100)));
          if (n === criticos) { clearTimeout(tope); fin(); }
        });
        const loop = () => {
          this.measure();
          this.shown += (this.progress - this.shown) * 0.15; // smoothing (same as the previous web)
          this.p.set(this.shown);
          const f = tramo(this.shown, T.frames);
          this.draw(ctx, Math.round(f * (FRAMES - 1)));
          this.raf = requestAnimationFrame(loop);
        };
        // The loop only runs while the hero is on screen (no work while reading the rest of the page).
        this.io = new IntersectionObserver(([entry]) => {
          cancelAnimationFrame(this.raf);
          if (entry.isIntersecting) {
            this.raf = requestAnimationFrame(loop);
          } else {
            this.measure(); // settle the intro state (navbar) for the position we left it at
          }
        });
        this.io.observe(this.host.nativeElement);
      }
      destroy.onDestroy(() => {
        cancelAnimationFrame(this.raf);
        clearTimeout(tope);
        this.io?.disconnect();
        ro.disconnect();
      });
    });
  }

  private measure(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    this.progress = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    const isDone = this.progress > 0.97 || r.bottom < window.innerHeight * 0.5;
    if (isDone !== this.wasDone) {
      this.wasDone = isDone;
      this.finished.set(isDone);
      this.done.emit(isDone);
    }
  }

  /** Draws the frame (or the nearest loaded one) covering the 2:3 box. */
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

  /** First frames → every 8th → the rest (every `step`-th, plus the last one), 6 requests at a time. */
  private preload(onFrame: () => void): void {
    const wanted = (i: number) => i % this.step === 0 || i === FRAMES - 1;
    const order: number[] = [0, 1, 2, 3, 4].filter(wanted);
    for (let i = 8; i < FRAMES; i += 8) if (wanted(i)) order.push(i);
    for (let i = 5; i < FRAMES; i++) if (wanted(i) && !order.includes(i)) order.push(i);
    this.load(order, onFrame);
  }

  private load(order: number[], onFrame: () => void): void {
    let next = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++];
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        if (img.naturalWidth) this.frames[i] = img;
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
