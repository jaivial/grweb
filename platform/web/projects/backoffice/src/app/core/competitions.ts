import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Competicion } from './api';

/** Competitions the user can access and the one selected through the URL (/:comp/…). */
@Injectable({ providedIn: 'root' })
export class Competitions {
  private readonly http = inject(HttpClient);
  readonly list = signal<Competicion[]>([]);
  readonly loaded = signal(false);
  readonly slug = signal<string | null>(null);
  readonly current = computed(() => this.list().find((c) => c.slug === this.slug()) ?? null);

  async load(force = false): Promise<Competicion[]> {
    if (this.loaded() && !force) return this.list();
    const list = await firstValueFrom(this.http.get<Competicion[]>('/api/admin/competiciones'));
    this.list.set(list);
    this.loaded.set(true);
    return list;
  }

  /** Re-reads one competition after a change (SSE evento.estado, módulos…). */
  async reload(id: string): Promise<void> {
    const c = await firstValueFrom(this.http.get<Competicion>(`/api/admin/competiciones/${id}`));
    this.list.update((l) => l.map((x) => (x.id === id ? c : x)));
  }
}
