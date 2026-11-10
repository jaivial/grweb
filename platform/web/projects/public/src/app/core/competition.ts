import { HttpClient, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, Injectable, PLATFORM_ID, REQUEST, RESPONSE_INIT, TransferState, inject, makeStateKey, signal } from '@angular/core';
import { DOCUMENT, isPlatformServer } from '@angular/common';
import { NavigationStart, Router } from '@angular/router';
import { firstValueFrom, tap, throwError, timeout } from 'rxjs';

/** Base URL of the API when rendering on the server (in-cluster gateway); empty in the browser (same origin /api). */
export const API_BASE = new InjectionToken<string>('API_BASE', { factory: () => '' });

/** Server only: cluster secret that marks the SSR's GETs to the gateway (own, larger per-visitor rate-limit bucket). */
export const SSR_SECRET = new InjectionToken<string>('SSR_SECRET', { factory: () => '' });

/**
 * SSR: relative /api calls go straight to the in-cluster gateway, carrying the visitor's X-Forwarded-For (set by the
 * host nginx) so the gateway rate-limits per visitor and not per web pod (all visitors would share one quota).
 * Browser: the same calls become absolute same-origin URLs. The transfer cache runs after this interceptor and keys by
 * URL; the server maps the gateway origin to the public one (HTTP_TRANSFER_CACHE_ORIGIN_MAP), so both keys match and
 * hydration reuses the server's answers instead of asking again.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const base = inject(API_BASE);
  if (!base) return next(req.clone({ url: inject(DOCUMENT).location.origin + req.url }));
  const xff = inject(REQUEST, { optional: true })?.headers.get('x-forwarded-for');
  const ssr = req.method === 'GET' ? inject(SSR_SECRET) : '';
  const headers: Record<string, string> = { ...(xff ? { 'X-Forwarded-For': xff } : {}), ...(ssr ? { 'X-GrCup-SSR': ssr } : {}) };
  // A stuck upstream must not hold the render (and a web worker) for the gateway's 60 s: fail to 503 instead.
  return next(req.clone({ url: base + req.url, setHeaders: headers })).pipe(timeout(10_000));
};

const NO_ENCONTRADOS = makeStateKey<Record<string, number>>('gr-api-4xx');

/**
 * The transfer cache only keeps successful answers: the 404/422 the server got (a missing page) are passed to the
 * browser too, so hydration does not ask again (an extra quota hit and a network error in the console on every 404).
 */
export const noEncontradoInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || !req.url.startsWith('/api/')) return next(req);
  const ts = inject(TransferState);
  const key = req.urlWithParams;
  if (isPlatformServer(inject(PLATFORM_ID))) {
    return next(req).pipe(tap({ error: (e: unknown) => {
      if (e instanceof HttpErrorResponse && (e.status === 404 || e.status === 422)) ts.set(NO_ENCONTRADOS, { ...ts.get(NO_ENCONTRADOS, {}), [key]: e.status });
    } }));
  }
  const m = ts.get(NO_ENCONTRADOS, {});
  const status = m[key];
  if (!status) return next(req);
  // One-shot: a later visit to the same URL asks the API again.
  delete m[key];
  ts.set(NO_ENCONTRADOS, m);
  return throwError(() => new HttpErrorResponse({ status, url: req.url }));
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

/** Failure state shared by every public API service: SSR status/headers and the «too many visits» notice of the page. */
@Injectable({ providedIn: 'root' })
export class FalloApi {
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  /** Some API call of this page got the gateway's 429 (the visitor's network exceeded its quota). */
  readonly limitado = signal(false);

  constructor() {
    // In the browser this service outlives pages: a 429 must not mark the next page.
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) this.limitado.set(false);
    });
  }

  marcar(e: unknown): void {
    if (esLimitado(e)) this.limitado.set(true);
    marcarFallo(this.res, e);
  }
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
  private pending?: Promise<CompeticionPublica | null>;

  /** Loaded once per render (concurrent callers share the request); with SSR the response is transferred to the browser. */
  load(): Promise<CompeticionPublica | null> {
    if (this.data()) return Promise.resolve(this.data());
    return (this.pending ??= this.fetch());
  }

  private async fetch(): Promise<CompeticionPublica | null> {
    try {
      const c = await firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${COMPETITION_SLUG}`));
      this.data.set(c);
      return c;
    } catch {
      this.failed.set(true);
      return null;
    } finally {
      this.pending = undefined;
    }
  }
}
