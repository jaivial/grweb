import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Config {
  premio: string; premioDetalle: string; premioImagen: string; premioValor: number; destino: string; precio: number; maxPorPersona: number; presets: number[]; totalMax?: number | null;
  ventaDesde?: string | null; ventaHasta?: string | null; fechaSorteo?: string | null; activa: boolean; version: number; updatedPor: string; updatedAt: string;
}
export interface ItemChecklist { clave: string; titulo: string; detalle: string; estado: 'pendiente' | 'hecho' | 'no_aplica'; nota?: string; por?: string; updatedAt?: string }
export interface Kpis { boletos: number; nuevos7d: number; recaudado: number; compradores: number; pendientes: number; reembolsadas: number; fallidas: number; serie: number[] }
export interface GanadorBO { nombre: string; email: string; cantidad: number; compra: string }
export interface Sorteo {
  id: string; semillaHash: string; hashLista: string; total: number; indice?: number; numero?: string; ganador?: GanadorBO; estado: 'congelado' | 'sorteado' | 'confirmado' | 'repetido';
  motivo?: string; testigo?: string; por: string; createdAt: string; sorteadoAt?: string; confirmadoAt?: string;
}
export interface Panel { config: Config; checklist: ItemChecklist[]; checklistCompleta: boolean; estado: string; pasarela: string; kpis: Kpis; actual?: Sorteo }
export interface Compra {
  id: string; nombre: string; email: string; telefono: string; cantidad: number; importe: number; estado: 'pendiente' | 'pagada' | 'fallida' | 'caducada' | 'reembolsada';
  boletos: string; pasarela: string; tarjeta: string; motivo?: string; createdAt: string; pagadaAt?: string;
}
export interface Compras { items: Compra[]; total: number; pagina: number; por: number }

export const ESTADO_VENTA: Record<string, { l: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' }> = {
  en_venta: { l: 'En venta', tone: 'success' }, proximamente: { l: 'Próximamente', tone: 'info' }, cerrada: { l: 'Venta cerrada', tone: 'neutral' },
  agotada: { l: 'Agotado', tone: 'neutral' }, bloqueada: { l: 'Venta bloqueada', tone: 'warning' }, sorteado: { l: 'Sorteado', tone: 'accent' },
};
export const ESTADO_COMPRA: Record<string, { l: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' }> = {
  pagada: { l: 'Pagado', tone: 'success' }, pendiente: { l: 'Pendiente', tone: 'warning' }, fallida: { l: 'Fallido', tone: 'danger' },
  caducada: { l: 'Caducado', tone: 'neutral' }, reembolsada: { l: 'Reembolsado', tone: 'info' },
};
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const euros = (c?: number) => eur.format((c ?? 0) / 100);
export const fecha = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace(',', '') : '—');
export const fechaLarga = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace('.', '') : '');

/** Raffle API (raffle service, Figma page 60). */
@Injectable({ providedIn: 'root' })
export class SorteoApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/sorteo`;
  }
  panel(cid: string): Promise<Panel> { return firstValueFrom(this.http.get<Panel>(this.b(cid))); }
  guardar(cid: string, c: Config): Promise<Panel> { return firstValueFrom(this.http.put<Panel>(this.b(cid), c, { headers: new HttpHeaders({ 'If-Match': `"${c.version}"` }) })); }
  checklist(cid: string, clave: string, estado: string, nota = ''): Promise<Panel> { return firstValueFrom(this.http.put<Panel>(`${this.b(cid)}/checklist/${clave}`, { estado, nota })); }
  compras(cid: string, f: { estado?: string; q?: string; pagina?: number }): Promise<Compras> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) p = p.set(k, String(v));
    return firstValueFrom(this.http.get<Compras>(`${this.b(cid)}/compras`, { params: p }));
  }
  csv(cid: string): Promise<Blob> { return firstValueFrom(this.http.get(`${this.b(cid)}/compras.csv`, { responseType: 'blob' })); }
  reembolsar(cid: string, id: string, motivo: string): Promise<Compra> { return firstValueFrom(this.http.post<Compra>(`${this.b(cid)}/compras/${id}/reembolso`, { confirmacion: 'REEMBOLSAR', motivo })); }
  reenviar(cid: string, id: string): Promise<void> { return firstValueFrom(this.http.post<void>(`${this.b(cid)}/compras/${id}/reenviar`, {})); }
  sorteos(cid: string): Promise<Sorteo[]> { return firstValueFrom(this.http.get<Sorteo[]>(`${this.b(cid)}/sorteos`)); }
  congelar(cid: string, testigo: string): Promise<Sorteo> { return firstValueFrom(this.http.post<Sorteo>(`${this.b(cid)}/sorteos`, { testigo })); }
  ejecutar(cid: string, id: string): Promise<Sorteo> { return firstValueFrom(this.http.post<Sorteo>(`${this.b(cid)}/sorteos/${id}/ejecutar`, {})); }
  confirmar(cid: string, id: string, notificar: boolean): Promise<Sorteo> { return firstValueFrom(this.http.post<Sorteo>(`${this.b(cid)}/sorteos/${id}/confirmar`, { notificar })); }
  repetir(cid: string, id: string, motivo: string, anularGanador: boolean): Promise<Sorteo> { return firstValueFrom(this.http.post<Sorteo>(`${this.b(cid)}/sorteos/${id}/repetir`, { motivo, anularGanador })); }
}
