import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Formulario } from './api';

/** PLACEHOLDER (F1): replaced by the Estadísticas agent. Keep the selector and the `formulario` input. */
@Component({
  selector: 'bo-form-estadisticas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="rounded-lg border border-dashed border-line-strong p-6 text-body-s text-text-tertiary">Estadísticas de «{{ formulario().nombre }}»: próximamente.</p>`,
})
export class BoFormEstadisticas {
  readonly formulario = input.required<Formulario>();
}
