import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, LOGO, LOGO_SRCSET, cdn, CdnPipe } from '@grcup/ui';
import { VideoScrub } from '../core/video-scrub';
import { MenuMovil } from '../layout/layout';
// Inline (8 KB) so the preload trophy paints with the server HTML instead of waiting for a CDN round trip
import TROFEO_PRECARGA from '../../../public/img/home/trofeo.webp' with { loader: 'dataurl' };
import { I18n, LocPipe } from '../core/i18n';

const TXT = {
  es: { titulo: 'WHATEVER IT TAKES', desliza: 'Desliza', saltar: 'Saltar intro', cargando: 'Cargando la animación', cargandoVideo: 'Cargando vídeo…' },
  en: { titulo: 'WHATEVER IT TAKES', desliza: 'Scroll', saltar: 'Skip intro', cargando: 'Loading the animation', cargandoVideo: 'Loading video…' },
};

const FRAMES = 313;
export interface HeroCms { eyebrow?: string; fecha?: string; ctaTexto?: string; ctaDestino?: string; imagen?: string; focalX?: number; focalY?: number }
const FPS = 24;
// v2: same 313 frames at 24 fps, x264 veryslow crf 27, GOP 8, aq-mode 3 (−46 %, SSIM 0.992 against v1; same seek time)
const VIDEO_MOBILE = cdn('/media/copa-horneada-v2-600x900.mp4');
const VIDEO_DESKTOP = cdn('/media/copa-horneada-v2-720x1080.mp4');
const frameUrl = (i: number) => `https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp_horneado/frame_${String(i + 1).padStart(4, '0')}.webp`;

