import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import type { Campo, Esquema } from './api';
import { BoCampoRender } from './campo-render';
import { temaVariables } from './esquema';
import { textoHtml } from './texto';

export type AccionCampo = 'duplicar' | 'subir' | 'bajar' | 'borrar';

/**
 * The form as a page: title, description, fields in their row layout and the submit button, with the theme applied
 * as CSS variables. Two uses: the editor canvas (`edicion`: fields drag to reorder, click to select, mini toolbar on
 * the selected one; palette drops land in `#fz-lienzo`) and the web preview (`interactivo`, with `valores`/`errores`).
 * «mitad» fields share a row on desktop; on phones and on the 390 px canvas every field takes the full width.
 */
@Component({
  selector: 'bo-formulario-render',
  imports: [CdkDrag, CdkDropList, GrIcon, BoCampoRender],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let aj = esquema().ajustes;
    <div class="relative mx-auto flex w-full flex-col gap-[var(--f-gap)] rounded-[var(--f-radio)] bg-[var(--f-fondo)] p-[calc(var(--f-pad)*2)] text-[var(--f-texto)] [font-family:var(--f-fuente)]"
      [style]="vars()" [style.max-width.px]="escritorio() ? 640 : 390">
      <header class="flex flex-col gap-2">
        <h1 class="text-[26px] leading-[32px] font-bold tracking-tight [overflow-wrap:anywhere]">{{ aj.titulo || 'Sin título' }}</h1>
        @if (aj.descripcion) { <p class="text-[15px] leading-relaxed opacity-80 [overflow-wrap:anywhere]" [innerHTML]="descripcion()"></p> }
      </header>

      <div id="fz-lienzo" cdkDropList [cdkDropListData]="esquema().campos" [cdkDropListDisabled]="!edicion()" [cdkDropListConnectedTo]="conectadoA()" cdkDropListOrientation="mixed"
        (cdkDropListDropped)="soltar.emit($event)" class="flex min-h-24 flex-wrap items-start gap-[var(--f-gap)]">
        @for (c of esquema().campos; track c.id) {
          <div cdkDrag [cdkDragData]="c" [cdkDragDisabled]="!edicion()" class="relative min-w-0 rounded-[calc(var(--f-radio)+6px)] [&.cdk-drag-placeholder]:opacity-30"
            [class]="claseCampo(c)" [class.pt-10]="edicion() && seleccion() === c.id" [attr.role]="edicion() ? 'button' : null" [attr.tabindex]="edicion() ? 0 : null" [attr.aria-pressed]="edicion() ? seleccion() === c.id : null"
            [attr.aria-label]="edicion() ? 'Elemento: ' + (c.etiqueta || c.tipo) : null"
            (click)="pulsar(c.id)" (keydown.enter)="pulsar(c.id)" (keydown.space)="pulsar(c.id, $event)">
            <div class="relative" [class.pointer-events-none]="edicion()">
              <bo-campo-render [campo]="c" [valor]="valores()[c.id]" [error]="errores()[c.id] ?? null" [interactivo]="interactivo()" (valorCambia)="valorCambia.emit({ id: c.id, valor: $event })" />
            </div>
            @if (edicion() && seleccion() === c.id) {
              <div class="absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-sm border border-line-strong bg-bg-raised p-0.5 text-text-primary shadow-card" role="toolbar" aria-label="Acciones del elemento" (click)="$event.stopPropagation()">
                <button type="button" class="flex size-8 items-center justify-center rounded-xs hover:bg-bg-hover" (click)="accion.emit({ tipo: 'duplicar', id: c.id })" aria-label="Duplicar"><gr-icon name="copy" [size]="14" /></button>
                <button type="button" class="flex size-8 items-center justify-center rounded-xs hover:bg-bg-hover disabled:opacity-30" [disabled]="$first" (click)="accion.emit({ tipo: 'subir', id: c.id })" aria-label="Subir"><gr-icon name="arrow-up" [size]="14" /></button>
                <button type="button" class="flex size-8 items-center justify-center rounded-xs hover:bg-bg-hover disabled:opacity-30" [disabled]="$last" (click)="accion.emit({ tipo: 'bajar', id: c.id })" aria-label="Bajar"><gr-icon name="arrow-down" [size]="14" /></button>
                <button type="button" class="flex size-8 items-center justify-center rounded-xs text-error hover:bg-bg-hover" (click)="accion.emit({ tipo: 'borrar', id: c.id })" aria-label="Borrar"><gr-icon name="trash" [size]="14" /></button>
              </div>
            }
          </div>
        } @empty {
          <p class="flex w-full items-center justify-center rounded-[var(--f-radio)] border border-dashed border-[color-mix(in_srgb,var(--f-texto)_30%,transparent)] px-4 py-10 text-center text-[14px] opacity-70">
            {{ edicion() ? 'Arrastra un elemento aquí o pulsa uno de la paleta' : 'Este formulario todavía no tiene preguntas' }}
          </p>
        }
      </div>

      <div class="pt-[var(--f-gap)]">
        <button type="button" class="flex h-12 w-full items-center justify-center rounded-[var(--f-radio)] bg-[var(--f-acento)] text-[16px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f-acento)]"
          [class.pointer-events-none]="edicion()" [attr.tabindex]="edicion() ? -1 : null">{{ aj.botonEnviar || 'Enviar' }}</button>
      </div>
    </div>
  `,
})
export class BoFormularioRender {
  readonly esquema = input.required<Esquema>();
  readonly escritorio = input(true);
  /** Canvas mode: drag, select and the mini toolbar. */
  readonly edicion = input(false);
  /** Web preview mode: the fields take answers. */
  readonly interactivo = input(false);
  readonly seleccion = input<string | null>(null);
  readonly valores = input<Record<string, unknown>>({});
  readonly errores = input<Record<string, string>>({});
  readonly conectadoA = input<string[]>([]);
  readonly seleccionar = output<string | null>();
  readonly soltar = output<CdkDragDrop<Campo[]>>();
  readonly valorCambia = output<{ id: string; valor: unknown }>();
  readonly accion = output<{ tipo: AccionCampo; id: string }>();

  protected readonly vars = computed(() => temaVariables(this.esquema().ajustes.tema));
  protected readonly descripcion = computed(() => textoHtml(this.esquema().ajustes.descripcion));

  /** Width and selection classes of one field wrapper. */
  protected claseCampo(c: Campo): string {
    const ancho = !this.escritorio() || c.ancho !== 'mitad' ? 'w-full' : 'w-[calc(50%-var(--f-gap)/2)] max-[700px]:w-full';
    if (!this.edicion()) return ancho;
    const sel = this.seleccion() === c.id
      ? 'outline outline-2 outline-offset-4 outline-[#7c5cff]'
      : 'hover:outline hover:outline-1 hover:outline-offset-4 hover:outline-[#7c5cff]/50';
    return `${ancho} cursor-grab ${sel}`;
  }

  /** Click or Enter/Space on a field selects it (canvas only). Space must not scroll the page. */
  protected pulsar(id: string, ev?: Event): void {
    if (!this.edicion()) return;
    ev?.preventDefault();
    this.seleccionar.emit(id);
  }
}
