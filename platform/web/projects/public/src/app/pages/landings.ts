import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { GrButton, GrIcon, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Cms, type Landing, type Seccion } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { HOME_ALTERNATES, Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Footer, Navbar, instagramOf, type Lang } from '../layout/layout';
import { Page } from '../layout/page';
import { applySeo } from './content';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);
const ICONS: Record<string, GrIconName> = { ticket: 'ticket', clock: 'clock', 'map-pin': 'map-pin', users: 'users', plane: 'plane', train: 'train', car: 'car' };
const icon = (n: string): GrIconName => ICONS[n] ?? 'info';

export interface RelatedLink {
  titulo: string;
  texto: string;
  ruta: string;
}

/** «Te puede interesar»: three numbered links (Figma pages 29, 32). */
@Component({
  selector: 'gr-related',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (nivel() === 'h3') { <h3 class="text-display-2xs md:text-display-xs">{{ titulo() }}</h3> }
    @else { <h2 class="text-display-2xs md:text-display-xs">{{ titulo() }}</h2> }
    <!-- every card the same size: equal columns, one fixed height, one line per text -->
    <ul class="mt-5 grid auto-rows-fr gap-3 lg:grid-cols-3 lg:gap-4">
      @for (l of items(); track l.ruta; let i = $index) {
        <li class="min-w-0">
          <a [href]="l.ruta" [attr.title]="l.titulo + ' · ' + l.texto" class="flex h-[84px] items-center gap-4 rounded-lg border border-line-subtle bg-bg-card px-4 transition-colors hover:border-line-strong">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/12 text-display-2xs text-accent-text">{{ (i + 1).toString().padStart(2, '0') }}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ l.titulo }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ l.texto }}</span></span>
            <gr-icon name="arrow-right" [size]="16" class="text-text-tertiary" />
          </a>
        </li>
      }
    </ul>
  `,
})
export class Related {
  readonly titulo = input('Te puede interesar');
  readonly items = input<RelatedLink[]>([]);
  /** Nivel del título: «h3» en las páginas cuyo contenido ya tiene sus dos H2 (Figma 75). */
  readonly nivel = input<'h2' | 'h3'>('h2');
}

/** «Sigue la GRS Cup 2»: Instagram band before the footer. */
@Component({
  selector: 'gr-community',
  imports: [GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="relative overflow-hidden rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 shadow-glow-deep md:flex md:items-center md:justify-between md:gap-8 md:p-10">
      <div>
        <p class="flex items-center gap-3 text-mono-xs text-text-tertiary">{{ en() ? 'Community' : 'Comunidad' }}</p>
        @if (nivel() === 'h3') { <h3 class="mt-3 text-display-xs md:text-display-m">{{ en() ? 'Follow the GRS Cup 2' : 'Sigue la GRS Cup 2' }}</h3> }
        @else { <h2 class="mt-3 text-display-xs md:text-display-m">{{ en() ? 'Follow the GRS Cup 2' : 'Sigue la GRS Cup 2' }}</h2> }
        <p class="mt-2 text-body-s text-text-secondary md:text-body-m">{{ en() ? 'Dates, schedule, raffle and results first on Instagram.' : 'Fechas, horarios, sorteo y resultados primero en Instagram.' }}</p>
      </div>
      <a grButton icon="camera" class="mt-5 w-full md:mt-0 md:w-auto" [href]="instagram()" target="_blank" rel="noopener">{{ en() ? 'Follow on Instagram' : 'Seguir en Instagram' }}</a>
    </section>
  `,
})
export class Community {
  readonly lang = input<Lang>('es');
  /** Nivel del título: «h3» en las páginas cuyo contenido ya tiene sus dos H2 (Figma 75). */
  readonly nivel = input<'h2' | 'h3'>('h2');
  protected readonly en = computed(() => this.lang() === 'en');
  private readonly comp = inject(Competition);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
}

// ============================================================ /publico ===

