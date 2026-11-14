import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';
import { VideoScrub } from '../core/video-scrub';

const FRAMES = 313;
export interface HeroCms { eyebrow?: string; fecha?: string; ctaTexto?: string; ctaDestino?: string; imagen?: string; focalX?: number; focalY?: number }
const FPS = 24;
const VIDEO_MOBILE = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/copa-scroll/copa-600x900.mp4';
const VIDEO_DESKTOP = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/copa-scroll/copa-720x1080.mp4';
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
 * Scroll-driven hero (Figma 04): smoke, title, trophy, clouds and the hand-over to «Campeonato», with the same thresholds.
 * A paused H.264 video is seeked to frame centres, coalescing scroll updates into one seek in flight; a fixed WebP covers
 * loading and failures. Its small Blob and decoder buffers replace the 313 retained image bitmaps (and the canvas).
 * With prefers-reduced-motion the section is one screen with the last WebP and no video download.
 */
@Component({
  selector: 'gr-hero-trophy',
  imports: [GrIcon, GrButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // UX1-R1-1/6: 200vh on phones (500vh from md), one screen with reduced motion - in CSS, so it holds from the SSR paint
  host: { class: 'relative block' },
  template: `
    <div class="sticky top-0 h-dvh overflow-hidden bg-bg-base">
      <!-- «Fondo»: grey at the top while the smoke is on screen (Figma intro), base later -->
      <div class="absolute inset-0 bg-[linear-gradient(180deg,#3a3435_0%,#252021_65%,#141112_100%)]" [style.opacity]="humo()"></div>
      <!-- Trophy: 2:3 box, 80 % of the height, red glow behind. The frames' near-black lightens into whatever is behind
           (blend «lighten», as in Figma) and every edge fades out (mask), so the box never shows on wide screens. -->
      <div class="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.35),transparent)]" [style.opacity]="trofeo()"></div>
      <div class="gr-trofeo-fundido absolute top-[6.4%] left-1/2 aspect-[2/3] h-[80%] max-w-[92vw] -translate-x-1/2 mix-blend-lighten" [style.opacity]="trofeo()">
        <video #video muted playsinline preload="auto" disablepictureinpicture disableremoteplayback aria-hidden="true" class="size-full object-cover"></video>
        <img [src]="imagenTrofeo()" alt="" fetchpriority="high" class="absolute inset-0 size-full object-cover" [class.hidden]="!imagenFija()" />
      </div>
      <!-- U30 · Figma 54: background image with focal point; with motion it fades out with the intro text (U31-R1-15) -->
      @if (hero().imagen) {
        <img [src]="hero().imagen" alt="" class="absolute inset-0 size-full object-cover" [style.opacity]="reduced() ? 0.6 : 0.6 * texto()" [style.object-position]="(hero().focalX ?? 50) + '% ' + (hero().focalY ?? 50) + '%'" />
      }
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
      <!-- Bottom fade (300 px, base) -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] bg-[linear-gradient(180deg,transparent,#141112)]"></div>
      <!-- Intro (BIZ-144 · Hero 2026): AEP logo, GR CUP 2026 logo, tagline, dates + place and the hero sponsors -->
      <div class="absolute inset-x-0 top-[84px] flex flex-col items-center px-5 text-center transition-opacity duration-700 md:top-[78px] motion-reduce:transition-none" [style.opacity]="texto()">
        <img src="/img/home/aep-hero.webp" alt="AEP · Asociación Española de Powerlifting" width="108" height="40" class="h-8 w-auto select-none md:h-10" draggable="false" />
        <img [src]="logo" alt="GR Strength Cup 2026" class="mt-[57px] h-[125px] w-auto select-none md:mt-[63px] md:h-[198px]" draggable="false" fetchpriority="high" />
        @if (hero().eyebrow) { <p class="mt-10 text-label-xs tracking-[0.12em] text-accent-text uppercase">{{ hero().eyebrow }}</p> }
        <h1 class="max-w-[1000px] font-display text-[30px] leading-[1.05] tracking-[-0.01em] uppercase [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-[56px]" [class]="hero().eyebrow ? 'mt-3' : 'mt-[65px]'">{{ titulo() || 'Los ganadores nunca se rinden' }}</h1>
        @if (hero().fecha || fechas() || lugar()) {
          <p class="mt-[66px] flex flex-col items-center gap-1 md:mt-[63px]">
            @if (hero().fecha || fechas()) { <span class="font-archivo text-[14px] leading-[15px] font-extrabold tracking-[0.08em] uppercase md:text-[20px] md:leading-[22px]">{{ hero().fecha || fechas() }}</span> }
            @if (lugar()) { <span class="font-archivo text-[9px] leading-[10px] font-medium tracking-[0.1em] text-text-secondary uppercase md:text-[11px] md:leading-3">{{ lugar() }}</span> }
          </p>
        } @else if (metaPartes().length) {
          <p class="mt-10 flex flex-wrap items-center justify-center gap-2.5 text-label-xs text-text-secondary">
            @for (m of metaPartes(); track $index) { @if ($index) { <span class="size-1 rounded-full bg-accent" aria-hidden="true"></span> }<span>{{ m }}</span> }
          </p>
        }
        @if (hero().ctaTexto && hero().ctaDestino) {
          <a grButton variant="primary" size="l" class="pointer-events-auto mt-8" [routerLink]="hero().ctaDestino">{{ hero().ctaTexto }}</a>
        }
        @if (patrocinadores().length) {
          <ul class="mt-16 flex flex-wrap items-center justify-center gap-2 md:mt-[63px] md:gap-4" aria-label="Organizan y colaboran">
            @for (p of patrocinadores(); track p.nombre) {
              <li class="flex h-11 w-[104px] items-center justify-center p-1.5 md:h-14 md:w-[176px]">
                @if (!p.logoUrl) { <span class="text-label-s text-text-secondary">{{ p.nombre }}</span> }
                @else if (p.url) { <a [href]="p.url" target="_blank" rel="noopener" class="size-full"><img [src]="p.logoUrl" [alt]="p.nombre" class="size-full object-contain" loading="lazy" decoding="async" /></a> }
                @else { <img [src]="p.logoUrl" [alt]="p.nombre" class="size-full object-contain" loading="lazy" decoding="async" /> }
              </li>
            }
          </ul>
        }
      </div>
      @if (!reduced()) {
        <div class="absolute inset-x-0 bottom-[110px] flex flex-col items-center gap-2 text-label-xs text-text-tertiary transition-opacity duration-500 md:inset-x-auto md:bottom-9 md:left-[120px] md:h-11 md:flex-row" [style.opacity]="pista()">
          Desliza<gr-icon name="arrow-down" [size]="18" class="animate-bounce text-text-muted" />
        </div>
        <button type="button" (click)="skip()" [class.invisible]="finished()"
          class="absolute bottom-[calc(24px+env(safe-area-inset-bottom))] left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-pill border border-white/15 bg-white/8 px-4 text-label-s backdrop-blur-[20px] hover:border-white/30 md:right-[120px] md:bottom-9 md:left-auto md:translate-x-0">
          Saltar intro<gr-icon name="arrow-down" [size]="16" />
        </button>
        <!-- «Hero preload»: trophy icon and download progress until the first video seek completes -->
        @if (precarga()) {
          <!-- also in the server HTML; it leaves by itself after 4 s if the script never runs (and at once without JS) -->
          <div class="gr-precarga absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg-base transition-opacity duration-500" [style.opacity]="precargaFuera() ? 0 : null"
            role="progressbar" aria-label="Cargando la animación" [attr.aria-valuenow]="progresoIndeterminado() ? null : criticoPct()" aria-valuemin="0" aria-valuemax="100">
            <img src="/img/home/trofeo.webp" alt="" class="h-[70px] w-20 animate-pulse object-contain" [class.invisible]="precargaFuera()" />
            <div class="h-2 w-64 overflow-hidden rounded-pill bg-bg-surface" [class.invisible]="precargaFuera()"><div class="h-full rounded-pill bg-[linear-gradient(90deg,#0e0c0d,#a82334)] transition-[width] duration-300" [class.animate-pulse]="progresoIndeterminado()" [style.width.%]="progresoIndeterminado() ? 100 : criticoPct()"></div></div>
            <p class="text-body-s text-text-tertiary" [class.invisible]="precargaFuera()">@if (progresoIndeterminado()) { Cargando vídeo… } @else { {{ criticoPct() }} % }</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { height: 200vh; }
    @media (min-width: 768px) { :host { height: 500vh; } }
    @media (prefers-reduced-motion: reduce) { :host { height: 100dvh; } }
    /* Figma «Fundido · arriba/abajo/izquierda/derecha»: 20 % at the top and bottom, 24 % at the sides */
    .gr-trofeo-fundido {
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 24%, #000 76%, transparent), linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent);
      -webkit-mask-composite: source-in;
      mask-image: linear-gradient(90deg, transparent, #000 24%, #000 76%, transparent), linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent);
      mask-composite: intersect;
    }
    .gr-precarga { animation: gr-precarga-fuera 0.5s ease 4s forwards; }
    @keyframes gr-precarga-fuera { to { opacity: 0; visibility: hidden; } }
  `],
})
export class HeroTrophy {
  /** "25 JULIO 2026 · ALMUSSAFES · VALENCIA" */
  readonly meta = input('');
  /** Title from the CMS (section «hero»). */
  readonly titulo = input('');
  /** U30 · Figma 54 «Web · editar hero»: antetítulo, fecha visible, CTA (texto/destino) and background image with focal point. */
  readonly hero = input<HeroCms>({});
  /** BIZ-144: «19 Y 20 DICIEMBRE DE 2026» and «ALMUSSAFES (VALENCIA) · PAVELLÓ …» (competition data). */
  readonly fechas = input('');
  readonly lugar = input('');
  /** BIZ-144: sponsors flagged «Mostrar en hero» (GET …/patrocinadores?hero=true). */
  readonly patrocinadores = input<{ nombre: string; logoUrl: string; url: string }[]>([]);
  /** Emits true once the intro has been scrolled through (the navbar shows from then on). */
  readonly done = output<boolean>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly puffs = PUFFS;
  protected readonly reduced = signal(false);
  protected readonly finished = signal(false);
  /** Video download progress; without Content-Length the bar is indeterminate. */
  protected readonly criticoPct = signal(0);
  protected readonly progresoIndeterminado = signal(false);
  protected readonly imagenTrofeo = signal(frameUrl(0));
  protected readonly imagenFija = signal(true);
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
  /** Preload overlay: shown until the first seek completes (never longer than 4 s), then fades out. */
  protected readonly precarga = signal(true);
  protected readonly precargaFuera = signal(false);
  private readonly p = signal(0);
  /** The intro text is visible from the first paint (server HTML too: it is the page's h1). */
  private readonly aparecido = signal(true);
  protected readonly metaPartes = computed(() => (this.meta() || '').split(' · ').filter(Boolean));
  // values of the timeline for the current (smoothed) progress
  protected readonly texto = computed(() => (this.aparecido() ? 1 - ease(tramo(this.p(), T.textoFuera)) : 0));
  protected readonly pista = computed(() => (this.aparecido() && this.p() < 0.05 ? 1 : 0));
  protected readonly humo = computed(() => (this.reduced() ? 1 : 1 - ease(tramo(this.p(), T.humo)) * 0.85));
  protected readonly desvio = computed(() => ease(tramo(this.p(), T.humo)));
  // The trophy takes over while the intro text leaves (Figma 04: clean background behind the text at scroll 0)
  protected readonly trofeo = computed(() => (this.reduced() ? 0 : ease(tramo(this.p(), T.textoFuera))));
  protected readonly nubes = computed(() => ease(tramo(this.p(), T.nubes)));

