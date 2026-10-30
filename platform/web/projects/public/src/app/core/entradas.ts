import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, RESPONSE_INIT, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

export type EstadoSesion = 'disponible' | 'ultimas' | 'agotada' | 'cerrada' | 'proximamente';
export interface SesionPub {
  id: string; nombre: string; detalle: string; inicio: string; fin: string; puertas: string; aforo: number; ocupadas: number; libres: number; estado: EstadoSesion;
  listaEspera: boolean; enEspera: number; maxPorReserva: number; aperturaAt?: string;
}
export interface Entradas { sesiones: SesionPub[]; personas: number; plazas: number }
export interface ReservaIn {
  sesionId: string; nombre: string; apellidos: string; email: string; telefono?: string; personas: number; origen?: string; utm?: Record<string, string>; aceptaPrivacidad: boolean; novedades?: boolean;
}
export interface MiEntrada {
  codigo: string; qr: string; nombre: string; apellidos: string; email: string; personas: number; dentro: number; estado: 'reservada' | 'usada' | 'anulada'; sesion: SesionPub; lugar: string;
  puedeCambiar: boolean; maxPersonas: number; compartir: string;
}
export interface Oferta { sesion: SesionPub; personas: number; expira: string; estado: string }

const base = `/api/competiciones/${COMPETITION_SLUG}/entradas`;

/** Free tickets (ticketing service). Upstream failures → 503 on the server render, never a false «agotado». */
@Injectable({ providedIn: 'root' })
export class EntradasPublic {
  private readonly http = inject(HttpClient);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  readonly failed = signal(false);

  async sesiones(): Promise<Entradas | null> {
    try {
      return await firstValueFrom(this.http.get<Entradas>(base));
    } catch {
      this.failed.set(true);
      if (this.res) {
        this.res.status = 503;
        this.res.headers = { ...(this.res.headers as Record<string, string> | undefined), 'Retry-After': '30', 'Cache-Control': 'no-store' };
      }
      return null;
    }
  }
  reservar(b: ReservaIn): Promise<{ codigo: string; token: string }> { return firstValueFrom(this.http.post<{ codigo: string; token: string }>(base, b)); }
  espera(b: { sesionId: string; email: string; nombre?: string; personas: number; aceptaPrivacidad: boolean }): Promise<void> { return firstValueFrom(this.http.post<void>(`${base}/espera`, b)); }
  oferta(t: string): Promise<Oferta> { return firstValueFrom(this.http.get<Oferta>(`${base}/oferta`, { params: { t } })); }
  aceptar(t: string): Promise<{ codigo: string; token: string }> { return firstValueFrom(this.http.post<{ codigo: string; token: string }>(`${base}/oferta`, { token: t })); }
  enlace(email: string): Promise<void> { return firstValueFrom(this.http.post<void>(`${base}/enlace`, { email })); }
  mia(t: string): Promise<MiEntrada> { return firstValueFrom(this.http.get<MiEntrada>('/api/mi-entrada', { params: { t } })); }
  personas(t: string, personas: number): Promise<MiEntrada> { return firstValueFrom(this.http.put<MiEntrada>('/api/mi-entrada', { token: t, personas })); }
  reenviar(t: string): Promise<void> { return firstValueFrom(this.http.post<void>('/api/mi-entrada/reenviar', { token: t })); }
  anular(t: string): Promise<MiEntrada> { return firstValueFrom(this.http.post<MiEntrada>('/api/mi-entrada/anular', { token: t })); }
  ics(t: string): string { return `/api/mi-entrada/calendario.ics?t=${encodeURIComponent(t)}`; }
}

export function errorDe(e: unknown, def = 'No hemos podido completarlo. Inténtalo en unos minutos.'): { code: string; detail: string } {
  if (e instanceof HttpErrorResponse) {
    const p = e.error as { code?: string; detail?: string; errors?: { location?: string; message?: string }[] } | null;
    return { code: p?.code ?? String(e.status), detail: p?.detail ?? def };
  }
  return { code: '', detail: def };
}

const TZ = 'Europe/Madrid';
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
export const dia = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso)).replace(',', '').replace('.', '') : '');
export const diaLargo = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(iso)).replace(',', '') : '');

/** QR as a data URL (qrcode is CommonJS: the dynamic import exposes it as `default`). */
export async function qrDataURL(content: string, width = 240): Promise<string> {
  const mod = await import('qrcode');
  const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
  return QR.toDataURL(content, { margin: 1, width, errorCorrectionLevel: 'M' });
}
