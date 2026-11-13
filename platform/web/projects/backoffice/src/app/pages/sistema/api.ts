import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GrIconName, GrTone } from '@grcup/ui';
import type { Competicion } from '../../core/api';

/** «Sistema e integraciones» (Figma 64): types and REST client (competition, audit, messaging). */
export type TipoInteg = 'smtp' | 'stripe' | 'whatsapp' | 'bunny' | 'aep';
export interface Integracion {
  tipo: TipoInteg;
  config: Record<string, string>;
  secreto: string;
  estado: 'sin_configurar' | 'configurada' | 'ok' | 'error';
  probadoAt?: string;
  error?: string;
  version: number;
  latenciaMs?: number;
  enviado?: string;
}
export interface Registro { estado: 'correcto' | 'falta' | 'revisar'; valor?: string; ayuda: string }
export interface Dominio { dominio: string; spf: Registro; dkim: Registro; dmarc: Registro }
export interface Salud {
  servicios: { nombre: string; ok: boolean; ms: number; error?: string; p95: number; peticiones: number }[];
  grupos: { nombre: string; pendientes: number; retraso: number; consumers: number; ultimoAt?: string }[];
  eventos: number;
  espectadores: number;
  cola?: { pendientes: number; enviadosHora: number };
  ultimoBackup?: string;
  generado: string;
}
export interface Webhook { id: string; proveedor: string; servicio: string; tipo: string; estado: 'procesado' | 'error'; respuesta: number; intentos: number; recibidoAt: string }
export interface Webhooks { items: Webhook[]; total: number; pagina: number; por: number }
export interface Exportacion { id: string; estado: 'en_curso' | 'lista' | 'error'; bytes: number; error?: string; createdAt: string; terminadaAt?: string; expiraAt?: string; url?: string }
export interface CompSistema extends Competicion {
  archivedAt?: string;
  clonadaDe?: string;
  anonimizarAt?: string;
  anonimizadaAt?: string;
  miembros?: number;
}

export const INTEG: Record<TipoInteg, { l: string; i: GrIconName; campos: { k: string; l: string; opciones?: string[] }[]; secreto?: string; ayudaSecreto?: string }> = {
  smtp: { l: 'Email (SMTP)', i: 'mail', secreto: 'Contraseña de aplicación', campos: [] },
  stripe: { l: 'Stripe', i: 'credit-card', secreto: 'Secreto', ayudaSecreto: 'JSON {"clave":"sk_…","webhook":"whsec_…"}', campos: [{ k: 'modo', l: 'Modo', opciones: ['test', 'live'] }, { k: 'clavePublica', l: 'Clave pública' }] },
  whatsapp: { l: 'WhatsApp', i: 'message', campos: [] },
  bunny: { l: 'Bunny CDN', i: 'globe', secreto: 'Access key', campos: [{ k: 'zona', l: 'Storage zone' }, { k: 'cdnUrl', l: 'URL del CDN' }] },
  aep: { l: 'AEP (acta)', i: 'upload', campos: [{ k: 'urlActa', l: 'URL del acta oficial (PDF)' }] },
};
export const ESTADO_INT: Record<Integracion['estado'], { l: string; tone: GrTone }> = {
  sin_configurar: { l: 'Sin configurar', tone: 'neutral' }, configurada: { l: 'Sin probar', tone: 'info' }, ok: { l: 'Operativo', tone: 'success' }, error: { l: 'Error', tone: 'danger' },
};
export const ESTADO_COMP: Record<string, { l: string; tone: GrTone }> = {
  borrador: { l: 'Borrador', tone: 'neutral' }, proximamente: { l: 'Próximamente', tone: 'info' }, inscripciones: { l: 'Inscripciones abiertas', tone: 'info' },
  completas: { l: 'Completas', tone: 'warning' }, hoy: { l: 'En directo', tone: 'live' }, finalizado: { l: 'Finalizada', tone: 'neutral' }, archivada: { l: 'Archivada', tone: 'neutral' },
};
/** Web modules (same keys as competition.ModulosCatalogo). */
export const MODULOS: { k: string; l: string; d: string }[] = [
  { k: 'entradas', l: 'Entradas', d: 'Reserva de entradas gratuitas por sesión con QR' },
  { k: 'atletas', l: 'Atletas', d: 'Listado y perfiles públicos de atletas' },
  { k: 'alta-atleta', l: 'Alta de atleta', d: 'Formulario público de alta (con revisión)' },
  { k: 'horarios', l: 'Horarios', d: 'Flights y horarios publicados' },
  { k: 'directo', l: 'Directo', d: 'Resultados en vivo y pantalla del pabellón' },
  { k: 'resultados', l: 'Resultados', d: 'Clasificaciones y acta' },
  { k: 'sorteo', l: 'Sorteo', d: 'Rifa de premios' },
  { k: 'areaAtleta', l: 'Área del atleta', d: 'Acceso del atleta a su ficha y avisos' },
  { k: 'voluntarios', l: 'Voluntarios', d: 'Formulario de voluntariado' },
  { k: 'blog', l: 'Blog', d: 'Noticias de la competición' },
  { k: 'galeria', l: 'Galería', d: 'Fotos por álbum' },
  { k: 'patrocinadores', l: 'Patrocinadores', d: 'Logos y niveles de patrocinio' },
  { k: 'campanas', l: 'Campañas', d: 'Campañas de email y WhatsApp (backoffice)' },
];

