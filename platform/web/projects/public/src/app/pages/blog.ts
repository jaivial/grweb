import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, SecurityContext, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton, fmtLongDate } from '@grcup/ui';
import { map } from 'rxjs';
import { Cms, renderMarkdown, type Heading, type Pagina } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { NoEncontrada } from '../layout/no-encontrada';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related } from './landings';

/** Category labels: singular on the cards, plural on the filter chips. */
const CATEGORIA: Record<string, [string, string]> = {
  noticias: ['Noticias', 'Noticias'], calendario: ['Calendario', 'Calendario'], guia: ['Guía', 'Guías'], normativa: ['Normativa', 'Normativa'],
  marcas: ['Marcas', 'Marcas'], cronica: ['Crónica', 'Crónicas'], entrenamiento: ['Entrenamiento', 'Entrenamiento'],
};
const etiqueta = (c?: string) => (c ? CATEGORIA[c]?.[0] ?? '' : '');
/** Posts in the grid per page (desktop) and per «Cargar más» (mobile). */
const POR_PAGINA = 9;
const fechaCorta = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace('.', '') : '');

/**
 * /blog (Figma page 34): category chips, the latest post as the featured card with the next three beside it, the rest
 * as cards (desktop pages) or rows with a thumbnail (mobile «Cargar más»), and the community band.
 */
