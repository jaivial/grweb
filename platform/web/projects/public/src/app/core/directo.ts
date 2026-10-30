import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, RESPONSE_INIT, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

export type Mov = 'sq' | 'bp' | 'dl';
export interface EnPlataforma {
  nombre: string; slug?: string; club?: string; sexo: 'F' | 'M'; categoria: string; division?: string; movimiento: Mov; numero: number; peso: number;
  votos?: string; resultado?: 'valido' | 'nulo' | 'renuncia'; juzgadoAt?: string;
}
export interface Celda { peso: number; resultado: 'pendiente' | 'valido' | 'nulo' | 'renuncia'; votos?: string }
export interface Fila {
  puesto?: number; nombre: string; slug?: string; club?: string; division?: string; iniciales: string; pesoCorporal?: number; sq?: number; bp?: number; dl?: number;
  total?: number; gl?: number; intentos: Record<Mov, Celda[]>; medalla?: 'oro' | 'plata' | 'bronce'; records?: string[]; sinTotal?: boolean; completo: boolean;
}
export interface Categoria { clave: string; sexo: 'F' | 'M'; categoria: string; titulo: string; corto: string; atletas: number; completos: number; filas: Fila[] }
export interface Directo {
  fase: 'antes' | 'en_directo' | 'finalizado'; pausa: boolean; retrasoMin: number; streamUrl?: string; replayUrl?: string; espectadores: number;
  flight?: { codigo: string; titulo: string; plataforma: number }; movimiento: Mov; ronda: number; turnoAt?: string;
  actual?: EnPlataforma; ultimo?: EnPlataforma; siguientes: EnPlataforma[]; clasificacion: Categoria[];
  proximo?: { titulo: string; inicio: string }; resultadosPublicados: boolean;
}
export interface ResultadosPublicos {
  competicion: { slug: string; nombre: string; fechaInicio?: string; fechaFin?: string; sede: string; estado: string };
  publicado: boolean; ejemplo: boolean; actualizado?: string; categorias: Categoria[]; mejores: Partial<Record<'F' | 'M', Fila>>;
}
export interface Pantalla { directo: Directo; pantalla: { siguientes: boolean; carrusel: boolean; qr: boolean }; nombre: string }
export interface Edicion { slug: string; nombre: string; estado: string; fechaInicio?: string; ciudad: string; anio: number }

export const MOV: Record<Mov, string> = { sq: 'Sentadilla', bp: 'Press banca', dl: 'Peso muerto' };
export const ORD = ['', '1.º', '2.º', '3.º'];
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const kg = (v?: number | null) => (v === undefined || v === null ? '—' : nf1.format(v));
export const gl = (v?: number | null) => (v === undefined || v === null ? '—' : nf2.format(v));
export const catCorta = (sexo: string, c: string) => `${sexo} ${c.replace('-', '−')}`;
export const catLarga = (sexo: string, c: string) => `${sexo === 'F' ? 'Femenino' : 'Masculino'} ${c.replace('-', '−')} kg`;

/** YouTube / Twitch link → embeddable player URL (anything else is not embedded). */
export function embed(url: string | undefined, host: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const id = u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&rel=0` : null;
    }
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed${u.pathname}?autoplay=1&mute=1&rel=0`;
    if (/(^|\.)twitch\.tv$/.test(u.hostname)) return `https://player.twitch.tv/?channel=${u.pathname.split('/')[1]}&parent=${host}&muted=true`;
  } catch { /* not a URL */ }
  return null;
}

/** Live snapshot, published results and editions (live + competition services). Upstream failures → 503 on SSR. */
@Injectable({ providedIn: 'root' })
export class DirectoPublic {
  private readonly http = inject(HttpClient);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  readonly failed = signal(false);

  directo(): Promise<Directo | null> { return this.get<Directo>(`/api/competiciones/${COMPETITION_SLUG}/directo`); }
  resultados(slug: string): Promise<ResultadosPublicos | null> { return this.get<ResultadosPublicos>(`/api/competiciones/${slug}/resultados`); }

  async pantalla(slug: string, token: string, previa: boolean): Promise<Pantalla | 'enlace' | null> {
    try {
      return await firstValueFrom(this.http.get<Pantalla>(`/api/competiciones/${slug}/pantalla`, { params: { token, ...(previa ? { previa: 'true' } : {}) } }));
    } catch (e) {
      return e instanceof HttpErrorResponse && e.status === 403 ? 'enlace' : null;
    }
  }

  /** Editions of the GR Cup (the competitions of the platform), newest first. */
  async ediciones(): Promise<Edicion[] | null> {
    const l = await this.get<Omit<Edicion, 'anio'>[]>('/api/competiciones');
    return l?.filter((c) => c.fechaInicio).map((c) => ({ ...c, anio: Number(c.fechaInicio!.slice(0, 4)) })) ?? null;
  }

  private async get<T>(url: string): Promise<T | null> {
    try {
      this.failed.set(false);
      return await firstValueFrom(this.http.get<T>(url));
    } catch (e) {
      this.failed.set(true);
      if (this.res && !(e instanceof HttpErrorResponse && e.status === 404)) {
        this.res.status = 503;
        this.res.headers = { ...(this.res.headers as Record<string, string> | undefined), 'Retry-After': '30', 'Cache-Control': 'no-store' };
      }
      return null;
    }
  }
}
