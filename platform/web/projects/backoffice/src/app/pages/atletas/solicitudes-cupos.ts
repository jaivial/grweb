import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrInput, GrToasts } from '@grcup/ui';
import { Realtime } from '../../core/realtime';
import { errText } from '../../shared/ui';
import { SolicitudesApi, type CupoPrueba } from './solicitudes-api';

/** «Cupo por competición»: seats of the public sign-up form per competition, live occupied counts. */
@Component({
  selector: 'bo-solicitudes-cupos',
  imports: [FormsModule, GrButton, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
@if (cupos().length) {
  <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5" aria-labelledby="cupos-t">
    <div class="flex min-w-0 flex-col gap-1">
      <h2 id="cupos-t" class="text-ui-h5">Cupo por competición</h2>
      <p class="text-body-xs text-text-tertiary">Plazas del formulario de alta. Sin cupo propio se reparten las plazas totales entre las competiciones. Una competición llena se muestra «Completa» y no se puede elegir. 0 = sin límite.</p>
    </div>
    <!-- The quotas in order, on one row with their button (it wraps only when there is no room). -->
    <div class="flex flex-wrap items-end gap-4">
    @for (c of cupos(); track c.codigo) {
      <label class="flex w-36 flex-col gap-1.5">
        <span class="text-label-s">{{ c.nombre }} · {{ c.ocupadas }} {{ c.ocupadas === 1 ? 'ocupada' : 'ocupadas' }}</span>
        <input grInput type="number" min="0" max="100000" [disabled]="!puede()" [ngModel]="cupoEdit()[c.codigo]"
          (ngModelChange)="ponCupo(c.codigo, $event)" [attr.aria-describedby]="c.porDefecto ? 'cupo-def-' + c.codigo : null" />
        @if (c.porDefecto) { <span [id]="'cupo-def-' + c.codigo" class="text-body-xs text-text-tertiary">Por defecto</span> }
      </label>
    }
    @if (puede()) {
      <button grButton variant="secondary" type="button" [loading]="guardandoCupos()" [disabled]="guardandoCupos()" (click)="guardarCupos()">Guardar cupos</button>
    }
    </div>
  </section>
}
  `,
})
export class SolicitudesCupos {
  private readonly api = inject(SolicitudesApi);
  private readonly toasts = inject(GrToasts);
  private readonly live = inject(Realtime);
  readonly cid = input.required<string>();
  readonly puede = input(false);

  protected readonly cupos = signal<CupoPrueba[]>([]);
  protected readonly cupoEdit = signal<Record<string, number>>({});
  protected readonly guardandoCupos = signal(false);

  constructor() {
    effect(() => {
      if (this.cid() && this.puede()) untracked(() => void this.cargarCupos());
    });
    const sub = this.live.events.subscribe((e) => { if (e.tipo.startsWith('athletes.solicitud_')) void this.refrescarOcupadas(); });
    const rs = this.live.resync.subscribe(() => void this.refrescarOcupadas());
    inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); rs.unsubscribe(); });
  }


  private ponCupos(c: CupoPrueba[]): void {
    this.cupos.set(c);
    this.cupoEdit.set(Object.fromEntries(c.map((x) => [x.codigo, x.plazas])));
  }

  protected ponCupo(codigo: string, v: number | string): void {
    this.cupoEdit.update((m) => ({ ...m, [codigo]: Number(v) }));
  }

  async cargarCupos(): Promise<void> {
    if (!this.puede()) return;
    try {
      this.ponCupos((await this.api.cupos(this.cid())).cupos);
    } catch {
      this.cupos.set([]);
    }
  }

  /** Live (SSE): refresh only the occupied counts; keeps any unsaved quota the admin is typing. */
  private async refrescarOcupadas(): Promise<void> {
    if (!this.cid() || !this.puede()) return;
    try {
      this.cupos.set((await this.api.cupos(this.cid())).cupos);
    } catch {
      // keep the last known counts
    }
  }

  async guardarCupos(): Promise<void> {
    const v = this.cupoEdit();
    if (Object.values(v).some((n) => !Number.isInteger(n) || n < 0 || n > 100000)) {
      this.toasts.error('Cupo no válido', 'Escribe un número entero de plazas (0 o más).');
      return;
    }
    const bajo = this.cupos().find((c) => v[c.codigo] > 0 && v[c.codigo] < c.ocupadas);
    if (bajo) {
      this.toasts.error('Cupo demasiado bajo', `${bajo.nombre} ya tiene ${bajo.ocupadas} plazas ocupadas: el cupo no puede ser menor (o pon 0 = sin límite).`);
      return;
    }
    this.guardandoCupos.set(true);
    try {
      this.ponCupos((await this.api.guardarCupos(this.cid(), v)).cupos);
      this.toasts.success('Cupos guardados', 'El formulario de alta ya usa las plazas nuevas.');
    } catch (e) {
      this.toasts.error('No se pudieron guardar los cupos', errText(e));
    } finally {
      this.guardandoCupos.set(false);
    }
  }
}
