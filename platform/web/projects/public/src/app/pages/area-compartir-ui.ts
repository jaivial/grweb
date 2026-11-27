import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';
import { I18n } from '../core/i18n';
import { GrTelefono } from '../layout/telefono';

const T = {
  es: {
    tuFoto: 'Tu foto aquí', usuario: '@atleta', mensaje: 'Enviar mensaje',
    titulo: 'Recorta tu foto', cancelar: 'Cancelar',
    ayuda: 'Arrastra la foto para encuadrarla y usa el zoom. Lo que queda dentro del marco 9:16 es lo que verás en la vista previa y lo que usaremos en la imagen final.',
    escenario: 'Foto: arrastra o usa las flechas para moverla, + y − para el zoom', mover: 'Arrastra para mover',
    menosZoom: 'Menos zoom', zoom: 'Zoom', masZoom: 'Más zoom', min: '1× · cubre el marco', max: '4× · máximo',
    restablecer: 'Restablecer', aplicar: 'Aplicar recorte', coma: ',',
  },
  en: {
    tuFoto: 'Your photo here', usuario: '@athlete', mensaje: 'Send message',
    titulo: 'Crop your photo', cancelar: 'Cancel',
    ayuda: 'Drag the photo to frame it and use the zoom. Whatever stays inside the 9:16 frame is what you will see in the preview and what we will use in the final image.',
    escenario: 'Photo: drag or use the arrow keys to move it, + and − to zoom', mover: 'Drag to move',
    menosZoom: 'Zoom out', zoom: 'Zoom', masZoom: 'Zoom in', min: '1× · fills the frame', max: '4× · maximum',
    restablecer: 'Reset', aplicar: 'Apply crop', coma: '.',
  },
};

export interface Recorte {
  focalX: number;
  focalY: number;
  zoom: number;
}

/**
 * Reference phone of Figma 83 (iPhone + Instagram story UI): visual reference only, never exported. Every size is in
 * cqw (1 cqw = 1/100 of the phone width, i.e. 3.93 pt) with the proportions of Instagram on a 393 × 852 pt iPhone:
 * status bar 54 pt, story 9:16 under it, and the reply row in the black band over the home indicator.
 */