/** Scroll timeline of Figma page 04 «Hero · Storyboard scroll» (the previous web's animation, same thresholds). */
// Jaime 14-nov: the intro text fades with the smoke (same span), and the closing clouds end covering the trophy.
// Jaime 15-nov 11:09: longer trophy turn, shorter cloud cover. Before (200vh phone / 500vh md): frames 4-60 %, clouds 48-60 %,
// 40 % idle hold. Now (300vh / 500vh): the trophy turns until 90 %, the clouds cover in its last part.
// Jaime 15-nov 11:40: the clouds rose too fast at 85-90 % (10vh phone, 20vh md): 82.5-90 % = 15vh / 30vh, still shorter
// than the original 48-60 % (12vh within a 100vh hero on phones, 48vh md) relative to the trophy turn.
// Jaime 16-nov: no idle hold of covered clouds after 90 % (20vh phone / 40vh md): the host is that much shorter and
// the same timeline in vh now ends at 100 % (6-180vh of a 180vh span on phones, 12-360vh of 360vh on md).
const T = { frames: [0.0333, 1], finNubes: 1 } as const;
// Fades in scroll pixels (not fractions), so they are equally gradual on phones (300vh) and desktop (500vh):
// the intro text + smoke clear over the first 600 px and the closing clouds rise over the last 700 px.
const PX = { introIni: 10, intro: 600, nubes: 700 } as const;
/** Frame fallback (video failed or stalled): every 3rd WebP, loaded progressively, shown as the nearest loaded frame. */
const PASO_FRAMES = 3;
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
  imports: [CdnPipe, GrIcon, GrButton, RouterLink, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // UX1-R1-1/6: 200vh on phones (500vh from md), one screen with reduced motion - in CSS, so it holds from the SSR paint
  // iOS Safari: own stacking context at z-0 so its sticky composited layers never paint over «Campeonato» (z-10)
  host: { class: 'relative isolate z-0 block' },
  template: `
    <!-- contain:paint: WebKit does not clip blurred, transformed puffs with overflow alone -->
    <div class="sticky top-0 h-dvh overflow-hidden bg-bg-base [contain:paint]">
      <!-- «Fondo»: grey at the top while the smoke is on screen (Figma intro), base later. It leaves while the trophy is
           shown, so the trophy's baked edges (faded to #141112) meet a flat bg-base and never show a box. -->
      <div class="absolute inset-0 bg-[linear-gradient(180deg,#3a3435_0%,#252021_65%,#141112_100%)]" [style.opacity]="humo() * (1 - trofeo())"></div>
      <!-- Trophy: 2:3 box, 80 % of the height, red glow behind. Perf (iPhone): the video/WebP frames already carry the
           Figma look baked in (blend «lighten» over the glow, edges faded 20 % top/bottom and 24 % sides to #141112), so
           they are a plain opaque layer: no mask-image nor mix-blend-mode recomposited on every decoded frame. The glow
           stays only for the part that spills past the box (its inside is baked with the same geometry). -->
      <div class="pointer-events-none absolute inset-0" [style.opacity]="trofeo()">
        <div class="absolute top-1/2 left-1/2 aspect-square h-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.35),transparent)]"></div>
        <div class="absolute top-[6.4%] left-1/2 aspect-[2/3] h-[80%] max-w-[92vw] -translate-x-1/2 [transform:translateZ(0)]">
          <!-- LCP: Chrome counts the video's first frame as the page's LCP even at opacity 0 or visibility:hidden (it
               came ~4 s late, after the whole download). Shrunk while the trophy is fully transparent (behind the loader,
               scroll 0), it never qualifies: the LCP is the h1. It still decodes and seeks (only its painted box shrinks). -->
          <video #video muted playsinline preload="auto" [style.transform]="trofeo() ? null : 'scale(0.1)'" disablepictureinpicture disableremoteplayback aria-hidden="true" class="size-full object-cover"></video>
          <!-- WebP frame only when needed (loader gone before the first seek, video failed, reduced motion): the
               trophy is hidden behind the loader and at opacity 0 at scroll 0, so it is never downloaded up front -->
          @if (imagenTrofeo(); as src) {
            <img [src]="src" alt="Trofeo de la GRS Cup 2" class="absolute inset-0 size-full object-cover" [class.hidden]="!imagenFija()" />
          }
        </div>
      </div>
      <!-- U30 · Figma 54: background image with focal point; with motion it fades out with the intro text (U31-R1-15) -->
      @if (hero().imagen) {
        <img [src]="hero().imagen | cdn" alt="Atleta compitiendo en la GRS Cup de powerlifting" class="absolute inset-0 size-full object-cover" [style.opacity]="reduced() ? 0.6 : 0.6 * texto()" [style.object-position]="(hero().focalX ?? 50) + '% ' + (hero().focalY ?? 50) + '%'" />
      }
      <!-- Smoke of the intro (clears and drifts away). Perf (iPhone): no filter:blur, the gradient's extra stops give the
           same soft edge; 12 blurred ~1000 px layers cost 200+ ms per frame on a weak GPU even with the hero still. -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true" [style.opacity]="humo()">
        @for (p of puffs; track $index) {
          <span class="gr-puff absolute rounded-full"
            [style.left.%]="p.left" [style.top.%]="p.top" [style.width.%]="p.width" [style.height.%]="p.height"
            [style.transform]="'translate(' + p.dx * desvio() * 30 + '%, ' + -desvio() * 35 + '%)'"></span>
        }
      </div>
      <!-- Clouds and fog entering from below (56.7 → 66.7 %) and the next section's title -->
      <div class="pointer-events-none absolute inset-0 will-change-[transform,opacity]" aria-hidden="true" [style.opacity]="nubes()" [style.transform]="'translateY(' + (1 - nubes()) * 40 + '%)'">
        @for (p of puffs; track $index) {
          <span class="gr-puff absolute rounded-full"
            [style.left.%]="p.left" [style.top.%]="p.top + 30" [style.width.%]="p.width" [style.height.%]="p.height"></span>
        }
      </div>
      <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(42_42_42/0.55)_0%,rgb(36_32_33/0.92)_45%,#141112_100%)] will-change-[transform,opacity]" [style.opacity]="nubes()" [style.transform]="'translateY(' + (1 - nubes()) * 60 + '%)'"></div>
      <!-- Bottom fade (300 px, base) -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] bg-[linear-gradient(180deg,transparent,#141112)]"></div>
      <!-- Intro (Figma home R2): GRS CUP 2 logo and tagline; dates, place and organiser logos moved to «Campeonato» -->
      <div class="gr-intro pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 pb-[12dvh] text-center" [style.opacity]="texto()">
        <img [attr.srcset]="logoSrcset" sizes="(min-width: 768px) 318px, 201px" [src]="logo" alt="GRS Cup 2" class="h-[clamp(80px,30vw,125px)] w-auto select-none md:h-[198px]" draggable="false" fetchpriority="high" />
        @if (hero().eyebrow) { <p class="gr-intro-extra mt-10 text-label-xs tracking-[0.12em] text-accent-text uppercase">{{ hero().eyebrow }}</p> }
        <h2 class="max-w-[1000px] font-monster text-[clamp(22px,8vw,30px)] leading-[1.05] tracking-[-0.01em] uppercase [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-[56px]" [class]="hero().eyebrow ? 'mt-3' : 'mt-3 md:mt-1'">{{ titulo() || t().titulo }}</h2>
        @if (hero().ctaTexto && hero().ctaDestino) {
          <a grButton variant="primary" size="l" class="gr-intro-extra pointer-events-auto mt-8" [routerLink]="hero().ctaDestino | loc">{{ hero().ctaTexto }}</a>
        }
      </div>
      @if (!reduced()) {
        <div class="gr-desliza absolute inset-x-0 bottom-[calc(110px+var(--gr-sobre-h,0px))] flex flex-col items-center gap-2 text-label-xs text-text-tertiary transition-opacity duration-500 md:inset-x-auto md:bottom-9 md:bottom-[calc(36px+var(--gr-sobre-h,0px))] md:left-[120px] md:h-11 md:flex-row" [style.opacity]="pista()">
          {{ t().desliza }}<gr-icon name="arrow-down" [size]="18" class="animate-bounce text-text-muted [animation-iteration-count:3]" />
        </div>
        <button type="button" (click)="skip()" [class.invisible]="finished()"
          class="absolute bottom-[calc(24px+max(env(safe-area-inset-bottom),var(--gr-sobre-h,0px)))] left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-pill border border-white/15 bg-[rgb(44_40_41/0.85)] px-4 text-label-s hover:border-white/30 md:right-[120px] md:bottom-[calc(36px+var(--gr-sobre-h,0px))] md:left-auto md:translate-x-0">
          {{ t().saltar }}<gr-icon name="arrow-down" [size]="16" />
        </button>
        <!-- «Hero preload»: trophy icon and download progress until the first video seek completes -->
        @if (precarga()) {
          <!-- also in the server HTML; it leaves by itself after 4 s if the script never runs (and at once without JS) -->
          <div class="gr-precarga absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg-base transition-opacity duration-500" [style.opacity]="precargaFuera() ? 0 : null"
            role="progressbar" [attr.aria-label]="t().cargando" [attr.aria-valuenow]="progresoIndeterminado() ? null : criticoPct()" aria-valuemin="0" aria-valuemax="100">
            <img [src]="trofeoPrecarga" alt="" class="h-[70px] w-20 animate-pulse object-contain" />
            <div class="h-2 w-64 overflow-hidden rounded-pill bg-bg-surface"><div class="h-full rounded-pill bg-[linear-gradient(90deg,#0e0c0d,#a82334)] transition-[width] duration-300" [class.animate-pulse]="progresoIndeterminado()" [style.width.%]="progresoIndeterminado() ? 100 : criticoPct()"></div></div>
            <p class="text-body-s text-text-tertiary">@if (progresoIndeterminado() || !criticoPct()) { {{ t().cargandoVideo }} } @else { {{ criticoPct() }} % }</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { height: 280vh; }
    @media (min-width: 768px) { :host { height: 460vh; } }
    @media (prefers-reduced-motion: reduce) { :host { height: 100dvh; } }
    /* Was radial(32 % → 12 % at 60 % → 0) + blur(80px): the blur spread the falloff, so the stops ease out instead */
    .gr-puff { background: radial-gradient(closest-side, rgb(138 138 138 / 0.2), rgb(120 120 120 / 0.16) 25%, rgb(100 100 100 / 0.09) 55%, rgb(90 90 90 / 0.03) 80%, transparent); }
    /* UX1-R1-7 / R2-2: short viewports (iPhone SE, zoom 200 %, landscape): compact intro so «Saltar intro» never sits on the text */
    @media (max-width: 767px) and (max-height: 700px) {
      .gr-intro { top: 72px; justify-content: flex-start; padding-bottom: 0; }
      .gr-intro > * + * { margin-top: 3dvh !important; }
      .gr-intro > img:first-child { height: min(30vw, 18dvh, 125px); }
    }
    /* UX1-R3-1: at 320×568 the compact CTA reaches «Desliza»; «Saltar intro» already tells the user to scroll */
    @media (max-width: 767px) and (max-height: 620px) {
      .gr-desliza { display: none; }
    }
    @media (max-height: 560px) {
      .gr-intro { top: 64px; justify-content: flex-start; padding-bottom: 0; }
      .gr-intro > * + * { margin-top: 12px !important; }
      .gr-intro > img:first-child { height: min(30vw, 14dvh, 125px); }
      /* zoom 200 % / landscape: only logo, title and date fit above «Saltar intro»; the booking CTA stays in the navbar and the bottom bar */
      .gr-intro-extra { display: none; }
      .gr-desliza { display: none; }
    }
    /* UX2-R1-15: text at 200 % (Dynamic Type / text zoom): the booking CTA would sit under «Saltar intro»; it stays in the bottom bar */
    .gr-intro { container: intro / inline-size; }
    @container intro (max-width: 22rem) { .gr-intro-extra { display: none; } }
    .gr-precarga { animation: gr-precarga-fuera 0.5s ease 4s forwards; }
    @keyframes gr-precarga-fuera { to { opacity: 0; visibility: hidden; } }
  `],
})
export class HeroTrophy {
  protected readonly t = inject(I18n).dict(TXT);
  /** Title from the CMS (section «hero»). */
  readonly titulo = input('');
  /** U30 · Figma 54 «Web · editar hero»: antetítulo, fecha visible, CTA (texto/destino) and background image with focal point. */
  readonly hero = input<HeroCms>({});
  /** Emits true once the intro has been scrolled through (the navbar shows from then on). */
  readonly done = output<boolean>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly menu = inject(MenuMovil);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly puffs = PUFFS;
  protected readonly reduced = signal(false);
  protected readonly finished = signal(false);
  /** Video download progress; without Content-Length the bar is indeterminate. */
  protected readonly criticoPct = signal(0);
  protected readonly progresoIndeterminado = signal(false);
  protected readonly imagenTrofeo = signal<string | null>(null);
  protected readonly imagenFija = signal(true);
  protected readonly logo = LOGO;
  protected readonly logoSrcset = LOGO_SRCSET;
  protected readonly trofeoPrecarga = TROFEO_PRECARGA;
  /** Preload overlay: shown until the first seek completes (never longer than 4 s), then fades out. */
  protected readonly precarga = signal(true);
  protected readonly precargaFuera = signal(false);
  private readonly p = signal(0);
  /** Scroll span of the hero in px (host height - viewport). Until measured (server HTML, first paint) a phone-sized
   *  span: with 1 px the pixel thresholds collapsed and p=0 rendered the trophy shown and the intro text hidden. */
  private readonly spanPx = signal(2000);
  private readonly tramoIntro = computed<[number, number]>(() => { const s = this.spanPx(); return [PX.introIni / s, Math.min(0.5, (PX.introIni + PX.intro) / s)]; });
  private readonly tramoNubes = computed<[number, number]>(() => [Math.max(0.5, T.finNubes - PX.nubes / this.spanPx()), T.finNubes]);
  /** The intro text is visible from the first paint (server HTML too: it is the page's h1). */
  private readonly aparecido = signal(true);
  // values of the timeline for the current (smoothed) progress
  protected readonly texto = computed(() => (this.aparecido() ? 1 - ease(tramo(this.p(), this.tramoIntro())) : 0));
  protected readonly pista = computed(() => (this.aparecido() && this.p() < 0.05 ? 1 : 0));
  protected readonly humo = computed(() => (this.reduced() ? 1 : 1 - ease(tramo(this.p(), this.tramoIntro())) * 0.85));
  protected readonly desvio = computed(() => ease(tramo(this.p(), this.tramoIntro())));
  // The trophy takes over while the intro text leaves (Figma 04: clean background behind the text at scroll 0)
  protected readonly nubes = computed(() => ease(tramo(this.p(), this.tramoNubes())));
  // ...and the clouds cover it completely at the end
  protected readonly trofeo = computed(() => (this.reduced() ? 0 : ease(tramo(this.p(), this.tramoIntro())) * (1 - this.nubes())));

