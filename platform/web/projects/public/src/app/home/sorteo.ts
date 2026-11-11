import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon } from '@grcup/ui';
import type { Seccion } from '../core/cms';
import { COMPETITION_SLUG } from '../core/competition';
import { VideoScrub } from '../core/video-scrub';
import { GLOW, GrTitulo } from './bloques';

/** Public raffle data used by the panel (GET /api/competiciones/{slug}/sorteo). */
export interface SorteoHome {
  estado: string; motivo?: string; premio: string; precio: number; vendidos: number; totalMax?: number; maxPorPersona: number; presets?: number[];
  premioImagen?: string; fechaSorteo?: string; ganador?: { numero: string; nombre: string; at?: string } | null;
}

const BELT_FRAMES = 169;
const BELT_VIDEO = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/cinturon-scroll/cinturon-960x540.mp4';
const beltFrame = (i: number) => `https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp/frame_${String(i).padStart(6, '0')}.webp`;
const ES_BELT = /\/belt_output_webp\/frame_\d{6}\.webp$/;
const euros = (c: number) => (c % 100 ? (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : String(c / 100)) + ' €';
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const diaHora = (iso: string) => {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(d).replace('.', '');
  const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(d);
  return `el ${dia} a las ${hora}`;
};
const TITULO_ESTADO: Record<string, string> = { cerrada: 'La venta ha terminado', agotada: 'Boletos agotados', bloqueada: 'Venta en preparación' };

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
 * «Section / Sorteo» (Figma 03, used in the home and as the hero of /sorteo). Open: the belt turning with the scroll, the
 * floating «1 €» sticker, the per-person limit, «Cómo participar» (tickets are sold
 * only at the venue, in cash: there is no online purchase), the live sold counter and the countdown to the
 * draw. Coming soon: the same without picking. Drawn: the winning ticket. Closed, sold out or blocked: the reason.
 */
@Component({
  selector: 'gr-sec-sorteo',
  imports: [RouterLink, GrButton, GrIcon, GrTitulo, GrCinturon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block bg-bg-base md:px-8 md:py-16 lg:px-20 lg:py-24' },
  template: `
    @let r = sorteo();
    @let p = pagina();
    @let e = r?.estado ?? '';
    @let venta = e === 'en_venta';
    <div class="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 overflow-hidden bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] px-5 pt-5 pb-7 md:rounded-2xl md:border md:border-accent/35 md:px-8 md:py-10 lg:flex-row lg:gap-14 lg:py-14 lg:pr-14 lg:pl-16">
      <div [class]="glow + ' -top-30 right-[-60px] size-[520px] bg-[radial-gradient(closest-side,rgb(196_43_62/0.25),transparent)]!'"></div>
      <!-- Visual: belt with its halo, the price sticker and the per-person limit -->
      <div class="relative h-[260px] w-full shrink-0 md:h-[360px] lg:h-[440px] lg:w-[520px]">
        <div class="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(90%,468px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(196_43_62/0.35),transparent)]" [class.opacity-60]="!venta && e !== 'proximamente'"></div>
        <gr-cinturon class="absolute inset-x-[4%] inset-y-[9%] overflow-hidden rounded-xl mix-blend-lighten [mask-image:radial-gradient(closest-side,#000_62%,transparent)]"
          [src]="imagen()" [alt]="r?.premio || 'Cinturón SBD'" [prioridad]="p" />
        @if (r && (venta || e === 'proximamente')) {
          <span class="gr-flotar absolute top-1 right-3 flex size-24 flex-col items-center justify-center rounded-full bg-[linear-gradient(135deg,#c42b3e,#6e1420)] shadow-[0_8px_32px_rgb(196_43_62/0.5)] md:top-2 md:right-[22px] lg:size-32">
            <span class="text-display-m leading-none lg:text-display-l">{{ euros(r.precio) }}</span><span class="text-label-xs">el boleto</span>
          </span>
          <span class="absolute bottom-0 left-3 inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-strong bg-bg-base px-3 text-label-xs text-text-secondary lg:bottom-6 lg:left-6">
            <gr-icon name="ticket" [size]="14" class="text-accent-text" />Hasta {{ r.maxPorPersona }} boletos por persona
          </span>
        }
      </div>
      <div class="relative flex w-full min-w-0 flex-col items-center gap-4 text-center [overflow-wrap:anywhere] lg:flex-1 lg:items-start lg:gap-5 lg:text-left">
        @if (r) {
          <p class="inline-flex items-center gap-2 text-label-xs text-text-secondary">
            <span class="size-2 shrink-0 rounded-full" [class]="venta ? 'bg-success' : e === 'proximamente' ? 'bg-warning' : 'bg-text-muted'" aria-hidden="true"></span>{{ linea() }}
          </p>
        }
        @if (p) { <h1 class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-m lg:text-display-l"><span class="sr-only">Sorteo: </span><gr-titulo [titulo]="titulo()" /></h1> }
        @else { <h2 class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-m lg:text-display-l"><gr-titulo [titulo]="titulo()" /></h2> }
        <p class="text-body-m text-text-tertiary lg:text-body-l">{{ parrafo() }}</p>
        @if (r && venta) {
          <p class="inline-flex items-center gap-2 rounded-md border border-line-strong bg-bg-base px-4 py-3 text-body-s text-text-secondary"><gr-icon name="ticket" [size]="16" class="shrink-0 text-accent-text" />Boletos solo en la sede, el día de la competición, y en efectivo.</p>
        }
        @if (r?.ganador; as g) {
          <div class="flex w-full items-center gap-3.5 rounded-lg border border-line-strong bg-bg-base px-4.5 py-3.5 text-left lg:w-auto">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/16 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
            <span class="flex flex-col gap-0.5"><span class="text-label-xs text-text-muted">Boleto ganador</span><span class="text-ui-h4">Nº {{ g.numero }} · {{ g.nombre }}</span></span>
          </div>
        } @else if (r && !venta && e !== 'proximamente') {
          <div class="flex w-full items-center gap-3.5 rounded-lg border border-line-strong bg-bg-base px-4.5 py-3.5 text-left lg:w-auto">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-white/6 text-text-tertiary"><gr-icon name="lock" [size]="20" /></span>
            <span class="flex flex-col gap-0.5"><span class="text-label-m">{{ tituloEstado[e] || 'Sorteo cerrado' }}</span>@if (r.motivo) { <span class="text-body-s text-text-tertiary">{{ r.motivo }}</span> }</span>
          </div>
        }
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          @if (venta) {
            @if (p) { <a grButton variant="display-gradient" size="l" class="gr-brillo" routerLink="." fragment="participa">Cómo participar</a> }
            @else { <a grButton variant="display-gradient" size="l" class="gr-brillo" routerLink="/sorteo" fragment="participa">Cómo participar</a> }
          } @else if (e === 'proximamente') {
            <button grButton variant="display-gradient" size="l" type="button" [disabled]="true">Muy pronto</button>
          } @else if (r?.ganador) {
            @if (p) { <a grButton variant="display-gradient" size="l" routerLink="." fragment="resultados">Ver el ganador</a> }
            @else { <a grButton variant="display-gradient" size="l" routerLink="/sorteo" fragment="resultados">Ver el ganador</a> }
          }
          @if (p) { <a grButton variant="outline" size="l" routerLink="." fragment="normas">Ver normas</a> }
          @else { <a grButton variant="outline" size="l" routerLink="/sorteo" fragment="normas">Ver normas</a> }
        </div>
        @if (r) {
          <p class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
            <span class="inline-flex items-center gap-1.5 text-label-s text-text-secondary" aria-live="polite"><gr-icon name="users" [size]="16" class="text-accent-text" />{{ num(vendidos()) }}{{ r.totalMax ? ' de ' + num(r.totalMax) : '' }} {{ vendidos() === 1 ? 'boleto vendido' : 'boletos vendidos' }}</span>
            @if (faltan()) { <span class="inline-flex items-center gap-1.5 text-mono-s text-text-secondary"><gr-icon name="clock" [size]="16" class="text-accent-text" />{{ faltan() }}</span> }
          </p>
        }
      </div>
    </div>
  `,
})
export class SecSorteo {
  readonly s = input<Seccion | undefined>();
  readonly sorteo = input<SorteoHome | null>(null);
  /** On /sorteo itself: the page's h1 and the actions go to the form and the rules of the page. */
  readonly pagina = input(false);
  protected readonly glow = GLOW;
  protected readonly euros = euros;
  protected readonly num = num;
  protected readonly tituloEstado = TITULO_ESTADO;
  private readonly http = inject(HttpClient);
  private readonly ahora = signal(Date.now());
  private readonly vivos = signal<number | null>(null);
  private t = (k: string) => ((this.s()?.[k] as string | undefined) ?? '');

  private readonly premio = computed(() => {
    const p = (this.sorteo()?.premio || 'Cinturón SBD').replace(/\s+\d+\s*mm$/i, '');
    return p.charAt(0).toLowerCase() + p.slice(1);
  });
  protected readonly imagen = computed(() => this.t('imagen') || this.sorteo()?.premioImagen || beltFrame(90));
  protected readonly titulo = computed(() => {
    const e = this.sorteo()?.estado;
    if (e && e !== 'en_venta' && e !== 'proximamente') return `Sorteo de un *${this.premio()}*`;
    return this.t('titulo') || `Gana un *${this.premio()}*`;
  });
  protected readonly linea = computed(() => {
    const r = this.sorteo();
    if (!r) return '';
    if (r.estado === 'sorteado') {
      const cuando = r.ganador?.at || r.fechaSorteo; // when it was drawn, not when it was scheduled
      return 'Sorteo cerrado' + (cuando ? ' · se celebró ' + diaHora(cuando) : '');
    }
    if (r.estado === 'proximamente') return 'Sorteo · ' + (r.motivo ? r.motivo.charAt(0).toLowerCase() + r.motivo.slice(1).replace(/\.$/, '') : 'la venta abre pronto');
    if (r.estado === 'en_venta') return 'Sorteo · ' + (r.fechaSorteo ? 'en directo ' + diaHora(r.fechaSorteo) : 'en directo durante la competición');
    return 'Sorteo · ' + (TITULO_ESTADO[r.estado] || 'cerrado').toLowerCase();
  });
  protected readonly parrafo = computed(() => {
    const e = this.sorteo()?.estado;
    if (e === 'sorteado') return 'Ya tenemos ganador. Consulta el boleto premiado y las normas del sorteo.';
    if (e && e !== 'en_venta' && e !== 'proximamente') return 'La venta de boletos está cerrada. Consulta las normas del sorteo.';
    return this.t('texto') || 'Los boletos se compran en la sede el día de la competición, solo en efectivo. Cuantos más tengas, más opciones de ganar.';
  });
  protected readonly vendidos = computed(() => this.vivos() ?? this.sorteo()?.vendidos ?? 0);
  /** Countdown to the draw («Faltan 46 d 04 h»; under a day, hours and minutes). */
  protected readonly faltan = computed(() => {
    const r = this.sorteo();
    if (!r?.fechaSorteo || r.estado === 'sorteado') return '';
    const ms = new Date(r.fechaSorteo).getTime() - this.ahora();
    if (ms <= 0) return '';
    const min = Math.floor(ms / 60_000), d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return d ? `Faltan ${d} d ${pad(h)} h` : `Faltan ${pad(h)} h ${pad(m)} min`;
  });

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const host = inject(ElementRef<HTMLElement>);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const reloj = setInterval(() => this.ahora.set(Date.now()), 30_000);
      // The sold counter goes up live while the panel is on screen (every 30 s, counting up to the new number).
      let sondeo: ReturnType<typeof setInterval> | undefined;
      let anim = 0;
      const subir = (hasta: number) => {
        const desde = this.vendidos(), t0 = performance.now();
        if (hasta <= desde || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this.vivos.set(hasta); return; }
        const paso = (t: number) => { const k = Math.min(1, (t - t0) / 800); this.vivos.set(Math.round(desde + (hasta - desde) * k)); if (k < 1) anim = requestAnimationFrame(paso); };
        anim = requestAnimationFrame(paso);
      };
      const io = new IntersectionObserver(([e]) => {
        clearInterval(sondeo);
        if (!e.isIntersecting || this.sorteo()?.estado !== 'en_venta') return;
        sondeo = setInterval(() => {
          firstValueFrom(this.http.get<SorteoHome>(`/api/competiciones/${COMPETITION_SLUG}/sorteo`)).then((r) => subir(r.vendidos)).catch(() => undefined);
        }, 30_000);
      });
      io.observe(host.nativeElement);
      destroy.onDestroy(() => { clearInterval(reloj); clearInterval(sondeo); cancelAnimationFrame(anim); io.disconnect(); });
    });
  }
}
