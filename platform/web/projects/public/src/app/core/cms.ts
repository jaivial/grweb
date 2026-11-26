import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, RESPONSE_INIT, TransferState, inject, makeStateKey, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { I18n } from './i18n';
import { COMPETITION_SLUG, FalloApi, esNoEncontrado } from './competition';

export type Seccion = Record<string, unknown>;

export interface HomeCms {
  version: string;
  secciones: Record<string, Seccion>;
  orden: string[];
  faqDestacadas: Faq[];
  patrocinadores: Patrocinador[];
}
export interface Faq {
  categoria: string;
  pregunta: string;
  respuesta: string;
}
export interface Patrocinador {
  nombre: string;
  nivel: string;
  logoUrl: string;
  url: string;
  descripcion?: string;
}
export interface Legal {
  tipo: string;
  version: string;
  titulo: string;
  contenido: string;
  publicadoAt: string;
}
export interface Pagina {
  slug: string;
  titulo: string;
  resumen: string;
  cuerpo?: string;
  portadaUrl: string;
  publicadoAt?: string;
  /** Blog: category, source line and reading time in minutes. */
  categoria?: string;
  fuente?: string;
  minutos?: number;
}
/** One page of /blog (12 posts): total for the category filter and the categories in use. */
export interface BlogPagina {
  items: Pagina[];
  total: number;
  pagina: number;
  porPagina: number;
  categorias: string[];
}
export interface Foto {
  url: string;
  alt: string;
  focalX: number;
  focalY: number;
  /** /galeria filter. */
  etiqueta?: 'plataforma' | 'calentamiento' | 'podio' | 'ambiente' | '';
  /** Pixel size, for media library photos (lays out the mosaic before the images load). */
  ancho?: number;
  alto?: number;
}
export interface Album {
  titulo: string;
  slug: string;
  fotos: Foto[];
}
export interface Landing {
  version: string;
  secciones: Record<string, Seccion>;
  orden: string[];
}

/** An access map of /mapa-de-accesos (uploaded in the backoffice; title, subtitle and description are optional). */
export interface MapaAcceso {
  imagenUrl: string;
  titulo: string;
  subtitulo: string;
  descripcion: string;
}

/**
 * A place of the guide (backoffice › Colaboradores Refugio): hotels, apartments and restaurants of /donde-dormir-y-comer
 * and the gyms of /como-llegar. Texts come in the page language (?lang=en); empty fields are not painted.
 */
export interface Sitio {
  /** Only hotels/restaurants: the section of /donde-dormir-y-comer. */
  tipo?: 'hotel' | 'apartamento' | 'restaurante';
  nombre: string;
  /** «Dirección, localidad» or «Tipo · localidad». */
  detalle: string;
  /** «≈ 4 min en coche · 1,8 km». */
  distancia?: string;
  /** «Desde 65 €/noche», «Pase de día ~10 €». */
  precio?: string;
  telefono?: string;
  email?: string;
  web?: string;
  imagen?: string;
  /** Brand logo (shown contained on a light panel). */
  logo?: string;
  /** Logo is light (white/grey): paint its panel dark (#141112) instead of white. */
  logoClaro?: boolean;
  /** Version of a dark logo for black panels (/como-llegar paints every logo on black). */
  logoOscuro?: string;
  /** Exact Google Maps link (overrides the search built by mapaDe). */
  maps?: string;
  descripcion?: string;
}

export interface SeoMap {
  paginas: { ruta: string; title: string; description: string; imagenUrl: string; indexable: boolean }[];
  redirecciones: { desde: string; hacia: string; codigo: number }[];
  rutas: string[];
}

const base = `/api/competiciones/${COMPETITION_SLUG}`;

/** Public content of the competition (cms service). Calls made during SSR are transferred to the browser. */
@Injectable({ providedIn: 'root' })
export class Cms {
  private readonly http = inject(HttpClient);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  private readonly fallo = inject(FalloApi);
  private readonly ts = inject(TransferState);
  private readonly doc = inject(DOCUMENT);
  private readonly i18n = inject(I18n);
  private readonly seo: Partial<Record<string, Promise<SeoMap | null>>> = {};
  /** True when the API failed (not a 4xx «not found»): pages show a retry message and SSR answers 503 (429 when rate limited), never a false 404. */
  readonly failed = signal(false);
  /** Some API call of the page (any service) got the gateway's rate limit (429) for the visitor's network. */
  readonly limitado = this.fallo.limitado;

