import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { Campo, TipoCampo } from '../formulario-api';
import { esBloque, esGrupo } from '../formulario-reglas';
import { ctrlId } from './campo-base';
import { FormBloque } from './campo-bloque';
import { FormTexto } from './campo-texto';
import { FormOpciones } from './campo-opciones';
import { FormEscala, FormValoracion } from './campo-escala';
import { FormArchivo } from './campo-archivo';

const TEXTO_TIPOS: ReadonlySet<TipoCampo> = new Set(['texto_corto', 'texto_largo', 'email', 'telefono', 'numero', 'fecha']);
const OPCION_TIPOS: ReadonlySet<TipoCampo> = new Set(['opcion_unica', 'desplegable', 'casillas', 'seleccion_multiple', 'casilla', 'si_no']);
const ALIN_CSS: Record<string, string> = { izquierda: 'left', centro: 'center', derecha: 'right' };

/**
 * Un campo del formulario público: etiqueta (o leyenda si es un grupo), ayuda, control según el tipo y error.
 * Emite el valor nuevo y `salida` cuando el foco sale del campo (validación en vivo).
 */
@Component({
  selector: 'gr-form-campo',
  imports: [NgTemplateOutlet, GrIcon, FormBloque, FormTexto, FormOpciones, FormEscala, FormValoracion, FormArchivo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 scroll-mt-28', '[class.md:col-span-2]': 'completo()' },
  template: `
    @if (bloque()) {
      <gr-form-bloque [campo]="campo()" />
    } @else if (grupo()) {
      <fieldset class="flex min-w-0 flex-col gap-2.5 border-0 p-0" (focusout)="alSalir($event)">
        <ng-container *ngTemplateOutlet="contenido" />
      </fieldset>
    } @else {
      <div class="flex min-w-0 flex-col gap-2" (focusout)="alSalir($event)">
        <ng-container *ngTemplateOutlet="contenido" />
      </div>
    }

    <ng-template #contenido>
      @if (grupo()) {
        <legend class="mb-1 text-[16px] leading-snug font-semibold text-[var(--f-texto)]" [style.text-align]="alineacion()">{{ campo().etiqueta }}@if (campo().obligatorio) { <span class="text-accent-text" aria-hidden="true"> *</span> }</legend>
      } @else if (!esCasilla()) {
        <label [attr.for]="ctrl()" class="text-[16px] leading-snug font-semibold text-[var(--f-texto)]" [style.text-align]="alineacion()">{{ campo().etiqueta }}@if (campo().obligatorio) { <span class="text-accent-text" aria-hidden="true"> *</span> }</label>
      }
      @if (campo().ayuda) {
        <p [id]="'f-' + campo().id + '-ayuda'" class="text-[14px] leading-snug text-[color-mix(in_srgb,var(--f-texto)_70%,transparent)]" [style.text-align]="alineacion()">{{ campo().ayuda }}</p>
      }

      @if (esTexto()) {
        <gr-form-texto [campo]="campo()" [valor]="valor()" [error]="error()" (cambio)="cambio.emit($event)" />
      } @else if (esOpcion()) {
        <gr-form-opciones [campo]="campo()" [valor]="valor()" [error]="error()" (cambio)="cambio.emit($event)" />
      } @else if (esEscala()) {
        <gr-form-escala [campo]="campo()" [valor]="valor()" [error]="error()" (cambio)="cambio.emit($event)" />
      } @else if (esValoracion()) {
        <gr-form-valoracion [campo]="campo()" [valor]="valor()" [error]="error()" (cambio)="cambio.emit($event)" />
      } @else if (esArchivo()) {
        <gr-form-archivo [campo]="campo()" [valor]="valor()" [error]="error()" [subida]="subida()" (elegir)="elegirArchivos.emit($event)" (quitar)="quitarArchivo.emit($event)" (cancelar)="cancelarSubida.emit()" />
      }

      @if (error()) {
        <p [id]="'f-' + campo().id + '-error'" role="alert" class="flex items-start gap-1.5 text-[14px] leading-snug text-accent-text">
          <gr-icon name="circle-alert" [size]="16" class="mt-0.5" />{{ error() }}
        </p>
      }
    </ng-template>
  `,
})
export class FormCampo {
  readonly campo = input.required<Campo>();
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly subida = input<{ nombre: string; pct: number } | null>(null);

  readonly cambio = output<unknown>();
  /** El foco salió del campo entero: momento de validar en vivo. */
  readonly salida = output<void>();
  readonly elegirArchivos = output<File[]>();
  readonly quitarArchivo = output<string>();
  readonly cancelarSubida = output<void>();

  protected readonly ctrl = computed(() => ctrlId(this.campo()));
  protected readonly completo = computed(() => this.campo().ancho !== 'mitad');
  /** Alignment chosen in the editor for the question text (`estilo.alinear`). */
  protected readonly alineacion = computed(() => ALIN_CSS[this.campo().estilo?.alinear ?? 'izquierda'] ?? 'left');
  protected readonly bloque = computed(() => esBloque(this.campo().tipo));
  protected readonly grupo = computed(() => esGrupo(this.campo().tipo));
  protected readonly esCasilla = computed(() => this.campo().tipo === 'casilla');
  protected readonly esTexto = computed(() => TEXTO_TIPOS.has(this.campo().tipo));
  protected readonly esOpcion = computed(() => OPCION_TIPOS.has(this.campo().tipo));
  protected readonly esEscala = computed(() => this.campo().tipo === 'escala' || this.campo().tipo === 'deslizador');
  protected readonly esValoracion = computed(() => this.campo().tipo === 'valoracion');
  protected readonly esArchivo = computed(() => this.campo().tipo === 'archivo');

  /** Cierre de foco fuera del campo: el `focusout` de un hijo que pasa a otro hijo no cuenta. */
  protected alSalir(ev: FocusEvent): void {
    const destino = ev.relatedTarget;
    const dentro = destino instanceof Node && (ev.currentTarget as Node).contains(destino);
    if (!dentro) this.salida.emit();
  }
}
