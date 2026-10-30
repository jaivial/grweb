import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrIcon, GrSkeleton } from '@grcup/ui';
import { map } from 'rxjs';
import { Cms, type Album, type Foto } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { instagramOf } from '../layout/layout';
import { Lightbox } from '../layout/lightbox';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related } from './landings';
import { GrCallout } from './seo-bloques';

/** Photos per page (desktop pagination) and per «Cargar más» (mobile). */
const POR_PAGINA = 12;
const ETIQUETAS: [NonNullable<Foto['etiqueta']>, string][] = [['plataforma', 'Plataforma'], ['calentamiento', 'Calentamiento'], ['podio', 'Podios'], ['ambiente', 'Ambiente']];

interface FotoGaleria extends Foto { album: string; pie: string }

/** «Edición 2025» for albums whose slug ends in a year, otherwise the album title. */
function nombreAlbum(a: Album): string {
  const anio = /(\d{4})$/.exec(a.slug)?.[1];
  return anio ? `Edición ${anio}` : a.titulo;
}

/**
 * /galeria (Figma page 30): filter chips (album and type of photo), a masonry of every published photo, pagination on
 * desktop and «Cargar más» on mobile, the «Comparte» callout, related links and the community band. The viewer is the
 * shared lightbox, with a share button.
 */
