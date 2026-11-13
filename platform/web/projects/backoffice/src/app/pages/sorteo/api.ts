import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Cash ticket info of the in-person raffle (raffle GET/PUT …/rifa/config). */
export interface RifaConfig {
  precioBoletoEfectivoCents: number; moneda: string; textoInfo: string; lugar: string; horario: string; fechaSorteo?: string | null; visible: boolean;
  itemsVisibles: number; version: number; updatedAt: string;
}
export interface RifaGanador { boleto: string; nombre?: string; nota?: string; registradoAt?: string }
/** One raffled object (Figma «Tarjeta item rifa»). */
export interface RifaItem {
  id: string; nombre: string; descripcion: string; imagenUrl: string | null; valorEstimadoCents: number | null; donante: string | null; unidades: number; orden: number;
  ganador: RifaGanador | null; visible: boolean; version: number;
}
export type RifaItemIn = Pick<RifaItem, 'nombre' | 'descripcion' | 'imagenUrl' | 'valorEstimadoCents' | 'donante' | 'unidades' | 'visible'>;
interface Lista { items: RifaItem[]; total: number }
/** One winner registration (GET …/rifa/ganadores/historial); boleto null = winner removed. */
export interface RifaHistorial { itemId: string; itemNombre: string; boleto: string | null; nombre: string | null; actor: string; at: string }

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const euros = (c?: number | null) => eur.format((c ?? 0) / 100);
/** «120 €» without decimals when whole (Figma row meta). */
export const eurosCorto = (c: number) => (c % 100 ? euros(c) : new Intl.NumberFormat('es-ES').format(c / 100) + ' €');
const ifMatch = (v: number) => ({ headers: new HttpHeaders({ 'If-Match': `W/"${v}"` }) });

/** Raffle API (raffle service, Figma page 60 · BO · Rifa). */
@Injectable({ providedIn: 'root' })
export class RifaApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/rifa`;
  }
  config(cid: string): Promise<RifaConfig> { return firstValueFrom(this.http.get<RifaConfig>(`${this.b(cid)}/config`)); }
  guardarConfig(cid: string, c: RifaConfig): Promise<RifaConfig> { return firstValueFrom(this.http.put<RifaConfig>(`${this.b(cid)}/config`, c, ifMatch(c.version))); }
  async items(cid: string): Promise<RifaItem[]> { return (await firstValueFrom(this.http.get<Lista>(`${this.b(cid)}/items`))).items; }
  async crear(cid: string, b: RifaItemIn): Promise<RifaItem[]> { return (await firstValueFrom(this.http.post<Lista>(`${this.b(cid)}/items`, b))).items; }
  async editar(cid: string, it: RifaItem, b: RifaItemIn): Promise<RifaItem[]> { return (await firstValueFrom(this.http.patch<Lista>(`${this.b(cid)}/items/${it.id}`, b, ifMatch(it.version)))).items; }
  async borrar(cid: string, it: RifaItem): Promise<RifaItem[]> { return (await firstValueFrom(this.http.delete<Lista>(`${this.b(cid)}/items/${it.id}`, ifMatch(it.version))))?.items ?? this.items(cid); }
  async orden(cid: string, ids: string[]): Promise<RifaItem[]> { return (await firstValueFrom(this.http.put<Lista>(`${this.b(cid)}/items/orden`, { ids }))).items; }
  async ganador(cid: string, id: string, g: { boleto: string; nombre?: string; nota?: string }): Promise<RifaItem[]> {
    return (await firstValueFrom(this.http.post<Lista>(`${this.b(cid)}/items/${id}/ganador`, g))).items;
  }
  async historial(cid: string): Promise<RifaHistorial[]> {
    return (await firstValueFrom(this.http.get<{ items: RifaHistorial[] | null }>(`${this.b(cid)}/ganadores/historial`))).items ?? [];
  }
}
