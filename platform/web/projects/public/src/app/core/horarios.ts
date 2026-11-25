import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG, FalloApi } from './competition';

export interface PubAtleta { slug: string; nombre: string; club: string; divisionNombre: string; sexo: 'F' | 'M'; categoria: string; lote: number }
/**
 * One time slot of a day (single platform, no flights): start time, sex, the weight categories grouped in it, the
 * EP1/EP2 category and the weigh-in window. `atletas` only holds public profiles; `total` counts everyone.
 */
export interface PubHorario {
  id: string; titulo: string; sexo: string; /** EP category of the slot as the API sends it («AEP-2», «AEP-3»…). */ ep?: string; inicio: string; fin: string; pesajeInicio: string; pesajeFin: string;
  total: number; atletas: PubAtleta[];
  /** @deprecated there are no flights: only old payloads bring it (still read by /entradas until it drops «el día hora a hora»). */
  codigo: string;
  /** @deprecated live state of the old flights: the schedule no longer shows it (home and /en-directo still read it). */
  estado: 'programado' | 'en_curso' | 'finalizado';
  /** @deprecated delays are not shown any more. */
  inicioEstimado: string;
}
/** @deprecated old name, kept while the home reads `flights`. */
export type PubFlight = PubHorario;
export interface AgendaItem { dia: string; hora: string; titulo: string; icono?: string }
export interface PubDia { fecha: string; puertas?: string; notas?: string[]; agenda: AgendaItem[]; horarios: PubHorario[]; /** same list as `horarios` (old field name) */ flights: PubHorario[] }
export interface Horarios { publicado: boolean; version?: number; actualizadoAt?: string; zonaHoraria: string; dias: PubDia[] }
export interface PaginaAtletas { items: PubAtleta[]; total: number; page: number; pageSize: number }

export const ICS_URL = `/api/competiciones/${COMPETITION_SLUG}/horarios.ics`;
/** Public SSE events after which the web reloads the schedule (publish, withdraw, live changes, «Publicar horarios» switch). */
export const EVENTOS_HORARIOS = ['horarios.publicados', 'horarios.retirados', 'horarios.cambiados', 'horarios.visibilidad'] as const;

type DiaApi = Partial<PubDia> & { fecha: string };

/** The schedule API is moving from `flights` to `horarios` (no flights, no platform numbers): accept both shapes. */
export function normalizar(h: Horarios & { dias: DiaApi[] }): Horarios {
  const dias: DiaApi[] = [...(h.dias ?? [])];
  // BIZ-167: the event is Saturday + Sunday; if only Saturday is published, add an empty Sunday («próximamente»).
  const ult = dias[dias.length - 1];
  if (ult && new Date(ult.fecha + 'T12:00:00Z').getUTCDay() === 6) {
    dias.push({ fecha: new Date(Date.parse(ult.fecha + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10) });
  }
  return {
    ...h,
    dias: dias.map((d) => {
      const lista = (d.horarios ?? d.flights ?? []).map((x) => ({ ...x, atletas: x.atletas ?? [] }));
      return { ...d, agenda: d.agenda ?? [], horarios: lista, flights: lista };
    }),
  };
}

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
      return normalizar(await firstValueFrom(this.http.get<Horarios & { dias: DiaApi[] }>(`/api/competiciones/${COMPETITION_SLUG}/horarios`, opts)));
    } catch (e) {
      this.failed.set(true);
      if (!(e instanceof HttpErrorResponse && e.status === 404)) this.fallo.marcar(e);
      return null;
    }
  }

  /** One page of the athletes of a time slot. null when the endpoint is not available (the page then pages the list it has). */
  async atletas(horarioId: string, page: number, pageSize: number): Promise<PaginaAtletas | null> {
    try {
      return await firstValueFrom(this.http.get<PaginaAtletas>(`/api/competiciones/${COMPETITION_SLUG}/horarios/${encodeURIComponent(horarioId)}/atletas`, { params: { page, pageSize } }));
    } catch {
      return null;
    }
  }
}
