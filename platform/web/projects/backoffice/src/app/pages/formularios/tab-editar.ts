import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GrIcon, GrSegmented } from '@grcup/ui';
import type { Campo, TipoCampo } from './api';
import { BoBuilderPaleta, PALETA_ID } from './builder-paleta';
import { BoFormularioRender, type AccionCampo } from './formulario-render';
import { BoIaFormulario } from './ia-formulario';
import { BoInspectorAjustes } from './inspector-ajustes';
import { BoInspectorCampo } from './inspector-campo';
import { FormularioStore } from './store';

/**
 * «Editar» tab (Figma-like builder): palette and layers on the left, the live form in the centre, the inspector or the
 * AI assistant on the right. Translates drag, click and toolbar events into store operations; the store does the work.
 */
@Component({
  selector: 'bo-tab-editar',
  imports: [BoBuilderPaleta, BoFormularioRender, BoInspectorCampo, BoInspectorAjustes, BoIaFormulario, GrIcon, GrSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = store.draft();
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2 rounded-md border border-line-subtle bg-bg-card p-1.5">
        <gr-segmented [options]="anchos" [value]="ancho()" (valueChange)="ancho.set($any($event))" label="Ancho de vista" />
        <span class="flex-1"></span>
        <button type="button" class="flex size-9 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-30" [disabled]="!store.puedeDeshacer()" (click)="store.deshacer()" aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)"><gr-icon name="undo" [size]="16" /></button>
        <button type="button" class="flex size-9 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-30" [disabled]="!store.puedeRehacer()" (click)="store.rehacer()" aria-label="Rehacer (Ctrl+Y)" title="Rehacer (Ctrl+Y)"><gr-icon name="redo" [size]="16" /></button>
        <button type="button" class="flex h-9 items-center gap-1.5 rounded-sm px-3 text-label-s" [attr.aria-pressed]="iaAbierta()" [class]="iaAbierta() ? 'bg-text-primary text-bg-base' : 'text-text-secondary hover:bg-bg-raised'" (click)="iaAbierta.set(!iaAbierta())"><gr-icon name="sparkles" [size]="14" />Asistente IA</button>
      </div>

      @if (b) {
        <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
          <aside class="order-2 h-fit min-w-0 rounded-lg border border-line-subtle bg-bg-card p-3 lg:sticky lg:top-20 lg:order-none" aria-label="Elementos y capas">
            <bo-builder-paleta [campos]="b.esquema.campos" [seleccion]="store.seleccion()" (add)="anadir($event)" (seleccionar)="store.seleccionar($event)" (reordenar)="reordenarCapas($event)" />
          </aside>

          <section class="order-1 min-w-0 rounded-lg border border-line-subtle bg-[#ece7e7] p-4 lg:order-none" aria-label="Lienzo del formulario" (click)="onLienzoClic($event)">
            <p class="mb-3 text-center text-mono-xs text-[#7a7072]">{{ ancho() === 'escritorio' ? 'ESCRITORIO · 640 PX' : 'MÓVIL · 390 PX' }}</p>
            <bo-formulario-render [esquema]="b.esquema" [escritorio]="ancho() === 'escritorio'" [edicion]="true" [seleccion]="store.seleccion()" [conectadoA]="[paletaId]"
              (seleccionar)="store.seleccionar($event)" (soltar)="soltar($event)" (accion)="accion($event)" />
          </section>

          <aside class="order-3 h-fit min-w-0 rounded-lg border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-20 lg:order-none" aria-label="Propiedades">
            @if (iaAbierta()) {
              <bo-ia-formulario (cerrar)="iaAbierta.set(false)" />
            } @else if (sel(); as c) {
              <bo-inspector-campo [campo]="c" />
            } @else {
              <bo-inspector-ajustes [borrador]="b" />
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class FormularioTabEditar {
  protected readonly store = inject(FormularioStore);
  protected readonly ancho = signal<'escritorio' | 'movil'>('escritorio');
  protected readonly iaAbierta = signal(false);
  protected readonly anchos = [
    { value: 'escritorio', label: 'Escritorio' },
    { value: 'movil', label: 'Móvil' },
  ];
  protected readonly paletaId = PALETA_ID;
  protected readonly sel = computed<Campo | null>(() => this.store.campoSeleccionado());

  protected anadir(tipo: TipoCampo): void {
    this.store.anadir(tipo);
  }

  /** Palette item dropped on the canvas → new field at that position; canvas item → moved. */
  protected soltar(ev: CdkDragDrop<Campo[]>): void {
    if (ev.previousContainer === ev.container) {
      this.store.moverA((ev.item.data as Campo).id, ev.currentIndex);
    } else if (ev.previousContainer.id === PALETA_ID) {
      this.store.anadir(ev.item.data as TipoCampo, ev.currentIndex);
    }
  }

  protected reordenarCapas(ev: CdkDragDrop<unknown>): void {
    if (ev.previousIndex === ev.currentIndex) return;
    this.store.moverA(ev.item.data as string, ev.currentIndex);
  }

  /** Mini toolbar of the selected field. */
  protected accion(ev: { tipo: AccionCampo; id: string }): void {
    const campos = this.store.campos();
    const i = campos.findIndex((c) => c.id === ev.id);
    switch (ev.tipo) {
      case 'duplicar': this.store.duplicar(ev.id); break;
      case 'borrar': this.store.borrar(ev.id); break;
      case 'subir': if (i > 0) this.store.moverA(ev.id, i - 1); break;
      case 'bajar': if (i >= 0 && i < campos.length - 1) this.store.moverA(ev.id, i + 1); break;
    }
  }

  /** Clicks on the empty canvas area clear the selection. */
  protected onLienzoClic(ev: Event): void {
    if ((ev.target as HTMLElement).closest('[role="button"], [role="toolbar"], button, input, textarea, select')) return;
    this.store.seleccionar(null);
  }
}
