import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

/** Public community account of the live page («cuenta de directo»: atleta or público). Service `fans`. */
export interface Fan {
  id: string;
  alias: string;
  tipo: 'atleta' | 'publico';
  atletaId?: string;
  insignia?: string;
}

export interface AccesoIn {
  email: string;
  tipo: 'atleta' | 'publico';
  alias: string;
  aceptaNormas: boolean;
}

/** Error code of the API (problem+json `code`), e.g. ATLETA_NO_ENCONTRADO, ALIAS_OCUPADO, ALIAS_NO_VALIDO. */
export function codigoError(e: unknown): string {
  if (e instanceof HttpErrorResponse) return (e.error && (e.error.code as string)) || `HTTP_${e.status}`;
  return 'DESCONOCIDO';
}
export function detalleError(e: unknown): string {
  if (e instanceof HttpErrorResponse && e.error?.detail) return e.error.detail as string;
  return 'No se ha podido completar. Inténtalo de nuevo en unos segundos.';
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

  private pendiente: Promise<Fan | null> | null = null;

  /** Loads the session once (browser only; SSR renders the anonymous state). */
  cargar(forzar = false): Promise<Fan | null> {
    if (!this.browser) return Promise.resolve(null);
    if (this.pendiente && !forzar) return this.pendiente;
    this.pendiente = firstValueFrom(this.http.get<Fan>(`${this.base}/yo`))
      .then((f) => (this.yo.set(f ?? null), f ?? null))
      .catch(() => (this.yo.set(null), null))
      .finally(() => this.cargada.set(true));
    return this.pendiente;
  }

  abrirAcceso(motivo: string | null = null): void {
    this.motivoAcceso.set(motivo);
    this.accesoAbierto.set(true);
  }

  cerrarAcceso(): void {
    this.accesoAbierto.set(false);
  }

  /** Asks for the magic link (always 202 when accepted). Throws HttpErrorResponse with `code` on errors. */
  async pedirAcceso(i: AccesoIn): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/acceso`, i));
  }

  /** Redeems the token of the email link (page /acceso?acceso=…); sets the cookie and the session. */
  async canjear(token: string): Promise<Fan> {
    const f = await firstValueFrom(this.http.post<Fan>(`${this.base}/canjear`, { token }));
    this.yo.set(f);
    this.cargada.set(true);
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
    }
  }

  /** Call when an API answers 401 SESION_FAN_REQUERIDA / SESION_FAN_REVOCADA: drops the local session. */
  sesionPerdida(): void {
    this.yo.set(null);
  }
}
