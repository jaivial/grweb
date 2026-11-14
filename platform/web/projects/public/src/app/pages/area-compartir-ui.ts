import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';

export interface Recorte {
  focalX: number;
  focalY: number;
  zoom: number;
}

/** Reference phone of Figma 83 (iPhone + Instagram story UI): visual reference only, never exported. */
@Component({
  selector: 'gr-story-movil',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[236px] md:w-[280px] lg:w-[300px]' },
  template: `
    <div class="rounded-[44px] border-[6px] border-[#2a2a2e] bg-black p-2 shadow-2xl">
      <div class="relative aspect-[9/16] overflow-hidden rounded-[34px]" [style.background]="fondo() || '#000'">
        @if (fondo()) { <div class="absolute inset-0 bg-cover bg-center grayscale" [style.background-image]="'url(' + fondo() + ')'"></div> }
        @if (src()) { <img [src]="src()" [alt]="alt()" class="absolute inset-0 h-full w-full object-cover" [class.blur-[6px]]="borroso()" /> }
        @else { <div class="absolute inset-0 animate-pulse bg-white/5"></div> }
        @if (hueco()) {
          <div class="absolute inset-x-0 top-[28%] flex flex-col items-center gap-1 text-white/60" aria-hidden="true"><gr-icon name="image" [size]="16" /><span class="font-mono text-[7px] tracking-[0.12em] uppercase">Tu foto aquí</span></div>
        }
        <!-- status bar, story progress and Instagram header -->
        <div class="pointer-events-none absolute inset-x-0 top-0 px-4 pt-2 text-white" aria-hidden="true">
          <div class="flex items-center justify-between text-[12px] font-semibold"><span>9:41</span><span class="h-5 w-16 rounded-full bg-black"></span><span class="h-2.5 w-5 rounded-[3px] bg-white"></span></div>
          @if (!borroso()) {
            <div class="mt-2 h-0.5 rounded bg-white/30"><div class="h-full w-1/3 rounded bg-white"></div></div>
            <div class="mt-2 flex items-center gap-1.5 text-[9px] font-semibold"><span class="size-4 rounded-full border border-white/60 bg-white/20"></span>{{ usuario() }} · 1 min<gr-icon class="ml-auto" name="x" [size]="12" /></div>
          }
        </div>
        @if (!borroso()) {
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-5 text-white" aria-hidden="true">
            <span class="flex-1 rounded-full border border-white/70 px-3 py-1 text-[8px]">Enviar mensaje</span><gr-icon name="heart" [size]="14" /><gr-icon name="send" [size]="14" />
          </div>
        }
        <span class="pointer-events-none absolute bottom-1.5 left-1/2 h-1 w-1/3 -translate-x-1/2 rounded-full bg-white/80" aria-hidden="true"></span>
      </div>
    </div>
  `,
})
export class StoryMovil {
  readonly src = input('');
  readonly alt = input('');
  readonly usuario = input('tu.usuario');
  readonly borroso = input(false);
  readonly hueco = input(false);
  /** Background photo behind a transparent sticker. */
  readonly fondo = input('');
}

/** «Recorta tu foto» (Figma 83 · 06): 9:16 frame, drag to move, wheel / pinch / slider to zoom (1×–4×). */
@Component({
  selector: 'gr-story-recorte',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `dialog::backdrop{background:rgb(0 0 0/.7)} input[type=range]{accent-color:#c4283a;height:44px} @media (max-width:639px){dialog[open]{animation:gr-hoja .3s cubic-bezier(.32,.72,0,1)}} @media (prefers-reduced-motion:reduce){dialog[open]{animation:none}}`,
  template: `
    <dialog #dlg class="m-auto w-full max-w-[610px] rounded-lg border border-line-subtle bg-bg-card p-5 text-text-primary shadow-2xl max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none max-sm:pt-[max(20px,env(safe-area-inset-top))] max-sm:pb-[max(20px,env(safe-area-inset-bottom))]"
      aria-labelledby="recorte-titulo" (cancel)="$event.preventDefault(); cancelar.emit()" (keydown)="tecla($event)">
      <div class="flex items-center justify-between"><h2 id="recorte-titulo" class="text-[18px] font-semibold">Recorta tu foto</h2>
        <button type="button" class="-mr-2 flex size-11 items-center justify-center rounded-xs text-text-tertiary hover:text-text-primary" aria-label="Cancelar" (click)="cancelar.emit()"><gr-icon name="x" [size]="20" /></button></div>
      <p class="mt-3 text-body-s text-text-secondary">Arrastra la foto para encuadrarla y usa el zoom. Lo que queda dentro del marco 9:16 es lo que verás en la vista previa y lo que usaremos en la imagen final.</p>
      <div #stage class="relative mt-4 h-[300px] touch-none overflow-hidden rounded-md bg-black select-none sm:h-[476px] max-sm:h-[60dvh]" tabindex="0"
        aria-label="Foto: arrastra o usa las flechas para moverla, + y − para el zoom"
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)" (wheel)="rueda($event)">
        @if (marco(); as m) {
          <img [src]="src()" alt="" draggable="false" class="pointer-events-none absolute max-w-none grayscale"
            [style.left.px]="m.x + ox()" [style.top.px]="m.y + oy()" [style.width.px]="dw()" [style.height.px]="dh()" />
          <div class="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/.6)]" [style.left.px]="m.x" [style.top.px]="m.y" [style.width.px]="m.w" [style.height.px]="m.h">
            <div class="absolute inset-0 grid grid-cols-3 grid-rows-3">@for (i of [0,1,2,3,4,5,6,7,8]; track i) { <span class="border border-white/25"></span> }</div>
            <span class="absolute top-2 left-2 rounded-xs bg-black/70 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em]">9:16 · 1080 × 1920</span>
            <span class="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"><gr-icon name="grip" [size]="12" />Arrastra para mover</span>
          </div>
        }
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xs" aria-label="Menos zoom" (click)="zoomA(zoom() - 0.1)"><gr-icon name="minus" [size]="18" /></button>
        <input type="range" class="flex-1" min="1" max="4" step="0.1" [value]="zoom()" aria-label="Zoom" (input)="zoomA(+$any($event.target).value)" />
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xs" aria-label="Más zoom" (click)="zoomA(zoom() + 0.1)"><gr-icon name="plus" [size]="18" /></button>
        <span class="w-10 text-label-s" aria-live="polite">{{ zoomTxt() }}</span>
      </div>
      <div class="mt-1 flex justify-between px-14 text-[11px] text-text-tertiary"><span>1× · cubre el marco</span><span>4× · máximo</span></div>
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" class="mr-auto h-11 min-w-11 text-label-s text-accent-text hover:underline" (click)="iniciar({ focalX: 50, focalY: 35, zoom: 1 })">Restablecer</button>
        <button grButton type="button" (click)="cancelar.emit()">Cancelar</button>
        <button grButton variant="primary" type="button" (click)="aplicarRecorte()">Aplicar recorte</button>
      </div>
    </dialog>
  `,
})
export class StoryRecorte {
  readonly src = input.required<string>();
  readonly ancho = input.required<number>();
  readonly alto = input.required<number>();
  readonly inicial = input<Recorte>({ focalX: 50, focalY: 35, zoom: 1 });
  readonly aplicar = output<Recorte>();
  readonly cancelar = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly stage = viewChild.required<ElementRef<HTMLDivElement>>('stage');
  protected readonly marco = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  protected readonly zoom = signal(1);
  protected readonly ox = signal(0);
  protected readonly oy = signal(0);
  private readonly base = computed(() => { const m = this.marco(); return m ? Math.max(m.w / this.ancho(), m.h / this.alto()) : 1; });
  protected readonly dw = computed(() => this.ancho() * this.base() * this.zoom());
  protected readonly dh = computed(() => this.alto() * this.base() * this.zoom());
  protected readonly zoomTxt = computed(() => this.zoom().toFixed(1).replace('.', ',') + '×');
  private readonly punteros = new Map<number, { x: number; y: number }>();

