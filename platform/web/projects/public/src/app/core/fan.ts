import { errorEn } from './errores';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationStart, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';
import { idiomaActual, type Lang } from './i18n';

/** Public community account of the live page («cuenta de directo»: atleta or público). Service `fans`. */
export interface Fan {
  id: string;
  alias: string;
  tipo: 'atleta' | 'publico';
  atletaId?: string;
  insignia?: string;
  email?: string;
  telefono?: string;
}

/** Destino interno al que vuelve el fan tras canjear el enlace mágico (solo rutas /fantasy/…; el backend ignora el resto). */
export const DESTINO_INTERNO = /^(\/en)?\/fantasy(\/[A-Za-z0-9_-]+)*$/;

export interface AccesoIn {
  email: string;
  tipo: 'atleta' | 'publico';
  /** Empty for a link to create or change the password of an existing account. */
  alias: string;
  aceptaNormas: boolean;
  /** Web path to return to after the email link (validated by the API). */
  next?: string;
  /** Optional mobile for the WhatsApp notices. */
  telefono?: string;
}

/** Answer of /fans/disponible: only the fields that were sent. */
export interface CampoLibre { libre: boolean; codigo?: string; mensaje?: string }
export interface Disponible { alias?: CampoLibre; email?: CampoLibre }

/** Message of a taken / invalid field of /disponible (English from the code, Spanish from the API). */
export function mensajeCampo(c: CampoLibre, lang: Lang = idiomaActual()): string {
  return (lang === 'en' && c.codigo && errorEn(c.codigo)) || c.mensaje || '';
}

/** Error code of the API (problem+json `code`), e.g. ATLETA_NO_ENCONTRADO, ALIAS_OCUPADO, ALIAS_NO_VALIDO. */
export function codigoError(e: unknown): string {
  if (e instanceof HttpErrorResponse) return (e.error && (e.error.code as string)) || `HTTP_${e.status}`;
  return 'DESCONOCIDO';
}
export function detalleError(e: unknown, lang: Lang = idiomaActual()): string {
  if (e instanceof HttpErrorResponse && lang === 'en' && errorEn(e.error?.code)) return errorEn(e.error.code)!;
  if (e instanceof HttpErrorResponse && lang !== 'en' && e.error?.detail) return e.error.detail as string;
  return lang === 'en' ? 'Could not complete. Please try again in a few seconds.' : 'No se ha podido completar. Inténtalo de nuevo en unos segundos.';
}

/**
 * Session of the fan, shared by the chat (/en-directo), the donations, /porra and /fantasy.
 * The session is the httpOnly cookie `grcup_fan` (Path=/api): the browser sends it on every same-origin /api call,
 * so no token is handled here. `yo()` is null when there is no session.
 *
 * The login modal (`AccesoModal`) is rendered once in the layout and opens when `accesoAbierto()` is true:
 * any page calls `fan.abrirAcceso()` (optionally with the action to resume after login).
 */
@Injectable({ providedIn: 'root' })
export class FanSession {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly base = `/api/competiciones/${COMPETITION_SLUG}/fans`;

  readonly yo = signal<Fan | null>(null);
  readonly cargada = signal(false);
  readonly conSesion = computed(() => this.yo() !== null);
  readonly accesoAbierto = signal(false);
  /** What the user was trying to do when the modal opened (e.g. 'chat', 'donar', 'porra', 'fantasy'). */
  readonly motivoAcceso = signal<string | null>(null);
  /** Path the email link brings the person back to (null: the live page). */
  readonly volverA = signal<string | null>(null);
  /** Email already typed on the page that opens the modal (prefills it). */
  readonly emailAcceso = signal('');
  /** Fantasy destination of the link (an invitation to a room): the modal tells it travels to any device. */
  readonly destino = computed(() => { const v = this.volverA(); return v && DESTINO_INTERNO.test(v) ? v : null; });

  private pendiente: Promise<Fan | null> | null = null;

  constructor() {
    // The modal is global (one instance in the layout): any navigation, back/forward included, closes it.
    inject(Router).events.subscribe((e) => e instanceof NavigationStart && this.accesoAbierto() && this.cerrarAcceso());
  }

  /** Loads the session once (browser only; SSR renders the anonymous state). */
  cargar(forzar = false): Promise<Fan | null> {
    if (!this.browser) return Promise.resolve(null);
    if (this.pendiente && !forzar) return this.pendiente;
    this.pendiente = firstValueFrom(this.http.get<Fan>(`${this.base}/yo`))
      .then((f) => (this.yo.set(f ?? null), f ?? null))
      // A failed ask is not an answer: it must not be shared (a frozen tab left the old one hanging forever).
      .catch(() => (this.yo.set(null), this.pendiente = null, null))
      .finally(() => this.cargada.set(true));
    return this.pendiente;
  }

  /** A frozen tab (iOS Safari) leaves the session request hanging: drop it so the next one asks again. */
  reanudar(): void {
    this.pendiente = null;
  }

  abrirAcceso(motivo: string | null = null, volverA: string | null = null, email = ''): void {
    this.motivoAcceso.set(motivo);
    this.emailAcceso.set(email);
    this.volverA.set(volverA);
    this.accesoAbierto.set(true);
  }

  cerrarAcceso(): void {
    this.accesoAbierto.set(false);
  }

  /** Asks for the magic link (always 202 when accepted). Throws HttpErrorResponse with `code` on errors. */
  async pedirAcceso(i: AccesoIn): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/acceso`, { ...i, next: i.next ?? this.volverA() ?? undefined }));
  }

  /** Before creating an account: is the alias valid and free, and has the email no account yet? (per field, only the ones sent) */
  disponible(b: { alias?: string; email?: string; tipo?: 'atleta' | 'publico' }): Promise<Disponible> {
    return firstValueFrom(this.http.post<Disponible>(`${this.base}/disponible`, b));
  }

  /** Signs in with email and password; sets the cookie and the session. Throws HttpErrorResponse (CREDENCIALES_INVALIDAS, 429). */
  async entrar(email: string, password: string): Promise<Fan> {
    const f = await firstValueFrom(this.http.post<Fan>(`${this.base}/entrar`, { email, password }));
    this.yo.set(f);
    this.cargada.set(true);
    this.pendiente = Promise.resolve(f);
    return f;
  }

  /** Redeems the token of the email link (page /acceso?acceso=…); sets the cookie and the session. */
  async canjear(token: string): Promise<Fan & { next?: string; requiereContrasena?: boolean }> {
    const f = await firstValueFrom(this.http.post<Fan & { next?: string; requiereContrasena?: boolean }>(`${this.base}/canjear`, { token }));
    this.yo.set(f);
    this.cargada.set(true);
    this.pendiente = Promise.resolve(f);
    return f;
  }

  /** Sets the password after redeeming a link (account without one, or a reset). Re-issues the session. */
  async fijarContrasena(password: string): Promise<Fan> {
    const f = await firstValueFrom(this.http.put<Fan>(`${this.base}/yo/contrasena`, { password }));
    this.yo.set(f);
    return f;
  }

  async cambiarAlias(alias: string): Promise<Fan> {
    const f = await firstValueFrom(this.http.patch<Fan>(`${this.base}/yo`, { alias }));
    this.yo.set(f);
    return f;
  }

  async salir(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.base}/salir`, {}));
    } finally {
      this.yo.set(null);
      this.pendiente = null;
    }
  }

  /** Call when an API answers 401 SESION_FAN_REQUERIDA / SESION_FAN_REVOCADA: drops the local session. */
  sesionPerdida(): void {
    this.yo.set(null);
    this.pendiente = null;
  }
}