  private progress = 0;
  private shown = 0;
  private scrub?: VideoScrub;
  private videoFallido = false;
  private raf = 0;
  private visible = false;
  private wake: () => void = () => {};
  private tope = 0;
  private fade = 0;
  private wasDone = false;
  /** Next frame jumps straight to the scroll position (loop (re)start, restored or programmatic scroll) instead of
   *  easing through the timeline: the eased sweep showed the trophy for ~0.5 s before the clouds covered it. */
  private saltar = true;
  private io?: IntersectionObserver;
  private readonly framesListos = new Set<number>();
  private framesCargando = false;
  private anchoVista = 0;
  private altoVista = 0;

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
        this.raf = 0;
        // while the mobile menu slides in, covers the page and slides out (layout.ts) the scroll does not move: no
        // measuring, style updates nor video seeks/decodes competing with its animation; jump on return (effect below)
        if (this.menu.enPantalla()) {
          this.saltar = true;
          return;
        }
        this.measure();
        // snap the last ~0.05 %: the easing never settled exactly, so a still hero kept repainting its blur layers every frame
        const d = Math.abs(this.progress - this.shown);
        if (this.saltar || d > 0.25 || d < 0.0005) this.shown = this.progress;
        else this.shown += (this.progress - this.shown) * 0.15; // smoothing (same as the previous web)
        this.saltar = false;
        this.p.set(this.shown);
        this.updateTarget();
        // Perf (iPhone): settled = no frame scheduled; scroll/resize/menu close wake it up again
        if (this.shown !== this.progress) this.raf = requestAnimationFrame(loop);
      };
      this.wake = () => {
        if (this.visible && !this.raf) this.raf = requestAnimationFrame(loop);
      };
      const opts = { passive: true } as const;
      window.addEventListener('scroll', this.wake, opts);
      window.addEventListener('resize', this.wake, opts);
      destroy.onDestroy(() => {
        window.removeEventListener('scroll', this.wake);
        window.removeEventListener('resize', this.wake);
      });
      // The loop only runs while the hero is on screen (no work while reading the rest of the page).
      this.io = new IntersectionObserver(([entry]) => {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.visible = entry.isIntersecting;
        if (entry.isIntersecting) {
          this.saltar = true;
          this.wake();
        } else {
          this.measure(); // settle the intro state (navbar) for the position we left it at
        }
      });
      this.io.observe(this.host.nativeElement);
    });
    effect(() => {
      if (!this.menu.enPantalla()) this.wake();
    });
  }

  private measure(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    // iOS Safari: innerHeight grows when the toolbar hides mid-scroll; the largest height seen at this width keeps the
    // progress from jumping back (the host is in vh = the large viewport, so this matches it once the bar is gone).
    if (window.innerWidth !== this.anchoVista) { this.anchoVista = window.innerWidth; this.altoVista = 0; }
    this.altoVista = Math.max(this.altoVista, window.innerHeight);
    const span = r.height - this.altoVista;
    if (span > 0) this.spanPx.set(span);
    this.progress = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    const isDone = this.progress > 0.97 || r.bottom < window.innerHeight * 0.5;
    if (isDone !== this.wasDone) {
      this.wasDone = isDone;
      this.finished.set(isDone);
      this.done.emit(isDone);
    }
  }

  private updateTarget(): void {
    const frame = Math.round(tramo(this.shown, T.frames) * (FRAMES - 1));
    if (!this.videoFallido) return this.scrub?.seek(frame);
    // nearest loaded fallback frame (frame 0 and the last are always first in the queue)
    let best = -1;
    for (const f of this.framesListos) if (best < 0 || Math.abs(f - frame) < Math.abs(best - frame)) best = f;
    if (best >= 0) {
      const url = frameUrl(best);
      if (this.imagenTrofeo() !== url) this.imagenTrofeo.set(url);
    }
  }

  /** Loads the fallback frames, 4 at a time, coarse to fine; the browser keeps them as encoded files. */
  private cargarFrames(): void {
    if (this.framesCargando) return;
    this.framesCargando = true;
    const cola: number[] = [0, FRAMES - 1];
    for (const paso of [PASO_FRAMES * 8, PASO_FRAMES * 4, PASO_FRAMES * 2, PASO_FRAMES])
      for (let f = 0; f < FRAMES; f += paso) if (!cola.includes(f)) cola.push(f);
    const siguiente = () => {
      const f = cola.shift();
      if (f === undefined) return;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { this.framesListos.add(f); this.updateTarget(); siguiente(); };
      img.onerror = () => siguiente();
      img.src = frameUrl(f);
    };
    for (let i = 0; i < 4; i++) siguiente();
  }

  private finPrecarga(): void {
    // the 4 s cap ended the loader before the first video frame (or the video failed): frame 0's WebP covers meanwhile
    if (this.imagenFija() && !this.imagenTrofeo()) this.imagenTrofeo.set(frameUrl(0));
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
    this.cargarFrames();
  }

  protected skip(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    // Land exactly at the start of the next section (it reserves room for the navbar).
    window.scrollTo({ top: window.scrollY + r.bottom, behavior: this.reduced() ? 'auto' : 'smooth' });
  }
}
