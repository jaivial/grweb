import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type TipoBloque = 'cabecera' | 'portada' | 'titulo' | 'texto' | 'boton' | 'imagen' | 'lista' | 'dos_columnas' | 'cuenta_atras' | 'horario' | 'separador' | 'espacio';
export type CanalBloque = 'ambos' | 'email' | 'whatsapp';
export interface Bloque {
  id: string; tipo: TipoBloque; canal?: CanalBloque; texto?: string; texto2?: string; url?: string; imagen?: string; alt?: string; items?: string[]; fecha?: string;
  alinear?: 'izquierda' | 'centro'; alto?: number;
}
export type EstadoCampana = 'borrador' | 'programada' | 'enviando' | 'pausada' | 'enviada' | 'cancelada';
export interface Canal { total: number; pendientes: number; enviados: number; entregados: number; leidos: number; fallidos: number }
export interface Campana {
  id: string; nombre: string; asunto: string; preheader: string; canales: ('email' | 'whatsapp')[]; estado: EstadoCampana; diseno: Bloque[]; segmentoId?: string; segmento: string;
  emailPorMin: number; waPorMin: number; programadaAt?: string; iniciadaAt?: string; terminadaAt?: string; version: number; creadaPor: string; updatedPor: string; createdAt: string; updatedAt: string;
  progreso: Partial<Record<'email' | 'whatsapp', Canal>>;
}
export interface CampanaItem {
  id: string; nombre: string; asunto: string; canales: ('email' | 'whatsapp')[]; estado: EstadoCampana; segmento: string; programadaAt?: string; terminadaAt?: string; updatedAt: string;
  progreso: Partial<Record<'email' | 'whatsapp', Canal>>;
}
export interface Lista { items: CampanaItem[]; total: number; enCurso: number; whatsapp: 'evo-weai' | 'simulado' | 'ninguno' }
export interface WhatsApp { texto: string; imagen?: string; enlaces: { texto: string; url: string }[] }
export interface Previa { emailHtml: string; texto: string; whatsapp: WhatsApp; error?: string }
export interface WAEstado { modo: 'evo-weai' | 'simulado' | 'ninguno'; numero?: string; conexion: 'open' | 'connecting' | 'close' | 'simulado' | 'ninguno'; detalle?: string }
export interface Audiencia { segmento: string; total: number; email: number; whatsapp: number; excluidos: number; whatsappEstado: WAEstado }
export interface Destinatario { destino: string; nombre: string; canal: 'email' | 'whatsapp'; estado: string; detalle: string; enviadoAt?: string; leidoAt?: string }
export interface Destinatarios { items: Destinatario[]; total: number; pagina: number; por: number }
export interface Revision { id: string; autor: 'usuario' | 'ia'; por: string; modelo?: string; nota?: string; diseno: Bloque[]; createdAt: string }
export interface Segmento { id: string; nombre: string; recuento: { total: number; email: number; whatsapp: number } }
export interface Modelo { id: string; nombre: string; recomendado: boolean }
export interface MensajeIA { rol: 'usuario' | 'asistente'; texto: string }
export interface RespuestaIA { respuesta: string; diseno: Bloque[]; modelo: string; ms: number }
export interface CampanaIn {
  nombre: string; asunto: string; preheader?: string; canales: ('email' | 'whatsapp')[]; diseno: Bloque[]; segmentoId?: string; emailPorMin: number; waPorMin: number; autor?: 'usuario' | 'ia'; modelo?: string; nota?: string;
}

export const ESTADO: Record<EstadoCampana, { l: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' }> = {
  borrador: { l: 'Borrador', tone: 'neutral' }, programada: { l: 'Programada', tone: 'info' }, enviando: { l: 'Enviando', tone: 'accent' },
  pausada: { l: 'Pausada', tone: 'warning' }, enviada: { l: 'Enviada', tone: 'success' }, cancelada: { l: 'Cancelada', tone: 'danger' },
};
export const TIPOS: { tipo: TipoBloque; l: string; icon: string }[] = [
  { tipo: 'cabecera', l: 'Cabecera', icon: 'layout' }, { tipo: 'portada', l: 'Portada', icon: 'camera' }, { tipo: 'titulo', l: 'Título', icon: 'pencil' },
  { tipo: 'texto', l: 'Texto', icon: 'layout' }, { tipo: 'boton', l: 'Botón', icon: 'arrow-right' }, { tipo: 'imagen', l: 'Imagen', icon: 'camera' },
  { tipo: 'dos_columnas', l: 'Dos columnas', icon: 'panel-left' }, { tipo: 'lista', l: 'Lista', icon: 'menu' }, { tipo: 'cuenta_atras', l: 'Cuenta atrás', icon: 'clock' },
  { tipo: 'horario', l: 'Flight / horario', icon: 'calendar' }, { tipo: 'separador', l: 'Separador', icon: 'minus' }, { tipo: 'espacio', l: 'Espacio', icon: 'chevrons-up-down' },
];
export const NOMBRE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.tipo, t.l])) as Record<TipoBloque, string>;
export const ESTADO_DEST: Record<string, { l: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' }> = {
  pendiente: { l: 'Pendiente', tone: 'neutral' }, enviando: { l: 'Enviando', tone: 'info' }, enviado: { l: 'Enviado', tone: 'info' }, entregado: { l: 'Entregado', tone: 'success' },
  leido: { l: 'Leído', tone: 'success' }, fallido: { l: 'Fallido', tone: 'danger' }, rebotado: { l: 'Rebotado', tone: 'warning' }, cancelado: { l: 'Cancelado', tone: 'neutral' },
};

