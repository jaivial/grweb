import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrIcon, GrSkeleton } from '@grcup/ui';
import { map } from 'rxjs';
import { Cms, type Album, type Foto } from '../core/cms';
import { Competition } from '../core/competition';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { instagramOf } from '../layout/layout';
import { Lightbox } from '../layout/lightbox';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related } from './landings';
import { GrCallout } from './seo-bloques';

/** Photos per page (desktop pagination) and per «Cargar más» batch (mobile, Figma 390: 24). */
const POR_PAGINA = 12;
const POR_LOTE = 24;
/** Photo types; «plataforma» reads «Tarima» and «ambiente» «Público» (Figma 393:131028). Labels: T.etiquetas. */
const ETIQUETAS: NonNullable<Foto['etiqueta']>[] = ['plataforma', 'calentamiento', 'podio', 'ambiente'];

const T = {
  es: {
    etiquetas: { plataforma: 'Tarima', calentamiento: 'Calentamiento', podio: 'Podios', ambiente: 'Público' } as Record<string, string>,
    edicion: (a: string) => 'Edición ' + a,
    titulo: 'Galería', eyebrow: 'Fotos', section: 'El evento',
    subtitulo: 'Fotos de la competición: tarima, calentamiento, podios y público.',
    filtros: 'Filtros',
    activos: (n: number) => n + ' activos',
    fotos: (n: number) => n + ' ' + (n === 1 ? 'foto' : 'fotos'),
    limpiar: 'Limpiar',
    filtrar: 'Filtrar fotos',
    ver: (n: number) => 'Ver ' + n + ' ' + (n === 1 ? 'foto' : 'fotos'),
    ampliar: 'Ampliar: ',
    paginas: 'Páginas de la galería', anterior: 'Página anterior', siguiente: 'Página siguiente',
    cargarMas: (a: number, b: number) => `Cargar más (${a} de ${b})`,
    sinFiltro: 'No hay fotos con estos filtros', sinFiltroTxt: 'Prueba con otra edición o categoría.', verTodas: 'Ver todas las fotos',
    comparte: 'Comparte', comparte1: '¿Tienes fotos de la competición? Etiqueta a ', comparte2: ' con #GRSCup2 y las añadiremos a la galería.',
    vacio: 'Aún no hay fotos publicadas',
    vacioTxt: 'Publicaremos aquí las fotos de la GRS Cup 2 después de la competición. Mientras tanto, puedes ver las de la edición 2025.',
    ver2025: 'Ver la edición 2025',
    grupoEdicion: 'Edición', todasEdiciones: 'Todas las ediciones', grupoCategoria: 'Categoría', todas: 'Todas',
    rel: [['Edición 2025', 'Crónica de la edición'], ['Resultados', 'Clasificaciones'], ['Patrocinadores', 'Quién lo hace posible']],
    seoTitulo: 'Galería · GRS Cup 2', seoDesc: 'Fotos de la GRS Cup: tarima, calentamiento, podios y público.',
  },
  en: {
    etiquetas: { plataforma: 'Platform', calentamiento: 'Warm-up', podio: 'Podiums', ambiente: 'Crowd' } as Record<string, string>,
    edicion: (a: string) => a + ' edition',
    titulo: 'Gallery', eyebrow: 'Photos', section: 'The event',
    subtitulo: 'Photos of the competition: platform, warm-up, podiums and crowd.',
    filtros: 'Filters',
    activos: (n: number) => n + ' active',
    fotos: (n: number) => n + ' ' + (n === 1 ? 'photo' : 'photos'),
    limpiar: 'Clear',
    filtrar: 'Filter photos',
    ver: (n: number) => 'See ' + n + ' ' + (n === 1 ? 'photo' : 'photos'),
    ampliar: 'Enlarge: ',
    paginas: 'Gallery pages', anterior: 'Previous page', siguiente: 'Next page',
    cargarMas: (a: number, b: number) => `Load more (${a} of ${b})`,
    sinFiltro: 'No photos match these filters', sinFiltroTxt: 'Try another edition or category.', verTodas: 'See all photos',
    comparte: 'Share', comparte1: 'Got photos of the competition? Tag ', comparte2: ' with #GRSCup2 and we will add them to the gallery.',
    vacio: 'No photos published yet',
    vacioTxt: 'We will publish the GRS Cup 2 photos here after the competition. In the meantime, you can see the ones from the 2025 edition.',
    ver2025: 'See the 2025 edition',
    grupoEdicion: 'Edition', todasEdiciones: 'All editions', grupoCategoria: 'Category', todas: 'All',
    rel: [['2025 edition', 'Report of the edition'], ['Results', 'Standings'], ['Sponsors', 'Who makes it possible']],
    seoTitulo: 'Gallery · GRS Cup 2', seoDesc: 'GRS Cup photos: platform, warm-up, podiums and crowd.',
  },
};

