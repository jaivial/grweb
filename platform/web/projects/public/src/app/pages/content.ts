import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, SecurityContext, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton, fmtLongDate } from '@grcup/ui';
import { Cms, renderMarkdown, type Album, type Faq, type Foto, type Heading, type Pagina, type Patrocinador } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { Seo, type SeoData } from '../core/seo';
import { Page } from '../layout/page';

/** Applies the SEO of a route: the CMS override when there is one, else the page's own defaults. */
export async function applySeo(cms: Cms, seo: Seo, path: string, title: string, description: string, image?: string, extra: Partial<SeoData> = {}): Promise<void> {
  const map = await cms.seoMap();
  const o = map?.paginas.find((p) => p.ruta === path);
  seo.set({ ...extra, title: o?.title || title, description: o?.description || description, path, image: o?.imagenUrl || image });
}

/** /preguntas-frecuentes (Figma page 24): topics, search and accordions grouped by topic. */
@Component({
  selector: 'gr-faq-page',
  imports: [Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Preguntas" accent="frecuentes" eyebrow="Ayuda" subtitle="Todo lo que necesitas saber sobre la inscripción, la competición, el sorteo y cómo venir a Almussafes.">
      <div class="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav class="h-fit min-w-0 rounded-lg border border-line-subtle bg-bg-card/80 p-3 lg:sticky lg:top-28" aria-label="Temas">
          <p class="px-2 pb-2 text-mono-xs text-text-muted">Temas</p>
          <ul class="flex gap-1 overflow-x-auto lg:flex-col">
            @for (t of temas(); track t.nombre) {
              <li><button type="button" (click)="tema.set(t.nombre)" class="flex h-10 w-full items-center justify-between gap-4 rounded-sm px-3 text-label-s whitespace-nowrap"
                [class]="tema() === t.nombre ? 'bg-accent-deep/40 text-text-primary' : 'text-text-secondary hover:bg-bg-raised'">{{ t.nombre }}<span class="text-mono-xs text-text-tertiary">{{ t.n }}</span></button></li>
            }
          </ul>
        </nav>
        <div class="min-w-0">
          <label class="relative block">
            <span class="sr-only">Buscar una pregunta</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="Busca una pregunta…" [value]="q()" (input)="q.set($any($event.target).value)"
              class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
          @if (faq() === null) { <div class="mt-6 flex flex-col gap-3">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-14" /> }</div> }
          @for (g of grupos(); track g.nombre; let i = $index) {
            <h2 class="mt-8 mb-3 flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="text-accent-text">{{ (i + 1).toString().padStart(2, '0') }}</span><span class="h-px w-6 bg-line-strong"></span>{{ g.nombre }}</h2>
            <div class="flex flex-col gap-2">
              @for (f of g.items; track f.pregunta) {
                <details class="group rounded-md border border-line-subtle bg-bg-card open:border-line-strong">
                  <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-label-m">{{ f.pregunta }}
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-raised text-text-secondary group-open:bg-accent-deep group-open:text-accent-text"><gr-icon [name]="'plus'" [size]="14" class="transition-transform group-open:rotate-45" /></span>
                  </summary>
                  <div class="prose-gr px-5 pb-5 text-body-s" [innerHTML]="md(f.respuesta)"></div>
                </details>
              }
            </div>
          } @empty {
            @if (faq() !== null) { <p class="mt-10 text-center text-body-m text-text-tertiary">No hay preguntas que coincidan con «{{ q() }}».</p> }
          }
        </div>
      </div>
    </gr-page>
  `,
})
export class FaqPage {
  private readonly cms = inject(Cms);
  protected readonly faq = signal<Faq[] | null>(null);
  protected readonly q = signal('');
  protected readonly tema = signal('Todas');
  protected readonly temas = computed(() => {
    const all = this.faq() ?? [];
    const m = new Map<string, number>();
    for (const f of all) m.set(f.categoria, (m.get(f.categoria) ?? 0) + 1);
    return [{ nombre: 'Todas', n: all.length }, ...[...m].map(([nombre, n]) => ({ nombre, n }))];
  });
  protected readonly grupos = computed(() => {
    const q = this.q().trim().toLowerCase();
    const items = (this.faq() ?? []).filter((f) => (this.tema() === 'Todas' || f.categoria === this.tema()) && (!q || (f.pregunta + ' ' + f.respuesta).toLowerCase().includes(q)));
    const m = new Map<string, Faq[]>();
    for (const f of items) m.set(f.categoria, [...(m.get(f.categoria) ?? []), f]);
    return [...m].map(([nombre, items]) => ({ nombre, items }));
  });
  protected md = (s: string) => renderMarkdown(s).html;
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [list, map] = await Promise.all([this.cms.faq(), this.cms.seoMap()]);
      this.faq.set(list ?? []);
      const o = map?.paginas.find((p) => p.ruta === '/preguntas-frecuentes');
      seo.set({
        title: o?.title || 'Preguntas frecuentes · GR Strength Cup',
        description: o?.description || 'Entradas gratuitas, inscripción AEP, sorteo y cómo llegar al pabellón de Almussafes.',
        path: '/preguntas-frecuentes',
        // FAQPage structured data (rich results), from the published questions.
        jsonLd: list?.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map((f) => ({ '@type': 'Question', name: f.pregunta, acceptedAnswer: { '@type': 'Answer', text: f.respuesta } })) } : undefined,
      });
    });
  }
}

/** Legal texts (Figma page 12): sticky table of contents, numbered sections, version stamp. */
@Component({
  selector: 'gr-legal-page',
  imports: [Page, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = doc();
    <gr-page [title]="d?.titulo ?? titulo()" [cabecera]="false">
      <!-- Figma 12–15: 260 px contents card (sticky) and the 760 px document, 1100 px together; on mobile the
           header comes first, then the contents, then the text -->
      <div class="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-6 md:pt-6 lg:grid-cols-[260px_minmax(0,760px)] lg:gap-x-12 lg:gap-y-9">
        <header class="flex flex-col items-start gap-3 lg:col-start-2">
          <p class="inline-flex h-[22px] items-center rounded-full bg-accent/12 px-2.5 text-label-xs text-accent-text uppercase">Legal</p>
          <h1 class="text-ui-h2 md:text-ui-h1">{{ d?.titulo ?? titulo() }}</h1>
          @if (d) { <p class="text-mono-s text-text-muted">Última actualización: {{ fecha(d.publicadoAt) }} · versión {{ d.version }}</p> }
        </header>
        @if (d === undefined) {
          <gr-skeleton class="h-96 rounded-lg lg:col-start-2" />
        } @else if (d === null) {
          @if (!cms.failed()) { <p class="text-body-m text-text-tertiary lg:col-start-2">Este texto todavía no está publicado.</p> }
          @else { <p class="text-body-m text-text-tertiary lg:col-start-2">No hemos podido cargar el texto. Vuelve a intentarlo en unos minutos.</p> }
        } @else {
          @if (toc().length) {
            <nav class="flex h-fit flex-col gap-1 rounded-2xl border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-28 lg:col-start-1 lg:row-span-2 lg:row-start-1" aria-label="Contenido">
              <p class="pb-2 text-label-xs text-text-muted uppercase">Contenido</p>
              <ol class="flex flex-col gap-1 text-body-s">
                @for (h of toc(); track h.id; let i = $index) {
                  <li><a [href]="'#' + h.id" class="relative flex rounded-sm py-1 pr-2 pl-[18px] lg:py-2" [class]="activo() === h.id ? 'bg-accent/12 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="activo() === h.id ? 'location' : null">
                    <span class="absolute top-1/2 left-2 h-4 w-0.5 -translate-y-1/2 rounded-full" [class]="activo() === h.id ? 'bg-accent' : ''"></span>{{ i + 1 }}. {{ h.text }}</a></li>
                }
              </ol>
            </nav>
          }
          <article class="prose-gr prose-legal min-w-0 lg:col-start-2 [&_h2]:scroll-mt-28" [innerHTML]="html()"></article>
        }
      </div>
    </gr-page>
  `,
})
export class LegalPage {
  readonly tipo = input.required<string>();
  readonly titulo = input('Texto legal');
  protected readonly cms = inject(Cms);
  protected readonly doc = signal<{ titulo: string; version: string; publicadoAt: string } | null | undefined>(undefined);
  protected readonly html = signal<SafeHtml>('');
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly toc = signal<Heading[]>([]);
  /** Section on screen (highlighted in the contents card). */
  protected readonly activo = signal('');
  protected fecha = fmtLongDate;
  constructor() {
    const seo = inject(Seo);
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) this.activo.set(e.target.id); }, { rootMargin: '-15% 0px -70% 0px' });
      const t = setInterval(() => {
        const hs = document.querySelectorAll('.prose-legal h2[id]');
        if (!hs.length) return;
        clearInterval(t);
        hs.forEach((h) => io.observe(h));
        this.activo.set(hs[0].id);
      }, 300);
      inject(DestroyRef).onDestroy(() => { clearInterval(t); io.disconnect(); });
    }
    void inject(PendingTasks).run(async () => {
      await Promise.resolve(); // inputs are set after construction
      const d = await this.cms.legal(this.tipo());
      if (!d) {
        this.doc.set(null);
        this.cms.notFound();
        return;
      }
      const r = renderMarkdown(d.contenido);
      // Angular's sanitizer drops «id» (anti-clobbering), which broke the contents links: sanitize first, then put
      // back our own slug ids (only [a-z0-9-]) on the h2 in order.
      let n = 0;
      const limpio = (this.sanitizer.sanitize(SecurityContext.HTML, r.html) ?? '').replace(/<h2>/g, () => `<h2 id="${r.headings[n++]?.id ?? 'seccion-' + n}">`);
      this.html.set(this.sanitizer.bypassSecurityTrustHtml(limpio));
      this.toc.set(r.headings);
      this.doc.set(d);
      seo.set({ title: `${d.titulo} · GR Strength Cup`, description: `${d.titulo} de la GR Strength Cup (versión ${d.version}).`, path: location0(this.tipo()) });
    });
  }
}

