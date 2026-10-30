import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, effect, inject, input, model } from '@angular/core';
import { GrIcon } from '@grcup/ui';

export interface FotoLightbox { imagen: string; alt: string }

/**
 * Figma 17 «Lightbox · fotos de la sede»: the photo on black, previous / next, «alt · 2 / 4» and close.
 * Open it by setting `indice` (−1 = closed). Esc closes, ← → move; the page does not scroll behind it.
 */
@Component({
  selector: 'gr-lightbox',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'tecla($event)' },
  template: `
    @if (indice() >= 0 && fotos()[indice()]; as f) {
      <div class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/92 px-4 py-16 md:px-24" role="dialog" aria-modal="true" [attr.aria-label]="'Foto ' + (indice() + 1) + ' de ' + fotos().length" (click)="cerrar()">
        <button type="button" #cerrarBtn class="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:top-6 md:right-6" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="20" /></button>
        <figure class="flex w-full max-w-[1060px] flex-col gap-4" (click)="$event.stopPropagation()">
          <img [src]="grande(f.imagen)" [alt]="f.alt" class="max-h-[72vh] w-full rounded-2xl object-contain" />
          <figcaption class="text-body-s text-text-secondary">{{ f.alt }} · {{ indice() + 1 }} / {{ fotos().length }}</figcaption>
        </figure>
        @if (fotos().length > 1) {
          <button type="button" class="absolute top-1/2 left-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:left-8" aria-label="Foto anterior" (click)="$event.stopPropagation(); mover(-1)"><gr-icon name="arrow-left" [size]="20" /></button>
          <button type="button" class="absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:right-8" aria-label="Foto siguiente" (click)="$event.stopPropagation(); mover(1)"><gr-icon name="arrow-right" [size]="20" /></button>
        }
      </div>
    }
  `,
})
export class Lightbox {
  readonly fotos = input<FotoLightbox[]>([]);
  readonly indice = model(-1);
  private readonly el = inject(ElementRef<HTMLElement>);
  private anterior: HTMLElement | null = null;

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        const abierto = this.indice() >= 0;
        document.body.style.overflow = abierto ? 'hidden' : '';
        if (abierto && !this.anterior) {
          this.anterior = document.activeElement as HTMLElement | null;
          setTimeout(() => (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('button')?.focus());
        } else if (!abierto && this.anterior) {
          this.anterior.focus?.();
          this.anterior = null;
        }
      });
      inject(DestroyRef).onDestroy(() => (document.body.style.overflow = ''));
    }
  }
  /** The «-l» version when there is one (the grids use the small one). */
  protected grande(src: string): string {
    return src.replace(/-s\.webp$/, '-l.webp');
  }
  protected cerrar(): void {
    this.indice.set(-1);
  }
  protected mover(d: number): void {
    const n = this.fotos().length;
    this.indice.set((this.indice() + d + n) % n);
  }
  protected tecla(e: KeyboardEvent): void {
    if (this.indice() < 0) return;
    if (e.key === 'Escape') this.cerrar();
    else if (e.key === 'ArrowRight') this.mover(1);
    else if (e.key === 'ArrowLeft') this.mover(-1);
  }
}