/** /publico (Figma page 29): what spectators will see, how an attempt is judged and the stand rules. All sections come from the CMS. */
@Component({
  selector: 'gr-publico-page',
  imports: [Page, GrIcon, GrSkeleton, GrCabecera, GrSelect, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .gr-vista { animation: gr-vista-in 180ms ease-out; }
    @keyframes gr-vista-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .gr-vista { animation: none; } }
  `,
  template: `
    @let l = land();
    <gr-page separacion="mt-[132px] block md:mt-[180px]" [title]="t('intro', 'titulo') || 'Ven a ver'" [accent]="t('intro', 'tituloAcento') || 'la competición'" [eyebrow]="t('intro', 'eyebrow')" [subtitle]="t('intro', 'texto')" section="Visita" crumb="Público">
      <!-- Figma 46:23: the page tabs are one dropdown (not sticky); each view has its own ?vista= -->
      <div class="mb-8 flex flex-col gap-2 md:mb-12 md:max-w-80">
        <label class="text-label-s text-text-secondary" for="publico-vista">Sección</label>
        <gr-select id="publico-vista" tam="l" [value]="vista()" (valorChange)="verVista($event)">
          @for (a of anchors; track a.id) { <option [value]="a.id">{{ a.t }}</option> }
        </gr-select>
      </div>
      @if (l === undefined) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-24 rounded-md" /> }</div>
      }
      <div class="flex flex-col gap-12 md:gap-20">
        @for (v of [vista()]; track v) {
        <div class="gr-vista flex flex-col gap-12 md:gap-20">
        @for (k of l?.orden ?? []; track k) {
          @let s = l!.secciones[k];
          @if (k === 'interesar' || k === SECCION[v]) {
          @switch (k) {
            @case ('datos') {
              <ul id="info" class="grid scroll-mt-32 grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
                @for (d of items(s, 'items'); track d['etiqueta']) {
                  <li class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5">
                    <p class="flex items-center gap-2 text-label-xs text-text-muted uppercase"><gr-icon [name]="ic(d['icono'])" [size]="18" class="shrink-0 text-accent-text" />{{ d['etiqueta'] }}</p>
                    <p class="text-label-m">{{ d['valor'] }}</p>
                  </li>
                }
              </ul>
            }
            @case ('movimientos') {
              <section id="que-veras" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="txt(str(s, 'texto'))" [centro]="false" tam="m" />
                <!-- Figma 29: three 300 × 420 cards on desktop; a swipe row with dots on mobile -->
                <ul #fila class="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:max-w-[932px] md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0" (scroll)="alDeslizar(fila)">
                  @for (m of items(s, 'items'); track m['titulo']; let i = $index) {
                    <li class="relative w-[258px] shrink-0 snap-start overflow-hidden rounded-lg border border-line-subtle shadow-card md:w-auto">
                      <img [src]="m['imagen']" [alt]="m['alt'] || m['titulo']" class="aspect-[300/420] w-full object-cover" loading="lazy" />
                      <div class="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5">
                        <span class="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-label-xs text-white uppercase">Movimiento · {{ (i + 1).toString().padStart(2, '0') }}</span>
                        <p class="text-display-xs">{{ m['titulo'] }}</p>
                      </div>
                    </li>
                  }
                </ul>
                @if (items(s, 'items').length > 1) {
                  <p class="flex gap-1.5 md:hidden" aria-hidden="true">
                    @for (m of items(s, 'items'); track m['titulo']; let i = $index) { <span class="h-1.5 rounded-full transition-all" [class]="i === tarjeta() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
                  </p>
                }
              </section>
            }
            @case ('juicio') {
              <section id="como-se-juzga" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                <ol class="grid gap-3 md:grid-cols-4 md:gap-4">
                  @for (p of items(s, 'pasos'); track p['titulo']; let i = $index, last = $last) {
                    <li class="rounded-lg border border-line-subtle bg-bg-card p-[25px]">
                      <p class="flex items-center gap-3 text-label-m"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-label-s text-white">{{ i + 1 }}</span>{{ txt(p['titulo']) }}</p>
                      <p class="mt-2 text-body-s text-text-tertiary">{{ txt(p['texto']) }}</p>
                      @if (last) {
                        <p class="mt-2 flex gap-2" aria-label="Ejemplo: dos luces blancas y una roja, intento válido">
                          <span class="size-5 rounded-full bg-white"></span><span class="size-5 rounded-full bg-white"></span><span class="size-5 rounded-full bg-accent"></span>
                        </p>
                      }
                    </li>
                  }
                </ol>
              </section>
            }
            @case ('normas') {
              <section id="normas" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                <ul class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
                  @for (n of items(s, 'items'); track n['texto']) {
                    <li class="flex gap-3 text-body-m text-text-secondary"><span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ txt(n['texto']) }}</li>
                  }
                </ul>
              </section>
            }
            @case ('interesar') {
              <gr-related [titulo]="str(s, 'titulo') || 'Te puede interesar'" [items]="related(s)" />
            }
          }
          }
        }
        </div>
        }
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class PublicoPage {
  protected readonly land = signal<Landing | null | undefined>(undefined);
  protected readonly anchors = [{ id: 'info', t: 'Info práctica' }, { id: 'que-veras', t: 'Qué verás' }, { id: 'como-se-juzga', t: 'Cómo se juzga' }, { id: 'normas', t: 'Normas en la grada' }];
  /** CMS section shown by each ?vista= («Te puede interesar» goes with all of them). */
  protected readonly SECCION: Record<string, string> = { info: 'datos', 'que-veras': 'movimientos', 'como-se-juzga': 'juicio', normas: 'normas' };
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly qp = signal(this.route.snapshot.queryParamMap.get('vista') ?? '');
  protected readonly vista = computed(() => (this.qp() in this.SECCION ? this.qp() : 'info'));
  /** Changes the view in place (no scroll jump); the canonical stays on /publico. */
  protected verVista(v: string) {
    if (v === this.vista()) return;
    this.qp.set(v);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { vista: v === 'info' ? null : v }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  /** Jaime: the stage is «tarima», never «plataforma». */
  protected txt = (t: string | undefined) => (t ?? '').replace(/plataforma/g, 'tarima').replace(/Plataforma/g, 'Tarima');
  /** Card in view in the mobile swipe row (dots). */
  protected readonly tarjeta = signal(0);
  protected alDeslizar(el: HTMLElement) {
    const li = el.firstElementChild as HTMLElement | null;
    if (li) this.tarjeta.set(Math.round(el.scrollLeft / (li.offsetWidth + 16)));
  }
  /** «Título *acento*» markup of gr-cabecera from the CMS fields. */
  protected tit = (s: Seccion | undefined) => [str(s, 'titulo'), str(s, 'tituloAcento') && '*' + str(s, 'tituloAcento') + '*'].filter(Boolean).join(' ');
  protected str = str;
  protected ic = icon;
  protected items = (s: Seccion | undefined, k: string) => list<Record<string, string>>(s, k);
  protected related = (s: Seccion | undefined) => list<RelatedLink>(s, 'items');
  protected t = (sec: string, k: string) => str(this.land()?.secciones[sec], k);

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [l, c] = await Promise.all([cms.landing('publico'), competition.load()]);
      this.land.set(l);
      if (!l) cms.notFound();
      await applySeo(cms, seo, '/publico', 'Ver la competición · GRS Cup 2', 'Entrada gratuita con reserva: qué verás, cómo se juzga un intento y normas de la grada.', undefined,
        { jsonLd: c ? eventLd(c, 'es') : undefined });
    });
  }
}

