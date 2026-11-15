import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { GrButton, GrIcon, GrSelect, GrSkeleton, type GrIconName, CdnPipe } from '@grcup/ui';
import { Cms, type Landing, type Seccion } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { I18n, LocPipe, type Lang } from '../core/i18n';
import { GrCabecera } from '../home/bloques';
import { instagramOf } from '../layout/layout';
import { Page } from '../layout/page';
import { applySeo } from './content';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);
const ICONS: Record<string, GrIconName> = { ticket: 'ticket', clock: 'clock', 'map-pin': 'map-pin', users: 'users', plane: 'plane', train: 'train', car: 'car' };
const icon = (n: string): GrIconName => ICONS[n] ?? 'info';

const T = {
  es: {
    insta: 'También en Instagram', interesar: 'Te puede interesar', comunidad: 'Comunidad', sigue: 'Sigue la GRS Cup 2', enDirecto: 'en directo',
    mira: 'Mira la competición, comenta en el chat y juega a la Porra y al Fantasy.', ver: 'Ver el directo', navAria: 'Directo y juegos', porra: 'Porra',
    venAVer: 'Ven a ver', laComp: 'la competición', visita: 'Visita', publico: 'Público', accesos: 'Accesos rápidos', seccion: 'Sección',
    ejemplo: 'Ejemplo: dos luces blancas y una roja, intento válido',
    directo: 'Directo', horarios: 'Horarios', rifa: 'Rifa', entradas: 'Entradas', dormir: 'Dónde dormir y comer', llegar: 'Cómo llegar', atletas: 'Atletas',
    info: 'Info práctica', queVeras: 'Qué verás', juzga: 'Cómo se juzga', normas: 'Normas en la grada',
    seoT: 'Ver la competición · GRS Cup 2', seoD: 'Entrada gratuita con reserva: qué verás, cómo se juzga un intento y normas de la grada.',
  },
  en: {
    insta: 'Also on Instagram', interesar: 'You may also like', comunidad: 'Community', sigue: 'Follow GRS Cup 2', enDirecto: 'live',
    mira: 'Watch the competition, chat and play the Pool and Fantasy.', ver: 'Watch live', navAria: 'Live and games', porra: 'Pool',
    venAVer: 'Come and watch', laComp: 'the competition', visita: 'Visit', publico: 'Spectators', accesos: 'Quick links', seccion: 'Section',
    ejemplo: 'Example: two white lights and one red, good lift',
    directo: 'Live', horarios: 'Schedule', rifa: 'Raffle', entradas: 'Tickets', dormir: 'Where to stay and eat', llegar: 'Getting there', atletas: 'Athletes',
    info: 'Practical info', queVeras: 'What you will see', juzga: 'How it is judged', normas: 'Rules in the stands',
    seoT: 'Watch the competition · GRS Cup 2', seoD: 'Free entry with booking: what you will see, how a lift is judged and the rules in the stands.',
  },
};

export interface RelatedLink {
  titulo: string;
  texto: string;
  ruta: string;
}

