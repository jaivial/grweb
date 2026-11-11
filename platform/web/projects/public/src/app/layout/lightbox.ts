import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, effect, inject, input, model, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';

/** `pie`: caption instead of the alt text (e.g. «Edición 2025 · Plataforma» in /galeria). */
export interface FotoLightbox { imagen: string; alt: string; pie?: string }

/**
 * Figma 17 «Lightbox · fotos de la sede» and Figma 30 «visor en móvil»: the photo on black, previous / next,
 * «alt · 2 / 4» and close; `compartir` adds a share button. On phones the photo goes edge to edge and moves with a swipe.
 * Open it by setting `indice` (−1 = closed). Esc closes, ← → move; the page does not scroll behind it.
 */
@Component({
  selector: 'gr-lightbox',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'tecla($event)' },
  template: `
    @if (indice() >= 0 && fotos()[indice()]; as f) {
      <div class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black py-16 md:bg-[#030303] md:px-28 md:pt-20" role="dialog" aria-modal="true" [attr.aria-label]="'Foto ' + (indice() + 1) + ' de ' + fotos().length" (click)="cerrar()">
        <div class="absolute top-4 right-4 flex gap-2 md:top-20 md:right-[118px]">
          @if (compartir()) {
            <button type="button" class="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:size-[62px]" aria-label="Compartir" (click)="$event.stopPropagation(); compartirFoto()"><gr-icon name="share" [size]="18" /></button>
          }
          <button type="button" class="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:size-[62px]" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="20" /></button>
        </div>
        <figure class="flex w-full flex-col items-center gap-4 md:w-[min(980px,100%,calc(62vh*1.75))] md:gap-12" (click)="$event.stopPropagation()" (touchstart)="tocar($event)" (touchend)="soltar($event)">
          @if (roto()) {
            <div class="flex aspect-[7/4] w-full flex-col items-center justify-center gap-3 bg-white/5 px-4 text-center md:rounded-2xl" role="alert">
              <gr-icon name="circle-alert" [size]="28" class="text-text-tertiary" /><p class="text-body-s text-text-secondary">No se pudo cargar la foto.</p>
              <button type="button" class="rounded-full bg-white/10 px-4 py-2 text-label-s hover:bg-white/20" (click)="reintentar()">Reintentar</button>
            </div>
          } @else {
            <img [src]="grande(f.imagen) + intento()" [alt]="f.alt" (error)="roto.set(true)" class="max-h-[72vh] w-full object-contain md:aspect-[7/4] md:max-h-none md:rounded-2xl md:object-cover" />
          }
          <figcaption class="px-4 text-center text-body-s text-text-tertiary md:self-stretch md:px-0 md:text-left md:text-body-m">{{ f.pie || f.alt }}<span class="ml-3 whitespace-nowrap">{{ indice() + 1 }} / {{ fotos().length }}</span></figcaption>
        </figure>
        <p class="sr-only" aria-live="polite">{{ aviso() }}</p>
        @if (fotos().length > 1) {
          <button type="button" class="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:left-12 md:top-[calc(50%-28px)] md:flex md:size-[62px] xl:left-[132px]" aria-label="Foto anterior" (click)="$event.stopPropagation(); mover(-1)"><gr-icon name="arrow-left" [size]="20" /></button>
          <button type="button" class="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:right-12 md:top-[calc(50%-28px)] md:flex md:size-[62px] xl:right-[132px]" aria-label="Foto siguiente" (click)="$event.stopPropagation(); mover(1)"><gr-icon name="arrow-right" [size]="20" /></button>
        }
        @if (aviso()) { <p class="absolute bottom-6 rounded-full bg-white/10 px-4 py-2 text-body-s" aria-hidden="true">{{ aviso() }}</p> }
      </div>
    }
  `,
})
export class Lightbox {
  readonly fotos = input<FotoLightbox[]>([]);
  readonly indice = model(-1);
  /** Share button (Web Share API; copies the page link where it is not available). */
  readonly compartir = input(false);
  protected readonly aviso = signal('');
  /** The photo failed to load (e.g. 429 from the media API): placeholder with «Reintentar». */
  protected readonly roto = signal(false);
  protected readonly intento = signal('');
  private x0 = 0;
  private readonly el = inject(ElementRef<HTMLElement>);
  private anterior: HTMLElement | null = null;

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        const abierto = this.indice() >= 0;
        this.roto.set(false);
        this.intento.set('');
        document.body.style.overflow = abierto ? 'hidden' : '';
        if (abierto && !this.anterior) {
          this.anterior = document.activeElement as HTMLElement | null;
          setTimeout(() => (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('button[aria-label="Cerrar"]')?.focus());
        } else if (!abierto && this.anterior) {
          this.anterior.focus?.();
          this.anterior = null;
        }
      });
      inject(DestroyRef).onDestroy(() => (document.body.style.overflow = ''));
    }
  }
  /** The «-l» version when there is one (the grids use the small one); media library photos at 1600 px. */
  protected grande(src: string): string {
    if (src.startsWith('/api/medios/') && !src.includes('?')) return src + '?w=1600';
    return src.replace(/-s\.webp$/, '-l.webp');
  }
  protected async compartirFoto(): Promise<void> {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else {
        await navigator.clipboard.writeText(url);
        this.avisar('Enlace copiado');
      }
    } catch {
      /* cancelled by the user */
    }
  }
  private avisar(t: string): void {
    this.aviso.set(t);
    setTimeout(() => this.aviso.set(''), 2000);
  }
  /** Swipe on phones: more than 50 px sideways moves to the next or previous photo. */
  protected tocar(e: TouchEvent): void {
    this.x0 = e.changedTouches[0]?.clientX ?? 0;
  }
  protected soltar(e: TouchEvent): void {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - this.x0;
    if (Math.abs(dx) > 50 && this.fotos().length > 1) this.mover(dx < 0 ? 1 : -1);
  }
  protected cerrar(): void {
    this.indice.set(-1);
  }
  protected mover(d: number): void {
    const n = this.fotos().length;
    this.indice.set((this.indice() + d + n) % n);
  }
  protected reintentar(): void {
    const src = this.grande(this.fotos()[this.indice()]?.imagen ?? '');
    this.intento.set((src.includes('?') ? '&' : '?') + 'r=' + Date.now());
    this.roto.set(false);
  }
  protected tecla(e: KeyboardEvent): void {
    if (this.indice() < 0) return;
    if (e.key === 'Tab') this.atrapar(e);
    else if (e.key === 'Escape') this.cerrar();
    else if (e.key === 'ArrowRight') this.mover(1);
    else if (e.key === 'ArrowLeft') this.mover(-1);
  }
  /** aria-modal: Tab and Shift+Tab cycle through the dialog's buttons, never the page behind. */
  private atrapar(e: KeyboardEvent): void {
    const dlg = (this.el.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    const b = Array.from(dlg?.querySelectorAll<HTMLElement>('button') ?? []).filter((x) => x.offsetParent !== null);
    if (!b.length) return;
    const i = b.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus();
  }
}
