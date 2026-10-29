import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

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
  /** «noindex» for private pages (athlete area). */
  robots?: string;
}

/** hreflang pair of the home and its English landing. */
export const HOME_ALTERNATES = [{ hreflang: 'es', path: '/' }, { hreflang: 'en', path: '/en' }, { hreflang: 'x-default', path: '/' }];

/** Title, description, canonical, Open Graph / Twitter and JSON-LD per page (SEO plan of the design). */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  readonly origin = 'https://grcup-qa.menustudioai.com';
  readonly defaultImage = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';

  set(d: SeoData): void {
    const url = this.origin + d.path;
    const image = d.image ?? this.defaultImage;
    this.title.setTitle(d.title);
    const tags: [string, string, string][] = [
      ['name', 'description', d.description],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'GR Strength Cup'],
      ['property', 'og:locale', d.lang === 'en' ? 'en_GB' : 'es_ES'],
      ['property', 'og:title', d.title],
      ['property', 'og:description', d.description],
      ['property', 'og:url', url],
      ['property', 'og:image', image],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', d.title],
      ['name', 'twitter:description', d.description],
      ['name', 'twitter:image', image],
    ];
    for (const [attr, key, content] of tags) this.meta.updateTag({ [attr]: key, content }, `${attr}="${key}"`);
    if (d.robots) this.meta.updateTag({ name: 'robots', content: d.robots }, 'name="robots"');
    else this.meta.removeTag('name="robots"');
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.rel = 'canonical';
      this.doc.head.appendChild(link);
    }
    link.href = url;
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
