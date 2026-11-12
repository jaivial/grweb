import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { GrIcon, type GrIconName } from '@grcup/ui';

export type BoDropState = 'idle' | 'uploading' | 'success' | 'error';

/**
 * Figma 48 «BO / Dropzone» (r16, dashed): Idle · Drag over · Uploading · Success · Error. Presentational: the page
 * uploads the emitted file (cms \`POST …/medios\` or athletes \`POST …/atletas/importaciones\`) and drives \`state\`.
 */
@Component({
  selector: 'bo-dropzone',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-6 text-center transition-colors has-focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
      [class]="frame()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="drop($event)">
      <input type="file" class="sr-only" [accept]="accept()" (change)="pick($event)" [disabled]="state() === 'uploading'" />
      <span class="mb-1 flex size-10 items-center justify-center rounded-md" [class]="tone()"><gr-icon [name]="icon()" [size]="20" [spin]="state() === 'uploading' && !over()" /></span>
      @if (view() === 'uploading') {
        <span class="flex max-w-full text-label-s text-text-primary"><span class="truncate">{{ status() }}</span><span class="shrink-0 whitespace-pre"> · {{ progress() }}&nbsp;%</span></span>
      } @else {
        <span class="text-label-s text-text-primary">{{ heading() }}</span>
      }
      <span class="text-body-xs" [class]="state() === 'error' && !over() ? 'text-error' : 'text-text-tertiary'" aria-live="polite">{{ detail() }}</span>
      @if (state() === 'uploading' && !over()) {
        <span class="mt-1 h-1.5 w-60 max-w-full overflow-hidden rounded-pill bg-bg-raised" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
          <span class="block h-full rounded-pill bg-accent transition-[width] motion-reduce:transition-none" [style.width.%]="progress()"></span>
        </span>
      }
    </label>
  `,
})
export class BoDropzone {
  readonly state = input<BoDropState>('idle');
  readonly title = input('Arrastra el archivo o haz clic');
  readonly hint = input('');
  /** Shown while uploading (file name; « · NN %» is appended on the same line) / on success / on error. */
  readonly status = input('');
  readonly subStatus = input('');
  readonly progress = input(0);
  readonly accept = input('');
  readonly file = output<File>();
  protected readonly over = signal(false);
  protected readonly view = computed(() => (this.over() ? 'over' : this.state()));
  protected readonly frame = computed(() => ({
    idle: 'border-dashed border-line-strong bg-bg-field hover:border-line-hover',
    over: 'border-dashed border-accent bg-accent/8',
    uploading: 'border-line-strong bg-bg-field',
    success: 'border-success/70 bg-bg-field',
    error: 'border-dashed border-error/70 bg-bg-field',
  })[this.view()]);
  protected readonly tone = computed(() => ({ success: 'bg-success/12 text-success', error: 'bg-error/12 text-error' })[this.view() as string] ?? 'bg-accent/12 text-accent-text');
  protected readonly icon = computed<GrIconName>(() => ({ idle: 'upload', over: 'download', uploading: 'loader', success: 'circle-check', error: 'circle-alert' } as const)[this.view()]);
  protected readonly heading = computed(() => (this.view() === 'over' ? 'Suelta para subir' : this.view() === 'idle' ? this.title() : this.status()));
  protected readonly detail = computed(() => (this.view() === 'over' ? 'Se validará antes de importar' : this.view() === 'idle' ? this.hint() : this.subStatus()));
  protected drop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this.file.emit(f);
  }
  protected pick(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.files?.[0]) this.file.emit(el.files[0]);
    el.value = '';
  }
}

export interface BoFocal {
  x: number;
  y: number;
}

/** Figma 48 «BO / Image focal»: drag the point or use the arrows; crops 1:1 · 4:5 · 16:9 preview \`object-position\`. Saved via cms PATCH focalX/focalY. */
@Component({
  selector: 'bo-image-focal',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="relative aspect-[480/272] touch-none overflow-hidden rounded-md select-none" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="editing.set(false)">
      <img [src]="src()" [alt]="alt()" class="size-full object-cover" [style.object-position]="pos()" draggable="false" />
      @if (editing()) {
        <span class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-md border border-white/25 *:border-white/25 [&>*:nth-child(-n+6)]:border-b [&>*:not(:nth-child(3n))]:border-r">
          @for (i of nine; track i) { <span></span> }
        </span>
      }
      <button type="button" class="absolute flex size-10 -translate-1/2 items-center justify-center rounded-full border-2 border-white bg-black/25 text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(230_96_107/0.9)]"
        [style.left.%]="value().x" [style.top.%]="value().y" role="slider" aria-label="Punto focal" [attr.aria-valuetext]="value().x + ' % / ' + value().y + ' %'"
        (keydown)="key($event)" (focus)="editing.set(true)" (blur)="editing.set(false)"><gr-icon name="crosshair" [size]="20" /></button>
    </div>
    <div class="flex flex-wrap items-start gap-3">
      @for (c of crops; track c.label) {
        <figure class="flex flex-col gap-1">
          <img [src]="src()" alt="" class="h-[72px] rounded-sm object-cover md:h-[90px]" [style.aspect-ratio]="c.ratio" [style.object-position]="pos()" />
          <figcaption class="text-mono-xs text-text-muted">{{ c.label }}</figcaption>
        </figure>
      }
    </div>
    <p class="text-body-xs text-text-tertiary">{{ editing() ? 'Arrastra el punto o usa las flechas · ' : '' }}focal {{ value().x }} % / {{ value().y }} %{{ editing() ? '' : ' · object-position: ' + pos() }}</p>
  `,
})
export class BoImageFocal {
  readonly value = model<BoFocal>({ x: 50, y: 50 });
  readonly src = input.required<string>();
  readonly alt = input('');
  protected readonly editing = signal(false);
  protected readonly nine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  protected readonly crops = [{ label: '1:1 avatar', ratio: '1' }, { label: '4:5 ficha', ratio: '4/5' }, { label: '16:9 cabecera', ratio: '16/9' }];
  protected readonly pos = computed(() => `${this.value().x}% ${this.value().y}%`);
  protected down(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.editing.set(true);
    this.move(e);
  }
  protected move(e: PointerEvent): void {
    if (!this.editing() || !e.buttons) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const c = (v: number) => Math.round(Math.min(100, Math.max(0, v * 100)));
    this.value.set({ x: c((e.clientX - r.left) / r.width), y: c((e.clientY - r.top) / r.height) });
  }
  protected key(e: KeyboardEvent): void {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const s = e.shiftKey ? 10 : 1;
    const c = (v: number) => Math.min(100, Math.max(0, v));
    this.value.update((v) => ({ x: c(v.x + d[0] * s), y: c(v.y + d[1] * s) }));
  }
}
