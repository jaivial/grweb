import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SMTPEstado { conocido: boolean; ok: boolean; servidor: string; error?: string; ultimoEnvio?: string; desde?: string; propio: boolean }
export interface Resumen { enviados7d: number; enviadosPrev: number; entregados: number; rebotes7d: number; enCola: number; ritmo: number; smtp: SMTPEstado; serie: number[] }
export interface PlantillaItem {
  clave: string; nombre: string; disparador: string; asunto: string; esencial: boolean; estado: 'activa' | 'pausada' | 'error'; error?: string; personalizada: boolean; enviados: number; fallos: number; ultimoEnvio?: string;
}
export interface Contenido { asunto: string; preheader: string; titulo: string; cuerpo: string; botonTexto: string; botonUrl: string; pie: string }
export interface PlantillaDetalle extends Contenido { info: PlantillaItem; variables: string[]; ejemplo: Record<string, string>; original: Contenido; version: number; updatedPor?: string; updatedAt?: string }
export interface Render { asunto: string; html: string; texto: string }
export type EstadoMensaje = 'en_cola' | 'enviando' | 'enviado' | 'reintentando' | 'rebotado' | 'fallido' | 'cancelado' | 'omitido';
export interface Mensaje {
  id: string; destino: string; canal: string; plantilla: string; nombre: string; asunto: string; estado: EstadoMensaje; intentos: number; detalle: string; prueba: boolean; createdAt: string; enviadoAt?: string; proximoAt?: string; proveedorId?: string;
}
export interface Salida { items: Mensaje[]; total: number; pagina: number; por: number; estados: Partial<Record<EstadoMensaje, number>> }
export interface AutoItem {
  clave: string; nombre: string; cuando: string; publico: string; canales: string[]; esencial: boolean; activa: boolean; estado: 'activa' | 'pausada' | 'error'; plantillas: string[]; enviados7d: number; ultimo?: string;
}
export interface Autos { pausarEnEvento: boolean; ritmo: number; items: AutoItem[] }

/** Transactional email API (messaging service, Figma page 62). */
@Injectable({ providedIn: 'root' })
export class EmailsApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/emails`;
  }
  resumen(cid: string): Promise<Resumen> {
    return firstValueFrom(this.http.get<Resumen>(`${this.b(cid)}/resumen`));
  }
  plantillas(cid: string): Promise<PlantillaItem[]> {
    return firstValueFrom(this.http.get<PlantillaItem[]>(`${this.b(cid)}/plantillas`));
  }
  plantilla(cid: string, clave: string): Promise<PlantillaDetalle> {
    return firstValueFrom(this.http.get<PlantillaDetalle>(`${this.b(cid)}/plantillas/${clave}`));
  }
  guardar(cid: string, p: PlantillaDetalle, c: Contenido): Promise<PlantillaDetalle> {
    return firstValueFrom(this.http.put<PlantillaDetalle>(`${this.b(cid)}/plantillas/${p.info.clave}`, c, { headers: new HttpHeaders({ 'If-Match': `W/"${p.version}"` }) }));
  }
  restaurar(cid: string, clave: string): Promise<PlantillaDetalle> {
    return firstValueFrom(this.http.delete<PlantillaDetalle>(`${this.b(cid)}/plantillas/${clave}`));
  }
  estado(cid: string, clave: string, estado: 'activa' | 'pausada'): Promise<PlantillaDetalle> {
    return firstValueFrom(this.http.put<PlantillaDetalle>(`${this.b(cid)}/plantillas/${clave}/estado`, { estado }));
  }
  previsualizar(cid: string, clave: string, contenido: Contenido): Promise<Render> {
    return firstValueFrom(this.http.post<Render>(`${this.b(cid)}/plantillas/${clave}/previsualizar`, { contenido }));
  }
  prueba(cid: string, clave: string, destino: string): Promise<Mensaje> {
    return firstValueFrom(this.http.post<Mensaje>(`${this.b(cid)}/plantillas/${clave}/prueba`, { destino }));
  }
  salida(cid: string, estado: string, q: string, pagina: number): Promise<Salida> {
    const params: Record<string, string> = { pagina: String(pagina) };
    if (estado) params['estado'] = estado;
    if (q) params['q'] = q;
    return firstValueFrom(this.http.get<Salida>(`${this.b(cid)}/salida`, { params }));
  }
  mensaje(cid: string, id: string): Promise<Mensaje & { html: string; texto: string }> {
    return firstValueFrom(this.http.get<Mensaje & { html: string; texto: string }>(`${this.b(cid)}/salida/${id}`));
  }
  bulk(cid: string, ids: string[], accion: 'reintentar' | 'cancelar'): Promise<{ afectados: number }> {
    return firstValueFrom(this.http.post<{ afectados: number }>(`${this.b(cid)}/salida/bulk`, { ids, accion }));
  }
  autos(cid: string): Promise<Autos> {
    return firstValueFrom(this.http.get<Autos>(`${this.b(cid)}/automatizaciones`));
  }
  auto(cid: string, clave: string, activa: boolean): Promise<Autos> {
    return firstValueFrom(this.http.put<Autos>(`${this.b(cid)}/automatizaciones/${clave}`, { activa }));
  }
  ajustes(cid: string, pausarEnEvento: boolean, ritmo: number): Promise<Autos> {
    return firstValueFrom(this.http.put<Autos>(`${this.b(cid)}/ajustes`, { pausarEnEvento, ritmo }));
  }
}

export const ESTADO_MSG: Record<EstadoMensaje, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  en_cola: { label: 'En cola', tone: 'info' }, enviando: { label: 'Enviando', tone: 'info' }, enviado: { label: 'Enviado', tone: 'success' }, reintentando: { label: 'Reintentando', tone: 'warning' },
  rebotado: { label: 'Rebotado', tone: 'danger' }, fallido: { label: 'Fallido', tone: 'danger' }, cancelado: { label: 'Cancelado', tone: 'neutral' }, omitido: { label: 'Omitido', tone: 'neutral' },
};
export const hace = (iso?: string): string => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');
