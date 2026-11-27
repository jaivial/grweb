import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../../core/i18n';
import { Campo } from '../formulario-api';
import { TEXTOS } from '../formulario-textos';
import { CLS_CONTROL, CLS_OPCION, claseBorde, ctrlId, descrito } from './campo-base';

/** Elecciones: opción única (radios), sí/no, desplegable, casilla, varias casillas y chips de selección múltiple. */
@Component({
  selector: 'gr-form-opciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @switch (campo().tipo) {
      @case ('desplegable') {
        <select [id]="ctrl()" [class]="clase()" [attr.aria-required]="campo().obligatorio || null" [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="alElegirSelect($event)">
          <option value="" [selected]="!valor()">{{ campo().placeholder || t().elige }}</option>
          @for (o of opciones(); track o.id) { <option [value]="o.id" [selected]="valor() === o.id">{{ o.texto }}</option> }
        </select>
      }
      @case ('casilla') {
        <label [class]="opcionClase()">
          <input type="checkbox" [id]="ctrl()" class="size-5 shrink-0 accent-[var(--f-acento)]" [checked]="valor() === true"
            [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="cambio.emit(marcado($event))" />
          <span class="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">{{ campo().etiqueta }}@if (campo().obligatorio) { <span class="text-accent-text" aria-hidden="true"> *</span> }</span>
        </label>
      }
      @case ('si_no') {
        <div class="grid gap-2 sm:grid-cols-2">
          @for (o of siNo(); track o.v) {
            <label [class]="opcionClase()">
              <input type="radio" class="size-5 shrink-0 accent-[var(--f-acento)]" [name]="ctrl()" [id]="$first ? ctrl() : null" [checked]="valor() === o.v"
                [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="cambio.emit(o.v)" />
              <span>{{ o.texto }}</span>
            </label>
          }
        </div>
      }
      @case ('opcion_unica') {
        <div class="flex flex-col gap-2">
          @for (o of opciones(); track o.id) {
            <label [class]="opcionClase()">
              <input type="radio" class="size-5 shrink-0 accent-[var(--f-acento)]" [name]="ctrl()" [id]="$first ? ctrl() : null" [value]="o.id" [checked]="valor() === o.id"
                [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="cambio.emit(o.id)" />
              <span class="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">{{ o.texto }}</span>
            </label>
          }
        </div>
      }
      @case ('casillas') {
        <div class="flex flex-col gap-2">
          @for (o of opciones(); track o.id) {
            <label [class]="opcionClase()">
              <input type="checkbox" class="size-5 shrink-0 accent-[var(--f-acento)]" [id]="$first ? ctrl() : null" [checked]="marcadas().has(o.id)"
                [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="alternar(o.id, marcado($event))" />
              <span class="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">{{ o.texto }}</span>
            </label>
          }
        </div>
      }
      @case ('seleccion_multiple') {
        <div class="flex flex-wrap gap-2">
          @for (o of opciones(); track o.id) {
            <label class="relative inline-flex cursor-pointer">
              <input type="checkbox" class="peer sr-only" [id]="$first ? ctrl() : null" [checked]="marcadas().has(o.id)"
                [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="alternar(o.id, marcado($event))" />
              <span class="inline-flex min-h-11 items-center rounded-full border bg-[var(--f-superficie)] px-4 text-[15px] font-medium text-[var(--f-texto)] transition-colors duration-150 peer-checked:border-[var(--f-acento)] peer-checked:bg-[var(--f-acento)] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--f-acento)] motion-reduce:transition-none"
                [class]="error() ? 'border-accent-text' : 'border-[color-mix(in_srgb,var(--f-texto)_22%,transparent)]'">{{ o.texto }}</span>
            </label>
          }
        </div>
      }
    }
  `,
})
export class FormOpciones {
  readonly campo = input.required<Campo>();
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly cambio = output<unknown>();

  protected readonly t = inject(I18n).dict(TEXTOS);
  protected readonly ctrl = computed(() => ctrlId(this.campo()));
  protected readonly descrito = computed(() => descrito(this.campo(), this.error()));
  protected readonly opciones = computed(() => this.campo().opciones ?? []);
  protected readonly opcionClase = computed(() => `${CLS_OPCION} ${claseBorde(!!this.error())}`);
  protected readonly clase = computed(() => `${CLS_CONTROL} ${claseBorde(!!this.error())} h-12`);
  protected readonly siNo = computed(() => [
    { v: true, texto: this.t().si },
    { v: false, texto: this.t().no },
  ]);
  protected readonly marcadas = computed(() => new Set(Array.isArray(this.valor()) ? (this.valor() as string[]) : []));

  protected marcado(ev: Event): boolean {
    return (ev.target as HTMLInputElement).checked;
  }

  protected alElegirSelect(ev: Event): void {
    this.cambio.emit((ev.target as HTMLSelectElement).value);
  }

  /** Varias casillas: se emite la lista en el orden de las opciones del campo. */
  protected alternar(id: string, on: boolean): void {
    const set = new Set(this.marcadas());
    if (on) set.add(id);
    else set.delete(id);
    this.cambio.emit(this.opciones().map((o) => o.id).filter((x) => set.has(x)));
  }
}