  private progress = 0;
  private shown = 0;
  private scrub?: VideoScrub;
  private videoFallido = false;
  private raf = 0;
  private tope = 0;
  private fade = 0;
  private wasDone = false;
  private io?: IntersectionObserver;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!this.browser) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.reduced.set(reduced);
      if (reduced) {
        this.imagenTrofeo.set(frameUrl(FRAMES - 1));
        this.done.emit(true);
        return;
      }

      const video = this.video().nativeElement;
      const onLoadedMetadata = () => {
        this.measure();
        this.updateTarget();
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      const scrub = new VideoScrub(video, {
        frames: FRAMES,
        fps: FPS,
        onFirstFrame: () => {
          this.imagenFija.set(false);
          this.finPrecarga();
        },
        onProgress: (pct) => {
          if (pct === null) this.progresoIndeterminado.set(true);
          else {
            this.criticoPct.set(pct);
            this.progresoIndeterminado.set(false);
          }
        },
        onError: () => this.failVideo(),
      });
      this.scrub = scrub;
      this.tope = window.setTimeout(() => this.finPrecarga(), 4000);

      destroy.onDestroy(() => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        scrub.destroy();
        cancelAnimationFrame(this.raf);
        clearTimeout(this.tope);
        clearTimeout(this.fade);
        this.io?.disconnect();
      });

      // Phones and Save-Data connections use the smaller encode; reduced motion never reaches this download.
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      const url = window.innerWidth < 768 || conn?.saveData ? VIDEO_MOBILE : VIDEO_DESKTOP;
      void scrub.load(url);
      const loop = () => {
        this.measure();
        this.shown += (this.progress - this.shown) * 0.15; // smoothing (same as the previous web)
        this.p.set(this.shown);
        this.updateTarget();
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

  private updateTarget(): void {
    this.scrub?.seek(Math.round(tramo(this.shown, T.frames) * (FRAMES - 1)));
  }

  private finPrecarga(): void {
    if (this.precargaFuera()) return;
    this.precargaFuera.set(true);
    clearTimeout(this.tope);
    this.fade = window.setTimeout(() => this.precarga.set(false), 500);
  }

  private failVideo(): void {
    if (this.videoFallido) return;
    this.videoFallido = true;
    this.imagenFija.set(true);
    this.finPrecarga();
  }

  protected skip(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    // Land exactly at the start of the next section (it reserves room for the navbar).
    window.scrollTo({ top: window.scrollY + r.bottom, behavior: this.reduced() ? 'auto' : 'smooth' });
  }
}