interface FotoGaleria extends Foto { album: string; pie: string }

/** «Edición 2025» for albums whose slug ends in a year, otherwise the album title. */
function nombreAlbum(a: Album, edicion = (y: string) => `Edición ${y}`): string {
  const anio = /(\d{4})$/.exec(a.slug)?.[1];
  return anio ? edicion(anio) : a.titulo;
}

/**
 * /galeria (Figma page 30; móvil 80:192530, desktop 80:192264, filtros 393:131028 / 393:131064, vacío 393:131100): a «Filtros»
 * button that opens a panel (Edición and Categoría) with the photo count, a masonry of every published photo, pagination on
 * desktop and «Cargar más» on mobile, the «Comparte» callout, related links and the community band. The viewer is the
 * shared lightbox, with a share button.
 */
@Component({
  selector: 'gr-galeria-page',
  imports: [Page, GrIcon, GrSkeleton, GrCallout, Related, Community, Lightbox, RouterLink, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'fuera($event)', '(document:keydown.escape)': 'cerrarPanel(true)' },
  styles: `
    .gr-filtros-in { animation: gr-filtros-in 180ms cubic-bezier(0.2, 0, 0, 1); }
    .gr-filtros-out { animation: gr-filtros-out 160ms ease-in forwards; }
    @keyframes gr-filtros-in { from { opacity: 0; transform: translateY(-6px); } }
    @keyframes gr-filtros-out { to { opacity: 0; transform: translateY(-6px); } }
    @media (prefers-reduced-motion: reduce) { .gr-filtros-in, .gr-filtros-out { animation-duration: 1ms; } }
  `,
  template: `
    <gr-page [title]="t().titulo" accent="GRS Cup" [eyebrow]="t().eyebrow" [section]="t().section" [crumb]="t().titulo" [subtitle]="t().subtitulo">
      <div class="flex flex-col gap-12 md:gap-20">
        @if (albums() === null) {
          <div class="columns-2 gap-2 md:columns-3 md:gap-4 xl:columns-4">
            @for (h of [300, 220, 260, 340, 240, 280, 320, 230]; track $index) { <gr-skeleton class="mb-2 block rounded-md md:mb-4" [style.height.px]="h" /> }
          </div>
        } @else if (todas().length) {
          <div class="flex flex-col gap-6 md:gap-8">
            <div #filtrosEl class="relative flex scroll-mt-28 flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <button #botonFiltros type="button" class="flex h-11 items-center gap-2 rounded-sm border px-4 text-label-m transition-colors"
                  [class]="panel() ? 'border-accent bg-accent/8 text-text-primary' : 'border-line-strong text-text-primary hover:border-text-tertiary'"
                  aria-controls="panel-filtros" [attr.aria-expanded]="panel()" (click)="alternarPanel()">
                  <gr-icon name="filter" [size]="16" />{{ t().filtros }}
                  @if (filtros().size) { <span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-label-xs text-white" [attr.aria-label]="t().activos(filtros().size)">{{ filtros().size }}</span> }
                  <gr-icon [name]="panel() ? 'chevron-up' : 'chevron-down'" [size]="16" />
                </button>
                <p class="text-body-s text-text-tertiary" aria-live="polite">{{ t().fotos(filtradas().length) }}</p>
              </div>
              @if (filtros().size) {
                <div class="flex items-center justify-between gap-3 text-body-s">
                  <p class="text-text-secondary">{{ resumen() }}</p>
                  <button type="button" class="-my-3 min-h-11 text-accent-text underline underline-offset-4" (click)="limpiar()">{{ t().limpiar }}</button>
                </div>
              }
              @if (panel()) {
                <div id="panel-filtros" #panelEl animate.enter="gr-filtros-in" animate.leave="gr-filtros-out" role="group" [attr.aria-label]="t().filtrar"
                  class="absolute top-[52px] left-0 z-30 flex w-full flex-col rounded-lg border border-line-subtle bg-bg-card shadow-[0_16px_40px_rgb(0_0_0/0.5)] md:w-[360px]">
                  @for (g of grupos(); track g.t) {
                    <div class="flex flex-col gap-1 border-b border-line-subtle p-3">
                      <p class="px-3 pt-1 pb-2 text-label-xs text-text-muted uppercase">{{ g.t }}</p>
                      <button type="button" [class]="opcion(g.nada())" [attr.aria-pressed]="g.nada()" (click)="limpiarGrupo(g.p)">{{ g.todas }}@if (g.nada()) { <gr-icon name="check" [size]="16" /> }</button>
                      @for (c of g.ops; track c.id) {
                        <button type="button" [class]="opcion(filtros().has(c.id))" [attr.aria-pressed]="filtros().has(c.id)" (click)="alternar(c.id)">{{ c.t }}@if (filtros().has(c.id)) { <gr-icon name="check" [size]="16" /> }</button>
                      }
                    </div>
                  }
                  <div class="flex items-center justify-between gap-3 p-3">
                    <button type="button" class="flex h-11 items-center px-3 text-label-m text-text-secondary hover:text-text-primary" (click)="limpiar()">{{ t().limpiar }}</button>
                    <button type="button" class="flex h-11 items-center rounded-sm bg-accent px-5 text-label-m text-white hover:bg-accent/90" (click)="cerrarPanel(true)">{{ t().ver(filtradas().length) }}</button>
                  </div>
                </div>
              }
            </div>
            @if (filtradas().length) {
              <!-- masonry: natural proportions, 2 / 3 / 4 columns -->
              <ul class="columns-2 gap-2 md:columns-3 md:gap-4 xl:columns-4">
                @for (f of visibles(); track f.url + f.album) {
                  <li class="mb-2 break-inside-avoid md:mb-4">
                    <button type="button" class="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-white/8" [attr.aria-label]="t().ampliar + f.alt" (click)="abrir(f)">
                      <img [src]="mini(f.url)" [attr.srcset]="srcset(f.url)" sizes="(min-width: 1280px) 288px, (min-width: 768px) 33vw, 50vw" [alt]="f.alt"
                        [attr.width]="f.ancho || null" [attr.height]="f.alto || null" [style.aspect-ratio]="f.ancho && f.alto ? f.ancho + ' / ' + f.alto : '3 / 4'"
                        class="block h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" [style.object-position]="f.focalX + '% ' + f.focalY + '%'" loading="lazy" />
                      <span class="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
                        <span class="flex size-11 items-center justify-center rounded-full bg-black/60 text-white"><gr-icon name="search" [size]="18" /></span>
                      </span>
                    </button>
                  </li>
                }
              </ul>
              @if (paginas() > 1) {
                <!-- desktop: ‹ 1 2 3 … 8 › (crawlable links); mobile: «Cargar más (24 de 96)» -->
                <nav class="hidden items-center justify-center gap-2 md:flex" [attr.aria-label]="t().paginas">
                  <a [routerLink]="[]" [queryParams]="{ pagina: pagina() > 2 ? pagina() - 1 : null }" [class]="paso(false, pagina() === 1)" [attr.aria-disabled]="pagina() === 1 || null" [attr.tabindex]="pagina() === 1 ? -1 : null" [attr.aria-label]="t().anterior" (click)="irA()"><gr-icon name="chevron-left" [size]="18" /></a>
                  @for (n of numeros(); track $index) {
                    @if (n === 0) { <span class="flex size-11 items-center justify-center text-text-tertiary" aria-hidden="true">…</span> }
                    @else { <a [routerLink]="[]" [queryParams]="{ pagina: n > 1 ? n : null }" [class]="paso(n === pagina(), false)" [attr.aria-current]="n === pagina() ? 'page' : null" (click)="irA()">{{ n }}</a> }
                  }
                  <a [routerLink]="[]" [queryParams]="{ pagina: pagina() < paginas() ? pagina() + 1 : paginas() }" [class]="paso(false, pagina() === paginas())" [attr.aria-disabled]="pagina() === paginas() || null" [attr.tabindex]="pagina() === paginas() ? -1 : null" [attr.aria-label]="t().siguiente" (click)="irA()"><gr-icon name="chevron-right" [size]="18" /></a>
                </nav>
                @if (mostradas() < filtradas().length) {
                  <button type="button" class="flex h-12 w-full items-center justify-center rounded-sm border border-line-strong text-label-m md:hidden" (click)="cargarMas()">{{ t().cargarMas(mostradas(), filtradas().length) }}</button>
                }
              }
            } @else {
              <div class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
                <p class="flex items-center gap-3 text-label-l"><gr-icon name="image" [size]="20" class="text-accent-text" />{{ t().sinFiltro }}</p>
                <p class="text-body-s text-text-secondary">{{ t().sinFiltroTxt }}</p>
                <button type="button" class="-my-2 inline-flex min-h-11 w-fit items-center gap-1 text-label-s text-accent-text" (click)="limpiar()">{{ t().verTodas }} <gr-icon name="arrow-right" [size]="14" /></button>
              </div>
            }
          </div>
          <gr-callout tono="dato" [titulo]="t().comparte">{{ t().comparte1 }}<a [href]="instagram()" target="_blank" rel="noopener" class="-my-3 inline-flex min-h-11 items-center text-text-primary underline">@grstrengthclub</a>{{ t().comparte2 }}</gr-callout>
        } @else {
          <!-- Figma 393:131100 «vacío» -->
          <div class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
            <h2 class="flex items-center gap-3 text-label-l"><gr-icon name="image" [size]="20" class="text-accent-text" />{{ t().vacio }}</h2>
            <p class="text-body-s text-text-secondary">{{ t().vacioTxt }}</p>
            <a [routerLink]="'/ediciones/2025' | loc" class="-my-2 inline-flex min-h-11 w-fit items-center gap-1 text-label-s text-accent-text">{{ t().ver2025 }} <gr-icon name="arrow-right" [size]="14" /></a>
          </div>
          <gr-callout tono="dato" [titulo]="t().comparte">{{ t().comparte1 }}<a [href]="instagram()" target="_blank" rel="noopener" class="-my-3 inline-flex min-h-11 items-center text-text-primary underline">@grstrengthclub</a>{{ t().comparte2 }}</gr-callout>
        }
        <gr-related [items]="rel()" />
        <gr-community />
      </div>
      <gr-lightbox [fotos]="visor()" [(indice)]="abierta" [compartir]="true" />
    </gr-page>
  `,
})
export class GaleriaPage {
  protected readonly albums = signal<Album[] | null>(null);
  protected readonly filtros = signal(new Set<string>());
  protected readonly abierta = signal(-1);
  /** Mobile shows «Cargar más» instead of the page links (set after hydration, so server and first render match). */
  protected readonly movil = signal(false);
  private readonly extra = signal(0);
  private readonly filtrosEl = viewChild<ElementRef<HTMLElement>>('filtrosEl');
  private readonly comp = inject(Competition);
  private readonly router = inject(Router);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly rel = computed(() => {
    const r = this.t().rel;
    return [
      { titulo: r[0][0], texto: r[0][1], ruta: this.i18n.path('/ediciones/2025') },
      { titulo: r[1][0], texto: r[1][1], ruta: this.i18n.path('/resultados') },
      { titulo: r[2][0], texto: r[2][1], ruta: this.i18n.path('/patrocinadores') },
    ];
  });

