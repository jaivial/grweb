import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

/**
 * Donations of the live page (service `donaciones`, contract §5): the public configuration, the ranking of the day
 * and the checkout (the backend answers with the URL of the payment gateway).
 */

export interface DonacionesConfig {
  activo: boolean;
  /** Céntimos. */
  minimo: number;
  /** Céntimos. */
  maximo: number;
  /** GRS coins announced per euro (exhibition only: they are not spendable). */
  coinsPorEuro: number;
  /** Céntimos. */
  importesSugeridos: number[];
  pasarela: 'stripe' | 'simulado' | 'ninguna';
}

export interface Donante {
  puesto: number;
  alias: string;
  /** Céntimos. */
  total: number;
  donativos: number;
}

export interface DonantesRanking {
  dia: string;
  items: Donante[];
  /** Céntimos. */
  totalRecaudado: number;
}

export interface DonacionCreada {
  donacionId: string;
  url: string;
}

/** Coins announced in the chat for an amount in cents. */
export function coinsDe(importe: number, coinsPorEuro: number): number {
  return Math.floor((importe * coinsPorEuro) / 100);
}

/** GRS Fantasy coins credited per euro (10.000 by default). */
export function fantasyDe(importe: number): number {
  return Math.floor(importe / 100) * 10000;
}

/** «10,00 €» */
export function euros(centimos: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(centimos / 100);
}

/** «10 €» (sin decimales: los importes del chat y de los chips). */
export function eurosCorto(centimos: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(centimos / 100);
}

/** Thousands separator for coins («1.000»). */
export function num(n: number): string {
  return new Intl.NumberFormat('es-ES', { useGrouping: true }).format(n);
}

@Injectable({ providedIn: 'root' })
export class Donaciones {
  private readonly http = inject(HttpClient);
  private readonly base = `/api/competiciones/${COMPETITION_SLUG}/donaciones`;

  /** Public configuration (amounts, limits and coins per euro). */
  readonly config = signal<DonacionesConfig | null>(null);
  /** Ranking of donors of the day. */
  readonly ranking = signal<DonantesRanking | null>(null);

  async cargarConfig(): Promise<DonacionesConfig | null> {
    try {
      const c = await firstValueFrom(this.http.get<DonacionesConfig>(`${this.base}/config`));
      this.config.set(c);
      return c;
    } catch {
      return null;
    }
  }

  async cargarRanking(dia?: string): Promise<DonantesRanking | null> {
    try {
      const r = await firstValueFrom(this.http.get<DonantesRanking>(`${this.base}/ranking`, { params: dia ? { dia } : {} }));
      this.ranking.set(r);
      return r;
    } catch {
      return null;
    }
  }

  /** Creates the donation and returns the URL of the payment gateway. */
  async donar(importe: number, mensaje: string, anonimo: boolean): Promise<DonacionCreada> {
    return firstValueFrom(this.http.post<DonacionCreada>(`${this.base}`, { importe, mensaje, anonimo }));
  }
}
