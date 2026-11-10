import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG, FalloApi } from './competition';

export interface PubAtleta { slug: string; nombre: string; club: string; divisionNombre: string; sexo: 'F' | 'M'; categoria: string; lote: number }
export interface PubFlight {
  id: string; codigo: string; titulo: string; sexo: string; plataforma: number; inicio: string; inicioEstimado: string; fin: string; pesajeInicio: string; pesajeFin: string;
  estado: 'programado' | 'en_curso' | 'finalizado'; retrasoMin: number; total: number; atletas: PubAtleta[];
}
export interface AgendaItem { dia: string; hora: string; titulo: string; icono?: string }
export interface PubDia { fecha: string; puertas?: string; notas: string[]; agenda: AgendaItem[]; flights: PubFlight[] }
export interface Horarios { publicado: boolean; version?: number; actualizadoAt?: string; zonaHoraria: string; dias: PubDia[] }

export const ICS_URL = `/api/competiciones/${COMPETITION_SLUG}/horarios.ics`;

/** Public schedule (schedule service). Errors → 503 like the other public pages (never a false «no publicado»). */
@Injectable({ providedIn: 'root' })
export class HorariosPublic {
  private readonly http = inject(HttpClient);
  private readonly fallo = inject(FalloApi);
  readonly failed = signal(false);

  /** `fresca`: after a live event, skip the 15 s HTTP cache (browser and edge) with a cache-busting param + no-cache. */
  async get(fresca = false): Promise<Horarios | null> {
    try {
      this.failed.set(false);
      const opts = fresca ? { params: { v: Date.now() }, headers: { 'Cache-Control': 'no-cache' } } : {};
      return await firstValueFrom(this.http.get<Horarios>(`/api/competiciones/${COMPETITION_SLUG}/horarios`, opts));
    } catch (e) {
      this.failed.set(true);
      if (!(e instanceof HttpErrorResponse && e.status === 404)) this.fallo.marcar(e);
      return null;
    }
  }
}
