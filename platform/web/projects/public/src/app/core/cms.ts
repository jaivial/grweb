import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, RESPONSE_INIT, inject, signal } from '@angular/core';
import { marked } from 'marked';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

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
}
export interface Foto {
  url: string;
  alt: string;
  focalX: number;
  focalY: number;
}
export interface Album {
  titulo: string;
  slug: string;
  fotos: Foto[];
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
  private seo?: Promise<SeoMap | null>;
  /** True when the API failed (not a 404): pages show a retry message and SSR answers 503, never a false 404. */
  readonly failed = signal(false);

  /** Marks a missing page as a real 404, unless the content could not be loaded at all. */
  notFound(): void {
    if (this.res && !this.failed()) this.res.status = 404;
  }

  home(): Promise<HomeCms | null> { return this.get<HomeCms>('/web'); }
  faq(): Promise<Faq[] | null> { return this.get<Faq[]>('/faq'); }
  patrocinadores(): Promise<Patrocinador[] | null> { return this.get<Patrocinador[]>('/patrocinadores'); }
  legal(tipo: string): Promise<Legal | null> { return this.get<Legal>(`/legal/${tipo}`); }
  pagina(slug: string): Promise<Pagina | null> { return this.get<Pagina>(`/paginas/${slug}`); }
  post(slug: string): Promise<Pagina | null> { return this.get<Pagina>(`/blog/${slug}`); }
  blog(): Promise<Pagina[] | null> { return this.get<Pagina[]>('/blog'); }
  galeria(): Promise<Album[] | null> { return this.get<Album[]>('/galeria'); }
  seoMap(): Promise<SeoMap | null> { return (this.seo ??= this.get<SeoMap>('/seo')); }

  async voluntario(body: unknown): Promise<void> {
    await firstValueFrom(this.http.post(`${base}/voluntarios`, body));
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      return await firstValueFrom(this.http.get<T>(base + path));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) return null;
      this.failed.set(true);
      if (this.res) {
        this.res.status = 503;
        this.res.headers = { ...(this.res.headers as Record<string, string> | undefined), 'Retry-After': '30', 'Cache-Control': 'no-store' };
      }
      return null;
    }
  }
}

export interface Heading {
  id: string;
  text: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Markdown → HTML with ids on h2 (for the table of contents). Angular sanitizes the result when bound. */
export function renderMarkdown(src: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const html = (marked.parse(src ?? '', { async: false }) as string).replace(/<h2>(.*?)<\/h2>/g, (_m, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '');
    const id = slugify(text) || `seccion-${headings.length + 1}`;
    headings.push({ id, text });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html, headings };
}
