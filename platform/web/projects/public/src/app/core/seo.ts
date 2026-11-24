import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, RESPONSE_INIT, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { cdn } from '@grcup/ui';
import { I18n, sinPrefijo } from './i18n';

/** Public origin of the web. The server provides PUBLIC_ORIGIN (app.config.server.ts); the browser uses its own. */
export const ORIGEN_PUBLICO = new InjectionToken<string>('ORIGEN_PUBLICO', {
  providedIn: 'root',
  factory: () => (typeof location !== 'undefined' ? location.origin : 'https://grcup-qa.menustudioai.com'),
});

export interface SeoData {
  title: string;
  description: string;
  path: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
  /** Page language (sets <html lang> and og:locale). Default «es». */
  lang?: 'es' | 'en';
  /** hreflang alternates, e.g. [{ hreflang: 'es', path: '/' }, { hreflang: 'en', path: '/en' }, { hreflang: 'x-default', path: '/' }]. */
  alternates?: { hreflang: string; path: string }[];
  /** «noindex» for private pages (athlete area) and 404s (no canonical either). */
  robots?: string;
}

/** hreflang pair of the home and its English landing. */
export const HOME_ALTERNATES = [{ hreflang: 'es', path: '/' }, { hreflang: 'en', path: '/en' }, { hreflang: 'x-default', path: '/' }];

/** BIZ-171: every title ends «<Página> · GRS Cup 2» (old brand suffixes are replaced); the home starts with «GRS Cup 2 · ». */
const MARCA = 'GRS Cup 2';
const SUFIJO_MARCA = /\s*[·|–-]\s*(?:blog de la\s+)?(?:GR Strength Cup|GRS? Cup(?: 2)?)(?:\s+blog)?\s*$/i;
export function tituloConMarca(t: string): string {
  if (t.startsWith(MARCA + ' · ')) return t;
  const base = t.replace(SUFIJO_MARCA, '').trim();
  return !base || /^(GR Strength Cup|GRS? Cup(?: 2)?)$/i.test(base) ? MARCA : base + ' · ' + MARCA;
}

/** Title, description, canonical, Open Graph / Twitter and JSON-LD per page (SEO plan of the design). */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  /** Public origin of the web (canonical, hreflang, JSON-LD): PUBLIC_ORIGIN on the server, location.origin in the browser. */
  readonly origin = inject(ORIGEN_PUBLICO);
  /** Share image (og/twitter): copy of the logo PNG on black, 1200×630; absolute CDN URL once published. */
  readonly defaultImage = cdn('/img/og/grscup-og.png');
  /** Ruta de la página que se está renderizando (la fija `set`). */
  readonly path = signal('');

  readonly i18n = inject(I18n);

  /** Pages pass their Spanish path: in EN the canonical is the /en one, <html lang> follows the URL and every page
   *  gets its es / en / x-default hreflang pair unless it gives its own. */
  set(d: SeoData): void {
    const lang = d.lang ?? this.i18n.lang();
    const es = sinPrefijo(d.path);
    d = { ...d, title: tituloConMarca(d.title), lang, path: this.i18n.path(es, lang), alternates: d.alternates ?? [{ hreflang: 'es', path: es }, { hreflang: 'en', path: this.i18n.path(es, 'en') }, { hreflang: 'x-default', path: es }] };
    const url = this.origin + d.path;
    this.path.set(d.path);
    const image = d.image ?? this.defaultImage;
    const imageAbs = image.startsWith('/') ? this.origin + image : image;
    this.title.setTitle(d.title);
    const tags: [string, string, string][] = [
      ['name', 'description', d.description],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'GRS Cup 2'],
      ['property', 'og:locale', d.lang === 'en' ? 'en_GB' : 'es_ES'],
      ['property', 'og:title', d.title],
      ['property', 'og:description', d.description],
      ['property', 'og:url', url],
      ['property', 'og:image', imageAbs],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', d.title],
      ['name', 'twitter:description', d.description],
      ['name', 'twitter:image', imageAbs],
    ];
    for (const [attr, key, content] of tags) this.meta.updateTag({ [attr]: key, content }, `${attr}="${key}"`);
    if (d.robots) this.meta.updateTag({ name: 'robots', content: d.robots }, 'name="robots"');
    else this.meta.removeTag('name="robots"');
    // A noindex page has no canonical (contradictory signals) and repeats the directive as a header for non-HTML crawlers.
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (d.robots?.includes('noindex')) {
      link?.remove();
      if (this.res) {
        // RESPONSE_INIT.headers is a Headers (already has Content-Type): spreading it would drop every header.
        const h = new Headers(this.res.headers);
        h.set('X-Robots-Tag', d.robots);
        this.res.headers = h;
      }
    } else {
      if (!link) {
        link = this.doc.createElement('link');
        link.rel = 'canonical';
        this.doc.head.appendChild(link);
      }
      link.href = url;
    }
    this.doc.documentElement.lang = d.lang ?? 'es';
    this.doc.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
    for (const a of d.alternates ?? []) {
      const l = this.doc.createElement('link');
      l.rel = 'alternate';
      l.setAttribute('hreflang', a.hreflang);
      l.href = this.origin + a.path;
      this.doc.head.appendChild(l);
    }
    this.doc.head.querySelectorAll('script[data-seo="jsonld"]').forEach((s) => s.remove());
    if (d.jsonLd) {
      const s = this.doc.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute('data-seo', 'jsonld');
      s.textContent = JSON.stringify(d.jsonLd);
      this.doc.head.appendChild(s);
    }
  }
}
