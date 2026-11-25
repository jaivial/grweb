import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Dia { fecha: string; inicio: string; fin: string; puertas?: string; pausaInicio?: string; pausaFin?: string; notas?: string[] }
export interface Config { maxPorSesion: number; minPorAtleta: number; descansoMin: number; pesajeAntesMin: number; pesajeDuracionMin: number; mesasPesaje: number; dias: Dia[] }
export interface SesionAtleta { id: string; nombre: string; sexo: 'F' | 'M'; categoria: string; club: string; divisionNombre: string; prueba?: string; totalPrevisto?: number; seguidores: number; lote: number; baja: boolean }
export interface Directo { estado: 'programado' | 'en_curso' | 'finalizado'; retrasoMin?: number }
/** A session (time slot) of a date: one platform, no flight letter. */
export interface Sesion {
  id: string; prueba: string; dia: string; inicio: string; fin: string; duracionMin: number; pesajeInicio: string; pesajeFin: string;
  titulo: string; sexo: 'F' | 'M' | 'X' | ''; categorias: string[]; sexoFijo: boolean; atletas: SesionAtleta[]; directo: Directo; publicado: boolean; avisos: string[];
}
export interface AgendaItem { dia: string; hora: string; titulo: string; icono?: string }
export interface Conflicto {
  tipo: 'exceso' | 'solape' | 'solape_pesaje' | 'sexo_mixto' | 'fuera_horario' | 'pausa' | 'baja' | 'sin_sesion' | 'vacio';
  bloquea: boolean; sesionId?: string; sesion?: string; prueba?: string; titulo: string; detalle: string;
}
export interface VersionInfo { numero: number; prueba: string; numeroPrueba: number; estado: 'publicada' | 'sustituida' | 'retirada'; at: string; por: string; cambios: number; avisos: number; seguidores: number }
export interface Borrador {
  config: Config; rev: number; zonaHoraria: string; sesiones: Sesion[]; agenda: AgendaItem[]; sinSesion: SesionAtleta[]; conflictos: Conflicto[];
  atletas: number; publicado: boolean; publicada?: VersionInfo; cambiosSinPublicar: boolean;
}
export interface Cambio { tipo: 'atleta' | 'sesion' | 'alta' | 'baja' | 'agenda'; titulo: string; antes: string; despues: string; atletas: number }
export interface Diff { prueba: string; desde: number; siguiente: number; primera: boolean; cambios: Cambio[]; afectados: number; conEmail: number; seguidores: number; bloqueantes: number; atletas: number }
export interface Publicado { version: number; prueba: string; numeroPrueba: number; cambios: number; avisos: number; seguidores: number }
export interface SesionEdit { dia?: string; inicio?: string; duracionMin?: number; pesajeInicio?: string; pesajeFin?: string; competicion?: string; sexo?: 'F' | 'M'; categorias?: string[]; nivel?: string }

/** BIZ-202: weight classes per sex (same lists as the backend). */
export const CATEGORIAS_SEXO: Record<'F' | 'M', string[]> = {
  F: ['-43', '-47', '-52', '-57', '-63', '-69', '-76', '-84', '+84'],
  M: ['-53', '-59', '-66', '-74', '-83', '-93', '-105', '-120', '+120'],
};

/** Schedule planner API (schedule service). Every draft change sends If-Match with the revision. */
@Injectable({ providedIn: 'root' })
export class HorariosApi {
  private readonly http = inject(HttpClient);
  private rev = 0;
  private base(cid: string): string {
    return `/api/admin/competiciones/${cid}/horarios`;
  }
  private h(): HttpHeaders {
    return new HttpHeaders({ 'If-Match': `W/"${this.rev}"` });
  }
  private async take(p: Promise<HttpResponse<Borrador>>): Promise<Borrador> {
    const r = await p;
    this.rev = r.body!.rev;
    return r.body!;
  }
  private opts() {
    return { headers: this.h(), observe: 'response' as const };
  }

  get(cid: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.get<Borrador>(this.base(cid), { observe: 'response' })));
  }
  config(cid: string, c: Config): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.put<Borrador>(`${this.base(cid)}/config`, c, this.opts())));
  }
  nuevaFecha(cid: string, fecha?: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/dias`, fecha ? { fecha } : {}, this.opts())));
  }
  borrarFecha(cid: string, dia: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.delete<Borrador>(`${this.base(cid)}/dias/${dia}`, this.opts())));
  }
  generar(cid: string, competicion?: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/generar`, competicion ? { competicion } : {}, this.opts())));
  }
  crearSesion(cid: string, b: SesionEdit): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/sesiones`, b, this.opts())));
  }
  editarSesion(cid: string, id: string, b: SesionEdit): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.patch<Borrador>(`${this.base(cid)}/sesiones/${id}`, b, this.opts())));
  }
  borrarSesion(cid: string, id: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.delete<Borrador>(`${this.base(cid)}/sesiones/${id}`, this.opts())));
  }
  atletas(cid: string, id: string, atletas: string[]): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.put<Borrador>(`${this.base(cid)}/sesiones/${id}/atletas`, { atletas }, this.opts())));
  }
  agenda(cid: string, items: AgendaItem[]): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.put<Borrador>(`${this.base(cid)}/agenda`, { items }, this.opts())));
  }
  restaurar(cid: string, n: number): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/versiones/${n}/restaurar`, {}, this.opts())));
  }
  diff(cid: string): Promise<Diff> {
    return firstValueFrom(this.http.get<Diff>(`${this.base(cid)}/diff`));
  }
  publicar(cid: string, avisarAtletas: boolean, avisarSeguidores: boolean): Promise<Publicado> {
    return firstValueFrom(this.http.post<Publicado>(`${this.base(cid)}/publicar`, { avisarAtletas, avisarSeguidores }, { headers: this.h() }));
  }
  despublicar(cid: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base(cid)}/despublicar`, {}));
  }
  versiones(cid: string): Promise<VersionInfo[]> {
    return firstValueFrom(this.http.get<VersionInfo[]>(`${this.base(cid)}/versiones`));
  }
}

const TZ = 'Europe/Madrid';
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
const fecha = (f: string, o: Intl.DateTimeFormatOptions) => (/^\d{4}-\d{2}-\d{2}$/.test(f ?? '') ? new Intl.DateTimeFormat('es-ES', { ...o, timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '');
/** «sábado 19» */
export const diaCorto = (f: string) => fecha(f, { weekday: 'long', day: 'numeric' });
/** «sábado, 19 dic» */
export const diaLargo = (f: string) => fecha(f, { weekday: 'long', day: 'numeric', month: 'short' });
export const nombrePrueba = (p?: string) => (p ? p.toUpperCase().replace('AEP', 'AEP-') : '');
export const cat = (c: string) => c.replace('-', '−');
export const kg = (n?: number) => (n === undefined || n === null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
/** Competition of the i-th date (AEP-2 the first, AEP-3 the second, as the backend). */
export const pruebaDeDia = (n: number, i: number) => (n >= 2 && i < 2 ? ['aep2', 'aep3'][i] : '');
