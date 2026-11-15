import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Competicion } from './api';

/** Gateway / upstream hiccups worth retrying (no answer, bad gateway, unavailable or queued, timeout). */
const pasajero = (e: unknown) => e instanceof HttpErrorResponse && [0, 502, 503, 504].includes(e.status);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Competitions the user can access and the one selected through the URL (/:comp/…). */
@Injectable({ providedIn: 'root' })
export class Competitions {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly list = signal<Competicion[]>([]);
  readonly loaded = signal(false);
  readonly slug = signal<string | null>(null);
  readonly current = computed(() => this.list().find((c) => c.slug === this.slug()) ?? null);
  /** One request for all the guards that ask at the same time. */
  private enCurso: Promise<Competicion[]> | null = null;

  /**
   * The route guards wait for this list: a failure there used to cancel the navigation and leave a blank page (Jaime,
   * 15-nov: «juegos / premios no cargan los datos» while the API was saturated). Now transient errors are retried
   * (0.6 s, 1.5 s, 3 s) and a final failure shows the BO «Error 500» page with «Reintentar», keeping the URL.
   */
  async load(force = false): Promise<Competicion[]> {
    if (this.loaded() && !force) return this.list();
    this.enCurso ??= this.pedir().finally(() => (this.enCurso = null));
    return this.enCurso;
  }

  private async pedir(): Promise<Competicion[]> {
    for (const ms of [600, 1500, 3000, -1]) {
      try {
        const list = await firstValueFrom(this.http.get<Competicion[]>('/api/admin/competiciones'));
        this.list.set(list);
        this.loaded.set(true);
        return list;
      } catch (e) {
        if (!pasajero(e) || ms < 0) {
          if (!(e instanceof HttpErrorResponse && e.status === 401)) void this.router.navigateByUrl('/500', { skipLocationChange: true });
          throw e;
        }
        await espera(ms);
      }
    }
    throw new Error('unreachable');
  }

  /** Re-reads one competition after a change (SSE evento.estado, módulos…). */
  async reload(id: string): Promise<void> {
    const c = await firstValueFrom(this.http.get<Competicion>(`/api/admin/competiciones/${id}`));
    this.list.update((l) => l.map((x) => (x.id === id ? c : x)));
  }
}
