import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Campo } from '../formulario-api';
import { CLS_CONTROL, claseBorde, ctrlId, descrito } from './campo-base';

/** Campos de texto de una línea o párrafo, correo, teléfono, número y fecha. Solo emite el valor; el contenedor gestiona el foco. */
@Component({
  selector: 'gr-form-texto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (campo().tipo === 'texto_largo') {
      <textarea [id]="ctrl()" rows="4" [class]="clase()" [placeholder]="campo().placeholder || ''"
  [attr.maxlength]="maxLargo()" [attr.aria-required]="campo().obligatorio || null"
        [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()"
        [value]="texto()" (input)="alEscribir($event)"></textarea>
    } @else {
      <input [id]="ctrl()" [type]="tipoInput()" [class]="clase()" [placeholder]="campo().placeholder || ''"
        [attr.autocomplete]="autocompletado()" [attr.inputmode]="modo()"
        [attr.min]="campo().tipo === 'numero' ? campo().min : null" [attr.max]="campo().tipo === 'numero' ? campo().max : null"
        [attr.step]="campo().tipo === 'numero' ? (campo().paso ?? 'any') : null"
        [attr.maxlength]="campo().tipo === 'numero' || campo().tipo === 'fecha' ? null : maxLargo()"
        [attr.aria-required]="campo().obligatorio || null" [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()"
        [value]="texto()" (input)="alEscribir($event)" />
    }
  `,
})
export class FormTexto {
  readonly campo = input.required<Campo>();
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly cambio = output<string | number | null>();

  protected readonly ctrl = computed(() => ctrlId(this.campo()));
  protected readonly descrito = computed(() => descrito(this.campo(), this.error()));
  /** Longitud máxima del esquema (si la hay); el campo puede venir sin bloque de validación. */
  protected readonly maxLargo = computed(() => this.campo().validacion?.maxLargo ?? null);
  protected readonly clase = computed(() => {
    const base = CLS_CONTROL + ' ' + claseBorde(!!this.error());
    return this.campo().tipo === 'texto_largo' ? base + ' min-h-28 py-3' : base + ' h-12';
  });
  protected readonly tipoInput = computed(() => {
    switch (this.campo().tipo) {
      case 'email': return 'email';
      case 'telefono': return 'tel';
      case 'numero': return 'number';
      case 'fecha': return 'date';
      default: return 'text';
    }
  });
  protected readonly autocompletado = computed(() => (this.campo().tipo === 'email' ? 'email' : this.campo().tipo === 'telefono' ? 'tel' : null));
  protected readonly modo = computed(() => (this.campo().tipo === 'numero' ? 'decimal' : null));
  protected readonly texto = computed(() => {
    const v = this.valor();
    return typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '';
  });

  protected alEscribir(ev: Event): void {
    const valor = (ev.target as HTMLInputElement).value;
    if (this.campo().tipo === 'numero') this.cambio.emit(valor === '' ? null : Number(valor));
    else this.cambio.emit(valor);
  }
}