/** SportsEvent structured data (free entry). */
function eventLd(c: CompeticionPublica, lang: Lang): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', inLanguage: lang,
    startDate: c.fechaInicio, endDate: c.fechaFin, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
    location: { '@type': 'Place', name: c.sede.nombre, address: { '@type': 'PostalAddress', streetAddress: c.sede.direccion, postalCode: c.sede.cp, addressLocality: c.sede.ciudad, addressRegion: c.sede.provincia, addressCountry: 'ES' } },
    organizer: { '@type': 'Organization', name: c.evento.organizador || 'GR Strength' },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://grcup-qa.menustudioai.com/entradas' },
  };
}

// ================================================================= /en ===

/** /en (Figma page 35): English landing for international lifters and visitors (hreflang es/en + x-default). */
@Component({
  selector: 'gr-en-page',
  imports: [RouterLink, Navbar, Footer, GrButton, GrIcon, GrSkeleton, GrCabecera, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = land();
    @let c = comp();
    <gr-navbar lang="en" />
    <main class="relative" lang="en">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[640px]" style="background: radial-gradient(50% 60% at 75% 10%, rgb(110 20 32 / 0.45), transparent 70%)"></div>
      <div class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px] xl:pb-24">
        @let h = l?.secciones?.['hero'];
        <section class="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <!-- Figma «Language switch»: 111 × 46 pill, the active language in red -->
            <p class="inline-flex rounded-full border border-line-strong p-1 text-label-xs" aria-label="Language">
              <a routerLink="/" hreflang="es" class="inline-flex h-9 items-center rounded-full px-3.5 text-text-tertiary hover:text-text-primary">ES</a>
              <span class="inline-flex h-9 items-center rounded-full bg-accent/20 px-3.5 text-text-primary" aria-current="page">EN</span>
            </p>
            @if (l === undefined) {
              <gr-skeleton class="mt-6 h-40 rounded-lg" />
            } @else {
              @if (str(h, 'eyebrow')) { <p class="mt-6 flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase">{{ str(h, 'eyebrow') }}</p> }
              <h1 class="mt-3 text-display-m md:text-display-xl">{{ str(h, 'titulo') || 'GRStrength Cup' }} <span class="text-accent-text">{{ str(h, 'tituloAcento') }}</span></h1>
              <p class="mt-4 max-w-xl text-body-m text-text-secondary md:text-body-l">{{ str(h, 'texto') }}</p>
              <ul class="mt-6 grid gap-3 sm:grid-cols-3">
                <li class="flex items-center gap-3"><span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="calendar" [size]="18" /></span>
                  <span><span class="block text-label-xs text-text-muted uppercase">Date</span><span class="block text-label-m">{{ fecha() }}</span></span></li>
                <li class="flex items-center gap-3"><span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="map-pin" [size]="18" /></span>
                  <span><span class="block text-label-xs text-text-muted uppercase">Venue</span><span class="block text-label-m">{{ c ? c.sede.ciudad + ' · Valencia' : 'Almussafes · Valencia' }}</span></span></li>
                @if (h?.['plazas']) {
                  <li class="flex items-center gap-3"><span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="user" [size]="18" /></span>
                    <span><span class="block text-label-xs text-text-muted uppercase">Lifters</span><span class="block text-label-m">{{ h?.['plazas'] }} places</span></span></li>
                }
              </ul>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <a grButton variant="primary" size="l" routerLink="/alta-atleta" hreflang="es" iconRight="arrow-right">{{ str(h, 'cta') || 'Athlete sign-up (Spanish)' }}</a>
                <a grButton size="l" routerLink="/sorteo" hreflang="es" iconRight="arrow-right">{{ str(h, 'ctaSorteo') || 'See the raffle' }}</a>
              </div>
            }
          </div>
          <img src="https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0150.webp" alt="GRStrength Cup trophy" width="420" height="560"
            class="mx-auto aspect-[3/4] w-full max-w-[320px] object-cover [mask-image:radial-gradient(closest-side,#000_70%,transparent)] lg:max-w-none" fetchpriority="high" />
        </section>

        <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
          @for (k of l?.orden ?? []; track k) {
            @let s = l!.secciones[k];
            @switch (k) {
              @case ('compete') {
                <section id="compete" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                  <ul class="grid gap-3 md:grid-cols-3 md:gap-4">
                    @for (i of items(s, 'items'); track i['titulo']) {
                      <li class="flex flex-col gap-1.5 rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ i['titulo'] }}</p><p class="text-body-s text-text-tertiary">{{ i['texto'] }}</p></li>
                    }
                  </ul>
                  @if (str(s, 'cta')) {
                    <a grButton variant="primary" size="l" routerLink="/alta-atleta" hreflang="es" class="self-start">{{ str(s, 'cta') }}</a>
                  }
                </section>
              }
              @case ('raffle') {
                <section id="raffle" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                  <!-- Figma «Panel» (24 px): the 360 × 230 belt photo, the title in Display, the display-style button -->
                  <div class="grid items-center gap-6 rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-4 shadow-glow-deep md:grid-cols-[360px_minmax(0,1fr)] md:gap-8 md:p-5">
                    @if (str(s, 'imagen')) { <img [src]="str(s, 'imagen')" alt="SBD belt" class="aspect-[360/230] w-full rounded-lg object-cover" loading="lazy" /> }
                    <div class="flex flex-col gap-3">
                      <p class="text-display-xs md:text-display-s">{{ str(s, 'subtitulo') }}</p>
                      <p class="text-body-m text-text-secondary">{{ str(s, 'texto') }}</p>
                      <div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <a grButton variant="display-gradient" size="l" routerLink="/sorteo" hreflang="es">{{ str(s, 'cta') || 'See the prizes' }}</a>
                        <a grButton variant="ghost" routerLink="/politica-concurso" hreflang="es">Raffle terms (Spanish)</a>
                      </div>
                    </div>
                  </div>
                </section>
              }
              @case ('travel') {
                <section id="travel" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                  <ul class="grid gap-3 md:grid-cols-3 md:gap-4">
                    @for (i of items(s, 'items'); track i['titulo']) {
                      <li class="rounded-lg border border-line-subtle bg-bg-card p-5">
                        <span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="ic(i['icono'])" [size]="20" /></span>
                        <p class="mt-4 text-label-m">{{ i['titulo'] }}</p>
                        <p class="mt-1 text-body-s text-text-secondary">{{ i['texto'] }}</p>
                        @if (i['nota']) { <p class="mt-3 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ i['nota'] }}</p> }
                      </li>
                    }
                  </ul>
                </section>
              }
              @case ('faq') {
                <section id="faq" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                  <div class="flex flex-col gap-3">
                    @for (q of items(s, 'items'); track q['pregunta']; let first = $first) {
                      <details class="group rounded-lg border border-line-subtle bg-bg-card open:border-accent/60" [open]="first">
                        <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-label-m md:text-ui-h4">{{ q['pregunta'] }}
                          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-text-secondary group-open:bg-accent/20 group-open:text-accent-text"><gr-icon name="plus" [size]="14" class="transition-transform group-open:rotate-45" /></span>
                        </summary>
                        <p class="px-5 pb-5 text-body-m text-text-secondary">{{ q['respuesta'] }}</p>
                      </details>
                    }
                  </div>
                </section>
              }
            }
          }
          <gr-community lang="en" />
        </div>
      </div>
    </main>
    <gr-footer lang="en" />
  `,
})
export class EnPage {
  /** «Título *acento*» markup of gr-cabecera from the CMS fields. */
  protected tit = (s: Seccion | undefined) => [str(s, 'titulo'), str(s, 'tituloAcento') && '*' + str(s, 'tituloAcento') + '*'].filter(Boolean).join(' ');
  protected readonly land = signal<Landing | null | undefined>(undefined);
  protected readonly comp = signal<CompeticionPublica | null>(null);
  protected str = str;
  protected ic = icon;
  protected items = (s: Seccion | undefined, k: string) => list<Record<string, string>>(s, k);
  protected readonly fecha = computed(() => {
    const d = this.comp()?.fechaInicio;
    return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(d)) : 'To be confirmed';
  });

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [l, c, map] = await Promise.all([cms.landing('en'), competition.load(), cms.seoMap()]);
      this.land.set(l);
      this.comp.set(c);
      if (!l) cms.notFound();
      const o = map?.paginas.find((p) => p.ruta === '/en');
      seo.set({
        title: o?.title || 'GRStrength Cup 2026 · Powerlifting competition in Valencia, Spain',
        description: o?.description || 'AEP powerlifting championship in Almussafes, 20 km south of Valencia. Free spectator entry, raffle and travel tips.',
        path: '/en', lang: 'en', alternates: HOME_ALTERNATES, image: o?.imagenUrl || undefined,
        jsonLd: c ? eventLd(c, 'en') : undefined,
      });
    });
  }
}
