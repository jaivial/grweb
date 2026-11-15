import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { GrSelect } from '@grcup/ui';

export interface BoOption {
  value: string;
  label: string;
  disabled?: boolean;
}

let seq = 0;

/**
 * Figma 48 «BO / Select» with its label and error: a labelled `gr-select` (menu on desktop, bottom sheet on phones).
 * No native `<select>` anywhere in the backoffice.
 */
@Component({
  selector: 'bo-select',
  imports: [GrSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex flex-col gap-2' },
  template: `
    <label [attr.for]="id" class="text-label-s" [class]="disabled() ? 'text-text-muted' : 'text-text-secondary'">{{ label() }}</label>
    <gr-select [id]="id" [value]="value() ?? ''" (valorChange)="value.set($event)" [invalido]="!!error()" [etiqueta]="label()" [class.pointer-events-none]="disabled()" [class.opacity-50]="disabled()">
      @if (!value()) { <option value="" hidden>{{ placeholder() }}</option> }
      @for (o of options(); track o.value) { <option [value]="o.value" [disabled]="o.disabled">{{ o.label }}</option> }
    </gr-select>
    @if (error()) { <p class="text-body-xs text-error" role="alert">{{ error() }}</p> }
  `,
})
export class BoSelect {
  readonly value = model<string | null>(null);
  readonly label = input.required<string>();
  readonly options = input.required<BoOption[]>();
  readonly placeholder = input('Selecciona…');
  readonly disabled = input(false);
  readonly error = input<string | null>(null);
  /** Kept for the catalogue («Open» state); the menu opens on click. */
  readonly expanded = input(false);
  protected readonly id = `bo-select-${++seq}`;
}
