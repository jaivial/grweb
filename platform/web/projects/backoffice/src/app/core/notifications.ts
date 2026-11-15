import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Notificacion } from './api';

/** Team notifications of the current competition (bell + panel, Figma «Shell · notificaciones»). */
@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly http = inject(HttpClient);
  private cid = '';
  readonly items = signal<Notificacion[]>([]);
  readonly unread = computed(() => this.items().filter((n) => !n.leida).length);
  readonly loading = signal(false);

  async load(cid: string): Promise<void> {
    this.cid = cid;
    this.loading.set(true);
    try {
      const r = await firstValueFrom(this.http.get<{ items: Notificacion[]; noLeidas: number }>(`/api/admin/competiciones/${cid}/notificaciones`));
      this.items.set(r.items);
    } finally {
      this.loading.set(false);
    }
  }

  push(n: Notificacion): void {
    this.items.update((l) => [n, ...l.filter((x) => x.id !== n.id)].slice(0, 100));
  }

  async markAll(): Promise<void> {
    if (!this.cid) return;
    this.items.update((l) => l.map((n) => ({ ...n, leida: true })));
    await firstValueFrom(this.http.post(`/api/admin/competiciones/${this.cid}/notificaciones/leer`, { todas: true }));
  }

  async mark(id: string): Promise<void> {
    this.items.update((l) => l.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    await firstValueFrom(this.http.post(`/api/admin/competiciones/${this.cid}/notificaciones/leer`, { ids: [id] }));
  }
}
