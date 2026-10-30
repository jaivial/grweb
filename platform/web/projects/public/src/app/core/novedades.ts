import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

export interface BajaInfo { destino: string; finalidad: string; texto: string; baja: boolean }

/** News subscription with double opt-in and one-click unsubscribe (crm service). */
@Injectable({ providedIn: 'root' })
export class Novedades {
  private readonly http = inject(HttpClient);

  /** Always 202 for a valid request (the API never reveals whether the address was already subscribed). */
  async suscribir(email: string, acepta: boolean, origen: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/suscripciones', { competicion: COMPETITION_SLUG, email, acepta, origen }));
  }
  async confirmar(token: string): Promise<string> {
    return (await firstValueFrom(this.http.post<{ email: string }>('/api/suscripciones/confirmar', { token }))).email;
  }
  bajaInfo(token: string): Promise<BajaInfo> {
    return firstValueFrom(this.http.get<BajaInfo>(`/api/baja/${encodeURIComponent(token)}`));
  }
  baja(token: string): Promise<BajaInfo> {
    return firstValueFrom(this.http.post<BajaInfo>(`/api/baja/${encodeURIComponent(token)}`, {}));
  }
}

export function mensajeError(e: unknown, def = 'No hemos podido completarlo. Inténtalo en unos minutos.'): string {
  if (e instanceof HttpErrorResponse) {
    const d = (e.error as { detail?: string; code?: string } | null)?.detail;
    if (e.status === 429) return d ?? 'Demasiados intentos seguidos. Prueba más tarde.';
    if (e.status === 422 || e.status === 404) return d ?? def;
  }
  return def;
}
