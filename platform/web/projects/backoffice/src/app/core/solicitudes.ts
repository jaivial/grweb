import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Auth } from './auth';
import { Competitions } from './competitions';
import { Realtime } from './realtime';
import { SolicitudesApi, type Contadores } from '../pages/atletas/solicitudes-api';

/**
 * Live count of the athlete requests waiting for a review (Figma D3: the «Atletas» item of the menu
 * shows «8 pendientes de revisar» and goes up in real time when a request arrives).
 *
 * Pending = new + in review + minors without a signed authorisation (the same figures as the tabs).
 */
@Injectable({ providedIn: 'root' })
export class SolicitudesContador {
  private readonly api = inject(SolicitudesApi);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private readonly realtime = inject(Realtime);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly contadores = signal<Contadores | null>(null);
  readonly pendientes = computed(() => {
    const c = this.contadores();
    return c ? c.pendiente + c.revision + c.menor : 0;
  });

  constructor() {
    const sub = this.realtime.events.subscribe((e) => {
      if (e.tipo.startsWith('athletes.solicitud_')) this.refrescar();
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      sub.unsubscribe();
    });
  }

  /** Reads the counters of the given competition (only for teams that can review requests). */
  async cargar(cid: string): Promise<void> {
    if (!this.auth.can(cid, 'atletas.editar')) {
      this.contadores.set(null);
      return;
    }
    try {
      const l = await this.api.lista(cid, { estado: 'pendiente', pagina: 1 });
      this.contadores.set(l.contadores);
    } catch {
      this.contadores.set(null);
    }
  }

  /** Re-reads the counters a moment after a request changes (the bus fires several events at once). */
  refrescar(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const cid = this.compsId();
      if (cid) void this.cargar(cid);
    }, 400);
  }

  private compsId(): string {
    return this.comps.current()?.id ?? '';
  }
}