  constructor() {
    afterNextRender(() => {
      this.dlg().nativeElement.showModal();
      const s = this.stage().nativeElement;
      const h = s.clientHeight - 24, w = (h * 9) / 16;
      this.marco.set({ x: (s.clientWidth - w) / 2, y: 12, w, h });
      this.iniciar(this.inicial());
      s.focus();
    });
  }

  protected iniciar(r: Recorte) {
    const m = this.marco();
    if (!m) return;
    this.zoom.set(Math.min(4, Math.max(1, r.zoom)));
    this.ox.set(-(this.dw() - m.w) * (r.focalX / 100));
    this.oy.set(-(this.dh() - m.h) * (r.focalY / 100));
  }

  private mover(x: number, y: number) {
    const m = this.marco()!;
    this.ox.set(Math.min(0, Math.max(m.w - this.dw(), x)));
    this.oy.set(Math.min(0, Math.max(m.h - this.dh(), y)));
  }

  /** Zoom around the centre of the frame (never leaves gaps: 1× covers the frame). */
  protected zoomA(z: number) {
    const m = this.marco();
    if (!m) return;
    const cx = (m.w / 2 - this.ox()) / this.dw(), cy = (m.h / 2 - this.oy()) / this.dh();
    this.zoom.set(Math.round(Math.min(4, Math.max(1, z)) * 100) / 100);
    this.mover(m.w / 2 - cx * this.dw(), m.h / 2 - cy * this.dh());
  }

  protected down(e: PointerEvent) {
    this.stage().nativeElement.setPointerCapture(e.pointerId);
    this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  protected move(e: PointerEvent) {
    const prev = this.punteros.get(e.pointerId);
    if (!prev) return;
    if (this.punteros.size === 1) {
      this.mover(this.ox() + e.clientX - prev.x, this.oy() + e.clientY - prev.y);
    } else {
      const otro = [...this.punteros.entries()].find(([k]) => k !== e.pointerId)![1];
      const antes = Math.hypot(prev.x - otro.x, prev.y - otro.y), ahora = Math.hypot(e.clientX - otro.x, e.clientY - otro.y);
      if (antes > 0) this.zoomA(this.zoom() * (ahora / antes));
    }
    this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  protected up(e: PointerEvent) {
    this.punteros.delete(e.pointerId);
  }

  protected rueda(e: WheelEvent) {
    e.preventDefault();
    this.zoomA(this.zoom() - e.deltaY * 0.002);
  }

  protected tecla(e: KeyboardEvent) {
    const paso: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    if (paso[e.key]) this.mover(this.ox() + paso[e.key][0], this.oy() + paso[e.key][1]);
    else if (e.key === '+' || e.key === '=') this.zoomA(this.zoom() + 0.1);
    else if (e.key === '-') this.zoomA(this.zoom() - 0.1);
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) this.aplicarRecorte();
    else return;
    e.preventDefault();
  }

  protected aplicarRecorte() {
    const m = this.marco();
    if (!m) return;
    const fx = this.dw() > m.w ? (-this.ox() / (this.dw() - m.w)) * 100 : 50;
    const fy = this.dh() > m.h ? (-this.oy() / (this.dh() - m.h)) * 100 : 50;
    this.aplicar.emit({ focalX: Math.round(fx * 10) / 10, focalY: Math.round(fy * 10) / 10, zoom: this.zoom() });
  }
}