/** Campaigns API (messaging + ai services, Figma page 61). */
@Injectable({ providedIn: 'root' })
export class CampanasApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/campanas`;
  }
  lista(cid: string, estado = ''): Promise<Lista> { return firstValueFrom(this.http.get<Lista>(this.b(cid), { params: estado ? { estado } : {} })); }
  crear(cid: string, nombre: string): Promise<Campana> { return firstValueFrom(this.http.post<Campana>(this.b(cid), { nombre })); }
  get(cid: string, id: string): Promise<Campana> { return firstValueFrom(this.http.get<Campana>(`${this.b(cid)}/${id}`)); }
  guardar(cid: string, id: string, version: number, c: CampanaIn): Promise<Campana> {
    return firstValueFrom(this.http.put<Campana>(`${this.b(cid)}/${id}`, c, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }
  borrar(cid: string, id: string): Promise<void> { return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/${id}`)); }
  duplicar(cid: string, id: string): Promise<Campana> { return firstValueFrom(this.http.post<Campana>(`${this.b(cid)}/${id}/duplicar`, {})); }
  revisiones(cid: string, id: string): Promise<Revision[]> { return firstValueFrom(this.http.get<Revision[]>(`${this.b(cid)}/${id}/revisiones`)); }
  previsualizar(cid: string, b: { nombre: string; asunto: string; preheader?: string; diseno: Bloque[] }): Promise<Previa> { return firstValueFrom(this.http.post<Previa>(`${this.b(cid)}/previsualizar`, b)); }
  audiencia(cid: string, id: string): Promise<Audiencia> { return firstValueFrom(this.http.get<Audiencia>(`${this.b(cid)}/${id}/audiencia`)); }
  prueba(cid: string, id: string, destino: string): Promise<{ canal: string; detalle: string }> { return firstValueFrom(this.http.post<{ canal: string; detalle: string }>(`${this.b(cid)}/${id}/prueba`, { destino })); }
  enviar(cid: string, id: string, version: number, b: { programadaAt?: string; soloEmail?: boolean }): Promise<{ estado: string; encolados: number }> {
    return firstValueFrom(this.http.post<{ estado: string; encolados: number }>(`${this.b(cid)}/${id}/enviar`, b, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }
  accion(cid: string, id: string, a: 'pausar' | 'reanudar' | 'cancelar' | 'desprogramar'): Promise<Campana> { return firstValueFrom(this.http.post<Campana>(`${this.b(cid)}/${id}/${a}`, {})); }
  destinatarios(cid: string, id: string, f: { canal?: string; estado?: string; pagina?: number }): Promise<Destinatarios> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) p = p.set(k, String(v));
    return firstValueFrom(this.http.get<Destinatarios>(`${this.b(cid)}/${id}/destinatarios`, { params: p }));
  }
  segmentos(cid: string): Promise<Segmento[]> { return firstValueFrom(this.http.get<Segmento[]>(`/api/admin/competiciones/${cid}/segmentos`)); }
  whatsapp(cid: string): Promise<WAEstado> { return firstValueFrom(this.http.get<WAEstado>(`/api/admin/competiciones/${cid}/whatsapp`)); }
  conectar(cid: string, numero: string): Promise<{ codigo?: string; qr?: string }> { return firstValueFrom(this.http.post<{ codigo?: string; qr?: string }>(`/api/admin/competiciones/${cid}/whatsapp/conectar`, { numero })); }
  modelos(cid: string): Promise<Modelo[]> { return firstValueFrom(this.http.get<Modelo[]>(`/api/admin/competiciones/${cid}/ia/modelos`)); }
  ia(cid: string, b: { instruccion: string; diseno: Bloque[]; seleccion?: string; historial: MensajeIA[]; campana: string }): Promise<RespuestaIA> {
    return firstValueFrom(this.http.post<RespuestaIA>(`/api/admin/competiciones/${cid}/ia/diseno`, b));
  }
}

const nf = new Intl.NumberFormat('es-ES');
export const n = (v: number | undefined) => nf.format(v ?? 0);
export const fecha = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace('.', '') : '');
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '–');
/** WhatsApp formatting → safe HTML (*bold*, _italic_, links, line breaks). */
export function waHtml(t: string): string {
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#53bdeb">$1</a>').replace(/\n/g, '<br>');
}
