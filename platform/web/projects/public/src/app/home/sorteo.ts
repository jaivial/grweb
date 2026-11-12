import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrButton, GrIcon } from '@grcup/ui';
import type { Seccion } from '../core/cms';
import { VideoScrub } from '../core/video-scrub';
import { GLOW, GrTitulo } from './bloques';

const BELT_FRAMES = 169;
const BELT_VIDEO = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/cinturon-scroll/cinturon-960x540.mp4';
const beltFrame = (i: number) => `https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp/frame_${String(i).padStart(6, '0')}.webp`;
const ES_BELT = /\/belt_output_webp\/frame_\d{6}\.webp$/;

/**
 * Static CDN belt in the server HTML; a paused H.264 video follows the scroll in the browser.
 * Reduced motion, Save-Data, other images and video failures keep the static picture.
 */
@Component({
  selector: 'gr-cinturon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <img [src]="src()" [alt]="alt()" class="absolute inset-0 size-full object-cover" [attr.loading]="prioridad() ? null : 'lazy'" [attr.fetchpriority]="prioridad() ? 'high' : null" />
    <video #video muted playsinline preload="auto" disablepictureinpicture disableremoteplayback aria-hidden="true" class="absolute inset-0 size-full object-cover transition-opacity duration-300" [class.opacity-0]="!listo()"></video>
  `,
})
export class GrCinturon {
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly prioridad = input(false);
  protected readonly listo = signal(false);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      if (!browser || !ES_BELT.test(this.src()) || window.matchMedia('(prefers-reduced-motion: reduce)').matches || conn?.saveData) return;
      const scrub = new VideoScrub(this.video().nativeElement, {
        frames: BELT_FRAMES,
        fps: 24,
        onFirstFrame: () => this.listo.set(true),
        onError: () => this.listo.set(false),
      });
      let raf = 0, cargado = false;
      const animar = () => {
        const r = this.host.nativeElement.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
        scrub.seek(Math.round(p * (BELT_FRAMES - 1)));
        raf = requestAnimationFrame(animar);
      };
      const cerca = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !cargado) {
          cargado = true;
          void scrub.load(BELT_VIDEO);
          cerca.disconnect();
        }
      }, { rootMargin: '600px 0px' });
      cerca.observe(this.host.nativeElement);
      const visible = new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting) raf = requestAnimationFrame(animar); });
      visible.observe(this.host.nativeElement);
      destroy.onDestroy(() => { cancelAnimationFrame(raf); cerca.disconnect(); visible.disconnect(); scrub.destroy(); });
    });
  }
}

/**
 * «Section / Sorteo» on the home (D-RIFA): the raffle is only at the venue and in cash, so the home shows the notice and
 * links to /sorteo (objects, place and hours). No online sale, counters or winning ticket here.
 */
@Component({
  selector: 'gr-sec-sorteo',
  imports: [RouterLink, GrButton, GrIcon, GrTitulo, GrCinturon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block bg-bg-base md:px-8 md:py-16 lg:px-20 lg:py-24' },
  template: `
    <div class="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 overflow-hidden bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] px-5 pt-5 pb-7 md:rounded-2xl md:border md:border-accent/35 md:px-8 md:py-10 lg:flex-row lg:gap-14 lg:py-14 lg:pr-14 lg:pl-16">
      <div [class]="glow + ' -top-30 right-[-60px] size-[520px] bg-[radial-gradient(closest-side,rgb(196_43_62/0.25),transparent)]!'"></div>
      <div class="relative h-[260px] w-full shrink-0 md:h-[360px] lg:h-[440px] lg:w-[520px]">
        <div class="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(90%,468px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(196_43_62/0.35),transparent)]"></div>
        <gr-cinturon class="absolute inset-x-[4%] inset-y-[9%] overflow-hidden rounded-xl mix-blend-lighten [mask-image:radial-gradient(closest-side,#000_62%,transparent)]"
          [src]="imagen()" alt="Cinturón SBD" />
      </div>
      <div class="relative flex w-full min-w-0 flex-col items-center gap-4 text-center [overflow-wrap:anywhere] lg:flex-1 lg:items-start lg:gap-5 lg:text-left">
        <p class="inline-flex items-center gap-2 text-label-xs text-text-secondary"><span class="size-2 shrink-0 rounded-full bg-success" aria-hidden="true"></span>Rifa presencial · durante el evento</p>
        <h2 class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-m lg:text-display-l"><gr-titulo [titulo]="titulo()" /></h2>
        <p class="text-body-m text-text-tertiary lg:text-body-l">{{ parrafo() }}</p>
        <p class="inline-flex items-center gap-2 rounded-md border border-line-strong bg-bg-base px-4 py-3 text-body-s text-text-secondary"><gr-icon name="ticket" [size]="16" class="shrink-0 text-accent-text" />Boletos solo en el recinto y en efectivo. No hay venta online.</p>
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a grButton variant="display-gradient" size="l" class="gr-brillo" routerLink="/sorteo">Ver la rifa</a>
          <a grButton variant="outline" size="l" routerLink="/sorteo" fragment="normas">Cómo funciona</a>
        </div>
      </div>
    </div>
  `,
})
export class SecSorteo {
  readonly s = input<Seccion | undefined>();
  protected readonly glow = GLOW;
  private t = (k: string) => ((this.s()?.[k] as string | undefined) ?? '');
  protected readonly imagen = computed(() => this.t('imagen') || beltFrame(90));
  protected readonly titulo = computed(() => this.t('titulo') || 'Rifa de *material* en el recinto');
  protected readonly parrafo = computed(() => this.t('texto') || 'Durante la competición rifamos material y premios donados. Los boletos se compran en el stand de la rifa, solo en efectivo.');
}
