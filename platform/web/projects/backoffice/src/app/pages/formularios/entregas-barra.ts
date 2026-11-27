import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CanalEstado } from './api';
import { PARTES_ENTREGA, resumenEntregas } from './formato';

/**
 * Stacked bar of one channel's delivery (enviados · en cola · fallidos · omitidos) with its text summary. Shared by the
 * Envíos table and the Estadísticas tab. The bar is decorative: the summary line carries the numbers.
 */
@Component({
  selector: 'bo-entregas-barra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col gap-1.5' },
  template: `
    <div class="flex h-2 gap-0.5 overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true">
      @for (p of partes(); track p.clave) {
        @if (p.pct > 0) { <span class="h-full rounded-pill" [class]="p.clase" [style.width.%]="p.pct"></span> }
      }
    </div>
    <p class="font-mono text-mono-xs text-text-tertiary">{{ resumen() }}</p>
  `,
})
export class BoEntregasBarra {
  readonly canal = input.required<CanalEstado>();
  protected readonly resumen = computed(() => resumenEntregas(this.canal()));
  /** Segment widths over the channel total (the sum of the parts when the total is missing). */
  protected readonly partes = computed(() => {
    const c = this.canal();
    const base = c.total || PARTES_ENTREGA.reduce((s, p) => s + c[p.clave], 0);
    return PARTES_ENTREGA.map((p) => ({ clave: p.clave, clase: p.clase, pct: base ? (c[p.clave] * 100) / base : 0 }));
  });
}
