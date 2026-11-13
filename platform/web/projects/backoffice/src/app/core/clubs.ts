import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { Competitions } from './competitions';
import { Realtime } from './realtime';

/** Live count of the club requests waiting for a review (Figma 67: the «Clubs» item of the menu shows the pending ones). */
@Injectable({ providedIn: 'root' })
export class ClubsContador {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly pendientes = signal(0);

  constructor() {
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('cms.club')) this.refrescar();
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      sub.unsubscribe();
    });
  }

  async cargar(cid: string): Promise<void> {
    if (!this.auth.can(cid, 'web.editar')) {
      this.pendientes.set(0);
      return;
    }
    try {
      const l = await firstValueFrom(this.http.get<{ estado: string }[]>(`/api/admin/competiciones/${cid}/web/clubs`));
      this.pendientes.set(l.filter((c) => c.estado === 'pendiente').length);
    } catch {
      this.pendientes.set(0);
    }
  }

  /** Re-reads the count a moment after a club changes (the bus can fire several events at once). */
  refrescar(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const cid = this.comps.current()?.id;
      if (cid) void this.cargar(cid);
    }, 400);
  }
}