  constructor() {
    // In the browser this service outlives pages: a transient error must not mark the next page as failed.
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        this.failed.set(false);
      }
    });
  }

  /** Marks a missing page as a real 404, unless the content could not be loaded at all. */
  notFound(): void {
    // Another API call of this render may already have answered 429/503: keep it.
    if (this.res && !this.failed() && (this.res.status ?? 200) < 400) this.res.status = 404;
  }

  home(): Promise<HomeCms | null> { return this.get<HomeCms>('/web'); }
  faq(): Promise<Faq[] | null> { return this.get<Faq[]>('/faq'); }
  patrocinadores(): Promise<Patrocinador[] | null> { return this.get<Patrocinador[]>('/patrocinadores'); }
  legal(tipo: string): Promise<Legal | null> { return this.get<Legal>(`/legal/${tipo}`); }
  /** Invalid slugs never reach the API, and a slug SSR already answered 404 is not fetched again on hydration (no console error, no rate limit spent). */
  async pagina(slug: string): Promise<Pagina | null> {
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    const k = makeStateKey<boolean>('pagina404:' + slug);
    if (!this.res && this.ts.hasKey(k)) { this.ts.remove(k); return null; }
    // 404 shell from server.ts (unknown route): only valid for the first load of that same path
    const m = this.res ? null : this.doc.querySelector('meta[name="gr-404"]');
    if (m) {
      m.remove();
      if (this.doc.location.pathname.replace(/\/+$/, '') === '/' + slug) return null;
    }
    const p = await this.get<Pagina>(`/paginas/${slug}`);
    if (this.res && !p && !this.failed()) this.ts.set(k, true);
    return p;
  }
  post(slug: string): Promise<Pagina | null> { return this.get<Pagina>(`/blog/${slug}`); }
  blog(page = 1, categoria = ''): Promise<BlogPagina | null> {
    return this.get<BlogPagina>(`/blog?page=${page}${categoria ? '&categoria=' + encodeURIComponent(categoria) : ''}`);
  }
  galeria(): Promise<Album[] | null> { return this.get<Album[]>('/galeria'); }
  seoMap(): Promise<SeoMap | null> { return (this.seo[this.i18n.lang()] ??= this.get<SeoMap>('/seo')); }

  landing(pagina: 'publico' | 'en'): Promise<Landing | null> { return this.get<Landing>(`/web/${pagina}`); }
  mapas(): Promise<MapaAcceso[] | null> { return this.get<MapaAcceso[]>('/mapas'); }
  hotelesRestaurantes(): Promise<Sitio[] | null> { return this.get<Sitio[]>('/hoteles-restaurantes'); }
  gimnasios(): Promise<Sitio[] | null> { return this.get<Sitio[]>('/gimnasios'); }

  async voluntario(body: unknown): Promise<void> {
    await firstValueFrom(this.http.post(`${base}/voluntarios`, body));
  }

  /** The signed-in fan's own volunteer request (empty estado = none); null without a session. */
  miVoluntario(): Promise<{ estado: string; puesto: string; turno: string } | null> {
    return this.get('/voluntarios/mi-solicitud');
  }

  private async get<T>(path: string): Promise<T | null> {
    // English content (?lang=en): the API overlays the English texts the CMS has; the rest stays in Spanish.
    if (this.i18n.lang() === 'en') path += (path.includes('?') ? '&' : '?') + 'lang=en';
    try {
      return await firstValueFrom(this.http.get<T>(base + path));
    } catch (e) {
      if (esNoEncontrado(e)) return null;
      this.failed.set(true);
      this.fallo.marcar(e);
      return null;
    }
  }
}

// renderMarkdown lives in ./markdown: «marked» (~48 KB) only loads with the pages and sections that render markdown
export type { Heading } from './markdown';
