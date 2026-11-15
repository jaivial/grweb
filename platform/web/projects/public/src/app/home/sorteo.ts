import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { GrButton, cdn } from '@grcup/ui';
import type { Seccion } from '../core/cms';
import { COMPETITION_SLUG } from '../core/competition';
import { VideoScrub } from '../core/video-scrub';
import { GLOW, GrTitulo } from './bloques';

const BELT_FRAMES = 169;
const BELT_VIDEO = cdn('/media/cinturon-960x540.mp4');
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

/** GET /api/competiciones/{slug}/rifa/items (only what the home needs). */
interface ItemRifa { id: string; nombre: string; imagenUrl: string | null }

/**
 * «Section / Rifa» on the home (Figma home R2 393:144944 · 387:108539): centred title and text, the first four prizes
 * of the raffle (from /rifa/items; the grid is left out when there are none), the cash-only note and the two CTAs in one
 * centred row. The raffle is only at the venue and in cash: no online sale here.
 */
@Component({
  selector: 'gr-sec-sorteo',
  imports: [RouterLink, GrButton, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block overflow-hidden bg-bg-base px-5 py-18 md:px-8 md:py-24 xl:px-20' },
  template: `
    <div [class]="glow + ' -top-30 left-1/2 size-[520px] -translate-x-1/2'"></div>
    <div class="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 text-center md:gap-8">
      <div class="flex max-w-[880px] flex-col items-center gap-4">
        <h2 class="text-display-s md:text-display-l"><gr-titulo [titulo]="titulo()" /></h2>
        <p class="text-body-m text-text-tertiary md:text-body-l">{{ parrafo() }}</p>
      </div>
      @if (items().length) {
        <ul class="grid w-full grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
          @for (i of items(); track i.id) {
            <li class="relative aspect-square overflow-hidden rounded-xl border border-white/8 bg-[linear-gradient(180deg,#2a2627,#141112)] md:aspect-[167/168]">
              @if (i.imagenUrl) { <img [src]="i.imagenUrl" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" decoding="async" /> }
              <span class="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(0_0_0/0.9))]"></span>
              <span class="absolute inset-x-3 bottom-3 text-left text-[14px] leading-[18px] font-semibold md:inset-x-2 md:text-[15px]">{{ i.nombre }}</span>
            </li>
          }
        </ul>
      }
      <p class="text-body-s text-text-tertiary">Boletos solo en el recinto y en efectivo. No hay venta online.</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <a grButton variant="primary" size="l" routerLink="/sorteo">Ver la rifa</a>
        <a grButton variant="outline" size="l" routerLink="/sorteo" fragment="normas" iconRight="arrow-right">Cómo funciona</a>
      </div>
    </div>
  `,
})
export class SecSorteo {
  readonly s = input<Seccion | undefined>();
  protected readonly glow = GLOW;
  private t = (k: string) => ((this.s()?.[k] as string | undefined) ?? '');
  protected readonly titulo = computed(() => this.t('titulo') || '*Rifa de material*|en el recinto');
  protected readonly parrafo = computed(() => this.t('texto') || 'Durante la competición rifamos material y premios donados. Boletos en el stand de la rifa, solo en efectivo.');
  protected readonly items = signal<ItemRifa[]>([]);
  constructor() {
    void inject(PendingTasks).run(() => firstValueFrom(inject(HttpClient).get<{ items: ItemRifa[] }>(`/api/competiciones/${COMPETITION_SLUG}/rifa/items`))
      .then((r) => this.items.set((r?.items ?? []).slice(0, 4)))
      .catch(() => undefined));
  }
}
