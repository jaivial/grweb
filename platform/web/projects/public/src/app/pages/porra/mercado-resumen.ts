/**
 * porra/mercado-resumen.ts — resumen de un mercado de porra (Figma «En vivo»): el bote, los tres atletas más apostados
 * con su cuota en vivo y «Ver más» para el resto. Lo usan /porra («En vivo») y la pestaña Porra del directo.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, type Lang } from '../../core/i18n';
import type { Mercado } from '../../core/juegos';
import { OddsRow } from './componentes';
import { monedas } from './formato';
import { kg, sexoTxt } from './ranking';

/** Atletas por mercado que se ven antes de «Ver más». */
const TOP = 3;

const T = {
  es: {
    bote: 'bote',
    sinAtletas: 'Todavía no hay atletas en este mercado.',
    verMas: (n: number) => `Ver más (${n})`,
    verMenos: 'Ver menos',
  },
  en: {
    bote: 'pot',
    sinAtletas: 'There are no athletes in this market yet.',
    verMas: (n: number) => `See more (${n})`,
    verMenos: 'See less',
  },
};

/** La etiqueta de un mercado: «Masculino · −83 kg» en las categorías de peso; el título en los demás. */
export function etiquetaDeMercado(m: Mercado, lang: Lang): string {
  return m.tipo === 'categoria' ? sexoTxt(m.sexo, lang) + ' · ' + kg(m.categoria) : m.titulo;
}

@Component({
  selector: 'gr-mercado-resumen',
  imports: [OddsRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto flex w-full max-w-lg flex-col gap-1 border-b border-line-subtle pb-4" [attr.aria-labelledby]="'vivo-' + mercado().id">
      <h2 [id]="'vivo-' + mercado().id" class="flex items-center justify-between gap-3 text-label-m text-text-primary">
        <span>{{ etiqueta() }}</span>
        <span class="font-mono text-[12px] font-normal text-text-secondary">{{ t().bote }} {{ monedas(mercado().bote) }}</span>
      </h2>
      @if (filas().length) {
        <ul class="flex flex-col" [attr.id]="'vivo-lista-' + mercado().id">
          @for (f of visibles(); track f.opcion.atletaId) {
            <li><gr-odds-row [opcion]="f.opcion" [bote]="mercado().bote" [total]="mercado().bote" [lider]="f.pos === 0 && f.opcion.apostado > 0" [activo]="false" /></li>
          }
        </ul>
        @if (filas().length > tope) {
          <button type="button" class="mt-1 min-h-11 self-start px-1 text-label-s text-accent-text" [attr.aria-expanded]="expandido()" [attr.aria-controls]="'vivo-lista-' + mercado().id"
            (click)="expandido.set(!expandido())">{{ expandido() ? t().verMenos : t().verMas(filas().length - tope) }}</button>
        }
      } @else {
        <p class="py-3 text-body-s text-text-tertiary">{{ t().sinAtletas }}</p>
      }
    </section>
  `,
})
export class MercadoResumen {
  readonly mercado = input.required<Mercado>();
  /** La etiqueta del mercado (la de su categoría o su título). */
  readonly etiqueta = input.required<string>();
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.locale());
  protected readonly tope = TOP;
  /** «Ver más» abierto. */
  protected readonly expandido = signal(false);

  /** Todos los atletas del mercado, del más apostado al menos (empate: por nombre). */
  protected readonly filas = computed(() => {
    const m = this.mercado();
    const lang = this.i18n.lang();
    return [...m.opciones]
      .sort((a, b) => b.apostado - a.apostado || a.nombre.localeCompare(b.nombre, 'es'))
      .map((o, pos) => ({ pos, opcion: { ...o, sexoTxt: sexoTxt(m.sexo, lang), categoria: m.tipo === 'categoria' ? kg(m.categoria) : '' } }));
  });
  /** Los que se ven: los tres primeros, o todos con «Ver más». */
  protected readonly visibles = computed(() => (this.expandido() ? this.filas() : this.filas().slice(0, TOP)));
}
