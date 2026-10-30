import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, RESPONSE_INIT, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

export interface Marcas {
  sq?: number;
  bp?: number;
  dl?: number;
}
export interface AtletaPub {
  slug: string;
  nombre: string;
  apellidos: string;
  club: string;
  ciudad: string;
  sexo: 'F' | 'M';
  categoria: string;
  division: string;
  divisionNombre: string;
  flight: string;
  plataforma?: number;
  horaInicio?: string;
  fotoUrl: string;
  focalX: number;
  focalY: number;
  destacado: boolean;
}
export interface ListaPub {
  resumen: { total: number; mujeres: number; hombres: number; clubs: number; flights: number; plataformas: number };
  atletas: AtletaPub[];
  actualizado: string;
}
export interface FichaPub extends AtletaPub {
  frase: string;
  bio: string;
  instagram: string;
  entrenador: string;
  historial: string;
  marcas?: Marcas;
  totalPrevisto?: number;
  primerosIntentos: Marcas;
  pesajeInicio?: string;
  pesajeFin?: string;
  seguidores: number;
  permiteSeguir: boolean;
  perfilMinimo: boolean;
  tambien: AtletaPub[];
}
export interface Participantes {
  plazas: number;
  ocupadas: number;
  mujeres: number;
  hombres: number;
  reserva: number;
  estado: string;
  grupos: { titulo: string; subtitulo: string; filas: { slug: string; nombre: string; club: string; sexo: 'F' | 'M'; categoria: string; flight: string; pesajeInicio?: string; pesajeFin?: string; horaInicio?: string }[] }[];
}

const base = `/api/competiciones/${COMPETITION_SLUG}`;

/** Public athletes API (athletes service). 404 → null (real 404 page); other errors → 503 like the CMS pages. */
@Injectable({ providedIn: 'root' })
export class AtletasPublic {
  private readonly http = inject(HttpClient);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  readonly failed = signal(false);

  lista(): Promise<ListaPub | null> { return this.get<ListaPub>('/atletas'); }
  ficha(slug: string): Promise<FichaPub | null> { return this.get<FichaPub>(`/atletas/${slug}`); }
  participantes(): Promise<Participantes | null> { return this.get<Participantes>('/participantes'); }
  async seguir(slug: string, email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${base}/atletas/${slug}/seguir`, { email, aceptaAviso: true }));
  }
  async bajaAviso(token: string): Promise<void> {
    await firstValueFrom(this.http.post(`${base}/seguimientos/baja`, { token }));
  }
  async confirmarAviso(token: string): Promise<string> {
    return (await firstValueFrom(this.http.post<{ atleta: string }>(`${base}/seguimientos/confirmar`, { token }))).atleta;
  }
  notFound(): void {
    if (this.res && !this.failed()) this.res.status = 404;
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

/** Starred athletes («Sigue a tus atletas y tendrás tu propio horario»), kept on this device only. */
@Injectable({ providedIn: 'root' })
export class Favoritos {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly slugs = signal<string[]>(this.read());

  has(slug: string): boolean { return this.slugs().includes(slug); }
  toggle(slug: string): void {
    const next = this.has(slug) ? this.slugs().filter((s) => s !== slug) : [...this.slugs(), slug];
    this.slugs.set(next);
    if (this.browser) localStorage.setItem('gr-favoritos', JSON.stringify(next));
  }
  private read(): string[] {
    if (!this.browser) return [];
    try {
      return JSON.parse(localStorage.getItem('gr-favoritos') ?? '[]') as string[];
    } catch {
      return [];
    }
  }
}

export const cat = (c: string) => c.replace('-', '−');
export const kg = (n?: number | null) => (n === undefined || n === null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: 2 }));
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');
export const iniciales = (a: { nombre: string; apellidos: string }) => ((a.nombre[0] ?? '') + (a.apellidos[0] ?? '')).toUpperCase();

/** IPF weight classes by sex (the lightest class is only for sub-juniors and juniors; the API validates it). */
export const CATEGORIAS_IPF: Record<'F' | 'M', string[]> = {
  F: ['-43', '-47', '-52', '-57', '-63', '-69', '-76', '-84', '+84'],
  M: ['-53', '-59', '-66', '-74', '-83', '-93', '-105', '-120', '+120'],
};
