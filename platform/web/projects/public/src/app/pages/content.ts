import { RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, SecurityContext, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { GrSkeleton, fmtLongDate, CdnPipe } from '@grcup/ui';
import { Cms, type Heading, type Pagina } from '../core/cms';
import { renderMarkdown } from '../core/markdown';
import { Competition, type CompeticionPublica } from '../core/competition';
import { Seo, type SeoData } from '../core/seo';
import { NoEncontrada } from '../layout/no-encontrada';
import { Footer, Navbar } from '../layout/layout';
import { Page } from '../layout/page';
import { I18n } from '../core/i18n';

const T = {
  es: {
    legal: 'Legal', textoLegal: 'Texto legal', actualizado: (f: string, v: string) => 'Última actualización: ' + f + ' · versión ' + v,
    noPublicado: 'Este texto todavía no está publicado.', noCargado: 'No hemos podido cargar el texto. Vuelve a intentarlo en unos minutos.', contenido: 'Contenido',
    legalSeoDesc: (t: string, v: string) => `${t} de la GRS Cup 2 (versión ${v}).`,
    blog: 'Blog', competicion: 'Competición', noEncontrada: 'Página no encontrada', noEncontradaSeo: 'Página no encontrada · GRS Cup 2',
    noDisponible: 'Contenido no disponible ahora mismo.', noExiste: 'La página no existe.',
  },
  en: {
    legal: 'Legal', textoLegal: 'Legal text', actualizado: (f: string, v: string) => 'Last updated: ' + f + ' · version ' + v,
    noPublicado: 'This text has not been published yet.', noCargado: "We couldn't load the text. Please try again in a few minutes.", contenido: 'Contents',
    legalSeoDesc: (t: string, v: string) => `${t} of GRS Cup 2 (version ${v}).`,
    blog: 'Blog', competicion: 'Competition', noEncontrada: 'Page not found', noEncontradaSeo: 'Page not found · GRS Cup 2',
    noDisponible: 'Content not available right now.', noExiste: 'This page does not exist.',
  },
};
/** English titles of the legal texts (the route data «titulo» is Spanish). */
const LEGAL_EN: Record<string, string> = {
  privacidad: 'Privacy policy', terminos: 'Terms and conditions', cookies: 'Cookie policy', consentimiento: 'Data and image consent',
  whatsapp: 'WhatsApp notifications text', 'bases-sorteo': 'Giveaway rules',
};
/** «1 April 2026» in EN; Spanish keeps fmtLongDate. */
const fechaLarga = (iso: string | null | undefined, locale: string) =>
  !iso || locale === 'es-ES' ? fmtLongDate(iso) : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso));

/** Applies the SEO of a route: the CMS override when there is one, else the page's own defaults. */
export async function applySeo(cms: Cms, seo: Seo, path: string, title: string, description: string, image?: string, extra: Partial<SeoData> = {}): Promise<void> {
  const map = await cms.seoMap();
  const o = map?.paginas.find((p) => p.ruta === path);
  // the CMS overrides are written in Spanish: in EN the page's own (translated) texts win
  const es = seo.i18n.lang() === 'es';
  seo.set({ ...extra, title: (es && o?.title) || title, description: (es && o?.description) || description, path: extra.path ?? path, image: o?.imagenUrl || image });
}


