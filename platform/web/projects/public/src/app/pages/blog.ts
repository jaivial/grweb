import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, PLATFORM_ID, PendingTasks, SecurityContext, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton, fmtLongDate } from '@grcup/ui';
import { map } from 'rxjs';
import { Cms, renderMarkdown, type BlogPagina, type Heading, type Pagina } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { NoEncontrada } from '../layout/no-encontrada';
import { Footer, Navbar } from '../layout/layout';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related } from './landings';

/** Category labels: singular on the cards, plural on the filter chips. */
const CATEGORIA: Record<string, [string, string]> = {
  noticias: ['Noticias', 'Noticias'], calendario: ['Calendario', 'Calendario'], guia: ['Guía', 'Guías'], normativa: ['Normativa', 'Normativa'],
  marcas: ['Marcas', 'Marcas'], cronica: ['Crónica', 'Crónicas'], entrenamiento: ['Entrenamiento', 'Entrenamiento'],
};
const etiqueta = (c?: string) => (c ? CATEGORIA[c]?.[0] ?? '' : '');
/** Cover of posts without one (cards and featured). */
const PORTADA = '/img/blog/trofeo-edicion.webp';
/** Spanish-only pages: hreflang es + x-default to themselves. */
const ES = (path: string) => [{ hreflang: 'es', path }, { hreflang: 'x-default', path }];
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
        } @else if (posts()!.length || cat()) {
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
                <a [routerLink]="'/blog/' + d.slug" class="group relative flex aspect-[350/420] flex-col justify-end overflow-hidden rounded-xl md:rounded-2xl border border-line-subtle md:aspect-[760/420]">
                  <img [src]="d.portadaUrl || portada" alt="" class="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
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
                      <a [routerLink]="'/blog/' + p.slug" class="group flex gap-4">
                        <span class="size-[88px] shrink-0 overflow-hidden rounded-md bg-bg-card"><img [src]="p.portadaUrl || portada" alt="" class="size-full object-cover" loading="lazy" /></span>
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
            @if (!posts()!.length) { <p class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-m text-text-secondary">No hay artículos en esta categoría.</p> }
            @if (visibles().length) {
              <!-- desktop: cards; mobile: rows with an 88 px thumbnail -->
              <ul class="grid gap-3 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
                @for (p of visibles(); track p.slug) {
                  <li [class.lg:hidden]="esReciente(p)">
                    <a [routerLink]="'/blog/' + p.slug" class="group flex h-full gap-4 rounded-lg border-line-subtle transition-colors md:flex-col md:gap-0 md:overflow-hidden md:border md:bg-bg-card md:hover:border-line-strong">
                      <span class="size-[88px] shrink-0 overflow-hidden rounded-md bg-bg-card md:aspect-[360/210] md:size-auto md:w-full md:rounded-none"><img [src]="p.portadaUrl || portada" alt="" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" /></span>
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
                  @for (n of numeros(); track $index) {
                    @if (n) {
                      <a [routerLink]="[]" [queryParams]="{ page: n > 1 ? n : null }" queryParamsHandling="merge" [attr.aria-current]="n === pagina() ? 'page' : null"
                        class="flex size-11 items-center justify-center rounded-md border text-label-m" [class]="n === pagina() ? 'border-accent bg-accent text-white' : 'border-line-strong text-text-secondary hover:text-text-primary'">{{ n }}</a>
                    } @else { <span class="flex size-11 items-center justify-center text-label-m text-text-tertiary" aria-hidden="true">…</span> }
                  }
                </nav>
              }
              @if (mostrados() < total()) {
                <button type="button" class="flex h-12 w-full items-center justify-center rounded-md border border-line-strong text-label-m md:hidden" [disabled]="cargando()" (click)="cargarMas()">Cargar más ({{ mostrados() }} de {{ total() }})</button>
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
  /** Page from the API (?page, ?categoria) plus the posts appended by «Cargar más» (mobile). */
  private readonly datos = signal<BlogPagina | null>(null);
  private readonly mas = signal<Pagina[]>([]);
  protected readonly cargando = signal(false);
  protected readonly portada = PORTADA;
  private readonly router = inject(Router);
  private readonly cms = inject(Cms);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => ({ page: Math.max(1, Number(q.get('page')) || 1), cat: CATEGORIA[q.get('categoria') ?? ''] ? q.get('categoria')! : '' }))));
  protected et = etiqueta;
  protected plural = (c: string) => CATEGORIA[c]?.[1] ?? c;
  protected readonly posts = computed(() => (this.datos() ? [...this.datos()!.items, ...this.mas()] : null));
  protected readonly cat = computed(() => this.query()?.cat ?? '');
  protected readonly pagina = computed(() => this.datos()?.pagina ?? 1);
  protected readonly total = computed(() => this.datos()?.total ?? 0);
  protected readonly chips = computed(() => Object.keys(CATEGORIA).filter((c) => this.datos()?.categorias.includes(c)));
  protected readonly destacado = computed(() => (this.pagina() === 1 ? this.posts()?.[0] ?? null : null));
  /** Beside the featured post on desktop; in the list on smaller screens. */
  protected readonly recientes = computed(() => (this.pagina() === 1 ? (this.posts() ?? []).slice(1, 4) : []));
  protected readonly visibles = computed(() => (this.posts() ?? []).slice(this.pagina() === 1 ? 1 : 0));
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / (this.datos()?.porPagina || 12))));
  protected readonly mostrados = computed(() => (this.pagina() - 1) * (this.datos()?.porPagina ?? 12) + (this.posts()?.length ?? 0));
  /** Figma 34: 1 · 2 · 3 … 8 (0 = ellipsis). */
  protected readonly numeros = computed(() => {
    const n = this.paginas(), p = this.pagina();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const set = [...new Set([1, 2, 3, p - 1, p, p + 1, n])].filter((x) => x >= 1 && x <= n).sort((x, y) => x - y);
    return set.flatMap((x, i) => (i && x - set[i - 1] > 1 ? [0, x] : [x]));
  });

  constructor() {
    const seo = inject(Seo);
    const tasks = inject(PendingTasks);
    effect(() => {
      const q = this.query();
      if (!q) return;
      void tasks.run(async () => {
        const d = await this.cms.blog(q.page, q.cat);
        this.mas.set([]);
        this.datos.set(d ?? { items: [], total: 0, pagina: q.page, porPagina: 12, categorias: [] });
        await applySeo(this.cms, seo, '/blog', 'Guías de powerlifting · Blog de la GR Strength Cup', 'Calendario, normativa y consejos para competir en powerlifting en la Comunitat Valenciana.', undefined, {
          alternates: ES('/blog'),
          jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog de la GR Strength Cup', url: seo.origin + '/blog', inLanguage: 'es',
            blogPost: (d?.items ?? []).map((p) => ({ '@type': 'BlogPosting', headline: p.titulo, url: seo.origin + '/blog/' + p.slug, ...(p.publicadoAt ? { datePublished: p.publicadoAt } : {}) })) },
        });
      });
    });
  }
  protected async cargarMas(): Promise<void> {
    const d = this.datos();
    if (!d || this.cargando()) return;
    this.cargando.set(true);
    const sig = await this.cms.blog(d.pagina + 1 + Math.ceil(this.mas().length / d.porPagina), this.cat());
    this.mas.update((m) => [...m, ...(sig?.items ?? [])]);
    this.cargando.set(false);
  }
  protected esReciente(p: Pagina): boolean { return this.pagina() === 1 && this.recientes().includes(p); }
  protected chip(activo: boolean): string {
    return 'flex h-11 items-center gap-2 rounded-full border px-4 text-label-s transition-colors ' +
      (activo ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary');
  }
  protected elegir(c: string): void {
    void this.router.navigate([], { queryParams: { categoria: c || null, page: null } });
  }
}