@Component({
  selector: 'gr-story-movil',
  imports: [GrIcon, GrTelefono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[200px] md:w-[230px] lg:w-[240px] xl:w-[288px]' },
  template: `
    <gr-telefono>
      <!-- status bar: time and signal / wifi / battery flanking the Dynamic Island, as on a real iPhone -->
      <div class="relative h-[13.7cqw] shrink-0 text-white" aria-hidden="true">
        <div class="absolute inset-x-[6.9cqw] top-[2.8cqw] flex h-[9.4cqw] items-center justify-between">
          <span class="text-[3.31cqw] font-semibold tabular-nums">9:41</span>
          <span class="flex items-center gap-[1.7cqw]">
            <svg viewBox="0 0 18 12" class="h-[2.6cqw] w-auto" fill="currentColor"><rect width="3" height="4" x="0" y="8" rx="1" /><rect width="3" height="6" x="5" y="6" rx="1" /><rect width="3" height="9" x="10" y="3" rx="1" /><rect width="3" height="12" x="15" rx="1" /></svg>
            <svg viewBox="0 0 16 12" class="h-[2.6cqw] w-auto" fill="currentColor"><path d="M8 12 5.7 9.5a3.5 3.5 0 0 1 4.6 0z" /><path d="M8 8.1c-1.5 0-2.8.6-3.9 1.6L2.7 8.2A7.6 7.6 0 0 1 8 5.9c2 0 3.9.8 5.3 2.3l-1.4 1.5A5.5 5.5 0 0 0 8 8.1" /><path d="M8 4.3c-2.4 0-4.6.9-6.3 2.5L.2 5.4A10.8 10.8 0 0 1 8 2.3c3.1 0 5.9 1.1 8 3.1l-1.5 1.4A8.8 8.8 0 0 0 8 4.3" /></svg>
            <svg viewBox="0 0 27 13" class="h-[3cqw] w-auto"><rect width="22" height="12" x=".5" y=".5" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".4" /><rect width="15" height="9" x="2" y="2" rx="2" fill="currentColor" /><path d="M24.5 4.4v4.2c1-.3 1.5-1 1.5-2.1s-.5-1.8-1.5-2.1" fill="currentColor" fill-opacity=".4" /></svg>
          </span>
        </div>
      </div>
      <!-- the 9:16 story, full screen width and not cropped -->
      <div class="relative aspect-[9/16] shrink-0 overflow-hidden rounded-[2.5cqw] bg-black">
        @if (sticker()) {
          <!-- a transparent PNG needs a background to read as a sticker: a generic, dimmed placeholder -->
          <div class="absolute inset-0 bg-[#18181b] [background-image:radial-gradient(55%_42%_at_72%_16%,#565660,transparent_70%),radial-gradient(45%_35%_at_22%_62%,#33333a,transparent_70%)]"></div>
        }
        @if (src()) { <img [src]="src()" [alt]="alt()" class="absolute inset-0 h-full w-full object-cover" [class.blur-[1.1cqw]]="borroso()" /> }
        @else { <div class="absolute inset-0 animate-pulse bg-white/5"></div> }
        @if (hueco()) {
          <div class="absolute inset-x-0 top-[28%] flex flex-col items-center gap-[0.8cqw] text-white/60" aria-hidden="true"><gr-icon class="gr-icono-fluido size-[4.2cqw]" name="image" /><span class="font-mono text-[1.9cqw] tracking-[0.12em] uppercase">{{ t().tuFoto }}</span></div>
        }
        <!-- scrim so the white chrome stays readable on a bright photo, then progress and header -->
        <div class="pointer-events-none absolute inset-x-0 top-0 h-[26cqw] bg-gradient-to-b from-black/60 to-transparent" aria-hidden="true"></div>
        <div class="pointer-events-none absolute inset-x-0 top-0 px-[3.05cqw] pt-[2.2cqw] text-white" aria-hidden="true">
          <div class="flex gap-[1.02cqw]">
            @for (s of segmentos; track $index) {
              <span class="h-[0.6cqw] flex-1 overflow-hidden rounded-full bg-white/35"><span class="block h-full bg-white" [style.width.%]="s"></span></span>
            }
          </div>
          <div class="mt-[2.2cqw] flex items-center gap-[2.3cqw]">
            @if (avatar()) {
              <img [src]="avatar()" alt="" class="size-[8.14cqw] shrink-0 rounded-full object-cover ring-1 ring-white/25" />
            } @else {
              <span class="grid size-[8.14cqw] shrink-0 place-items-center rounded-full bg-white/25 text-[2.9cqw] font-semibold">{{ iniciales() }}</span>
            }
            <span class="flex min-w-0 items-center gap-[1.2cqw]">
              <span class="truncate text-[3.31cqw] font-semibold">{{ handle() }}</span>
              <span class="shrink-0 text-[3.05cqw] text-white/80">· 1 min</span>
            </span>
            <span class="ml-auto flex shrink-0 items-center gap-[2.6cqw]">
              <gr-icon class="gr-icono-fluido size-[6.1cqw]" name="more" /><gr-icon class="gr-icono-fluido size-[5.1cqw]" name="x" />
            </span>
          </div>
        </div>
      </div>
      <!-- in the black band under the story, as Instagram does on a 19.5:9 iPhone -->
      <div class="pointer-events-none flex flex-1 flex-col justify-end px-[3.05cqw] pb-[5.2cqw] text-white" aria-hidden="true">
        <div class="flex items-center gap-[2.6cqw]">
          <span class="flex h-[11.2cqw] flex-1 items-center rounded-full border border-white/60 px-[3.6cqw] text-[3.31cqw]">{{ t().mensaje }}</span>
          <gr-icon class="gr-icono-fluido size-[6.1cqw]" name="heart" /><gr-icon class="gr-icono-fluido size-[6.1cqw]" name="send" />
        </div>
      </div>
    </gr-telefono>
  `,
})
export class StoryMovil {
  readonly src = input('');
  readonly alt = input('');
  protected readonly t = inject(I18n).dict(T);
  /** Handle or first name of the athlete in the story header («@lucia», «Lucía»). */
  readonly usuario = input('');
  /** The athlete's photo for the header avatar; their initials when there is none. */
  readonly avatar = input('');
  readonly nombre = input('');
  readonly borroso = input(false);
  readonly hueco = input(false);
  /** A transparent PNG over a generic placeholder instead of the composed story. */
  readonly sticker = input(false);
  /** Handle shown in the header («@atleta» in the blurred example). */
  protected readonly handle = computed(() => this.usuario() || this.t().usuario);
  /** Three stories in the account: the first one is being played. */
  protected readonly segmentos = [38, 0, 0];
  protected readonly iniciales = computed(() => {
    const p = this.nombre().trim().split(/\s+/).filter(Boolean);
    const i = p.length > 1 ? p[0][0] + p[1][0] : (p[0]?.[0] ?? this.handle().replace('@', '')[0] ?? '');
    return i.toUpperCase() || '·';
  });
}

/** «Recorta tu foto» (Figma 83 · 06): 9:16 frame, drag to move, wheel / pinch / slider to zoom (1×–4×). */
@Component({
  selector: 'gr-story-recorte',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `dialog::backdrop{background:rgb(0 0 0/.7)} input[type=range]{accent-color:#c4283a;height:44px} @media (max-width:639px){dialog[open]{animation:gr-hoja .3s cubic-bezier(.32,.72,0,1)}} @media (prefers-reduced-motion:reduce){dialog[open]{animation:none}}`,
  template: `
    <dialog #dlg class="m-auto w-full max-w-[610px] rounded-lg border border-line-subtle bg-bg-card p-5 text-text-primary shadow-2xl max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none max-sm:pt-[max(16px,env(safe-area-inset-top))] max-sm:pb-[max(12px,env(safe-area-inset-bottom))] max-sm:open:flex max-sm:open:flex-col"
      aria-labelledby="recorte-titulo" (cancel)="$event.preventDefault(); cancelar.emit()" (keydown)="tecla($event)">
      <div class="flex items-center justify-between"><h2 id="recorte-titulo" class="text-[18px] font-semibold">{{ t().titulo }}</h2>
        <button type="button" class="-mr-2 flex size-11 items-center justify-center rounded-xs text-text-tertiary hover:text-text-primary" [attr.aria-label]="t().cancelar" (click)="cancelar.emit()"><gr-icon name="x" [size]="20" /></button></div>
      <p class="mt-3 text-body-s text-text-secondary max-sm:mt-1 max-sm:line-clamp-2">{{ t().ayuda }}</p>
      <div #stage class="relative mt-4 h-[300px] touch-none overflow-hidden rounded-md bg-black select-none sm:h-[476px] max-sm:mt-3 max-sm:h-auto max-sm:min-h-0 max-sm:flex-1" tabindex="0"
        [attr.aria-label]="t().escenario"
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)" (wheel)="rueda($event)">
        @if (marco(); as m) {
          <img [src]="src()" alt="" draggable="false" class="pointer-events-none absolute max-w-none grayscale"
            [style.left.px]="m.x + ox()" [style.top.px]="m.y + oy()" [style.width.px]="dw()" [style.height.px]="dh()" />
          <div class="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/.6)]" [style.left.px]="m.x" [style.top.px]="m.y" [style.width.px]="m.w" [style.height.px]="m.h">
            <div class="absolute inset-0 grid grid-cols-3 grid-rows-3">@for (i of [0,1,2,3,4,5,6,7,8]; track i) { <span class="border border-white/25"></span> }</div>
            <span class="absolute top-2 left-2 rounded-xs bg-black/70 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em]">9:16 · 1080 × 1920</span>
            <span class="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"><gr-icon name="grip" [size]="12" />{{ t().mover }}</span>
          </div>
        }
      </div>
      <div class="mt-4 flex items-center gap-3 max-sm:mt-2">
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xs" [attr.aria-label]="t().menosZoom" (click)="zoomA(zoom() - 0.1)"><gr-icon name="minus" [size]="18" /></button>
        <input type="range" class="flex-1" min="1" max="4" step="0.1" [value]="zoom()" [attr.aria-label]="t().zoom" (input)="zoomA(+$any($event.target).value)" />
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xs" [attr.aria-label]="t().masZoom" (click)="zoomA(zoom() + 0.1)"><gr-icon name="plus" [size]="18" /></button>
        <span class="w-10 text-label-s" aria-live="polite">{{ zoomTxt() }}</span>
      </div>
      <div class="mt-1 flex justify-between px-14 text-[11px] text-text-tertiary max-sm:hidden"><span>{{ t().min }}</span><span>{{ t().max }}</span></div>
      <div class="mt-5 flex shrink-0 items-center gap-3 max-sm:mt-3"><!-- UX3-R2-2: one row; on mobile cancel is the top-right x -->
        <button type="button" class="mr-auto h-11 min-w-11 text-label-s text-accent-text hover:underline" (click)="iniciar({ focalX: 50, focalY: 35, zoom: 1 })">{{ t().restablecer }}</button>
        <button grButton type="button" class="max-sm:hidden" (click)="cancelar.emit()">{{ t().cancelar }}</button>
        <button grButton variant="primary" type="button" (click)="aplicarRecorte()">{{ t().aplicar }}</button>
      </div>
    </dialog>
  `,
})
export class StoryRecorte {
  protected readonly t = inject(I18n).dict(T);
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
  protected readonly zoomTxt = computed(() => this.zoom().toFixed(1).replace('.', this.t().coma) + '×');
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
