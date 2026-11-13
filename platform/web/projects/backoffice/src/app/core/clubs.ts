import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { Competitions } from './competitions';
import { Realtime } from './realtime';

/** Live count of the requests of a cms collection waiting for a review (the menu item shows it), refreshed by SSE. */
abstract class ContadorCms {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly pendientes = signal(0);

  /** SSE prefix of the collection events, its admin path under /api/admin/competiciones/{cid} and the pending states. */
  constructor(private readonly prefijo: string, private readonly ruta: string, private readonly estados: string[]) {
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith(this.prefijo)) this.refrescar();
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
      const l = await firstValueFrom(this.http.get<{ estado: string }[]>(`/api/admin/competiciones/${cid}/${this.ruta}`));
      this.pendientes.set(l.filter((c) => this.estados.includes(c.estado)).length);
    } catch {
      this.pendientes.set(0);
    }
  }

  /** Re-reads the count a moment after a change (the bus can fire several events at once). */
  refrescar(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const cid = this.comps.current()?.id;
      if (cid) void this.cargar(cid);
    }, 400);
  }
}

/** Figma 67: the «Clubs» item of the menu shows the pending club requests. */
@Injectable({ providedIn: 'root' })
export class ClubsContador extends ContadorCms {
  constructor() { super('cms.club', 'web/clubs', ['pendiente']); }
}

/** Figma 68: the «Voluntarios» item of the menu shows the requests still to review (new or in review). */
@Injectable({ providedIn: 'root' })
export class VoluntariosContador extends ContadorCms {
  constructor() { super('cms.voluntario', 'voluntarios', ['pendiente', 'revision']); }
}