/** Legal texts (Figma page 12): sticky table of contents, numbered sections, version stamp. */
@Component({
  selector: 'gr-legal-page',
  imports: [RouterLink, Page, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = doc();
    <gr-page [title]="d?.titulo ?? tituloTxt()" [cabecera]="false">
      <!-- Figma 12–15: 260 px contents card (sticky) and the 760 px document, 1100 px together; on mobile the
           header comes first, then the contents, then the text -->
      <div class="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-6 pt-7 md:pt-6 lg:grid-cols-[260px_minmax(0,760px)] lg:gap-x-12 lg:gap-y-9">
        <header class="flex flex-col items-start gap-3 lg:col-start-2">
          <p class="inline-flex h-[22px] items-center rounded-full bg-accent/12 px-2.5 text-label-xs text-accent-text uppercase">{{ t().legal }}</p>
          <h1 class="text-ui-h2 md:text-ui-h1">{{ d?.titulo ?? tituloTxt() }}</h1>
          @if (d) { <p class="text-mono-s text-text-muted">{{ t().actualizado(fechaMes(d.publicadoAt), d.version) }}</p> }
        </header>
        @if (d === undefined) {
          <gr-skeleton class="h-96 rounded-lg lg:col-start-2" />
        } @else if (d === null) {
          @if (!cms.failed()) { <p class="text-body-m text-text-tertiary lg:col-start-2">{{ t().noPublicado }}</p> }
          @else { <p class="text-body-m text-text-tertiary lg:col-start-2">{{ t().noCargado }}</p> }
        } @else {
          @if (toc().length) {
            <nav class="flex h-fit flex-col gap-1 rounded-lg border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-28 lg:col-start-1 lg:row-span-2 lg:row-start-1" [attr.aria-label]="t().contenido">
              <p class="pb-2 text-body-s font-semibold text-text-primary">{{ t().contenido }}</p>
              <ol class="flex flex-col text-body-s md:gap-1">
                @for (h of toc(); track h.id; let i = $index) {
                  <li><a routerLink="." [fragment]="h.id" (click)="activo.set(h.id)" class="relative flex min-h-11 items-center rounded-sm px-1 py-1 md:min-h-0 md:px-2.5 md:py-1 lg:py-2" [class]="actual() === h.id ? 'bg-accent/12 text-text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="actual() === h.id ? 'location' : null">{{ h.id === 'contacto' ? '' : i + 1 + '. ' }}{{ h.text }}</a></li>
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
  readonly titulo = input('');
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  /** Fallback title until the text loads: the route's Spanish one, or its English version. */
  protected readonly tituloTxt = computed(() => (this.i18n.lang() === 'en' ? LEGAL_EN[this.tipo()] : this.titulo()) || this.t().textoLegal);
  protected readonly cms = inject(Cms);
  protected readonly doc = signal<{ titulo: string; version: string; publicadoAt: string } | null | undefined>(undefined);
  protected readonly html = signal<SafeHtml>('');
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly toc = signal<Heading[]>([]);
  /** Section on screen (highlighted in the contents card). */
  protected readonly activo = signal('');
  /** Highlighted entry: the section on screen, else the first one (QA U18-R1-3: none was active on load at 1440). */
  protected readonly actual = computed(() => this.activo() || this.toc()[0]?.id);
  protected fecha = (iso: string | null | undefined) => fechaLarga(iso, this.i18n.locale());
  /** Figma 12–15 write the month capitalized: «1 de Abril de 2026». */
  protected fechaMes = (iso: string | null | undefined) => this.fecha(iso).replace(/ de (\p{Ll})/u, (_, m: string) => ' de ' + m.toUpperCase());
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
      const r = renderMarkdown(d.contenido, this.i18n.lang());
      // Angular's sanitizer drops «id» (anti-clobbering), which broke the contents links: sanitize first, then put
      // back our own slug ids (only [a-z0-9-]) on the h2 in order.
      let n = 0;
      const limpio = (this.sanitizer.sanitize(SecurityContext.HTML, r.html) ?? '').replace(/<h2>/g, () => `<h2 id="${r.headings[n++]?.id ?? 'seccion-' + n}">`);
      this.html.set(this.sanitizer.bypassSecurityTrustHtml(limpio));
      this.toc.set(r.headings);
      this.doc.set(d);
      seo.set({ title: `${d.titulo} · GRS Cup 2`, description: this.t().legalSeoDesc(d.titulo, d.version), path: location0(this.tipo()) });
    });
  }
}

const LEGAL_PATHS: Record<string, string> = { privacidad: '/privacidad', terminos: '/terminos', cookies: '/cookies', consentimiento: '/consentimiento-datos', 'bases-sorteo': '/politica-concurso' };
const location0 = (tipo: string) => LEGAL_PATHS[tipo] ?? '/';

/** Generic CMS page (reglamento, categorías de peso, marcas mínimas…) and blog post. */
@Component({
  selector: 'gr-content-page',
  imports: [CdnPipe, Page, GrSkeleton, NoEncontrada, Navbar, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Figma 17 «404»: the same page as an unknown route (no SEO header, glow or page padding) -->
    @if (p() === null && !cms.failed()) { <gr-navbar /><main><gr-no-encontrada /></main><gr-footer /> } @else {
    <gr-page [title]="p()?.titulo ?? (p() === null && !cms.failed() ? t().noEncontrada : '')" [eyebrow]="tipo() === 'blog' ? t().blog : t().competicion" [subtitle]="p()?.resumen ?? ''"
      [stamp]="tipo() === 'blog' && p()?.publicadoAt ? fecha(p()!.publicadoAt!) : ''" [cabecera]="p() !== null || cms.failed()">
      @if (p() === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (p() !== null) {
        @if (p()!.portadaUrl) { <img [src]="p()!.portadaUrl | cdn" alt="" class="mb-10 aspect-[16/7] w-full max-w-4xl rounded-lg object-cover" /> }
        <article class="prose-gr max-w-3xl text-body-m" [innerHTML]="html()"></article>
      }
    </gr-page>
    }
  `,
})
export class ContentPage {
  readonly slug = input('');
  readonly pslug = input('');
  readonly tipo = input<'pagina' | 'blog'>('pagina');
  protected readonly cms = inject(Cms);
  protected readonly p = signal<Pagina | null | undefined>(undefined);
  protected readonly html = signal('');
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected fecha = (iso: string | null | undefined) => fechaLarga(iso, this.i18n.locale());
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
        seo.set({ title: this.cms.failed() ? 'GRS Cup 2' : this.t().noEncontradaSeo, description: this.cms.failed() ? this.t().noDisponible : this.t().noExiste, path: '/' + slug, ...(this.cms.failed() ? {} : { robots: 'noindex' }) });
        return;
      }
      this.html.set(renderMarkdown(p.cuerpo ?? '', this.i18n.lang()).html);
      this.p.set(p);
      const path = (blog ? '/blog/' : '/') + slug;
      await applySeo(this.cms, seo, path, `${p.titulo} · GRS Cup 2`, p.resumen || p.titulo, p.portadaUrl || undefined);
    });
  }
}




