import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { GrButton, GrIconButton } from '@grcup/ui';
import { BoCheckbox } from './controls';

/**
 * Figma 49 «BO / Table toolbar»: Default · Filtered · Bulk · Loading (56 px). Search + filter pills go in [filters], right side in [actions],
 * bulk actions in [bulk]. With `selected > 0` the bar turns into the bulk bar (accent tint r12) with a mixed checkbox that clears the selection.
 */
@Component({
  selector: 'bo-table-toolbar',
  imports: [BoCheckbox, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (selected()) {
      <div class="flex min-h-14 flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2" role="toolbar" aria-label="Acciones en bloque">
        <bo-checkbox [value]="selected() >= total() ? true : 'mixed'" aria="Quitar selección" (valueChange)="clear.emit()" />
        <p class="min-w-0 flex-1 text-[14px] leading-[17px] font-semibold text-text-primary" aria-live="polite">{{ selected() }} {{ selected() === 1 ? 'seleccionada' : 'seleccionadas' }} de {{ fmt(total()) }}</p>
        <ng-content select="[bulk]" />
        <button grButton variant="ghost" (click)="clear.emit()">Quitar selección</button>
      </div>
    } @else {
      <div class="flex min-h-14 flex-wrap items-center gap-2 py-2" role="toolbar" aria-label="Filtros de la tabla">
        <ng-content select="[filters]" />
        @if (filtered()) { <button grButton variant="ghost" (click)="reset.emit()">Limpiar filtros</button> }
        <div class="ml-auto flex items-center gap-2">
          <p class="text-body-xs text-text-tertiary" aria-live="polite">{{ loading() ? 'Buscando…' : fmt(total()) + ' ' + (filtered() ? 'resultados' : noun()) }}</p>
          <ng-content select="[actions]" />
        </div>
      </div>
    }
  `,
})
export class BoTableToolbar {
  readonly total = input(0);
  readonly selected = input(0);
  readonly loading = input(false);
  readonly filtered = input(false);
  /** Plural noun for the unfiltered counter («1.248 entradas»). */
  readonly noun = input('resultados');
  readonly clear = output<void>();
  readonly reset = output<void>();
  protected fmt(n: number): string { return n.toLocaleString('es-ES'); }
}

/** Figma 49 «BO / Modal» Kind=Form: 520 px panel r20 card, p24, gap 20, title 20 SemiBold, fields projected, footer [modalActions] aligned right. */
@Component({
  selector: 'bo-modal-form',
  imports: [A11yModule, GrIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'open() && !busy() && open.set(false)' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" (click)="!busy() && open.set(false)">
        <form novalidate class="flex max-h-[92dvh] w-full flex-col gap-5 overflow-y-auto rounded-t-[20px] border border-line-strong bg-bg-card p-6 shadow-card sm:max-w-[520px] sm:rounded-[20px]"
          role="dialog" aria-modal="true" [attr.aria-label]="title()" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" [attr.aria-busy]="busy() || null"
          (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); $event.stopPropagation(); enviar.emit()">
          <div class="flex items-center gap-3">
            <h2 class="min-w-0 flex-1 text-[20px] leading-[26px] font-semibold text-text-primary">{{ title() }}</h2>
            <button grIconButton type="button" icon="x" label="Cerrar" [disabled]="busy()" (click)="open.set(false)"></button>
          </div>
          <ng-content />
          <div class="flex flex-wrap justify-end gap-2"><ng-content select="[modalActions]" /></div>
        </form>
      </div>
    }
  `,
})
export class BoModalForm {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly busy = input(false);
  /** Not «submit»: the native submit event of the <form> bubbles to the host and would fire it twice. */
  readonly enviar = output<void>();
}
