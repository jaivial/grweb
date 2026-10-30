import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type EstadoEmail = 'confirmado' | 'pendiente' | 'no' | 'revocado' | 'rebotado' | 'no_valido';
export type EstadoWA = 'aceptado' | 'no' | 'baja' | 'no_valido' | '';
export interface ContactoItem {
  id: string; nombre: string; email: string; telefono: string; origen: string; emailEstado: EstadoEmail; whatsappEstado: EstadoWA; relacion: string; ultimaActividad: string; anonimizado: boolean;
}
export interface Kpis {
  contactos: number; nuevos7d: number; email: number; emailNuevos7d: number; pctEmail: number; whatsapp: number; whatsappNuevos7d: number; pctWhatsapp: number; bajas: number; pctBajas: number; serie: number[];
}
export interface Lista { items: ContactoItem[]; total: number; pagina: number; por: number; kpis: Kpis; origenes: string[]; pestanas: Record<'contactos' | 'segmentos' | 'supresiones', number> }
export interface Consentimiento { finalidad: string; canal: string; estado: 'pendiente' | 'confirmado' | 'revocado'; version: string; hash: string; origen: string; ip: string; aceptadoAt: string; doiAt?: string; revocadoAt?: string; motivo?: string }
export interface Actividad { tipo: string; titulo: string; detalle: string; at: string }
export interface Supresion { id: string; canal: 'email' | 'whatsapp'; destino: string; tipo: 'baja' | 'email_invalido' | 'whatsapp_invalido' | 'rebote'; motivo: string; origen: string; at: string; contactoId?: string; nombre: string }
export interface Ficha extends ContactoItem { etiquetas: string[]; createdAt: string; consentimientos: Consentimiento[]; actividad: Actividad[]; supresiones: Supresion[]; version: number }
export interface Condicion { campo: 'origen' | 'relacion' | 'etiqueta' | 'creado' | 'actividad'; operador: 'es' | 'no_es' | 'desde' | 'hasta'; valor: string }
export interface Recuento { total: number; email: number; whatsapp: number }
export interface Segmento { id: string; nombre: string; condiciones: Condicion[]; ultimoUso: string; recuento: Recuento; version: number; updatedAt: string }
export interface Supresiones { items: Supresion[]; tipos: Record<Supresion['tipo'], number>; total: number }
export interface Filtros { q?: string; origen?: string; canal?: string; estado?: string; relacion?: string; pagina?: number }

/** Contacts API (crm service, Figma page 61). */
@Injectable({ providedIn: 'root' })
export class ContactosApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}`;
  }
  private params(f: Filtros): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== null) p = p.set(k, String(v));
    return p;
  }
  lista(cid: string, f: Filtros): Promise<Lista> {
    return firstValueFrom(this.http.get<Lista>(`${this.b(cid)}/contactos`, { params: this.params(f) }));
  }
  exportUrl(cid: string, f: Filtros): string {
    return `${this.b(cid)}/contactos/export.csv?${this.params(f).toString()}`;
  }
  async exportar(cid: string, f: Filtros): Promise<Blob> {
    return firstValueFrom(this.http.get(this.exportUrl(cid, f), { responseType: 'blob' }));
  }
  ficha(cid: string, id: string): Promise<Ficha> {
    return firstValueFrom(this.http.get<Ficha>(`${this.b(cid)}/contactos/${id}`));
  }
  rectificar(cid: string, f: Ficha, b: { nombre: string; email: string; telefono: string; etiquetas: string[] }): Promise<Ficha> {
    return firstValueFrom(this.http.put<Ficha>(`${this.b(cid)}/contactos/${f.id}`, b, { headers: new HttpHeaders({ 'If-Match': `W/"${f.version}"` }) }));
  }
  acceso(cid: string, id: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.b(cid)}/contactos/${id}/rgpd/acceso`, { responseType: 'blob' }));
  }
  suprimir(cid: string, id: string): Promise<{ seguimientos: number; voluntarios: number; atleta: boolean }> {
    return firstValueFrom(this.http.post<{ seguimientos: number; voluntarios: number; atleta: boolean }>(`${this.b(cid)}/contactos/${id}/rgpd/supresion`, {}));
  }
  segmentos(cid: string): Promise<Segmento[]> {
    return firstValueFrom(this.http.get<Segmento[]>(`${this.b(cid)}/segmentos`));
  }
  contar(cid: string, condiciones: Condicion[]): Promise<Recuento> {
    return firstValueFrom(this.http.post<Recuento>(`${this.b(cid)}/segmentos/contar`, { condiciones }));
  }
  guardarSegmento(cid: string, s: { id?: string; version?: number; nombre: string; condiciones: Condicion[] }): Promise<Segmento[]> {
    const body = { nombre: s.nombre, condiciones: s.condiciones };
    return s.id
      ? firstValueFrom(this.http.put<Segmento[]>(`${this.b(cid)}/segmentos/${s.id}`, body, { headers: new HttpHeaders({ 'If-Match': `W/"${s.version}"` }) }))
      : firstValueFrom(this.http.post<Segmento[]>(`${this.b(cid)}/segmentos`, body));
  }
  borrarSegmento(cid: string, id: string): Promise<Segmento[]> {
    return firstValueFrom(this.http.delete<Segmento[]>(`${this.b(cid)}/segmentos/${id}`));
  }
  supresiones(cid: string, tipo = ''): Promise<Supresiones> {
    return firstValueFrom(this.http.get<Supresiones>(`${this.b(cid)}/supresiones`, { params: tipo ? { tipo } : {} }));
  }
  addSupresion(cid: string, canal: string, destino: string, motivo: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/supresiones`, { canal, destino, motivo: motivo || undefined }));
  }
  delSupresion(cid: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/supresiones/${id}`));
  }
}

export const FINALIDAD: Record<string, string> = {
  privacidad: 'Privacidad (obligatorio)', novedades_email: 'Novedades por email', avisos_whatsapp: 'Avisos por WhatsApp', avisos_atleta: 'Avisos de atletas', imagen: 'Uso de imagen en fotos del evento',
};
export const ESTADO_EMAIL: Record<EstadoEmail, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  confirmado: { label: 'Confirmado', tone: 'success' }, pendiente: { label: 'Pendiente', tone: 'warning' }, no: { label: 'No aceptado', tone: 'neutral' },
  revocado: { label: 'Revocado', tone: 'danger' }, rebotado: { label: 'Rebotado', tone: 'danger' }, no_valido: { label: 'No válido', tone: 'danger' },
};
export const ESTADO_WA: Record<Exclude<EstadoWA, ''>, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  aceptado: { label: 'Aceptado', tone: 'success' }, no: { label: 'No aceptado', tone: 'neutral' }, baja: { label: 'Baja', tone: 'neutral' }, no_valido: { label: 'No válido', tone: 'danger' },
};
export const TIPO_SUP: Record<Supresion['tipo'], { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  baja: { label: 'Baja', tone: 'neutral' }, email_invalido: { label: 'Email no válido', tone: 'danger' }, whatsapp_invalido: { label: 'WhatsApp no válido', tone: 'danger' }, rebote: { label: 'Rebote', tone: 'warning' },
};
export const fecha = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');
export const fechaLarga = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) + ' (Europe/Madrid)' : '');
export const iniciales = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '·';