const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });
const fechaNum = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });
export function fecha(iso?: string | null): string { return iso ? fechaCorta.format(new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso)) : ''; }
export function fechaDMA(iso?: string | null): string { return iso ? fechaNum.format(new Date(iso)) : ''; }
/** «hace 12 s», «hace 4 h», «hace 3 días». */
export function hace(iso?: string | null, ahora = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

@Injectable({ providedIn: 'root' })
export class SistemaApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string { return `/api/admin/competiciones/${cid}`; }
  competiciones(): Promise<CompSistema[]> { return firstValueFrom(this.http.get<CompSistema[]>('/api/admin/competiciones', { params: { todas: true } })); }
  crear(b: { nombre: string; slug: string; fechaInicio?: string; fechaFin?: string; modulos: Record<string, boolean>; clonarDe?: string; copiar?: string[] }): Promise<Competicion> {
    return firstValueFrom(this.http.post<Competicion>('/api/admin/competiciones', b));
  }
  integraciones(cid: string): Promise<Integracion[]> { return firstValueFrom(this.http.get<Integracion[]>(`${this.b(cid)}/integraciones`)); }
  guardar(cid: string, tipo: TipoInteg, config: Record<string, string>, secreto?: string): Promise<Integracion> {
    return firstValueFrom(this.http.put<Integracion>(`${this.b(cid)}/integraciones/${tipo}`, { config, ...(secreto ? { secreto } : {}) }));
  }
  /** With `borrador` it tests those values without saving them («Enviar prueba» before «Guardar»). */
  probar(cid: string, tipo: TipoInteg, borrador?: { config: Record<string, string>; secreto?: string }): Promise<Integracion> {
    return firstValueFrom(this.http.post<Integracion>(`${this.b(cid)}/integraciones/${tipo}/probar`, borrador ? { config: borrador.config, ...(borrador.secreto ? { secreto: borrador.secreto } : {}) } : {}));
  }
  dominio(cid: string): Promise<Dominio> { return firstValueFrom(this.http.get<Dominio>(`${this.b(cid)}/integraciones/smtp/dominio`)); }
  salud(cid: string): Promise<Salud> { return firstValueFrom(this.http.get<Salud>(`${this.b(cid)}/sistema/salud`)); }
  webhooks(cid: string, f: { proveedor?: string; estado?: string; pagina?: number; por?: number }): Promise<Webhooks> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v) params[k] = String(v);
    return firstValueFrom(this.http.get<Webhooks>(`${this.b(cid)}/webhooks`, { params }));
  }
  archivar(cid: string): Promise<unknown> { return firstValueFrom(this.http.post(`${this.b(cid)}/archivar`, {})); }
  anonimizar(cid: string, confirmacion: string): Promise<{ estado: string; anonimizarAt: string; servicios: string[] }> {
    return firstValueFrom(this.http.post<{ estado: string; anonimizarAt: string; servicios: string[] }>(`${this.b(cid)}/anonimizar`, { confirmacion }));
  }
  eliminar(cid: string, confirmacion: string): Promise<unknown> { return firstValueFrom(this.http.request('DELETE', this.b(cid), { body: { confirmacion } })); }
  exportar(cid: string): Promise<Exportacion> { return firstValueFrom(this.http.post<Exportacion>(`${this.b(cid)}/exportaciones`, { tipo: 'completa' })); }
  exportaciones(cid: string): Promise<Exportacion[]> { return firstValueFrom(this.http.get<Exportacion[]>(`${this.b(cid)}/exportaciones`)); }
  descargar(url: string): Promise<Blob> { return firstValueFrom(this.http.get(url, { responseType: 'blob' })); }
}
