import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrIcon, GrSparkline } from '@grcup/ui';
import { BO_SK } from './shell';

const card = 'rounded-lg border bg-bg-card p-5';

/** Figma 49 «BO / KPI»: Up · Down · Flat · Loading · Error (reintentar) · Empty (sin datos todavía). 264 px card r16, 36 px value. */
@Component({
  selector: 'bo-kpi',
  imports: [GrIcon, GrSparkline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'flex min-w-0 flex-col gap-2 rounded-lg border bg-bg-card p-5 ' + (error() ? 'border-error/40' : 'border-line-subtle')", '[attr.aria-busy]': 'loading() || null' },
  template: `
    <div class="flex min-h-3.5 items-start gap-2">
      <p class="min-w-0 flex-1 text-[12px] leading-[14px] font-medium text-text-muted">{{ label() }}</p>
      @if (!loading() && !error() && trend().length > 1) { <gr-sparkline [values]="trend()" [color]="dir() === 'down' ? '#E6606B' : dir() === 'up' ? '#22C55E' : '#9CA3AF'" /> }
    </div>
    @if (loading()) {
      <span class="${BO_SK} h-8 w-[120px] rounded-sm!"></span><span class="${BO_SK} h-3 w-[160px]"></span>
    } @else if (error()) {
      <p class="flex items-center gap-2 text-[14px] leading-[17px] font-semibold text-error" role="alert"><gr-icon name="circle-alert" [size]="18" />No se pudo cargar</p>
      <button type="button" class="flex w-fit items-center gap-1.5 rounded-xs text-[14px] leading-[17px] font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-accent-text" (click)="retry.emit()"><gr-icon name="refresh" [size]="14" />Reintentar</button>
    } @else {
      <p class="text-[36px] leading-[41px] font-bold" [class]="value() === null ? 'text-text-muted' : 'text-text-primary'">{{ value() ?? '0' }}</p>
      <div class="flex min-h-[17px] items-center gap-2">
        @if (value() !== null && delta()) {
          <span class="flex h-[22px] items-center gap-1 rounded-xs px-1.5 text-mono-xs" [class]="chip()">
            @if (dir() !== 'flat') { <gr-icon [name]="dir() === 'up' ? 'arrow-up' : 'arrow-down'" [size]="12" /> }{{ delta() }}
          </span>
        }
        <span class="truncate text-body-xs text-text-tertiary">{{ value() === null ? 'Sin datos todavía' : caption() }}</span>
      </div>
    }
  `,
})
export class BoKpi {
  readonly label = input.required<string>();
  readonly value = input<string | null>(null);
  readonly delta = input('');
  readonly caption = input('');
  readonly trend = input<number[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  readonly retry = output<void>();
  protected readonly dir = computed(() => { const d = this.delta().replace('−', '-'); return d.startsWith('-') ? 'down' : !d || /^[+±]?0(\D|$)/.test(d) ? 'flat' : 'up'; });
  protected readonly chip = computed(() => ({ up: 'bg-success/12 text-success', down: 'bg-error/12 text-error', flat: 'bg-bg-raised text-text-tertiary' })[this.dir()]);
}

export type BoSkeletonKind = 'table' | 'cards' | 'kpis' | 'form' | 'detail';

/** Figma 49 «BO / Skeleton»: final shape without jumps (Table · Cards · KPI row · Form · Detail). Shown after 300 ms by the caller. */
@Component({
  selector: 'bo-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-busy': 'true', role: 'status', 'aria-label': 'Cargando…' },
  template: `
    @switch (kind()) {
      @case ('table') {
        <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
          <div class="flex h-10 items-center gap-6 border-b border-line-subtle px-4">@for (w of [80, 120, 60, 90]; track $index) { <span class="${BO_SK} h-2" [style.width.px]="w"></span> }</div>
          @for (r of rows(); track $index) {
            <div class="flex h-14 items-center gap-4 border-b border-line-subtle px-4 last:border-0">
              <span class="${BO_SK} size-[18px]"></span><span class="${BO_SK} size-8 rounded-full!"></span>
              <span class="flex w-[260px] flex-col gap-1.5"><span class="${BO_SK} h-2.5 w-[160px]"></span><span class="${BO_SK} h-2 w-[120px]"></span></span>
              <span class="${BO_SK} hidden h-2.5 w-24 md:block"></span><span class="${BO_SK} hidden h-5 w-[88px] rounded-xs! md:block"></span>
            </div>
          }
        </div>
      }
      @case ('cards') {
        <div class="grid gap-4 md:grid-cols-3">@for (r of [1, 2, 3]; track r) {
          <div class="flex h-[154px] flex-col gap-3 ${card} border-line-subtle"><span class="${BO_SK} h-24 rounded-sm!"></span><span class="${BO_SK} h-2.5 w-2/3"></span></div>
        }</div>
      }
      @case ('kpis') {
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">@for (r of [1, 2, 3, 4]; track r) {
          <div class="flex h-[116px] flex-col gap-2 ${card} border-line-subtle"><span class="${BO_SK} h-2.5 w-24"></span><span class="${BO_SK} h-8 w-[120px] rounded-sm!"></span><span class="${BO_SK} h-3 w-3/4"></span></div>
        }</div>
      }
      @case ('form') {
        <div class="flex flex-col gap-5 ${card} border-line-subtle">
          @for (r of [1, 2, 3]; track r) { <div class="flex flex-col gap-2"><span class="${BO_SK} h-2.5 w-28"></span><span class="${BO_SK} h-10 rounded-md!"></span></div> }
          <span class="${BO_SK} h-10 w-32 self-end rounded-sm!"></span>
        </div>
      }
      @case ('detail') {
        <div class="flex flex-col gap-4 ${card} border-line-subtle">
          <div class="flex items-center gap-3"><span class="${BO_SK} size-12 rounded-full!"></span><span class="flex flex-col gap-2"><span class="${BO_SK} h-3.5 w-48"></span><span class="${BO_SK} h-2.5 w-32"></span></span></div>
          @for (r of [1, 2, 3]; track r) { <span class="${BO_SK} h-2.5" [style.width.%]="100 - r * 15"></span> }
        </div>
      }
    }
  `,
})
export class BoSkeleton {
  readonly kind = input<BoSkeletonKind>('table');
  readonly count = input(5);
  protected readonly rows = computed(() => Array.from({ length: this.count() }));
}

/** Figma 49 «BO / Stepper»: wizard steps (current · done · error · pending), 28 px circles joined by 2 px connectors. */
@Component({
  selector: 'bo-stepper',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex items-center gap-2" aria-label="Pasos">
      @for (s of steps(); track $index; let i = $index; let last = $last) {
        <li class="flex items-center gap-2" [class.flex-1]="!last" [attr.aria-current]="i === current() ? 'step' : null">
          <button type="button" class="flex shrink-0 items-center gap-2 rounded-xs focus-visible:outline-2 focus-visible:outline-accent-text disabled:cursor-default" [disabled]="i >= current() && i !== error()" (click)="go.emit(i)">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[13px]" [class]="dot(i)">
              @if (i === error()) { <gr-icon name="x" [size]="14" /> } @else if (i < current()) { <gr-icon name="check" [size]="14" /> } @else { {{ i + 1 }} }
            </span>
            <span class="hidden text-[14px] leading-[17px] font-semibold md:inline" [class]="i === error() ? 'text-error' : i <= current() ? 'text-text-primary' : 'text-text-tertiary'">{{ s }}</span>
          </button>
          @if (!last) { <span class="h-0.5 min-w-4 flex-1 rounded-2xs" [class]="i < current() && i !== error() ? 'bg-accent' : 'bg-line-strong'"></span> }
        </li>
      }
    </ol>
  `,
})
export class BoStepper {
  readonly steps = input.required<string[]>();
  readonly current = input(0);
  /** Index of the step that failed (stays marked; the user can go back to it). */
  readonly error = input<number | null>(null);
  readonly go = output<number>();
  protected dot(i: number): string {
    if (i === this.error()) return 'border border-error bg-error/16 text-error';
    if (i < this.current()) return 'bg-accent text-white';
    if (i === this.current()) return 'border border-accent bg-accent/16 text-accent-text';
    return 'bg-bg-raised text-text-tertiary';
  }
}
