import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Formulario } from './api';

/** PLACEHOLDER (F1): replaced by the Atletas agent. Keep the selector and the `formulario` input. */
@Component({
  selector: 'bo-form-atletas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="rounded-lg border border-dashed border-line-strong p-6 text-body-s text-text-tertiary">Respuestas por atleta de «{{ formulario().nombre }}»: próximamente.</p>`,
})
export class BoFormAtletas {
  readonly formulario = input.required<Formulario>();
}