const LEGAL_PATHS: Record<string, string> = { privacidad: '/privacidad', terminos: '/terminos', cookies: '/cookies', consentimiento: '/consentimiento-datos', 'bases-sorteo': '/politica-concurso' };
const location0 = (tipo: string) => LEGAL_PATHS[tipo] ?? '/';

/** Generic CMS page (reglamento, categorías de peso, marcas mínimas…) and blog post. */
@Component({
  selector: 'gr-content-page',
  imports: [Page, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="p()?.titulo ?? (p() === null && !cms.failed() ? 'Página no encontrada' : '')" [eyebrow]="tipo() === 'blog' ? 'Blog' : 'Competición'" [subtitle]="p()?.resumen ?? ''"
      [stamp]="tipo() === 'blog' && p()?.publicadoAt ? fecha(p()!.publicadoAt!) : ''">
      @if (p() === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (p() === null) { @if (!cms.failed()) { <p class="text-body-m text-text-tertiary">Esta página no existe o todavía no está publicada. <a href="/" class="text-accent-text underline">Volver al inicio</a></p> } }
      @else {
        @if (p()!.portadaUrl) { <img [src]="p()!.portadaUrl" alt="" class="mb-10 aspect-[16/7] w-full max-w-4xl rounded-lg object-cover" /> }
        <article class="prose-gr max-w-3xl text-body-m" [innerHTML]="html()"></article>
      }
    </gr-page>
  `,
})
export class ContentPage {
  readonly slug = input('');
  readonly pslug = input('');
  readonly tipo = input<'pagina' | 'blog'>('pagina');
  protected readonly cms = inject(Cms);
  protected readonly p = signal<Pagina | null | undefined>(undefined);
  protected readonly html = signal('');
  protected fecha = fmtLongDate;
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      await Promise.resolve();
      const slug = this.slug() || this.pslug();
      const blog = this.tipo() === 'blog';
      const p = blog ? await this.cms.post(slug) : await this.cms.pagina(slug);
      if (!p) {
        this.p.set(null);
        this.cms.notFound();
        seo.set({ title: 'Página no encontrada · GR Strength Cup', description: 'La página no existe.', path: '/' + slug });
        return;
      }
      this.html.set(renderMarkdown(p.cuerpo ?? '').html);
      this.p.set(p);
      const path = (blog ? '/blog/' : '/') + slug;
      await applySeo(this.cms, seo, path, `${p.titulo} · GR Strength Cup`, p.resumen || p.titulo, p.portadaUrl || undefined);
    });
  }
}

/** /blog (Figma page 34). */
@Component({
  selector: 'gr-blog-page',
  imports: [Page, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Blog" eyebrow="Noticias" subtitle="Novedades de la competición: reservas, horarios, atletas y resultados.">
      @if (posts() === null) { <div class="grid gap-6 md:grid-cols-3">@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-72 rounded-lg" /> }</div> }
      @else {
        <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          @for (p of posts(); track p.slug) {
            <a [href]="'/blog/' + p.slug" class="group flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card transition-colors hover:border-line-strong">
              @if (p.portadaUrl) { <img [src]="p.portadaUrl" alt="" class="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" /> }
              <div class="flex flex-1 flex-col gap-2 p-5">
                @if (p.publicadoAt) { <p class="text-mono-xs text-text-tertiary">{{ fecha(p.publicadoAt) }}</p> }
                <h2 class="text-ui-h4">{{ p.titulo }}</h2>
                <p class="text-body-s text-text-secondary">{{ p.resumen }}</p>
              </div>
            </a>
          } @empty { <p class="text-body-m text-text-tertiary">Todavía no hay noticias.</p> }
        </div>
      }
    </gr-page>
  `,
})
export class BlogPage {
  protected readonly posts = signal<Pagina[] | null>(null);
  protected fecha = fmtLongDate;
  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      this.posts.set((await cms.blog()) ?? []);
      await applySeo(cms, seo, '/blog', 'Blog · GR Strength Cup', 'Noticias de la GR Strength Cup.');
    });
  }
}

