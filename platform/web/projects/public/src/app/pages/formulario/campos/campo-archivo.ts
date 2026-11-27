import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { I18n } from '../../../core/i18n';
import { ArchivoSubido, Campo } from '../formulario-api';
import { TEXTOS } from '../formulario-textos';
import { ctrlId, descrito } from './campo-base';
import { tamano, tiposLegibles } from '../formulario-reglas';

/** Subida de archivos: arrastrar y soltar o elegir, progreso, quitar y límites de tipo, tamaño y número. */
@Component({
  selector: 'gr-form-archivo',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (archivos().length) {
      <ul class="flex flex-col gap-2">
        @for (a of archivos(); track a.url) {
          <li class="flex items-center gap-3 rounded-[var(--f-radio)] border border-[color-mix(in_srgb,var(--f-texto)_22%,transparent)] bg-[var(--f-superficie)] py-2 pr-2 pl-3.5 text-[var(--f-texto)]">
            <gr-icon name="file-text" [size]="18" class="text-[var(--f-acento)]" />
            <span class="min-w-0 flex-1 truncate text-[15px]">{{ a.nombre }} <span class="text-[13px] opacity-70">({{ tam(a.tamano) }})</span></span>
            <button type="button" class="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--f-texto)_10%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--f-acento)] focus-visible:outline-none"
              [attr.aria-label]="t().quitar(a.nombre)" (click)="quitar.emit(a.url)">
              <gr-icon name="x" [size]="18" />
            </button>
          </li>
        }
      </ul>
    }
    @if (subida(); as s) {
      <div class="mt-2 flex flex-col gap-2 text-[14px] text-[var(--f-texto)]">
        <div class="flex justify-between gap-3"><span class="truncate">{{ t().subiendo(s.nombre) }}</span><span>{{ s.pct }} %</span></div>
        <div class="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--f-texto)_15%,transparent)]" role="progressbar"
          aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="s.pct" [attr.aria-label]="t().progreso">
          <div class="h-full rounded-full bg-[var(--f-acento)] transition-[width] duration-200 motion-reduce:transition-none" [style.width.%]="s.pct"></div>
        </div>
      </div>
    }
    @if (puedeSubir()) {
      <div class="mt-2 flex flex-col items-center gap-2 rounded-[var(--f-radio)] border border-dashed px-4 py-6 text-center text-[var(--f-texto)] transition-colors"
        [class]="arrastrando() ? 'border-[var(--f-acento)] bg-[color-mix(in_srgb,var(--f-acento)_8%,transparent)]' : error() ? 'border-accent-text' : 'border-[color-mix(in_srgb,var(--f-texto)_30%,transparent)]'"
        (dragover)="alArrastrar($event)" (dragleave)="arrastrando.set(false)" (drop)="alSoltar($event)">
        <button type="button" [id]="ctrl()" [disabled]="!!subida()"
          class="inline-flex min-h-11 items-center gap-2 rounded-[var(--f-radio)] bg-[var(--f-acento)] px-5 text-[15px] font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--f-acento)] focus-visible:outline-none disabled:opacity-50"
          [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (click)="entrada.click()">
          <gr-icon name="upload" [size]="18" />{{ maximo() > 1 ? t().elegirArchivos : t().elegirArchivo }}
        </button>
        <p class="text-[14px] opacity-80">{{ t().arrastra }}</p>
        <p class="text-[13px] opacity-70">{{ formatos() }}</p>
        <input #entrada type="file" class="sr-only" tabindex="-1" aria-hidden="true" [attr.accept]="accept()" [attr.multiple]="maximo() > 1 ? '' : null" (change)="alElegir($event)" />
      </div>
    } @else if (!subida()) {
      <p class="mt-2 text-[14px] text-[var(--f-texto)] opacity-80">{{ t().lleno }}</p>
    }
  `,
})
export class FormArchivo {
  readonly campo = input.required<Campo>();
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly subida = input<{ nombre: string; pct: number } | null>(null);
  readonly elegir = output<File[]>();
  readonly quitar = output<string>();

  protected readonly t = inject(I18n).dict(TEXTOS);
  protected readonly arrastrando = signal(false);

  protected readonly ctrl = computed(() => ctrlId(this.campo()));
  protected readonly descrito = computed(() => descrito(this.campo(), this.error()));
  protected readonly archivos = computed<ArchivoSubido[]>(() => (Array.isArray(this.valor()) ? (this.valor() as ArchivoSubido[]) : []));
  protected readonly maximo = computed(() => this.campo().archivo?.maxArchivos ?? 1);
  protected readonly puedeSubir = computed(() => this.archivos().length < this.maximo());
  protected readonly accept = computed(() => (this.campo().archivo?.tipos ?? []).join(','));
  protected readonly formatos = computed(() => {
    const cfg = this.campo().archivo;
    return this.t().formatos(tiposLegibles(cfg?.tipos ?? [], this.t().tipoImagen) || '—', cfg?.maxMb ?? 0);
  });

  protected tam(bytes: number): string {
    return tamano(bytes);
  }

  protected alElegir(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const lista = Array.from(el.files ?? []);
    el.value = '';
    if (lista.length) this.elegir.emit(lista);
  }

  protected alArrastrar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(true);
  }

  protected alSoltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    const lista = Array.from(ev.dataTransfer?.files ?? []);
    if (lista.length) this.elegir.emit(lista);
  }
}
