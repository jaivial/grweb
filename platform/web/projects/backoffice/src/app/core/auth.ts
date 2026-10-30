import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, from, switchMap, throwError } from 'rxjs';
import type { Sesion, Usuario } from './api';

/**
 * Session of the backoffice. The access token lives only in memory; the refresh token is an httpOnly
 * SameSite=Strict cookie scoped to /api/auth, so a reload restores the session with POST /api/auth/refresh.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private refreshing: Promise<boolean> | null = null;
  private expiresAt = 0;

  readonly user = signal<Usuario | null>(null);
  readonly token = signal<string | null>(null);
  readonly ready = signal(false);
  readonly isLoggedIn = computed(() => this.user() !== null);

  /** Restores the session from the refresh cookie (once, at start-up). */
  async bootstrap(): Promise<void> {
    if (this.ready()) return;
    await this.refresh();
    this.ready.set(true);
  }

  async login(email: string, password: string, recordar: boolean): Promise<Usuario> {
    const s = await firstValueFrom(this.http.post<Sesion>('/api/auth/login', { email, password, recordar }));
    this.apply(s);
    return s.usuario;
  }

  async magicLink(email: string, siguiente: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/magic-link', { email, siguiente }));
  }

  /** Single-flight refresh: concurrent 401s share one request (the server also tolerates races). */
  refresh(): Promise<boolean> {
    this.refreshing ??= firstValueFrom(this.http.post<Sesion>('/api/auth/refresh', {}))
      .then((s) => {
        this.apply(s);
        return true;
      })
      .catch(() => {
        this.clear();
        return false;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Fresh token for long-lived requests (SSE): refreshes when it expires in < 60 s. */
  async freshToken(): Promise<string | null> {
    if (!this.token() || Date.now() > this.expiresAt - 60_000) await this.refresh();
    return this.token();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.clear();
      await this.router.navigateByUrl('/login');
    }
  }

  can(cid: string | undefined, perm: string): boolean {
    const u = this.user();
    if (!u || !cid) return false;
    return u.root || (u.competiciones.find((c) => c.competitionId === cid)?.permisos.includes(perm) ?? false);
  }

  rolEn(cid: string | undefined): string {
    const u = this.user();
    if (!u || !cid) return '';
    return u.competiciones.find((c) => c.competitionId === cid)?.rol.nombre ?? (u.root ? 'Root' : '');
  }

  private apply(s: Sesion): void {
    this.token.set(s.accessToken);
    this.user.set(s.usuario);
    this.expiresAt = new Date(s.expiresAt).getTime();
  }

  clear(): void {
    this.token.set(null);
    this.user.set(null);
    this.expiresAt = 0;
    // The offline ticket list of the door scanner holds names: it never outlives the session on this device.
    if (typeof localStorage !== 'undefined') {
      for (const k of Object.keys(localStorage)) if (k.startsWith('gr-checkin-lista-')) localStorage.removeItem(k);
    }
  }
}

/** Adds the bearer token and retries once after refreshing on 401 (except on the auth endpoints themselves). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const isAuthCall = req.url.startsWith('/api/auth/') && !req.url.startsWith('/api/auth/me') && !req.url.startsWith('/api/auth/device/');
  const withToken = (t: string | null) => (t && !isAuthCall ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req);
  const hadSession = auth.token() !== null;
  return next(withToken(auth.token())).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall) return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (!ok) {
            // Only an expired session goes to «Sesión caducada»; without any session the guards send to /login.
            if (hadSession) void router.navigate(['/sesion-caducada'], { queryParams: { siguiente: router.url } });
            return throwError(() => err);
          }
          return next(withToken(auth.token()));
        }),
      );
    }),
  );
};