/** /galeria (Figma page 30): albums and a lightbox with keyboard navigation. */
@Component({
  selector: 'gr-galeria-page',
  imports: [Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'key($event)' },
  template: `
    <gr-page title="Galería" eyebrow="Fotos" subtitle="Las mejores imágenes de cada edición.">
      @if (albums() === null) { <gr-skeleton class="h-96 rounded-lg" /> }
      @for (a of albums() ?? []; track a.slug) {
        <h2 class="mt-2 mb-5 text-display-xs">{{ a.titulo }}</h2>
        <ul class="mb-12 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          @for (f of a.fotos; track f.url; let i = $index) {
            <li><button type="button" class="block w-full overflow-hidden rounded-md" (click)="open(a, i)" [attr.aria-label]="'Ampliar: ' + f.alt">
              <img [src]="f.url" [alt]="f.alt" class="aspect-[4/3] w-full object-cover transition-transform duration-500 hover:scale-[1.03]" [style.object-position]="f.focalX + '% ' + f.focalY + '%'" loading="lazy" />
            </button></li>
          }
        </ul>
      } @empty { @if (albums() !== null) { <p class="text-body-m text-text-tertiary">Pronto publicaremos fotos.</p> } }
    </gr-page>
    @if (viewer(); as v) {
      <div class="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true" [attr.aria-label]="v.foto.alt">
        <div class="flex h-14 items-center justify-between px-4 text-body-s text-text-secondary">
          <span>{{ v.i + 1 }} / {{ v.album.fotos.length }}</span>
          <button type="button" class="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cerrar" (click)="viewer.set(null)"><gr-icon name="x" [size]="22" /></button>
        </div>
        <div class="flex flex-1 items-center justify-center gap-2 px-2 pb-6">
          <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Anterior" (click)="step(-1)"><gr-icon name="chevron-left" [size]="24" /></button>
          <img [src]="v.foto.url" [alt]="v.foto.alt" class="max-h-full max-w-full rounded-sm object-contain" />
          <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Siguiente" (click)="step(1)"><gr-icon name="chevron-right" [size]="24" /></button>
        </div>
      </div>
    }
  `,
})
export class GaleriaPage {
  protected readonly albums = signal<Album[] | null>(null);
  protected readonly viewer = signal<{ album: Album; i: number; foto: Foto } | null>(null);
  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      this.albums.set((await cms.galeria()) ?? []);
      await applySeo(cms, seo, '/galeria', 'Galería · GR Strength Cup', 'Fotos de la GR Strength Cup.');
    });
  }
  protected open(album: Album, i: number): void { this.viewer.set({ album, i, foto: album.fotos[i] }); }
  protected step(d: number): void {
    const v = this.viewer();
    if (!v) return;
    const i = (v.i + d + v.album.fotos.length) % v.album.fotos.length;
    this.viewer.set({ album: v.album, i, foto: v.album.fotos[i] });
  }
  protected key(e: KeyboardEvent): void {
    if (!this.viewer()) return;
    if (e.key === 'Escape') this.viewer.set(null);
    if (e.key === 'ArrowRight') this.step(1);
    if (e.key === 'ArrowLeft') this.step(-1);
  }
}