  private readonly query = inject(ActivatedRoute).queryParamMap;
  private readonly paginaQuery = toSignal(this.query.pipe(map((q) => Number(q.get('pagina')) || 1)), { initialValue: 1 });
  protected readonly todas = computed<FotoGaleria[]>(() => {
    const t = this.t();
    return (this.albums() ?? []).flatMap((a) => a.fotos.map((f) => {
      const album = nombreAlbum(a, t.edicion);
      const tipo = f.etiqueta && ETIQUETAS.includes(f.etiqueta) ? t.etiquetas[f.etiqueta] : undefined;
      return { ...f, album: a.slug, pie: [album, tipo].filter(Boolean).join(' · ') };
    }));
  });
  /** Edición (albums) and Categoría (photo types) groups of the filter panel. */
  protected readonly grupos = computed(() => {
    const f = this.filtros();
    const t = this.t();
    const albums = (this.albums() ?? []).filter((a) => a.fotos.length).map((a) => ({ id: 'a:' + a.slug, t: nombreAlbum(a, t.edicion) }));
    const hay = new Set(this.todas().map((x) => x.etiqueta));
    const tipos = ETIQUETAS.filter((k) => hay.has(k)).map((k) => ({ id: 'e:' + k, t: t.etiquetas[k] }));
    return [
      { t: t.grupoEdicion, p: 'a:', todas: t.todasEdiciones, ops: albums, nada: () => ![...f].some((x) => x.startsWith('a:')) },
      { t: t.grupoCategoria, p: 'e:', todas: t.todas, ops: tipos, nada: () => ![...f].some((x) => x.startsWith('e:')) },
    ];
  });
  /** «Edición 2025 · Podios» */
  protected readonly resumen = computed(() => this.grupos().flatMap((g) => g.ops.filter((o) => this.filtros().has(o.id)).map((o) => o.t)).join(' · '));
  protected readonly panel = signal(false);
  private readonly botonFiltros = viewChild<ElementRef<HTMLElement>>('botonFiltros');
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panelEl');
  /** Albums OR albums, types OR types, album AND type. */
  protected readonly filtradas = computed(() => {
    const f = this.filtros();
    const albums = [...f].filter((x) => x.startsWith('a:')).map((x) => x.slice(2));
    const tipos = [...f].filter((x) => x.startsWith('e:')).map((x) => x.slice(2));
    return this.todas().filter((x) => (!albums.length || albums.includes(x.album)) && (!tipos.length || tipos.includes(x.etiqueta ?? '')));
  });
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.filtradas().length / POR_PAGINA)));
  protected readonly pagina = computed(() => Math.min(Math.max(1, this.paginaQuery()), this.paginas()));
  private readonly desde = computed(() => (this.pagina() - 1) * POR_PAGINA);
  protected readonly mostradas = computed(() => Math.min(this.filtradas().length, this.movil() ? POR_LOTE + this.extra() : this.desde() + POR_PAGINA));
  protected readonly visibles = computed(() => this.filtradas().slice(this.movil() ? 0 : this.desde(), this.mostradas()));
  protected readonly visor = computed(() => this.filtradas().map((f) => ({ imagen: f.url, alt: f.alt, pie: f.pie })));
  /** 1 2 3 … 8 around the current page (0 = gap). */
  protected readonly numeros = computed(() => {
    const n = this.paginas(), p = this.pagina();
    const set = [...new Set([1, 2, 3, p - 1, p, p + 1, n])].filter((x) => x >= 1 && x <= n).sort((a, b) => a - b);
    const out: number[] = [];
    set.forEach((x, i) => { if (i && x - set[i - 1] > 1) out.push(0); out.push(x); });
    return out;
  });

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    // ?filtro=a:2025,e:podio — shareable and kept on reload
    this.query.pipe(takeUntilDestroyed()).subscribe((q) => {
      const f = (q.get('filtro') ?? '').split(',').filter(Boolean);
      if (f.join() !== [...this.filtros()].join()) this.filtros.set(new Set(f));
    });
    void inject(PendingTasks).run(async () => {
      const [albums] = await Promise.all([cms.galeria(), this.comp.load()]);
      this.albums.set(albums ?? []);
      await applySeo(cms, seo, '/galeria', this.t().seoTitulo, this.t().seoDesc);
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const mq = matchMedia('(max-width: 767px)');
      const cambio = () => this.movil.set(mq.matches);
      afterNextRender(cambio);
      mq.addEventListener('change', cambio);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', cambio));
    }
  }

  protected opcion(activo: boolean): string {
    return 'flex h-11 w-full items-center justify-between gap-2 rounded-sm px-3 text-left text-body-m transition-colors ' +
      (activo ? 'bg-accent/12 text-text-primary' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary');
  }
  protected alternarPanel(): void {
    this.panel.update((v) => !v);
  }
  protected cerrarPanel(foco = false): void {
    if (!this.panel()) return;
    this.panel.set(false);
    if (foco) this.botonFiltros()?.nativeElement.focus();
  }
  /** Closes the panel on a click outside it and its button. */
  protected fuera(e: Event): void {
    const t = e.target as Node | null;
    if (!this.panel() || !t || !t.isConnected) return;
    if (this.panelEl()?.nativeElement.contains(t) || this.botonFiltros()?.nativeElement.contains(t)) return;
    this.panel.set(false);
  }
  protected limpiarGrupo(prefijo: string): void {
    this.cambiarFiltros(new Set([...this.filtros()].filter((x) => !x.startsWith(prefijo))));
  }
  protected paso(actual: boolean, desactivado: boolean): string {
    return 'flex size-11 items-center justify-center rounded-md border text-label-m transition-colors ' +
      (actual ? 'border-accent bg-accent text-white' : desactivado ? 'pointer-events-none border-line-subtle text-text-muted' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary');
  }
  /** Media library photos get the 480 / 960 px copies; other URLs are used as they are. */
  protected mini(url: string): string {
    return url.startsWith('/api/medios/') ? url + '?w=480' : url;
  }
  protected srcset(url: string): string | null {
    return url.startsWith('/api/medios/') ? `${url}?w=480 480w, ${url}?w=960 960w` : null;
  }
  protected alternar(id: string): void {
    const f = new Set(this.filtros());
    if (!f.delete(id)) f.add(id);
    this.cambiarFiltros(f);
  }
  protected limpiar(): void {
    this.cambiarFiltros(new Set());
  }
  private cambiarFiltros(f: Set<string>): void {
    this.filtros.set(f); // at once; the URL follows
    this.extra.set(0);
    void this.router.navigate([], { queryParams: { filtro: [...f].join(',') || null, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true }); // page 1 of the new selection
  }
  protected cargarMas(): void {
    this.extra.update((n) => n + POR_LOTE);
  }
  protected abrir(f: FotoGaleria): void {
    this.abierta.set(this.filtradas().indexOf(f));
  }
  /** After a page link: back to the filters, so the new photos start at the top. */
  protected irA(): void {
    setTimeout(() => this.filtrosEl()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}
