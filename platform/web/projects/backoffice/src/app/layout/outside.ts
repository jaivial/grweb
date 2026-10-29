import { Directive, ElementRef, inject, output } from '@angular/core';

/** Emits when a pointer-down or Escape happens outside the host (dropdowns, panels). */
@Directive({
  selector: '[boOutside]',
  host: { '(document:pointerdown)': 'onDown($event)', '(document:keydown.escape)': 'outside.emit()' },
})
export class Outside {
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly outside = output<void>({ alias: 'boOutside' });
  protected onDown(e: PointerEvent): void {
    if (!this.el.nativeElement.contains(e.target as Node)) this.outside.emit();
  }
}
