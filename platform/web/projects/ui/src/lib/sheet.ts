import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, untracked, viewChild } from '@angular/core';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Hoja lateral (Figma «Sheet»): entra por la derecha en md+ y desde abajo en móvil (bottom sheet). Modal: diálogo con
 * aria-modal, foco atrapado dentro (Tab cicla), Esc y clic en el velo la cierran, bloquea el scroll del body y
 * devuelve el foco a quien la abrió. Se renderiza siempre y se muestra con `abierto`.
 */
@Component({
  selector: 'gr-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown)': 'teclado($event)' },
  styles: `
    .gr-sheet-velo { animation: gr-sheet-velo 0.2s ease-out both; }
    .gr-sheet-panel { animation: gr-sheet-sube 0.3s cubic-bezier(0.32, 0.72, 0, 1) both; }
    @media (min-width: 768px) { .gr-sheet-panel { animation-name: gr-sheet-entra; } }
    @keyframes gr-sheet-velo { from { opacity: 0; } }
    @keyframes gr-sheet-sube { from { transform: translateY(100%); } }
    @keyframes gr-sheet-entra { from { transform: translateX(100%); } }
    @media (prefers-reduced-motion: reduce) { .gr-sheet-panel, .gr-sheet-velo { animation: none; } }
  `,
  template: `
    @if (abierto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center md:justify-end">
        <button type="button" tabindex="-1" class="gr-sheet-velo fixed inset-0 bg-black/70 backdrop-blur-[2px]" [attr.aria-label]="cerrarTxt()" (click)="cerrar.emit()"></button>
        <div #panel role="dialog" aria-modal="true" [attr.aria-labelledby]="tituloId" tabindex="-1"
          class="gr-sheet-panel relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line-strong bg-bg-raised shadow-card outline-none md:h-full md:max-h-none md:w-[440px] md:rounded-none md:border-y-0 md:border-r-0">
          <header class="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-3.5 md:py-4">
            <h2 [id]="tituloId" class="text-display-xs">{{ titulo() }}</h2>
            <button type="button" class="-m-2 flex size-11 items-center justify-center rounded-sm text-text-secondary hover:text-text-primary" [attr.aria-label]="cerrarTxt()" (click)="cerrar.emit()">
              <span aria-hidden="true" class="text-[20px] leading-none">×</span>
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
})
export class GrSheet {
  private readonly doc = inject(DOCUMENT);
  readonly abierto = input(false);
  readonly titulo = input('');
  /** Texto accesible del botón de cerrar y del velo. */
  readonly cerrarTxt = input('Cerrar');
  readonly cerrar = output<void>();
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly tituloId = 'gr-sheet-' + Math.random().toString(36).slice(2, 8);
  private previo: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const abierto = this.abierto();
      untracked(() => this.estado(abierto));
    });
  }

  private estado(abierto: boolean): void {
    if (abierto) {
      this.previo = this.doc.activeElement as HTMLElement | null;
      this.doc.body.style.overflow = 'hidden';
      setTimeout(() => this.panel()?.nativeElement.focus({ preventScroll: true }));
    } else {
      this.doc.body.style.overflow = '';
      this.previo?.focus?.({ preventScroll: true });
      this.previo = null;
    }
  }

  protected teclado(e: KeyboardEvent): void {
    if (!this.abierto()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cerrar.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodos = Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === this.doc.activeElement);
    if (!nodos.length) return;
    const primero = nodos[0];
    const ultimo = nodos[nodos.length - 1];
    const dentro = this.doc.activeElement && this.el.nativeElement.contains(this.doc.activeElement);
    if (e.shiftKey && (!dentro || this.doc.activeElement === primero)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (!dentro || this.doc.activeElement === ultimo)) {
      e.preventDefault();
      primero.focus();
    }
  }
}
