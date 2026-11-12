import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output, viewChild } from '@angular/core';

/**
 * Popover (Figma «Popover alineación» / «Hoja inferior»): a floating panel anchored to its positioned parent on
 * desktop (radius 16, bg/raised, line/strong) and a bottom sheet with a dimmed backdrop on mobile (radius 24,
 * bg/surface). Render it inside an `@if`: it takes the focus when it appears, closes with Escape, with the backdrop
 * and when the focus or a click leaves it. The parent returns the focus to the trigger on `cerrar`.
 */
@Component({
  selector: 'gr-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()', '(document:click)': 'fuera($event)' },
  styles: `
    .hoja { animation: gr-popover-sube 0.24s cubic-bezier(0.22, 1, 0.36, 1) both; }
    @keyframes gr-popover-sube { from { transform: translateY(24px); opacity: 0; } }
    @media (min-width: 768px) { @keyframes gr-popover-sube { from { transform: translateY(4px); opacity: 0; } } }
    @media (prefers-reduced-motion: reduce) { .hoja { animation: none; } }
  `,
  template: `
    <button type="button" tabindex="-1" class="fixed inset-0 z-40 bg-bg-deep/75 md:hidden" aria-label="Cerrar" (click)="cerrar.emit()"></button>
    <div #panel tabindex="-1" role="dialog" [attr.aria-label]="etiqueta()"
      class="hoja fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line-strong bg-bg-surface px-5 pt-3 pb-7 text-left outline-none md:absolute md:inset-x-auto md:top-full md:right-0 md:bottom-auto md:z-30 md:mt-2 md:max-h-none md:w-[360px] md:rounded-lg md:bg-bg-raised md:p-4 md:shadow-card">
      <span class="mx-auto block h-1 w-10 shrink-0 rounded-pill bg-line-strong md:hidden" aria-hidden="true"></span>
      <ng-content />
    </div>
  `,
})
export class GrPopover {
  /** Accessible name of the panel. */
  readonly etiqueta = input('');
  readonly cerrar = output<void>();
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private listo = false;

  constructor() {
    afterNextRender(() => {
      this.panel().nativeElement.focus({ preventScroll: true });
      // the click that opened the popover is still bubbling: ignore outside clicks until the next tick
      setTimeout(() => (this.listo = true));
    });
  }

  protected fuera(e: Event): void {
    if (this.listo && !this.el.nativeElement.contains(e.target as Node)) this.cerrar.emit();
  }
}