/** /patrocinadores (Figma page 31). */
@Component({
  selector: 'gr-patrocinadores-page',
  imports: [Page],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Patrocinadores" eyebrow="Gracias" subtitle="Marcas y entidades que hacen posible la GR Strength Cup.">
      @for (g of niveles(); track g.nivel) {
        <h2 class="mt-2 mb-5 text-mono-xs text-text-tertiary">{{ g.titulo }}</h2>
        <ul class="mb-12 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          @for (p of g.items; track p.nombre) {
            <li>
              <a [attr.href]="p.url || null" target="_blank" rel="noopener sponsored" class="flex h-32 items-center justify-center rounded-lg border border-line-subtle bg-bg-card p-6 transition-colors hover:border-line-strong">
                @if (p.logoUrl) { <img [src]="p.logoUrl" [alt]="p.nombre" class="max-h-16 w-auto object-contain" loading="lazy" /> } @else { <span class="text-label-m">{{ p.nombre }}</span> }
              </a>
            </li>
          }
        </ul>
      }
    </gr-page>
  `,
})
export class PatrocinadoresPage {
  private readonly items = signal<Patrocinador[]>([]);
  protected readonly niveles = computed(() =>
    [['principal', 'Patrocinador principal'], ['oro', 'Oro'], ['plata', 'Plata'], ['colaborador', 'Colaboradores'], ['institucional', 'Instituciones']]
      .map(([nivel, titulo]) => ({ nivel, titulo, items: this.items().filter((p) => p.nivel === nivel) }))
      .filter((g) => g.items.length),
  );
  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      this.items.set((await cms.patrocinadores()) ?? []);
      await applySeo(cms, seo, '/patrocinadores', 'Patrocinadores · GR Strength Cup', 'Marcas y entidades que hacen posible la GR Strength Cup.');
    });
  }
}

/** /voluntarios (Figma page 33): form with a separate, unticked privacy consent. */
@Component({
  selector: 'gr-voluntarios-page',
  imports: [Page, FormsModule, GrField, GrInput, GrButton, GrAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Hazte" accent="voluntario" eyebrow="Equipo" subtitle="Ayúdanos en la mesa, la puerta, el calentamiento o la carga de discos. Te escribimos para organizar los turnos.">
      @if (sent()) {
        <gr-alert tone="success" title="¡Solicitud recibida!" class="max-w-xl">Gracias, {{ nombre }}. Te escribiremos a {{ email }} con los turnos disponibles.</gr-alert>
      } @else {
        <form class="grid max-w-xl gap-5" (ngSubmit)="send()" novalidate>
          <gr-field label="Nombre y apellidos" for="v-nombre"><input grInput id="v-nombre" name="nombre" autocomplete="name" required [(ngModel)]="nombre" /></gr-field>
          <gr-field label="Email" for="v-email"><input grInput id="v-email" name="email" type="email" autocomplete="email" required [(ngModel)]="email" /></gr-field>
          <gr-field label="Teléfono" for="v-tel" [optional]="true"><input grInput id="v-tel" name="telefono" type="tel" autocomplete="tel" [(ngModel)]="telefono" /></gr-field>
          <gr-field label="Disponibilidad" for="v-disp" hint="Sábado mañana, tarde, domingo…"><input grInput id="v-disp" name="disp" [(ngModel)]="disponibilidad" /></gr-field>
          <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="menor" [(ngModel)]="esMenor" class="mt-1 size-5 accent-[#C42B3E]" />Soy menor de edad (pediremos la autorización de mi madre, padre o tutor)</label>
          <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="priv" [(ngModel)]="acepta" class="mt-1 size-5 accent-[#C42B3E]" />He leído y acepto la <a href="/privacidad" target="_blank" class="text-accent-text underline">política de privacidad</a></label>
          @if (error()) { <gr-alert tone="danger" title="No se pudo enviar">{{ error() }}</gr-alert> }
          <button grButton variant="primary" size="l" type="submit" [loading]="busy()">Enviar solicitud</button>
        </form>
      }
    </gr-page>
  `,
})
export class VoluntariosPage {
  private readonly cms = inject(Cms);
  protected nombre = '';
  protected email = '';
  protected telefono = '';
  protected disponibilidad = '';
  protected esMenor = false;
  protected acepta = false;
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(() => applySeo(this.cms, seo, '/voluntarios', 'Voluntarios · GR Strength Cup', 'Apúntate como voluntario en la GR Strength Cup.'));
  }
  protected async send(): Promise<void> {
    this.error.set('');
    if (!this.nombre.trim() || !this.email.includes('@')) return this.error.set('Escribe tu nombre y un email válido.');
    if (!this.acepta) return this.error.set('Tienes que aceptar la política de privacidad para enviar la solicitud.');
    this.busy.set(true);
    try {
      await this.cms.voluntario({ nombre: this.nombre, email: this.email, telefono: this.telefono, disponibilidad: this.disponibilidad, esMenor: this.esMenor, aceptaPrivacidad: this.acepta });
      this.sent.set(true);
    } catch (e) {
      const d = (e as { error?: { detail?: string } }).error?.detail;
      this.error.set(d ?? 'Inténtalo de nuevo en unos minutos.');
    } finally {
      this.busy.set(false);
    }
  }
}


