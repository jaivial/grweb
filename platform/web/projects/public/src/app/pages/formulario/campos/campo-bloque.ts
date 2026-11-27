import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Campo } from '../formulario-api';
import { textoRico } from '../formulario-reglas';

const ALIN: Record<string, string> = { izquierda: 'text-left', centro: 'text-center', derecha: 'text-right' };

/** Bloques decorativos del formulario: título, párrafo, imagen y separador. No tienen respuesta. */
@Component({
  selector: 'gr-form-bloque',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @switch (campo().tipo) {
      @case ('titulo') {
        <h2 class="scroll-mt-28 leading-tight [font-family:var(--font-display)]"
          [class]="clase()" [style.color]="color()" [style.background-color]="fondo()" [innerHTML]="html()"></h2>
      }
      @case ('parrafo') {
        <p class="text-[16px] leading-relaxed text-[var(--f-texto)]" [class]="clase()" [innerHTML]="html()"></p>
      }
      @case ('imagen') {
        @if (imagenValida()) {
          <img [src]="campo().imagen" [alt]="campo().alt" loading="lazy" decoding="async" class="block h-auto w-full rounded-[var(--f-radio)]" />
        }
      }
      @case ('separador') {
        <hr class="border-t border-[color-mix(in_srgb,var(--f-texto)_18%,transparent)]" />
      }
    }
  `,
})
export class FormBloque {
  readonly campo = input.required<Campo>();

  protected readonly html = computed(() => textoRico(this.campo().etiqueta));
  protected readonly clase = computed(() => {
    const e = this.campo().estilo;
    const tam = e?.tamano === 's' ? 'text-[15px]' : e?.tamano === 'l' ? 'text-[20px]' : 'text-[17px]';
    const titulo = this.campo().tipo === 'titulo' ? (e?.tamano === 's' ? 'text-[22px]' : e?.tamano === 'l' ? 'text-[38px] md:text-[44px]' : 'text-[30px] md:text-[34px]') : '';
    return [ALIN[e?.alinear ?? 'izquierda'], tam, titulo, e?.negrita ? 'font-bold' : '', e?.borde ? 'border border-[color-mix(in_srgb,var(--f-texto)_18%,transparent)] p-4' : '', e?.fondo ? 'p-4' : ''].join(' ');
  });
  protected readonly color = computed(() => (/^#[0-9a-f]{6}$/i.test(this.campo().estilo?.color ?? '') ? this.campo().estilo.color : null));
  protected readonly fondo = computed(() => (/^#[0-9a-f]{6}$/i.test(this.campo().estilo?.fondo ?? '') ? this.campo().estilo.fondo : null));
  protected readonly imagenValida = computed(() => this.campo().imagen?.startsWith('https://') ?? false);
}
