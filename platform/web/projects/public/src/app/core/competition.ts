import { HttpClient, type HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Base URL of the API when rendering on the server (in-cluster gateway); empty in the browser (same origin /api). */
export const API_BASE = new InjectionToken<string>('API_BASE', { factory: () => '' });

/** SSR: relative /api calls go straight to the in-cluster gateway. */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE);
  return base && req.url.startsWith('/api/') ? next(req.clone({ url: base + req.url })) : next(req);
};

export interface CompeticionPublica {
  slug: string;
  nombre: string;
  nombreCorto: string;
  edicion: number;
  estado: string;
  fechaInicio?: string;
  fechaFin?: string;
  zonaHoraria: string;
  sede: { nombre: string; direccion: string; cp: string; ciudad: string; provincia: string; mapsUrl: string; lat?: number; lng?: number };
  evento: { descripcion: string; nivel: string; organizador: string; emailContacto: string; puertas: string; aforoPabellon: number; instagram: string };
  modulos: Record<string, boolean>;
  inscripcion: { modo: string; url: string; estado: string; plazas?: number };
  comoLlegar: { tipo: string; titulo: string; detalle: string; nota?: string; estado: string }[];
}

/** Slug of the competition this site serves (one public site per competition). */
export const COMPETITION_SLUG = 'grcup';

@Injectable({ providedIn: 'root' })
export class Competition {
  private readonly http = inject(HttpClient);
  readonly data = signal<CompeticionPublica | null>(null);
  readonly failed = signal(false);

  /** Loaded once per render; with SSR the response is transferred to the browser (no second request). */
  async load(): Promise<CompeticionPublica | null> {
    if (this.data()) return this.data();
    try {
      const c = await firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${COMPETITION_SLUG}`));
      this.data.set(c);
      return c;
    } catch {
      this.failed.set(true);
      return null;
    }
  }
}
