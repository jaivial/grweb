import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, RESPONSE_INIT, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';

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
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  readonly failed = signal(false);

  async get(): Promise<Horarios | null> {
    try {
      this.failed.set(false);
      return await firstValueFrom(this.http.get<Horarios>(`/api/competiciones/${COMPETITION_SLUG}/horarios`));
    } catch (e) {
      this.failed.set(true);
      if (this.res && !(e instanceof HttpErrorResponse && e.status === 404)) {
        this.res.status = 503;
        this.res.headers = { ...(this.res.headers as Record<string, string> | undefined), 'Retry-After': '30', 'Cache-Control': 'no-store' };
      }
      return null;
    }
  }
}