/** «Te puede interesar»: three numbered links (Figma pages 29, 32). */
@Component({
  selector: 'gr-related',
  imports: [GrIcon, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (nivel() === 'h3') { <h3 class="text-display-2xs md:text-display-xs">{{ titulo() || t().interesar }}</h3> }
    @else { <h2 class="text-display-2xs md:text-display-xs">{{ titulo() || t().interesar }}</h2> }
    <!-- every card the same size: equal columns, one fixed height, one line per text -->
    <ul class="mt-5 grid auto-rows-fr gap-3 lg:grid-cols-3 lg:gap-4">
      @for (l of items(); track l.ruta; let i = $index) {
        <li class="min-w-0">
          <a [href]="l.ruta | loc" [attr.title]="l.titulo + ' · ' + l.texto" class="flex h-[84px] items-center gap-4 rounded-lg border border-line-subtle bg-bg-card px-4 transition-colors hover:border-line-strong">
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
  readonly titulo = input('');
  protected readonly t = inject(I18n).dict(T);
  readonly items = input<RelatedLink[]>([]);
  /** Nivel del título: «h3» en las páginas cuyo contenido ya tiene sus dos H2 (Figma 75). */
  readonly nivel = input<'h2' | 'h3'>('h2');
}

/**
 * «Sigue la GRS Cup 2 en directo» (Figma «CTA band» 80:159737, Kind=Directo): one shared band before the footer of the
 * inner pages. Main CTA to the live page, plus quick links to its chat and to the Porra and Fantasy games.
 */
@Component({
  selector: 'gr-community',
  imports: [RouterLink, GrButton, GrIcon, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="relative overflow-hidden rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 shadow-glow-deep md:flex md:items-center md:justify-between md:gap-10 md:p-10">
      <div class="md:max-w-xl">
        <p class="text-mono-xs text-text-tertiary">{{ t().comunidad }}</p>
        <!-- the red part is never split: white words on one line, the whole red phrase on the next -->
        @if (nivel() === 'h3') {
          <h3 class="mt-3 text-display-xs md:text-display-m">{{ t().sigue }} <span class="block bg-accent-grain bg-clip-text whitespace-nowrap text-transparent">{{ t().enDirecto }}</span></h3>
        } @else {
          <h2 class="mt-3 text-display-xs md:text-display-m">{{ t().sigue }} <span class="block bg-accent-grain bg-clip-text whitespace-nowrap text-transparent">{{ t().enDirecto }}</span></h2>
        }
        <p class="mt-2 text-body-s text-text-secondary md:text-body-m">{{ t().mira }}</p>
      </div>
      <div class="mt-5 flex flex-col gap-3 md:mt-0 md:w-[340px] md:shrink-0">
        <a grButton variant="primary" icon="play" class="w-full" [routerLink]="'/en-directo' | loc">{{ t().ver }}</a>
        <nav class="grid grid-cols-3 gap-2" [attr.aria-label]="t().navAria">
          @for (l of enlaces(); track l.ruta) {
            <a [routerLink]="l.ruta | loc" [queryParams]="l.query" class="flex h-11 min-w-0 items-center justify-center gap-1 rounded-md border border-line-strong bg-black/20 px-1.5 text-label-s transition-colors hover:border-accent/60 hover:bg-black/30">
              <gr-icon [name]="l.icono" [size]="14" class="shrink-0" /><span class="truncate">{{ l.texto }}</span>
            </a>
          }
        </nav>
        <a [href]="instagram()" target="_blank" rel="noopener" class="inline-flex items-center gap-2 self-start text-body-xs text-text-tertiary hover:text-text-secondary"><gr-icon name="instagram" [size]="14" />{{ t().insta }}</a>
      </div>
    </section>
  `,
})
export class Community {
  /** Nivel del título: «h3» en las páginas cuyo contenido ya tiene sus dos H2 (Figma 75). */
  readonly nivel = input<'h2' | 'h3'>('h2');
  protected readonly t = inject(I18n).dict(T);
  private readonly comp = inject(Competition);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
  protected readonly enlaces = computed<{ texto: string; ruta: string; query?: Record<string, string>; icono: GrIconName }[]>(() => [
    { texto: 'Chat', ruta: '/en-directo', query: { tab: 'chat' }, icono: 'message' },
    { texto: this.t().porra, ruta: '/porra', icono: 'trophy' },
    { texto: 'Fantasy', ruta: '/fantasy', icono: 'star' },
  ]);
}

// ============================================================ /publico ===

/** /publico (Figma page 29): what spectators will see, how an attempt is judged and the stand rules. All sections come from the CMS. */
@Component({
  selector: 'gr-publico-page',
  imports: [CdnPipe, RouterLink, LocPipe, Page, GrIcon, GrSkeleton, GrCabecera, GrSelect, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .gr-vista { animation: gr-vista-in 180ms ease-out; }
    @keyframes gr-vista-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .gr-vista { animation: none; } }
  `,
  template: `
    @let l = land();
    <gr-page [title]="t('intro', 'titulo') || tp().venAVer" [accent]="t('intro', 'tituloAcento') || tp().laComp" [eyebrow]="t('intro', 'eyebrow')" [subtitle]="txt(t('intro', 'texto'))" [section]="tp().visita" [crumb]="tp().publico">
      <!-- Jaime 15-nov: quick accesses first — square cards with only an icon and a title -->
      <nav class="mb-12 md:mb-20" aria-labelledby="publico-accesos">
        <h2 id="publico-accesos" class="mb-4 text-label-s text-text-secondary uppercase md:mb-6">{{ tp().accesos }}</h2>
        <ul class="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 lg:grid-cols-5">
          @for (a of accesos; track a.ruta) {
            <li>
              <a [routerLink]="a.ruta | loc" class="group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/8 bg-white/3 p-2 text-center transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-4 md:gap-4">
                <span class="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(196_43_62/0.18),transparent)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true"></span>
                <span class="flex size-10 items-center justify-center rounded-lg bg-accent/16 text-accent-text sm:size-12 md:size-14"><gr-icon [name]="a.icono" [size]="22" /></span>
                <span class="text-[13px] leading-tight font-semibold sm:text-[15px] md:text-[17px]">{{ a.texto }}</span>
              </a>
            </li>
          }
        </ul>
      </nav>
      <!-- Figma 46:23: the page tabs are one dropdown (not sticky); each view has its own ?vista= -->
      <div class="mb-8 flex flex-col gap-2 md:mb-12 md:max-w-80">
        <label class="text-label-s text-text-secondary" for="publico-vista">{{ tp().seccion }}</label>
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
                      <img [src]="m['imagen'] | cdn" [alt]="m['alt'] || m['titulo']" class="aspect-[300/420] w-full object-cover" loading="lazy" />
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
                        <p class="mt-2 flex gap-2" [attr.aria-label]="tp().ejemplo">
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
              <gr-related [titulo]="str(s, 'titulo') || tp().interesar" [items]="related(s)" />
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
  private readonly i18n = inject(I18n);
  protected readonly tp = this.i18n.dict(T);
  protected readonly accesos: { texto: string; ruta: string; icono: GrIconName }[] = [
    { texto: this.tp().directo, ruta: '/en-directo', icono: 'radio' },
    { texto: this.tp().horarios, ruta: '/horarios', icono: 'calendar' },
    { texto: this.tp().porra, ruta: '/porra', icono: 'trophy' },
    { texto: 'GRS Fantasy', ruta: '/fantasy', icono: 'star' },
    { texto: this.tp().rifa, ruta: '/sorteo', icono: 'gift' },
    { texto: this.tp().entradas, ruta: '/entradas', icono: 'ticket' },
    { texto: this.tp().dormir, ruta: '/donde-dormir-y-comer', icono: 'building' },
    { texto: this.tp().llegar, ruta: '/como-llegar', icono: 'map-pin' },
    { texto: this.tp().atletas, ruta: '/atletas', icono: 'users' },
    { texto: 'FAQ', ruta: '/preguntas-frecuentes', icono: 'help' },
  ];
  protected readonly land = signal<Landing | null | undefined>(undefined);
  protected readonly anchors = [{ id: 'info', t: this.tp().info }, { id: 'que-veras', t: this.tp().queVeras }, { id: 'como-se-juzga', t: this.tp().juzga }, { id: 'normas', t: this.tp().normas }];
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
      await applySeo(cms, seo, '/publico', this.tp().seoT, this.tp().seoD, undefined,
        { jsonLd: c ? eventLd(c, this.i18n.lang(), seo.origin) : undefined });
    });
  }
}

/** SportsEvent structured data (free entry). */
function eventLd(c: CompeticionPublica, lang: Lang, origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', inLanguage: lang,
    startDate: c.fechaInicio, endDate: c.fechaFin, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
    location: { '@type': 'Place', name: c.sede.nombre, address: { '@type': 'PostalAddress', streetAddress: c.sede.direccion, postalCode: c.sede.cp, addressLocality: c.sede.ciudad, addressRegion: c.sede.provincia, addressCountry: 'ES' } },
    organizer: { '@type': 'Organization', name: c.evento.organizador || 'GR Strength' },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: origin + '/entradas' },
  };
}
