import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CampoEstadistica } from './api';
import { porcentaje } from './formato';

/**
 * One question of «Resultados por pregunta»: option choices as horizontal bars (n and %), the mean for numeric fields,
 * and the count of answers for free text. Percentages are over the answers to that question.
 */
@Component({
  selector: 'bo-resultados-campo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-md border border-line-subtle bg-bg-card p-4' },
  template: `
    <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
      <h3 class="min-w-0 text-label-m break-words">{{ campo().etiqueta }}</h3>
      <span class="shrink-0 text-body-xs text-text-tertiary">{{ respuestas() }}</span>
    </div>

    @if (campo().opciones?.length) {
      @if (campo().respondidas) {
        <ul class="flex flex-col gap-2.5">
          @for (o of campo().opciones; track o.id) {
            <li class="flex flex-col gap-1">
              <div class="flex items-baseline justify-between gap-3 text-body-s">
                <span class="min-w-0 break-words text-text-secondary">{{ o.texto }}</span>
                <span class="shrink-0 font-mono text-mono-xs tabular-nums text-text-tertiary">{{ o.n }} · {{ pct(o.n) }} %</span>
              </div>
              <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true"><span class="block h-full rounded-pill bg-accent" [style.width.%]="pct(o.n)"></span></span>
            </li>
          }
        </ul>
      } @else { <p class="text-body-s text-text-tertiary">Aún sin respuestas.</p> }
    } @else if (campo().media !== undefined) {
      <p class="flex items-baseline gap-2"><span class="font-sans text-[32px] leading-none font-bold tabular-nums">{{ media() }}</span><span class="text-body-xs text-text-tertiary">media de {{ campo().respondidas }} {{ campo().respondidas === 1 ? 'respuesta' : 'respuestas' }}</span></p>
    } @else if (campo().tipo === 'archivo') {
      <p class="text-body-s text-text-tertiary">{{ campo().respondidas }} {{ campo().respondidas === 1 ? 'archivo' : 'archivos' }}</p>
    } @else {
      <p class="text-body-s text-text-tertiary">{{ campo().respondidas }} {{ campo().respondidas === 1 ? 'respuesta de texto' : 'respuestas de texto' }}</p>
    }
  `,
})
export class BoResultadosCampo {
  readonly campo = input.required<CampoEstadistica>();
  private readonly nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  protected readonly respuestas = computed(() => {
    const n = this.campo().respondidas;
    return `${n} ${n === 1 ? 'respuesta' : 'respuestas'}`;
  });
  protected readonly media = computed(() => this.nf.format(this.campo().media ?? 0));
  /** Share of this question's answers (a choice is counted once per answer, so this can exceed 100 % only on multi-choice). */
  protected pct(n: number): number {
    return porcentaje(n, this.campo().respondidas);
  }
}
