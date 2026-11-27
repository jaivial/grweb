import { HttpContext, HttpContextToken, HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { TimeoutError, retry, throwError, timeout, timer } from 'rxjs';

/** Marks a request that must not be cut at 12 s: uploads, exports and downloads are legitimately slow. */
export const GR_SIN_TIMEOUT = new HttpContextToken<boolean>(() => false);

/** Context of a slow request: `{ context: sinTimeout() }`. */
export const sinTimeout = (): HttpContext => new HttpContext().set(GR_SIN_TIMEOUT, true);

const MS = 12_000;

/**
 * «The socket is dead»: iOS Safari freezes the tab and a request queued on a connection that no longer exists never
 * errors, so the page waits for it forever (the router's data fetches included). A timeout or a 0/502/504.
 */
const seCayo = (e: unknown): boolean =>
  e instanceof TimeoutError || (e instanceof HttpErrorResponse && (e.status === 0 || e.status === 502 || e.status === 504));

/**
 * Browser-side cut of every API request (12 s) and one retry of the idempotent ones (GET/HEAD) when the socket died.
 * Register it last (closest to the network) so a long wait of another interceptor — the queue of `colaInterceptor` — is
 * not counted. Server side the gateway's own timeouts apply (`apiBaseInterceptor`).
 */
export const grHttpTimeoutInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next) => {
  if (req.context.get(GR_SIN_TIMEOUT) || !isPlatformBrowser(inject(PLATFORM_ID))) return next(req);
  const peticion = next(req).pipe(timeout(MS));
  // Only GET/HEAD: a POST that timed out may have been applied already.
  if (req.method !== 'GET' && req.method !== 'HEAD') return peticion;
  return peticion.pipe(retry({ count: 1, delay: (e: unknown) => (seCayo(e) ? timer(400) : throwError(() => e)) }));
};
