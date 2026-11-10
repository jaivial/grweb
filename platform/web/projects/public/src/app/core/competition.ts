import { HttpClient, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, Injectable, REQUEST, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Base URL of the API when rendering on the server (in-cluster gateway); empty in the browser (same origin /api). */
export const API_BASE = new InjectionToken<string>('API_BASE', { factory: () => '' });

/**
 * SSR: relative /api calls go straight to the in-cluster gateway, carrying the visitor's X-Forwarded-For (set by the
 * host nginx) so the gateway rate-limits per visitor and not per web pod (all visitors would share one quota).
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE);
  if (!base || !req.url.startsWith('/api/')) return next(req);
  const xff = inject(REQUEST, { optional: true })?.headers.get('x-forwarded-for');
  return next(req.clone({ url: base + req.url, ...(xff ? { setHeaders: { 'X-Forwarded-For': xff } } : {}) }));
};

/** A 4xx answer other than 429 means «this content does not exist» (404, or 422 for a slug the API rejects). */
export const esNoEncontrado = (e: unknown): boolean => e instanceof HttpErrorResponse && e.status >= 400 && e.status < 500 && e.status !== 429;

/** A 429 from the gateway: the visitor's network exceeded its quota. */
export const esLimitado = (e: unknown): boolean => e instanceof HttpErrorResponse && e.status === 429;

/** SSR status of a render whose API call failed: 429 with the gateway's Retry-After when rate limited, else 503 (a 429 wins). */
export function marcarFallo(res: ResponseInit | null, e: unknown): void {
  const limitado = esLimitado(e);
  if (!res || (res.status === 429 && !limitado)) return;
  res.status = limitado ? 429 : 503;
  const retry = limitado ? ((e as HttpErrorResponse).headers.get('Retry-After') ?? '60') : '30';
  // RESPONSE_INIT.headers is a Headers (already has Content-Type): spreading it would drop every header.
  const h = new Headers(res.headers);
  h.set('Retry-After', retry);
  h.set('Cache-Control', 'no-store');
  res.headers = h;
}

export interface CompeticionPublica {
  slug: string;
  nombre: string;
  nombreCorto: string;
  edicion: number;
  estado: string;
  fechaInicio?: string;
  fechaFin?: string;
  zonaHoraria: string;
  sede: { nombre: string; direccion: string; cp: string; ciudad: string; provincia: string; mapsUrl: string; lat?: number; lng?: number };
  evento: { descripcion: string; nivel: string; organizador: string; emailContacto: string; puertas: string; aforoPabellon: number; instagram: string };
  modulos: Record<string, boolean>;
  inscripcion: { modo: string; url: string; estado: string; plazas?: number };
  comoLlegar: { tipo: string; titulo: string; detalle: string; nota?: string; estado: string }[];
}

/** Slug of the competition this site serves (one public site per competition). */
export const COMPETITION_SLUG = 'grcup';

@Injectable({ providedIn: 'root' })
export class Competition {
  private readonly http = inject(HttpClient);
  readonly data = signal<CompeticionPublica | null>(null);
  readonly failed = signal(false);

  /** Loaded once per render; with SSR the response is transferred to the browser (no second request). */
  async load(): Promise<CompeticionPublica | null> {
    if (this.data()) return this.data();
    try {
      const c = await firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${COMPETITION_SLUG}`));
      this.data.set(c);
      return c;
    } catch {
      this.failed.set(true);
      return null;
    }
  }
}
