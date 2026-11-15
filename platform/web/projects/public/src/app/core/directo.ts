import { embedVideo } from '@grcup/ui';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG, FalloApi } from './competition';

export type Mov = 'sq' | 'bp' | 'dl';
export interface EnPlataforma {
  nombre: string; slug?: string; club?: string; sexo: 'F' | 'M'; categoria: string; division?: string; movimiento: Mov; numero: number; peso: number;
  votos?: string; resultado?: 'valido' | 'nulo' | 'renuncia'; juzgadoAt?: string;
}
export interface Celda { peso: number; resultado: 'pendiente' | 'valido' | 'nulo' | 'renuncia'; votos?: string }
export interface Fila {
  puesto?: number; nombre: string; slug?: string; club?: string; division?: string; iniciales: string; pesoCorporal?: number; sq?: number; bp?: number; dl?: number;
  total?: number; subtotal?: number; gl?: number; intentos: Record<Mov, Celda[]>; medalla?: 'oro' | 'plata' | 'bronce'; records?: string[]; sinTotal?: boolean; completo: boolean;
  /** Public photo (only public profile + image consent) and lot number: optional, older payloads do not bring them. */
  fotoUrl?: string; lote?: number;
}
export interface Categoria { clave: string; sexo: 'F' | 'M'; categoria: string; titulo: string; corto: string; atletas: number; completos: number; filas: Fila[] }
export interface Directo {
  fase: 'antes' | 'en_directo' | 'finalizado'; pausa: boolean; retrasoMin: number; streamUrl?: string; replayUrl?: string; streamHome?: boolean; espectadores: number;
  sesion?: { hora: string; titulo: string }; movimiento: Mov; ronda: number; turnoAt?: string;
  actual?: EnPlataforma; ultimo?: EnPlataforma; siguientes: EnPlataforma[]; clasificacion: Categoria[];
  proximo?: { titulo: string; inicio: string }; resultadosPublicados: boolean;
}
export interface ResultadosPublicos {
  competicion: { slug: string; nombre: string; fechaInicio?: string; fechaFin?: string; sede: string; estado: string; actaUrl?: string };
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

/** An athlete waiting for the active attempt of the current lift (input of the «Siguientes» list). */
export interface Turno { fila: Fila; sexo: 'F' | 'M'; categoria: string; numero: number; peso: number }

/**
 * Lifting order of the current lift, computed in the client from the provisional ranking (same rules as OpenLifter,
 * src/logic/liftingOrder.ts, which the table runs):
 * - a cell is pending when it has a requested weight (> 0) and no result yet; without weight the athlete is not in the order;
 * - active attempt = the lowest attempt number with some pending cell. When every athlete with a weight in column N has a
 *   result, the lowest pending one is N + 1 (so the round moves on and the list reorders with the new weights);
 * - order inside the attempt: requested weight ascending; ties: 1) lot, when both have one; 2) from the 2.º attempt, the
 *   order of the previous attempt (recursively, same rules); 3) lighter bodyweight; 4) name.
 * Returns the pending athletes of the active attempt in lifting order (the first one is the athlete on the tarima).
 */
export function ordenTarima(cats: Categoria[], mov: Mov): { numero: number; orden: Turno[] } {
  const todos = cats.flatMap((c) => c.filas.map((fila) => ({ fila, sexo: c.sexo, categoria: c.categoria })));
  const celda = (f: Fila, n: number): Celda | undefined => f.intentos?.[mov]?.[n - 1];
  const pendiente = (f: Fila, n: number) => { const x = celda(f, n); return !!x && x.peso > 0 && x.resultado === 'pendiente'; };
  const numero = [1, 2, 3].find((n) => todos.some((t) => pendiente(t.fila, n))) ?? 0;
  if (!numero) return { numero: 0, orden: [] };
  const cmp = (a: Fila, b: Fila, n: number): number => {
    const pa = celda(a, n)?.peso ?? 0, pb = celda(b, n)?.peso ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.lote && b.lote && a.lote !== b.lote) return a.lote - b.lote;
    if (n > 1) return cmp(a, b, n - 1);
    if ((a.pesoCorporal ?? 0) !== (b.pesoCorporal ?? 0)) return (a.pesoCorporal ?? Infinity) - (b.pesoCorporal ?? Infinity);
    return a.nombre.localeCompare(b.nombre, 'es');
  };
  const orden = todos
    .filter((t) => pendiente(t.fila, numero))
    .sort((a, b) => cmp(a.fila, b.fila, numero))
    .map((t) => ({ ...t, numero, peso: celda(t.fila, numero)!.peso }));
  return { numero, orden };
}

/** YouTube / Twitch link → embeddable player URL (shared with the backoffice preview). */
export const embed = embedVideo;

/** Live snapshot, published results and editions (live + competition services). Upstream failures → 503 on SSR. */
@Injectable({ providedIn: 'root' })
export class DirectoPublic {
  private readonly http = inject(HttpClient);
  private readonly fallo = inject(FalloApi);
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
      if (!(e instanceof HttpErrorResponse && e.status === 404)) this.fallo.marcar(e);
      return null;
    }
  }
}
