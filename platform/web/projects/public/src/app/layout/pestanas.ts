import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, output, viewChild } from '@angular/core';

/**
 * Section tabs on phones and tablets (Jaime 16-nov): shadcn-style tab pills (TabsList / TabsTrigger) in one row that
 * scrolls sideways with snap when they do not fit, instead of the dropdown + bottom sheet. The selected tab is scrolled
 * into view. Options with `href` are plain links (SSR / SEO); the rest emit `elegir`.
 */
@Component({
  selector: 'gr-pestanas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .fila { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .fila::-webkit-scrollbar { display: none; }
  `,
  template: `
    <div #fila class="fila relative flex w-max max-w-full snap-x snap-mandatory scroll-px-1 gap-1 overflow-x-auto rounded-pill border border-line-subtle bg-bg-surface p-1"
      role="tablist" [attr.aria-label]="etiqueta() || null">
      @for (o of opciones(); track o.id) {
        @if (o.href) {
          <a [href]="o.href" role="tab" [attr.aria-selected]="o.id === valor()" [attr.aria-current]="o.id === valor() ? 'page' : null" [attr.data-state]="o.id === valor() ? 'active' : 'inactive'" [attr.data-id]="o.id"
            [class]="clase(o.id === valor())">{{ o.t }}</a>
        } @else {
          <button type="button" role="tab" [attr.aria-selected]="o.id === valor()" [attr.data-state]="o.id === valor() ? 'active' : 'inactive'" [attr.data-id]="o.id"
            (click)="elegir.emit(o.id)" [class]="clase(o.id === valor())">{{ o.t }}</button>
        }
      }
    </div>
  `,
})
export class Pestanas {
  readonly opciones = input.required<{ id: string; t: string; href?: string }[]>();
  readonly valor = input.required<string>();
  readonly etiqueta = input('');
  readonly elegir = output<string>();
  private readonly fila = viewChild.required<ElementRef<HTMLElement>>('fila');

  protected clase(activa: boolean): string {
    return 'flex h-10 shrink-0 snap-start items-center justify-center rounded-pill border px-4 text-label-s whitespace-nowrap transition-colors pointer-coarse:h-11 '
      + (activa ? 'border-line-strong bg-bg-raised text-text-primary shadow-[0_2px_8px_rgb(0_0_0/0.35)]' : 'border-transparent text-text-secondary hover:text-text-primary');
  }

  constructor() {
    // keep the selected tab visible (horizontal scroll only: the page does not move)
    afterRenderEffect(() => {
      const fila = this.fila().nativeElement;
      const b = fila.querySelector<HTMLElement>(`[data-id="${this.valor()}"]`);
      if (!b) return;
      const izq = b.offsetLeft - (fila.clientWidth - b.offsetWidth) / 2;
      fila.scrollTo({ left: Math.max(0, izq), behavior: 'instant' });
    });
  }
}
