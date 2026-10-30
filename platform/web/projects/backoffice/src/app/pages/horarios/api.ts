import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Dia { fecha: string; inicio: string; fin: string; puertas?: string; pausaInicio?: string; pausaFin?: string; notas?: string[] }
export interface Config {
  maxPorFlight: number; plataformas: number; orden: 'total' | 'categoria'; separarSexo: boolean; minPorAtleta: number; descansoMin: number;
  pesajeAntesMin: number; pesajeDuracionMin: number; mesasPesaje: number; dias: Dia[];
}
export interface FlightAtleta { id: string; nombre: string; sexo: 'F' | 'M'; categoria: string; club: string; divisionNombre: string; totalPrevisto?: number; seguidores: number; lote: number; baja: boolean }
export interface Directo { estado: 'programado' | 'en_curso' | 'finalizado'; retrasoMin?: number }
export interface Flight {
  id: string; codigo: string; dia: string; plataforma: number; inicio: string; fin: string; duracionMin: number; pesajeInicio: string; pesajeFin: string;
  titulo: string; sexo: 'F' | 'M' | 'X' | ''; atletas: FlightAtleta[]; directo: Directo; publicado: boolean; avisos: string[];
}
export interface AgendaItem { dia: string; hora: string; titulo: string; icono?: string }
export interface Conflicto {
  tipo: 'exceso' | 'solape_plataforma' | 'solape_pesaje' | 'sexo_mixto' | 'fuera_horario' | 'pausa' | 'baja' | 'sin_flight' | 'vacio';
  bloquea: boolean; flightId?: string; flight?: string; titulo: string; detalle: string;
}
export interface VersionInfo { numero: number; estado: 'publicada' | 'sustituida' | 'retirada'; at: string; por: string; cambios: number; avisos: number; seguidores: number }
export interface Borrador {
  config: Config; rev: number; zonaHoraria: string; flights: Flight[]; agenda: AgendaItem[]; sinFlight: FlightAtleta[]; conflictos: Conflicto[];
  atletas: number; publicado: boolean; publicada?: VersionInfo; cambiosSinPublicar: boolean;
}
export interface Cambio { tipo: 'atleta' | 'flight' | 'alta' | 'baja' | 'agenda'; titulo: string; antes: string; despues: string; atletas: number }
export interface Diff { desde: number; siguiente: number; primera: boolean; cambios: Cambio[]; afectados: number; conEmail: number; seguidores: number; bloqueantes: number; atletas: number }
export interface Publicado { version: number; cambios: number; avisos: number; seguidores: number }

/** Schedule planner API (schedule service, Figma page 56). Every draft change sends If-Match with the revision. */
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

  get(cid: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.get<Borrador>(this.base(cid), { observe: 'response' })));
  }
  config(cid: string, c: Config): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.put<Borrador>(`${this.base(cid)}/config`, c, { headers: this.h(), observe: 'response' })));
  }
  generar(cid: string, b: { maxPorFlight?: number; plataformas?: number; orden?: string }): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/generar`, b, { headers: this.h(), observe: 'response' })));
  }
  crearFlight(cid: string, b: { dia?: string; plataforma?: number; inicio?: string }): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/flights`, b, { headers: this.h(), observe: 'response' })));
  }
  editarFlight(cid: string, id: string, b: { dia?: string; plataforma?: number; inicio?: string; duracionMin?: number; pesajeInicio?: string; pesajeFin?: string }): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.patch<Borrador>(`${this.base(cid)}/flights/${id}`, b, { headers: this.h(), observe: 'response' })));
  }
  borrarFlight(cid: string, id: string): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.delete<Borrador>(`${this.base(cid)}/flights/${id}`, { headers: this.h(), observe: 'response' })));
  }
  atletas(cid: string, id: string, atletas: string[]): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.put<Borrador>(`${this.base(cid)}/flights/${id}/atletas`, { atletas }, { headers: this.h(), observe: 'response' })));
  }
  agenda(cid: string, items: AgendaItem[]): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.put<Borrador>(`${this.base(cid)}/agenda`, { items }, { headers: this.h(), observe: 'response' })));
  }
  restaurar(cid: string, n: number): Promise<Borrador> {
    return this.take(firstValueFrom(this.http.post<Borrador>(`${this.base(cid)}/versiones/${n}/restaurar`, {}, { headers: this.h(), observe: 'response' })));
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
  directo(cid: string, id: string, d: Directo): Promise<Directo> {
    return firstValueFrom(this.http.put<Directo>(`${this.base(cid)}/flights/${id}/directo`, d));
  }
}

const TZ = 'Europe/Madrid';
export const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
const fecha = (f: string, o: Intl.DateTimeFormatOptions) => (/^\d{4}-\d{2}-\d{2}$/.test(f ?? '') ? new Intl.DateTimeFormat('es-ES', { ...o, timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '');
export const diaCorto = (f: string) => fecha(f, { weekday: 'long', day: 'numeric' });
export const diaLargo = (f: string) => fecha(f, { weekday: 'long', day: 'numeric', month: 'short' });
export const cat = (c: string) => c.replace('-', '−');
export const kg = (n?: number) => (n === undefined || n === null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