/**
 * Blog post (Figma page 34b): category eyebrow, title, summary and source; author line, cover, the article (with the
 * «caja» boxes of renderMarkdown), share buttons; contents and the event card in a sticky column; related links.
 */
@Component({
  selector: 'gr-blog-post-page',
  imports: [Page, GrIcon, GrButton, GrSkeleton, NoEncontrada, Navbar, Footer, RouterLink, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = p();
    <!-- Figma 17 «404»: the same page as an unknown route (no SEO header, glow or page padding) -->
    @if (a === null && !cms.failed()) { <gr-navbar /><main><gr-no-encontrada /></main><gr-footer /> } @else {
    <gr-page [title]="a ? titulo(a.titulo)[0] : (a === null && !cms.failed() ? 'Página no encontrada' : '')" [accent]="a ? titulo(a.titulo)[1] : ''" [eyebrow]="a ? (et(a.categoria) || 'Blog') : ''" section="Blog" [crumb]="a ? miga(a) : ''"
      [subtitle]="a?.resumen ?? ''" [stamp]="a?.fuente ? 'Fuente: ' + a.fuente : ''" [cabecera]="a !== null || cms.failed()">
      @if (a === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (a !== null) {
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
                <p class="text-label-s">Comparte este {{ a.categoria === 'calendario' ? 'calendario' : 'artículo' }}</p>
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
                      <li><a routerLink="." [fragment]="h.id" (click)="activo.set(h.id)" class="relative flex rounded-sm py-2 px-2.5" [class]="activo() === h.id ? 'bg-accent/12 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="activo() === h.id ? 'location' : null">{{ i + 1 }}. {{ h.text }}</a></li>
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
                    <a grButton variant="primary" routerLink="/" class="mt-1">Más información</a>
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
    }
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
    { titulo: 'Tu primera competición', texto: 'Guía paso a paso', ruta: '/preguntas-frecuentes' },
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
        seo.set({ title: this.cms.failed() ? 'GR Strength Cup' : 'Página no encontrada · GR Strength Cup', description: this.cms.failed() ? 'Contenido no disponible ahora mismo.' : 'La página no existe.', path: '/blog/' + slug, ...(this.cms.failed() ? {} : { robots: 'noindex' }) });
        return;
      }
      const r = renderMarkdown(p.cuerpo ?? '');
      // the sanitizer drops «id»: sanitize, then put back our slug ids ([a-z0-9-]) on the h2 in order (as LegalPage)
      let n = 0;
      const limpio = (this.sanitizer.sanitize(SecurityContext.HTML, r.html) ?? '').replace(/<h2( class="ancla")?>/g, (_m, c?: string) => `<h2${c ?? ''} id="${r.headings[n++]?.id ?? 'seccion-' + n}">`);
      this.html.set(this.sanitizer.bypassSecurityTrustHtml(limpio));
      this.toc.set(r.headings);
      this.p.set(p);
      this.url = seo.origin + '/blog/' + slug;
      const abs = (u: string) => (u.startsWith('/') ? seo.origin + u : u);
      const org = { '@type': 'Organization', name: this.comp.data()?.evento.organizador || 'GR Strength', url: seo.origin };
      await applySeo(this.cms, seo, '/blog/' + slug, `${p.titulo} · GR Strength Cup`, p.resumen || p.titulo, p.portadaUrl || undefined, {
        alternates: ES('/blog/' + slug),
        jsonLd: {
          '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.titulo, description: p.resumen || p.titulo, inLanguage: 'es',
          mainEntityOfPage: seo.origin + '/blog/' + slug, ...(p.portadaUrl ? { image: abs(p.portadaUrl) } : {}),
          ...(p.publicadoAt ? { datePublished: p.publicadoAt } : {}), ...(p.categoria ? { articleSection: etiqueta(p.categoria) } : {}),
          author: org, publisher: org,
        },
      });
    });
  }

  /** Figma 34: the place («en la Comunitat Valenciana») is the red second line of the title. */
  protected titulo(t: string): [string, string] {
    const m = / en (la|el|los|las) /.exec(t);
    return m ? [t.slice(0, m.index), t.slice(m.index + 1)] : [t, ''];
  }
  /** Breadcrumb: the category, with the year for calendars («Calendario 2026»). */
  protected miga(a: Pagina): string {
    const e = etiqueta(a.categoria) || 'Artículo';
    const y = a.categoria === 'calendario' ? /\b20\d\d\b/.exec(a.titulo)?.[0] : '';
    return y ? e + ' ' + y : e;
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
