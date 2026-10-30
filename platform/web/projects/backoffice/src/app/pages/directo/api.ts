import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Mov = 'sq' | 'bp' | 'dl';
export type ResultadoIntento = 'pendiente' | 'valido' | 'nulo' | 'renuncia';
export interface Pantalla { siguientes: boolean; carrusel: boolean; qr: boolean; ver?: number }
export interface Estado {
  version: number; fase: 'antes' | 'en_directo' | 'finalizado'; flightId?: string; movimiento: Mov; pausa: boolean; retrasoMin: number; streamUrl: string; replayUrl: string;
  pantalla: Pantalla; publicarAuto: boolean; turnoAt?: string; updatedAt: string;
}
export interface IntentoMesa { id: string; peso: number; votos: string; resultado: ResultadoIntento; corregido: boolean }
export interface FilaMesa {
  id: string; lote: number; nombre: string; sexo: 'F' | 'M'; categoria: string; club: string; division: string; pesoCorporal?: number; rackSq?: number; rackBp?: string;
  intentos: Record<Mov, [IntentoMesa | null, IntentoMesa | null, IntentoMesa | null]>; mejor: Record<Mov, number | null>; total?: number; turno: number; sinPeso?: boolean;
}
export interface Turno {
  atletaId: string; nombre: string; club: string; sexo: 'F' | 'M'; categoria: string; lote: number; intentoId?: string; numero: number; peso: number; rackSq?: number; rackBp?: string; frase?: string;
}
export interface FlightMesa { id: string; codigo: string; titulo: string; plataforma: number; dia: string; inicio: string; atletas: number; hechos: number; estado: 'programado' | 'en_curso' | 'finalizado' }
export interface Mesa {
  estado: Estado; horariosPublicados: boolean; espectadores: number; pantallaPing?: string; flights: FlightMesa[]; flight?: FlightMesa; ronda: number; atletas: FilaMesa[];
  actual?: Turno; siguientes: Turno[]; movimientoCompleto: boolean; siguienteMovimiento?: Mov; flightCompleto: boolean;
}
export interface EstadoIn {
  fase: Estado['fase']; flightId?: string; movimiento: Mov; pausa: boolean; retrasoMin: number; streamUrl: string; replayUrl: string; pantalla: Pantalla; publicarAuto: boolean;
}
export interface Celda { peso: number; resultado: ResultadoIntento; votos?: string }
export interface Fila {
  puesto?: number; atletaId?: string; nombre: string; slug?: string; club?: string; division?: string; iniciales: string; pesoCorporal?: number; sq?: number; bp?: number; dl?: number;
  total?: number; gl?: number; intentos: Record<Mov, Celda[]>; medalla?: 'oro' | 'plata' | 'bronce'; records?: string[]; sinTotal?: boolean; completo: boolean;
}
export interface Categoria { clave: string; sexo: 'F' | 'M'; categoria: string; titulo: string; corto: string; atletas: number; completos: number; filas: Fila[] }
export interface CategoriaResumen { clave: string; titulo: string; corto: string; atletas: number; completos: number; publicado?: { version: number; at: string; por: string }; cambios: boolean }
export interface ResultadosAdmin { categorias: CategoriaResumen[]; categoria?: Categoria; absoluta: Record<'F' | 'M', Fila[]>; publicarAuto: boolean; flights: number; cerrados: number }

export const MOV: Record<Mov, string> = { sq: 'Sentadilla', bp: 'Press banca', dl: 'Peso muerto' };
export const MOV_CORTO: Record<Mov, string> = { sq: 'SQ', bp: 'BP', dl: 'DL' };
export const ORD = ['', '1.º', '2.º', '3.º'];

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kg = (v?: number | null) => (v === undefined || v === null ? '—' : nf1.format(v));
export const gl = (v?: number | null) => (v === undefined || v === null ? '—' : nf2.format(v));
export const cat = (sexo: string, c: string) => `${sexo} ${c.replace('-', '−')}`;
export const ini = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
/** «Válido (2-1)» from the lights. */
export function veredicto(votos: string, r: ResultadoIntento): string {
  if (r === 'renuncia') return 'Renuncia';
  if (r === 'pendiente') return 'Sin juzgar';
  const b = [...votos].filter((x) => x === 'B').length;
  return `${r === 'valido' ? 'Válido' : 'Nulo'} (${b}-${votos.length - b})`;
}

/** Live desk and results API (live service, Figma page 57). */
@Injectable({ providedIn: 'root' })
export class DirectoApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/directo`;
  }
  mesa(cid: string): Promise<Mesa> { return firstValueFrom(this.http.get<Mesa>(this.b(cid))); }
  estado(cid: string, version: number, e: EstadoIn): Promise<Mesa> {
    return firstValueFrom(this.http.put<Mesa>(`${this.b(cid)}/estado`, e, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }
  declarar(cid: string, b: { atletaId: string; movimiento: Mov; numero: number; peso: number; record?: boolean }): Promise<Mesa> {
    return firstValueFrom(this.http.post<Mesa>(`${this.b(cid)}/intentos`, b));
  }
  veredicto(cid: string, id: string, b: { votos?: string; renuncia?: boolean }): Promise<Mesa> {
    return firstValueFrom(this.http.post<Mesa>(`${this.b(cid)}/intentos/${id}/veredicto`, b));
  }
  corregir(cid: string, id: string, b: { votos?: string; renuncia?: boolean; peso?: number; motivo: string }): Promise<Mesa> {
    return firstValueFrom(this.http.post<Mesa>(`${this.b(cid)}/intentos/${id}/correccion`, b));
  }
  pantalla(cid: string): Promise<{ url: string; ping?: string }> { return firstValueFrom(this.http.get<{ url: string; ping?: string }>(`${this.b(cid)}/pantalla`)); }
  rotar(cid: string): Promise<{ url: string; ping?: string }> { return firstValueFrom(this.http.post<{ url: string; ping?: string }>(`${this.b(cid)}/pantalla/rotar`, {})); }

  resultados(cid: string, categoria?: string): Promise<ResultadosAdmin> {
    return firstValueFrom(this.http.get<ResultadosAdmin>(`/api/admin/competiciones/${cid}/resultados`, { params: categoria ? { categoria } : {} }));
  }
  publicar(cid: string, categorias: string[], avisar: boolean): Promise<{ publicadas: string[] }> {
    return firstValueFrom(this.http.post<{ publicadas: string[] }>(`/api/admin/competiciones/${cid}/resultados/publicar`, { categorias, avisar }));
  }
  retirar(cid: string, categoria: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/admin/competiciones/${cid}/resultados/retirar`, { categoria }));
  }
  acta(cid: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`/api/admin/competiciones/${cid}/resultados/acta.csv`, { responseType: 'blob' }));
  }
}
