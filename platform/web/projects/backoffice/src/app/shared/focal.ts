import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { webPublica } from '../core/web';

/** Image with a focal point (Figma 54 «Imagen de fondo» / patrocinadores): drag or click the point, or use the arrow keys;
 * the 1:1 avatar, 4:5 card and 16:9 header crops follow it (object-position). Values are percentages 0–100. */
@Component({
  selector: 'bo-focal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="relative max-w-[480px] cursor-crosshair touch-none overflow-hidden rounded-md border border-line-subtle bg-bg-surface select-none"
      (pointerdown)="down($event)" (pointermove)="drag($event)" (pointerup)="up($event)">
      <img [src]="url()" [alt]="alt()" class="pointer-events-none block w-full" draggable="false" />
      <span class="pointer-events-none absolute inset-y-0 w-px bg-white/30" [style.left.%]="x()"></span>
      <span class="pointer-events-none absolute inset-x-0 h-px bg-white/30" [style.top.%]="y()"></span>
      <button type="button" class="absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/40 shadow-card focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(230_96_107/0.9)]"
        [style.left.%]="x()" [style.top.%]="y()" [attr.aria-label]="'Punto focal ' + x() + ' % horizontal, ' + y() + ' % vertical. Muévelo con las flechas'"
        (keydown)="key($event)"><span class="size-2 rounded-full bg-white"></span></button>
    </div>
    <div class="flex flex-wrap items-start gap-3">
      @for (c of crops; track c.label) {
        <figure class="flex flex-col gap-1">
          <img [src]="url()" alt="" class="rounded-sm object-cover" [style.width.px]="c.w" [style.height.px]="c.h" [style.object-position]="x() + '% ' + y() + '%'" />
          <figcaption class="text-mono-xs uppercase tracking-wider text-text-tertiary">{{ c.label }}</figcaption>
        </figure>
      }
    </div>
    <p class="text-body-xs text-text-tertiary">Arrastra el punto o usa las flechas · focal {{ x() }} % / {{ y() }} %</p>
  `,
})
export class BoFocal {
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly x = model(50);
  readonly y = model(50);
  /** Design assets of the public web («/img/…») live on the web host. */
  protected readonly url = computed(() => (this.src().startsWith('/') && !this.src().startsWith('//') ? webPublica() + this.src() : this.src()));
  protected readonly crops = [{ label: '1:1 avatar', w: 72, h: 72 }, { label: '4:5 ficha', w: 72, h: 90 }, { label: '16:9 cabecera', w: 160, h: 90 }];
  private dragging = false;

  private at(e: PointerEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
    this.x.set(clamp(((e.clientX - r.left) / r.width) * 100));
    this.y.set(clamp(((e.clientY - r.top) / r.height) * 100));
  }
  protected down(e: PointerEvent): void {
    this.dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.at(e);
  }
  protected drag(e: PointerEvent): void { if (this.dragging) this.at(e); }
  protected up(e: PointerEvent): void {
    this.dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
  protected key(e: KeyboardEvent): void {
    const step = e.shiftKey ? 10 : 1;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    this.x.update((v) => Math.max(0, Math.min(100, v + d[0])));
    this.y.update((v) => Math.max(0, Math.min(100, v + d[1])));
  }
}

