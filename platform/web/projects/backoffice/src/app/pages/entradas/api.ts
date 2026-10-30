import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type EstadoSesion = 'disponible' | 'ultimas' | 'agotada' | 'cerrada' | 'proximamente';
export interface Sesion {
  id: string; nombre: string; detalle: string; inicio: string; fin: string; puertas: string; aforo: number; ocupadas: number; libres: number; estado: EstadoSesion;
  listaEspera: boolean; enEspera: number; maxPorReserva: number; aperturaAt?: string; cierreAt?: string; publicada: boolean; reservas: number; dentro: number; sobreventa: number; version: number;
}
export interface Ajustes { autoPromocion: boolean; plazoHoras: number; permitirParcial: boolean }
export interface Resumen {
  reservas: number; nuevas7d: number; personas: number; media: number; ocupacion: number; plazas: number; espera: number; esperaTop: string; serie: number[];
  sesiones: Sesion[]; ajustes: Ajustes; pestanas: Record<'sesiones' | 'reservas' | 'espera', number>;
}
export interface Entrada {
  id: string; codigo: string; nombre: string; apellidos: string; email: string; telefono: string; sesionId: string; sesion: string; personas: number; dentro: number;
  estado: 'reservada' | 'usada' | 'anulada'; origen: string; manual: boolean; nota: string; novedades: boolean; consentimientos: Record<string, unknown>; motivo?: string; createdAt: string;
}
export interface Escaneo { id: string; codigo: string; nombre: string; puesto: string; usuario: string; resultado: Resultado['resultado']; personas: number; offline: boolean; at: string }
export interface Detalle extends Entrada { escaneos: Escaneo[]; qr: string }
export interface Lista { items: Entrada[]; total: number; pagina: number; por: number; origenes: string[] }
export interface EsperaItem { id: string; sesionId: string; sesion: string; nombre: string; email: string; personas: number; estado: 'en_espera' | 'oferta' | 'caducada'; expira?: string; orden: number; createdAt: string }
export interface Espera { items: EsperaItem[]; ajustes: Ajustes }
export interface SesionIn {
  nombre: string; detalle?: string; inicio: string; fin: string; puertas: string; aforo: number; maxPorReserva: number; aperturaAt?: string; cierreAt?: string; publicada: boolean; listaEspera: boolean;
}
export interface Resultado {
  resultado: 'valida' | 'ya_usada' | 'otra_sesion' | 'invalida' | 'anulada' | 'manual'; codigo: string; nombre: string; personas: number; dentro: number; pendientes: number;
  sesionId?: string; sesion: string; mensaje: string; primera?: string; puestoAnterior?: string; registrado: boolean;
}
export interface Puesto { id: string; nombre: string; tipo: 'puerta' | 'taquilla' | 'pesaje'; detalle: string; ultimoPing?: string; cola: number; escaneos15: number }
export interface Compacta { c: string; s: string; n: string; p: number; d: number; e: string }
export interface Bootstrap { puestos: Puesto[]; sesiones: Sesion[]; actual?: string; lista: Compacta[]; generado: string }
export interface EscaneoIn { qr?: string; codigo?: string; puesto: string; sesionId?: string; confirmar?: boolean; personas?: number; forzar?: boolean; clave?: string; offline?: boolean; escaneadoAt?: string }
export interface ResumenCheckin { sesiones: Sesion[]; puestos: Puesto[]; ultimos: Escaneo[]; incidencias: Escaneo[]; ritmo: number[] }

