import type { HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Injectable, Pipe, type PipeTransform, computed, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

/**
 * Site language (ES default, EN under the /en prefix). One UI for both: every text comes from a per-feature
 * dictionary { es: {...}, en: {...} } (en is type-checked against es), read with I18n.dict():
 *
 *   const T = { es: { titulo: 'Entradas', plazas: (n: number) => n + ' plazas' }, en: { titulo: 'Tickets', plazas: (n: number) => n + ' seats' } };
 *   protected readonly t = inject(I18n).dict(T);      // template: {{ t().titulo }} · {{ t().plazas(3) }}
 *
 * In-app links go through the «loc» pipe so they keep the language: [routerLink]="'/entradas' | loc".
 */
export type Lang = 'es' | 'en';

const PREFIJO = /^\/en(\/|$|\?|#)/;
const langDe = (url: string): Lang => (PREFIJO.test(url) ? 'en' : 'es');

/** '/en/x' → '/x', '/en' → '/', '/en?a=1' → '/?a=1'. */
export function sinPrefijo(p: string): string {
  if (!PREFIJO.test(p)) return p;
  const resto = p.slice(3);
  return resto.startsWith('/') ? resto : '/' + resto;
}

let actual: Lang = 'es';
/** Language of the page being shown (for plain helpers called without a lang, e.g. API error texts). */
export const idiomaActual = (): Lang => actual;

@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly router = inject(Router);
  /** Current language: from the request URL on the server / first paint, then from each navigation. */
  readonly lang = signal<Lang>(langDe(inject(DOCUMENT).location?.pathname ?? '/'));
  /** Locale for Intl / toLocale*: 'es-ES' or 'en-GB'. */
  readonly locale = computed(() => (this.lang() === 'en' ? 'en-GB' : 'es-ES'));

  constructor() {
    actual = this.lang();
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.lang.set((actual = langDe(e.url)));
    });
  }

  /** Reactive dictionary of the current language. */
  dict<T>(d: { es: T; en: NoInfer<T> }) {
    return computed(() => d[this.lang()]);
  }

  /** Spanish path → path in the given language ('/entradas' → '/en/entradas' in EN). External URLs and '#x' stay. */
  path(p: string, lang: Lang = this.lang()): string {
    if (!p.startsWith('/') || p.startsWith('//')) return p;
    const base = sinPrefijo(p);
    if (lang === 'es') return base;
    if (base === '/') return '/en';
    return base.startsWith('/?') || base.startsWith('/#') ? '/en' + base.slice(1) : '/en' + base;
  }

  /** The current page in the other language (language switch). */
  otra(): string {
    return this.path(sinPrefijo(this.router.url), this.lang() === 'en' ? 'es' : 'en');
  }
}

/** [routerLink]="'/entradas' | loc" → '/en/entradas' in EN. Impure: it follows the language signal. */
@Pipe({ name: 'loc', pure: false })
export class LocPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(p: string | null | undefined): string {
    return p == null ? '' : this.i18n.path(p);
  }
}

/** Public APIs (outside the CMS) whose texts have English overrides: competition, schedule, tickets and raffle. */
/** Age division names come in Spanish from the data («Máster 1», «Júnior», «Subjúnior»…): English labels in EN. */
export function divisionEn(d: string | null | undefined, lang: Lang = actual): string {
  if (!d || lang !== 'en') return d ?? '';
  return d.replace(/M[áa]ster/gi, 'Master').replace(/Sub-?\s?j[úu]nior/gi, 'Sub-junior').replace(/J[úu]nior/gi, 'Junior')
    .replace(/Absoluta|Absoluto/gi, 'Open').replace(/Abierta/gi, 'Open');
}

/** {{ a.divisionNombre | division }}. Impure: it follows the language signal. */
@Pipe({ name: 'division', pure: false })
export class DivisionPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(d: string | null | undefined): string {
    return divisionEn(d, this.i18n.lang());
  }
}

const CON_EN = /^\/api\/competiciones\/[a-z0-9-]+(\/(horarios|entradas|rifa(\/items)?))?$/;

/** On /en pages, GETs to those APIs carry ?lang=en so the API overlays its English texts. */
export const langInterceptor: HttpInterceptorFn = (req, next) =>
  req.method === 'GET' && inject(I18n).lang() === 'en' && CON_EN.test(req.url.split('?')[0]) ? next(req.clone({ setParams: { lang: 'en' } })) : next(req);
