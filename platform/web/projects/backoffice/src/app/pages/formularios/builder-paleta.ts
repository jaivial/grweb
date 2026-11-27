import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GrIcon, type GrIconName } from '@grcup/ui';
import type { Campo, TipoCampo } from './api';
import { GRUPOS_ELEMENTOS, infoTipo } from './catalogo';

/** Id of the canvas drop list (formulario-render) that palette items drop into. */
export const LIENZO_ID = 'fz-lienzo';
/** Id of this panel's palette drop list (drag source). */
export const PALETA_ID = 'fz-paleta';

/**
 * Left panel of the builder: the palette of the 20 element types (drag to the canvas, or click to add after the
 * selection) and the layers list (the same fields as the canvas, selectable and reorderable by drag).
 */
@Component({
  selector: 'bo-builder-paleta',
  imports: [CdkDrag, CdkDropList, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="fz-paleta-titulo">
      <h2 id="fz-paleta-titulo" class="mb-2 text-label-s text-text-secondary">Elementos</h2>
      <div [id]="paletaId" cdkDropList [cdkDropListConnectedTo]="[lienzoId]" [cdkDropListSortingDisabled]="true" [cdkDropListDisabled]="!editable()" class="flex flex-col gap-3">
        @for (g of grupos; track g.grupo) {
          <div>
            <p class="mb-1.5 font-mono text-[11px] tracking-[0.04em] text-text-muted uppercase">{{ g.grupo }}</p>
            <div class="grid grid-cols-2 gap-1.5">
              @for (t of g.tipos; track t.tipo) {
                <button type="button" cdkDrag [cdkDragData]="t.tipo" [cdkDragDisabled]="!editable()" (click)="add.emit(t.tipo)" [disabled]="!editable()"
                  class="flex h-[60px] cursor-grab flex-col items-center justify-center gap-1 rounded-md border border-line-subtle bg-bg-raised/40 text-[12px] text-text-secondary transition-colors hover:border-[#7c5cff]/60 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[#7c5cff] disabled:opacity-40 motion-reduce:transition-none"
                  [attr.aria-label]="'Añadir ' + t.label">
                  <gr-icon [name]="t.icon" [size]="16" class="text-text-tertiary" />
                  <span class="line-clamp-2 max-w-full px-1 text-center leading-tight" [attr.title]="t.label">{{ t.label }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </section>

    <section class="mt-5 border-t border-line-subtle pt-4" aria-labelledby="fz-capas-titulo">
      <h2 id="fz-capas-titulo" class="mb-2 flex items-center justify-between text-label-s text-text-secondary"><span>Capas</span><span class="font-mono text-mono-xs text-text-muted">{{ campos().length }}</span></h2>
      <ul id="fz-capas" cdkDropList [cdkDropListDisabled]="!editable()" (cdkDropListDropped)="reordenar.emit($event)" class="flex flex-col gap-0.5" role="listbox" aria-label="Capas del formulario">
        @for (c of campos(); track c.id) {
          <li cdkDrag [cdkDragData]="c.id" [cdkDragDisabled]="!editable()" role="option" [attr.aria-selected]="seleccion() === c.id">
            <button type="button" (click)="seleccionar.emit(c.id)" class="flex h-8 w-full items-center gap-2 rounded-xs border px-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[#7c5cff]"
              [class]="seleccion() === c.id ? 'border-transparent bg-[#7c5cff]/20 text-text-primary' : 'border-transparent text-text-secondary hover:bg-bg-raised'">
              <gr-icon name="grip" [size]="12" class="shrink-0 text-text-muted" />
              <gr-icon [name]="icono(c)" [size]="14" class="shrink-0 text-text-tertiary" />
              <span class="min-w-0 flex-1 truncate">{{ c.etiqueta || tipoLabel(c.tipo) }}</span>
              @if (c.obligatorio) { <span class="shrink-0 text-[11px] text-accent-text">*</span> }
            </button>
          </li>
        } @empty {
          <li class="px-2 py-2 text-body-xs text-text-tertiary">Sin elementos todavía.</li>
        }
      </ul>
    </section>
  `,
})
export class BoBuilderPaleta {
  readonly campos = input.required<Campo[]>();
  readonly seleccion = input<string | null>(null);
  readonly editable = input(true);
  readonly add = output<TipoCampo>();
  readonly seleccionar = output<string>();
  readonly reordenar = output<CdkDragDrop<unknown>>();
  protected readonly grupos = GRUPOS_ELEMENTOS;
  protected readonly lienzoId = LIENZO_ID;
  protected readonly paletaId = PALETA_ID;

  protected icono(c: Campo): GrIconName {
    return infoTipo(c.tipo).icon;
  }

  protected tipoLabel(t: TipoCampo): string {
    return infoTipo(t).label;
  }
}