/** Tickets API (ticketing service, Figma pages 58 and 59). */
@Injectable({ providedIn: 'root' })
export class EntradasApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/entradas`;
  }
  private c(cid: string): string {
    return `/api/admin/competiciones/${cid}/checkin`;
  }
  resumen(cid: string): Promise<Resumen> { return firstValueFrom(this.http.get<Resumen>(`${this.b(cid)}/resumen`)); }
  crearSesion(cid: string, s: SesionIn): Promise<Resumen> { return firstValueFrom(this.http.post<Resumen>(`${this.b(cid)}/sesiones`, s)); }
  editarSesion(cid: string, id: string, version: number, s: SesionIn, forzar = false): Promise<Resumen> {
    return firstValueFrom(this.http.put<Resumen>(`${this.b(cid)}/sesiones/${id}`, s, { headers: new HttpHeaders({ 'If-Match': `W/"${version}"` }), params: forzar ? { forzar: 'true' } : {} }));
  }
  borrarSesion(cid: string, id: string): Promise<Resumen> { return firstValueFrom(this.http.delete<Resumen>(`${this.b(cid)}/sesiones/${id}`)); }
  lista(cid: string, f: { sesion?: string; estado?: string; origen?: string; q?: string; pagina?: number }): Promise<Lista> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) p = p.set(k, String(v));
    return firstValueFrom(this.http.get<Lista>(this.b(cid), { params: p }));
  }
  exportar(cid: string, f: { sesion?: string; estado?: string; q?: string }): Promise<Blob> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) p = p.set(k, String(v));
    return firstValueFrom(this.http.get(`${this.b(cid)}/export.csv`, { params: p, responseType: 'blob' }));
  }
  detalle(cid: string, id: string): Promise<Detalle> { return firstValueFrom(this.http.get<Detalle>(`${this.b(cid)}/${id}`)); }
  manual(cid: string, b: { sesionId: string; nombre: string; apellidos?: string; email?: string; telefono?: string; personas: number; nota?: string; enviar: boolean; forzar: boolean }): Promise<Detalle> {
    return firstValueFrom(this.http.post<Detalle>(this.b(cid), b));
  }
  bulk(cid: string, ids: string[], accion: 'anular' | 'reenviar' | 'mover', extra: { sesionId?: string; motivo?: string; avisar?: boolean } = {}): Promise<{ afectadas: number; personas: number }> {
    return firstValueFrom(this.http.post<{ afectadas: number; personas: number }>(`${this.b(cid)}/bulk`, { ids, accion, ...extra }));
  }
  espera(cid: string): Promise<Espera> { return firstValueFrom(this.http.get<Espera>(`${this.b(cid)}/espera`)); }
  ofrecer(cid: string, id: string): Promise<Espera> { return firstValueFrom(this.http.post<Espera>(`${this.b(cid)}/espera/${id}/ofrecer`, {})); }
  retirar(cid: string, id: string): Promise<Espera> { return firstValueFrom(this.http.delete<Espera>(`${this.b(cid)}/espera/${id}`)); }
  ajustes(cid: string, a: Ajustes): Promise<Espera> { return firstValueFrom(this.http.put<Espera>(`${this.b(cid)}/ajustes`, a)); }
  bootstrap(cid: string): Promise<Bootstrap> { return firstValueFrom(this.http.get<Bootstrap>(`${this.c(cid)}/bootstrap`)); }
  escanear(cid: string, b: EscaneoIn): Promise<Resultado> { return firstValueFrom(this.http.post<Resultado>(`${this.c(cid)}/escaneos`, b)); }
  lote(cid: string, items: EscaneoIn[]): Promise<{ resultados: Resultado[] }> { return firstValueFrom(this.http.post<{ resultados: Resultado[] }>(`${this.c(cid)}/escaneos/lote`, { items })); }
  buscar(cid: string, q: string): Promise<Entrada[]> { return firstValueFrom(this.http.get<Entrada[]>(`${this.c(cid)}/buscar`, { params: { q } })); }
  ping(cid: string, puesto: string, cola: number): Promise<void> { return firstValueFrom(this.http.post<void>(`${this.c(cid)}/ping`, { puesto, cola })); }
  resumenCheckin(cid: string): Promise<ResumenCheckin> { return firstValueFrom(this.http.get<ResumenCheckin>(`${this.c(cid)}/resumen`)); }
}

const TZ = 'Europe/Madrid';
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
export const horaSeg = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
export const fechaCorta = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
export const diaHora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
/** ISO instant → value of an <input type="datetime-local"> in Madrid time. */
export function aLocal(iso?: string): string {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return p.replace(' ', 'T');
}
/** <input type="datetime-local"> value (Madrid) → ISO instant. */
export function deLocal(v: string): string {
  if (!v) return '';
  const guess = new Date(v + ':00Z');
  const off = new Date(guess.toLocaleString('en-US', { timeZone: TZ })).getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess.getTime() - off).toISOString();
}
export const ESTADO_SESION: Record<EstadoSesion, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  disponible: { label: 'Abierta', tone: 'success' }, ultimas: { label: 'Casi llena', tone: 'warning' }, agotada: { label: 'Agotada', tone: 'danger' }, cerrada: { label: 'Cerrada', tone: 'neutral' }, proximamente: { label: 'Programada', tone: 'info' },
};
export const ESTADO_ENTRADA: Record<Entrada['estado'], { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  reservada: { label: 'Reservada', tone: 'info' }, usada: { label: 'Usada', tone: 'success' }, anulada: { label: 'Anulada', tone: 'neutral' },
};
export const RESULTADO: Record<Resultado['resultado'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  valida: { label: 'Válida', tone: 'success' }, manual: { label: 'Manual', tone: 'success' }, ya_usada: { label: 'Ya usada', tone: 'warning' }, otra_sesion: { label: 'Otra sesión', tone: 'warning' },
  invalida: { label: 'No válido', tone: 'danger' }, anulada: { label: 'Anulada', tone: 'danger' },
};