@Component({
  selector: 'gr-galeria-page',
  imports: [Page, GrIcon, GrSkeleton, GrCallout, Related, Community, Lightbox, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Galería" accent="GRStrength Cup" eyebrow="Fotos" section="El evento" crumb="Galería" subtitle="Fotos de la competición: plataforma, calentamiento, podios y ambiente.">
      <div class="flex flex-col gap-12 md:gap-16">
        @if (albums() === null) {
          <div class="columns-2 gap-3 md:columns-3 md:gap-4 xl:columns-4">
            @for (h of [300, 220, 260, 340, 240, 280, 320, 230]; track $index) { <gr-skeleton class="mb-3 block rounded-md md:mb-4" [style.height.px]="h" /> }
          </div>
        } @else if (todas().length) {
          <div class="flex flex-col gap-6 md:gap-8">
            <div #filtrosEl class="flex scroll-mt-28 flex-wrap gap-2" role="group" aria-label="Filtrar fotos">
              <button type="button" [class]="chip(!filtros().size)" [attr.aria-pressed]="!filtros().size" (click)="limpiar()"><gr-icon [name]="!filtros().size ? 'check' : 'plus'" [size]="14" />Todas</button>
              @for (c of chips(); track c.id) {
                <button type="button" [class]="chip(filtros().has(c.id))" [attr.aria-pressed]="filtros().has(c.id)" (click)="alternar(c.id)"><gr-icon [name]="filtros().has(c.id) ? 'check' : 'plus'" [size]="14" />{{ c.t }}</button>
              }
            </div>
            @if (filtradas().length) {
              <!-- masonry: natural proportions, 2 / 3 / 4 columns -->
              <ul class="columns-2 gap-3 md:columns-3 md:gap-4 xl:columns-4">
                @for (f of visibles(); track f.url + f.album) {
                  <li class="mb-3 break-inside-avoid md:mb-4">
                    <button type="button" class="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-white/8" [attr.aria-label]="'Ampliar: ' + f.alt" (click)="abrir(f)">
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
                <nav class="hidden items-center justify-center gap-2 md:flex" aria-label="Páginas de la galería">
                  <a [routerLink]="[]" [queryParams]="{ pagina: pagina() > 2 ? pagina() - 1 : null }" [class]="paso(false, pagina() === 1)" [attr.aria-disabled]="pagina() === 1 || null" [attr.tabindex]="pagina() === 1 ? -1 : null" aria-label="Página anterior" (click)="irA()"><gr-icon name="chevron-left" [size]="18" /></a>
                  @for (n of numeros(); track $index) {
                    @if (n === 0) { <span class="flex size-11 items-center justify-center text-text-tertiary" aria-hidden="true">…</span> }
                    @else { <a [routerLink]="[]" [queryParams]="{ pagina: n > 1 ? n : null }" [class]="paso(n === pagina(), false)" [attr.aria-current]="n === pagina() ? 'page' : null" (click)="irA()">{{ n }}</a> }
                  }
                  <a [routerLink]="[]" [queryParams]="{ pagina: pagina() < paginas() ? pagina() + 1 : paginas() }" [class]="paso(false, pagina() === paginas())" [attr.aria-disabled]="pagina() === paginas() || null" [attr.tabindex]="pagina() === paginas() ? -1 : null" aria-label="Página siguiente" (click)="irA()"><gr-icon name="chevron-right" [size]="18" /></a>
                </nav>
                @if (mostradas() < filtradas().length) {
                  <button type="button" class="flex h-12 w-full items-center justify-center rounded-sm border border-line-strong text-label-m md:hidden" (click)="cargarMas()">Cargar más ({{ mostradas() }} de {{ filtradas().length }})</button>
                }
              }
            } @else {
              <p class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-m text-text-secondary">No hay fotos con estos filtros. <button type="button" class="text-accent-text underline" (click)="limpiar()">Ver todas</button></p>
            }
          </div>
          <gr-callout tono="dato" titulo="Comparte">¿Tienes fotos de la competición? Etiqueta a <a [href]="instagram()" target="_blank" rel="noopener" class="text-text-primary underline">@grstrengthclub</a> con #GRStrengthCup y las añadiremos a la galería.</gr-callout>
        } @else {
          <p class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-m text-text-secondary">Pronto publicaremos las fotos de la competición.</p>
        }
        <gr-related [items]="rel" />
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
  protected readonly rel = [
    { titulo: 'Edición 2025', texto: 'Crónica de la edición', ruta: '/ediciones/2025' },
    { titulo: 'Resultados', texto: 'Clasificaciones', ruta: '/resultados' },
    { titulo: 'Patrocinadores', texto: 'Quién lo hace posible', ruta: '/patrocinadores' },
  ];

  private readonly paginaQuery = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => Number(q.get('pagina')) || 1)), { initialValue: 1 });
  protected readonly todas = computed<FotoGaleria[]>(() =>
    (this.albums() ?? []).flatMap((a) => a.fotos.map((f) => {
      const album = nombreAlbum(a);
      const tipo = ETIQUETAS.find(([k]) => k === f.etiqueta)?.[1];
      return { ...f, album: a.slug, pie: [album, tipo].filter(Boolean).join(' · ') };
    })),
  );
  /** «Edición 2025» per album, then the photo types that appear. */
  protected readonly chips = computed(() => {
    const albums = (this.albums() ?? []).filter((a) => a.fotos.length).map((a) => ({ id: 'a:' + a.slug, t: nombreAlbum(a) }));
    const hay = new Set(this.todas().map((f) => f.etiqueta));
    return [...albums, ...ETIQUETAS.filter(([k]) => hay.has(k)).map(([k, t]) => ({ id: 'e:' + k, t }))];
  });
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
  protected readonly mostradas = computed(() => Math.min(this.filtradas().length, this.desde() + POR_PAGINA + (this.movil() ? this.extra() : 0)));
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
    void inject(PendingTasks).run(async () => {
      const [albums] = await Promise.all([cms.galeria(), this.comp.load()]);
      this.albums.set(albums ?? []);
      await applySeo(cms, seo, '/galeria', 'Galería · GR Strength Cup', 'Fotos de la GR Strength Cup: plataforma, calentamiento, podios y ambiente.');
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const mq = matchMedia('(max-width: 767px)');
      const cambio = () => this.movil.set(mq.matches);
      afterNextRender(cambio);
      mq.addEventListener('change', cambio);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', cambio));
    }
  }

  protected chip(activo: boolean): string {
    return 'flex h-11 items-center gap-2 rounded-full border px-4 text-label-s transition-colors ' +
      (activo ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary');
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
    this.filtros.set(f);
    this.extra.set(0);
    if (this.pagina() > 1) void this.router.navigate([], { queryParams: { pagina: null }, queryParamsHandling: 'merge', replaceUrl: true }); // page 1 of the new selection
  }
  protected cargarMas(): void {
    this.extra.update((n) => n + POR_PAGINA);
  }
  protected abrir(f: FotoGaleria): void {
    this.abierta.set(this.filtradas().indexOf(f));
  }
  /** After a page link: back to the filters, so the new photos start at the top. */
  protected irA(): void {
    setTimeout(() => this.filtrosEl()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}
