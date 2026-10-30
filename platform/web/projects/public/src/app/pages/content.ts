import { RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, SecurityContext, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { GrSkeleton, fmtLongDate } from '@grcup/ui';
import { Cms, renderMarkdown, type Heading, type Pagina } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { Seo, type SeoData } from '../core/seo';
import { NoEncontrada } from '../layout/no-encontrada';
import { Page } from '../layout/page';

/** Applies the SEO of a route: the CMS override when there is one, else the page's own defaults. */
export async function applySeo(cms: Cms, seo: Seo, path: string, title: string, description: string, image?: string, extra: Partial<SeoData> = {}): Promise<void> {
  const map = await cms.seoMap();
  const o = map?.paginas.find((p) => p.ruta === path);
  seo.set({ ...extra, title: o?.title || title, description: o?.description || description, path, image: o?.imagenUrl || image });
}


/** Legal texts (Figma page 12): sticky table of contents, numbered sections, version stamp. */
@Component({
  selector: 'gr-legal-page',
  imports: [RouterLink, Page, GrSkeleton],
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
                  <li><a routerLink="." [fragment]="h.id" (click)="activo.set(h.id)" class="relative flex rounded-sm py-1 pr-2 pl-[18px] lg:py-2" [class]="activo() === h.id ? 'bg-accent/12 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="activo() === h.id ? 'location' : null">
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
      // the first heading inside the band below the navbar wins (short sections can put two in it)
      const vistos = new Set<string>();
      const io = new IntersectionObserver((es) => {
        for (const e of es) e.isIntersecting ? vistos.add(e.target.id) : vistos.delete(e.target.id);
        const primero = this.toc().find((h) => vistos.has(h.id));
        if (primero) this.activo.set(primero.id);
      }, { rootMargin: '-10% 0px -60% 0px' });
      const t = setInterval(() => {
        const hs = document.querySelectorAll('.prose-legal h2[id]');
        if (!hs.length) {
          if (this.doc() !== undefined && !this.toc().length) clearInterval(t); // loaded without sections, not published or failed
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
  imports: [Page, GrSkeleton, NoEncontrada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="p()?.titulo ?? (p() === null && !cms.failed() ? 'Página no encontrada' : '')" [eyebrow]="tipo() === 'blog' ? 'Blog' : 'Competición'" [subtitle]="p()?.resumen ?? ''"
      [stamp]="tipo() === 'blog' && p()?.publicadoAt ? fecha(p()!.publicadoAt!) : ''" [cabecera]="p() !== null || cms.failed()">
      @if (p() === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (p() === null) { @if (!cms.failed()) { <gr-no-encontrada class="-mt-[92px] md:-mt-[148px]" /> } }
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




