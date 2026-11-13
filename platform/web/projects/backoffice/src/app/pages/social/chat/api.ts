import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Chat service (contrato §4). Admin: C/chat/* con permiso «directo.operar». */

export interface MensajeAdmin {
  id: string;
  fanId: string;
  alias: string;
  texto: string;
  borrado: boolean;
  reportes: number;
  fecha: string;
}

export interface MensajesAdmin {
  dia: string;
  mensajes: MensajeAdmin[];
}

export interface ChatConfig {
  activo: boolean;
  modoLentoSeg: number;
  /** La columna puede venir a null si la fila existe pero la lista está vacía. */
  palabrasProhibidas: string[] | null;
  dominiosPermitidos: string[] | null;
  maxHitos: number;
  version: number;
}

/** Fan callado ahora mismo: silencio del backoffice o baneo del servicio de fans. */
export interface SilenciadoChat {
  fanId: string;
  tipo: 'silenciado' | 'baneado';
  hasta: string;
}

/** Vista pública de la sala (conectados, sala activa y modo lento). */
export interface ChatEstado {
  conectados: number;
  salaActiva: boolean;
  modoLentoSeg: number;
  dia: string;
}

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/chat`;
  }

  config(cid: string): Promise<ChatConfig> {
    return firstValueFrom(this.http.get<ChatConfig>(`${this.b(cid)}/config`));
  }

  guardarConfig(cid: string, c: Omit<ChatConfig, 'version'>, version: number): Promise<ChatConfig> {
    return firstValueFrom(this.http.put<ChatConfig>(`${this.b(cid)}/config`, c, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }

  mensajes(cid: string, dia: string, limite = 100, busca = ''): Promise<MensajesAdmin> {
    let p = new HttpParams().set('dia', dia).set('limite', String(limite));
    if (busca) p = p.set('busca', busca);
    return firstValueFrom(this.http.get<MensajesAdmin>(`${this.b(cid)}/mensajes`, { params: p }));
  }

  reportados(cid: string, dia: string, limite = 100): Promise<MensajesAdmin> {
    const p = new HttpParams().set('dia', dia).set('limite', String(limite));
    return firstValueFrom(this.http.get<MensajesAdmin>(`${this.b(cid)}/reportados`, { params: p }));
  }

  /**
   * Borra un mensaje de una jornada (`?dia=`): el id del stream solo es único dentro de una sala, así que sin la
   * jornada se borraría el mensaje más reciente con ese id.
   */
  borrar(cid: string, id: string, dia: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/mensajes/${id}`, { params: new HttpParams().set('dia', dia) }));
  }

  silenciar(cid: string, fanId: string, minutos: number, motivo: string): Promise<{ hasta: string }> {
    return firstValueFrom(this.http.put<{ hasta: string }>(`${this.b(cid)}/fans/${fanId}/silenciar`, { minutos, motivo }));
  }

  desSilenciar(cid: string, fanId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/fans/${fanId}/silenciar`));
  }

  silenciados(cid: string): Promise<{ fans: SilenciadoChat[] }> {
    return firstValueFrom(this.http.get<{ fans: SilenciadoChat[] }>(`${this.b(cid)}/silenciados`));
  }

  /** Baneo desde la moderación: reutiliza el endpoint del servicio de fans (§3). */
  banear(cid: string, fanId: string, hasta: string, motivo: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/admin/competiciones/${cid}/fans/${fanId}/banear`, { hasta, motivo }));
  }

  /** Estado público de la sala (mismo origen que el backoffice). */
  estado(slug: string): Promise<ChatEstado> {
    return firstValueFrom(this.http.get<ChatEstado>(`/api/competiciones/${slug}/chat/estado`));
  }
}