@Component({
  selector: 'gr-blog-page',
  imports: [Page, GrIcon, GrSkeleton, RouterLink, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Guías de" accent="powerlifting" eyebrow="Blog" crumb="Blog" subtitle="Calendario, normativa y consejos para competir en powerlifting en la Comunitat Valenciana.">
      <div class="flex flex-col gap-16 md:gap-20">
        @if (posts() === null) {
          <div class="grid gap-6 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)]"><gr-skeleton class="h-[420px] rounded-2xl" /><gr-skeleton class="h-72 rounded-lg" /></div>
        } @else if (posts()!.length) {
          <div class="flex flex-col gap-6 md:gap-8">
            @if (chips().length > 1) {
              <div class="flex flex-wrap gap-2" role="group" aria-label="Categorías">
                <button type="button" [class]="chip(!cat())" [attr.aria-pressed]="!cat()" (click)="elegir('')"><gr-icon [name]="!cat() ? 'check' : 'plus'" [size]="14" />Todos</button>
                @for (c of chips(); track c) {
                  <button type="button" [class]="chip(cat() === c)" [attr.aria-pressed]="cat() === c" (click)="elegir(c)"><gr-icon [name]="cat() === c ? 'check' : 'plus'" [size]="14" />{{ plural(c) }}</button>
                }
              </div>
            }
            @if (destacado(); as d) {
              <div class="grid gap-6 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)] lg:gap-8">
                <!-- Figma «Destacado»: 760 × 420 (350 × 420 on mobile), 24 px corners, title over the photo -->
                <a [href]="'/blog/' + d.slug" class="group relative flex aspect-[350/420] flex-col justify-end overflow-hidden rounded-2xl border border-line-subtle md:aspect-[760/420]">
                  @if (d.portadaUrl) { <img [src]="d.portadaUrl" alt="" class="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" /> }
                  <span class="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,rgb(14_12_13/0.95))]" aria-hidden="true"></span>
                  <span class="relative flex flex-col items-start gap-3 p-5 md:p-6">
                    @if (d.categoria) { <span class="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-label-xs text-white uppercase">{{ et(d.categoria) }}</span> }
                    <span class="text-display-xs md:text-display-s">{{ d.titulo }}</span>
                    @if (d.resumen) { <span class="text-body-s text-text-secondary">{{ d.resumen }}</span> }
                  </span>
                </a>
                @if (recientes().length) {
                  <div class="hidden flex-col gap-4 lg:flex">
                    <p class="text-label-xs text-text-muted uppercase">Más recientes</p>
                    @for (p of recientes(); track p.slug) {
                      <a [href]="'/blog/' + p.slug" class="group flex gap-4">
                        <span class="size-[88px] shrink-0 overflow-hidden rounded-md bg-bg-card">@if (p.portadaUrl) { <img [src]="p.portadaUrl" alt="" class="size-full object-cover" loading="lazy" /> }</span>
                        <span class="flex min-w-0 flex-col gap-1">
                          @if (p.categoria) { <span class="text-label-xs text-accent-text uppercase">{{ et(p.categoria) }}</span> }
                          <span class="text-label-m group-hover:underline">{{ p.titulo }}</span>
                          <span class="text-body-xs text-text-tertiary">{{ p.minutos }} min</span>
                        </span>
                      </a>
                    }
                  </div>
                }
              </div>
            }
            @if (resto().length) {
              <!-- desktop: cards; mobile: rows with an 88 px thumbnail -->
              <ul class="grid gap-3 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
                @for (p of visibles(); track p.slug) {
                  <li [class.lg:hidden]="esReciente(p)">
                    <a [href]="'/blog/' + p.slug" class="group flex h-full gap-4 rounded-lg border-line-subtle transition-colors md:flex-col md:gap-0 md:overflow-hidden md:border md:bg-bg-card md:hover:border-line-strong">
                      <span class="size-[88px] shrink-0 overflow-hidden rounded-md bg-bg-card md:aspect-[360/210] md:size-auto md:w-full md:rounded-none">@if (p.portadaUrl) { <img [src]="p.portadaUrl" alt="" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" /> }</span>
                      <span class="flex min-w-0 flex-1 flex-col gap-1.5 md:p-5">
                        @if (p.categoria) { <span class="text-label-xs text-accent-text uppercase">{{ et(p.categoria) }}</span> }
                        <span class="text-label-m md:text-ui-h4">{{ p.titulo }}</span>
                        @if (p.resumen) { <span class="hidden text-body-s text-text-secondary md:block">{{ p.resumen }}</span> }
                        <span class="text-body-xs text-text-tertiary md:mt-auto md:pt-2">{{ p.minutos }} min<span class="hidden md:inline"> de lectura</span></span>
                      </span>
                    </a>
                  </li>
                }
              </ul>
              @if (paginas() > 1) {
                <nav class="hidden items-center justify-center gap-2 md:flex" aria-label="Páginas del blog">
                  @for (n of numeros(); track n) {
                    <a [routerLink]="[]" [queryParams]="{ pagina: n > 1 ? n : null }" [attr.aria-current]="n === pagina() ? 'page' : null"
                      class="flex size-11 items-center justify-center rounded-md border text-label-m" [class]="n === pagina() ? 'border-accent bg-accent text-white' : 'border-line-strong text-text-secondary hover:text-text-primary'">{{ n }}</a>
                  }
                </nav>
                @if (mostrados() < resto().length) {
                  <button type="button" class="flex h-12 w-full items-center justify-center rounded-md border border-line-strong text-label-m md:hidden" (click)="extra.set(extra() + porPagina)">Cargar más ({{ mostrados() }} de {{ resto().length }})</button>
                }
              }
            }
          </div>
        } @else {
          <p class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-m text-text-secondary">Todavía no hay artículos. Vuelve pronto.</p>
        }
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class BlogPage {
  protected readonly posts = signal<Pagina[] | null>(null);
  protected readonly cat = signal('');
  protected readonly extra = signal(0);
  protected readonly movil = signal(false);
  protected readonly porPagina = POR_PAGINA;
  private readonly router = inject(Router);
  private readonly paginaQuery = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => Number(q.get('pagina')) || 1)), { initialValue: 1 });
  protected et = etiqueta;
  protected plural = (c: string) => CATEGORIA[c]?.[1] ?? c;
  protected readonly chips = computed(() => Object.keys(CATEGORIA).filter((c) => (this.posts() ?? []).some((p) => p.categoria === c)));
  private readonly filtrados = computed(() => (this.posts() ?? []).filter((p) => !this.cat() || p.categoria === this.cat()));
  protected readonly destacado = computed(() => this.filtrados()[0] ?? null);
  /** Beside the featured post on desktop; in the list on smaller screens. */
  protected readonly recientes = computed(() => this.filtrados().slice(1, 4));
  protected readonly resto = computed(() => this.filtrados().slice(1));
  private readonly enRejilla = computed(() => this.resto().filter((p) => !this.recientes().includes(p)));
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.enRejilla().length / POR_PAGINA)));
  protected readonly pagina = computed(() => Math.min(Math.max(1, this.paginaQuery()), this.paginas()));
  protected readonly mostrados = computed(() => Math.min(this.resto().length, 3 + POR_PAGINA + this.extra()));
  /** Desktop: the three recent ones (hidden from lg, shown beside the featured post) + the page; mobile: «Cargar más». */
  protected readonly visibles = computed(() => {
    if (this.movil()) return this.resto().slice(0, this.mostrados());
    const desde = (this.pagina() - 1) * POR_PAGINA;
    return [...(this.pagina() === 1 ? this.recientes() : []), ...this.enRejilla().slice(desde, desde + POR_PAGINA)];
  });
  protected readonly numeros = computed(() => Array.from({ length: this.paginas() }, (_, i) => i + 1));

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      this.posts.set((await cms.blog()) ?? []);
      await applySeo(cms, seo, '/blog', 'Guías de powerlifting · Blog de la GR Strength Cup', 'Calendario, normativa y consejos para competir en powerlifting en la Comunitat Valenciana.');
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const mq = matchMedia('(max-width: 767px)');
      const cambio = () => this.movil.set(mq.matches);
      afterNextRender(cambio);
      mq.addEventListener('change', cambio);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', cambio));
    }
  }
  protected esReciente(p: Pagina): boolean { return this.pagina() === 1 && this.recientes().includes(p); }
  protected chip(activo: boolean): string {
    return 'flex h-11 items-center gap-2 rounded-full border px-4 text-label-s transition-colors ' +
      (activo ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary');
  }
  protected elegir(c: string): void {
    this.cat.set(c);
    this.extra.set(0);
    if (this.pagina() > 1) void this.router.navigate([], { queryParams: { pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

/**
 * Blog post (Figma page 34b): category eyebrow, title, summary and source; author line, cover, the article (with the
 * «caja» boxes of renderMarkdown), share buttons; contents and the event card in a sticky column; related links.
 */
@Component({
  selector: 'gr-blog-post-page',
  imports: [Page, GrIcon, GrButton, GrSkeleton, NoEncontrada, RouterLink, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = p();
    <gr-page [title]="a?.titulo ?? (a === null && !cms.failed() ? 'Página no encontrada' : '')" [eyebrow]="a ? (et(a.categoria) || 'Blog') : ''" section="Blog" [crumb]="a ? (et(a.categoria) || 'Artículo') : ''"
      [subtitle]="a?.resumen ?? ''" [stamp]="a?.fuente ? 'Fuente: ' + a.fuente : ''" [cabecera]="a !== null || cms.failed()">
      @if (a === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (a === null) { @if (!cms.failed()) { <gr-no-encontrada class="-mt-[92px] md:-mt-[148px]" /> } }
      @else {
        <div class="flex flex-col gap-16 md:gap-20">
          <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)] lg:gap-10">
            <div class="flex min-w-0 flex-col gap-6 md:gap-8">
              <p class="flex items-center gap-3">
                <span class="flex size-10 items-center justify-center rounded-full bg-accent text-label-s text-white" aria-hidden="true">GR</span>
                <span class="flex flex-col"><span class="text-label-s">Equipo GRStrength</span><span class="text-body-xs text-text-tertiary">{{ fecha(a.publicadoAt) }} · {{ a.minutos }} min de lectura</span></span>
              </p>
              @if (a.portadaUrl) { <img [src]="a.portadaUrl" alt="" class="aspect-[760/400] w-full rounded-xl object-cover" /> }
              @if (toc().length > 1) {
                <!-- mobile: contents before the text (desktop: sticky column) -->
                <nav class="rounded-lg border border-line-subtle bg-bg-card p-4 lg:hidden" aria-label="Contenido">
                  <p class="pb-2 text-label-xs text-text-muted uppercase">Contenido</p>
                  <ol class="flex flex-col gap-1 text-body-s">
                    @for (h of toc(); track h.id; let i = $index) { <li><a routerLink="." [fragment]="h.id" class="flex min-h-11 items-center text-text-secondary hover:text-text-primary">{{ i + 1 }}. {{ h.text }}</a></li> }
                  </ol>
                </nav>
              }
              <article class="prose-gr prose-blog min-w-0" [innerHTML]="html()"></article>
              <div class="flex flex-col gap-3 border-t border-line-subtle pt-6">
                <p class="text-label-s">Comparte este artículo</p>
                <div class="flex flex-wrap gap-2">
                  <a [href]="compartir('x')" target="_blank" rel="noopener" class="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-text-tertiary"><gr-icon name="share" [size]="16" />X</a>
                  <a [href]="compartir('facebook')" target="_blank" rel="noopener" class="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-text-tertiary"><gr-icon name="share" [size]="16" />Facebook</a>
                  <a [href]="compartir('whatsapp')" target="_blank" rel="noopener" class="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-text-tertiary"><gr-icon name="share" [size]="16" />WhatsApp</a>
                  <button type="button" class="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-text-tertiary" (click)="copiar()"><gr-icon name="link" [size]="16" />{{ copiado() ? 'Enlace copiado' : 'Copiar enlace' }}</button>
                </div>
              </div>
            </div>
            <aside class="flex flex-col gap-6 lg:sticky lg:top-28">
              @if (toc().length > 1) {
                <nav class="hidden rounded-lg border border-line-subtle bg-bg-card p-4 lg:block" aria-label="Contenido del artículo">
                  <p class="pb-2 text-label-xs text-text-muted uppercase">Contenido</p>
                  <ol class="flex flex-col gap-1 text-body-s">
                    @for (h of toc(); track h.id; let i = $index) {
                      <li><a routerLink="." [fragment]="h.id" (click)="activo.set(h.id)" class="relative flex rounded-sm py-2 pr-2 pl-[18px]" [class]="activo() === h.id ? 'bg-accent/12 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="activo() === h.id ? 'location' : null">
                        <span class="absolute top-1/2 left-2 h-4 w-0.5 -translate-y-1/2 rounded-full" [class]="activo() === h.id ? 'bg-accent' : ''"></span>{{ i + 1 }}. {{ h.text }}</a></li>
                    }
                  </ol>
                </nav>
              }
              @if (comp.data(); as c) {
                <!-- Figma «Edition card»: the next edition with its date and level -->
                <div class="overflow-hidden rounded-xl border border-line-subtle bg-bg-card">
                  <div class="relative h-40 overflow-hidden bg-bg-deep md:h-[200px]">
                    <img src="/img/blog/trofeo-edicion.webp" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
                    <span class="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgb(14_12_13/0.9))]" aria-hidden="true"></span>
                    @if (c.fechaInicio) { <span class="absolute bottom-4 left-5 text-display-l text-white">{{ c.fechaInicio.slice(0, 4) }}</span> }
                  </div>
                  <div class="flex flex-col items-start gap-3 p-5">
                    <span class="inline-flex h-6 items-center rounded-full border border-info/40 bg-info/10 px-2.5 text-label-xs text-info uppercase">{{ c.fechaInicio ? fechaLarga(c.fechaInicio) : 'Fecha por confirmar' }}</span>
                    <p class="text-display-xs">{{ c.nombre }}</p>
                    <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="map-pin" [size]="14" class="text-accent-text" />{{ c.sede.ciudad }}@if (c.sede.provincia) { ({{ c.sede.provincia }}) }</p>
                    @if (c.evento.nivel) { <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="trophy" [size]="14" class="text-accent-text" />Nivel {{ c.evento.nivel }}</p> }
                    <a grButton variant="primary" href="/" class="mt-1">Más información</a>
                  </div>
                </div>
              }
            </aside>
          </div>
          <gr-related [items]="rel" />
          <gr-community />
        </div>
      }
    </gr-page>
  `,
})
export class BlogPostPage {
  readonly pslug = input('');
  protected readonly cms = inject(Cms);
  protected readonly comp = inject(Competition);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly p = signal<Pagina | null | undefined>(undefined);
  protected readonly html = signal<SafeHtml>('');
  protected readonly toc = signal<Heading[]>([]);
  protected readonly activo = signal('');
  protected readonly copiado = signal(false);
  protected et = etiqueta;
  protected fecha = fechaCorta;
  protected fechaLarga = fmtLongDate;
  protected readonly rel = [
    { titulo: 'Marcas mínimas', texto: 'Totales AEP-1 por categoría', ruta: '/marcas-minimas' },
    { titulo: 'AEP-1, AEP-2 y AEP-3', texto: 'Qué significa cada nivel', ruta: '/reglamento' },
    { titulo: 'Tu primera competición', texto: 'Preguntas frecuentes', ruta: '/preguntas-frecuentes' },
  ];
  private url = '';

  constructor() {
    const seo = inject(Seo);
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const vistos = new Set<string>();
      const io = new IntersectionObserver((es) => {
        for (const e of es) e.isIntersecting ? vistos.add(e.target.id) : vistos.delete(e.target.id);
        const primero = this.toc().find((h) => vistos.has(h.id));
        if (primero) this.activo.set(primero.id);
      }, { rootMargin: '-10% 0px -60% 0px' });
      const t = setInterval(() => {
        const hs = document.querySelectorAll('.prose-blog h2[id]');
        if (!hs.length) {
          if (this.p() !== undefined && this.toc().length < 2) clearInterval(t);
          return;
        }
        clearInterval(t);
        hs.forEach((h) => io.observe(h));
        this.activo.set(hs[0].id);
      }, 300);
      inject(DestroyRef).onDestroy(() => { clearInterval(t); io.disconnect(); });
    }
    void inject(PendingTasks).run(async () => {
      await Promise.resolve(); // inputs are set after construction
      const slug = this.pslug();
      const [p] = await Promise.all([this.cms.post(slug), this.comp.load()]);
      if (!p) {
        this.p.set(null);
        this.cms.notFound();
        seo.set({ title: 'Página no encontrada · GR Strength Cup', description: 'La página no existe.', path: '/blog/' + slug });
        return;
      }
      const r = renderMarkdown(p.cuerpo ?? '');
      // the sanitizer drops «id»: sanitize, then put back our slug ids ([a-z0-9-]) on the h2 in order (as LegalPage)
      let n = 0;
      const limpio = (this.sanitizer.sanitize(SecurityContext.HTML, r.html) ?? '').replace(/<h2>/g, () => `<h2 id="${r.headings[n++]?.id ?? 'seccion-' + n}">`);
      this.html.set(this.sanitizer.bypassSecurityTrustHtml(limpio));
      this.toc.set(r.headings);
      this.p.set(p);
      this.url = seo.origin + '/blog/' + slug;
      await applySeo(this.cms, seo, '/blog/' + slug, `${p.titulo} · GR Strength Cup`, p.resumen || p.titulo, p.portadaUrl || undefined);
    });
  }

  protected compartir(red: 'x' | 'facebook' | 'whatsapp'): string {
    const u = encodeURIComponent(this.enlace()), t = encodeURIComponent(this.p()?.titulo ?? '');
    if (red === 'x') return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    if (red === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    return `https://wa.me/?text=${t}%20${u}`;
  }
  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }
  private enlace(): string {
    return typeof location !== 'undefined' ? location.origin + location.pathname : this.url;
  }
}
