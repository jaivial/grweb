import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { GrIcon, GrIconButton, type GrIconName } from '@grcup/ui';
import { BO_SK } from './shell';

export type BoTone = 'accent' | 'info' | 'success' | 'warning' | 'error' | 'live' | 'neutral';
const tile: Record<BoTone, string> = {
  accent: 'bg-accent/14 text-accent-text', info: 'bg-info/14 text-info', success: 'bg-success/14 text-success', warning: 'bg-warning/14 text-warning',
  error: 'bg-error/14 text-error', live: 'bg-live/14 text-live', neutral: 'bg-bg-raised text-text-tertiary',
};
const t14 = 'text-[14px] leading-[17px] font-semibold text-text-primary';

/** Figma 49 «BO / Chart card»: Bars (por día, hitos resaltados) · Line (acumulado vs. objetivo) · Loading · Empty. Card r16, área 218 px. */
@Component({
  selector: 'bo-chart-card',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5', '[attr.aria-busy]': 'loading() || null' },
  template: `
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="truncate text-[18px] leading-6 font-semibold text-text-primary">{{ title() }}</h3>
      <span class="shrink-0 text-body-xs text-text-muted">{{ period() }}</span>
    </div>
    <div class="relative h-[218px]">
      @if (loading()) {
        <div class="flex h-full items-end gap-1.5">@for (h of sk; track $index) { <span class="${BO_SK} flex-1 rounded-2xs!" [style.height.%]="h"></span> }</div>
      } @else if (!values().length) {
        <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
          <gr-icon name="bar-chart" [size]="24" class="text-text-muted" />
          <p class="${t14}">{{ emptyTitle() }}</p>
          @if (emptyText()) { <p class="text-body-xs text-text-tertiary">{{ emptyText() }}</p> }
        </div>
      } @else if (kind() === 'bars') {
        <div class="flex h-[190px] items-end gap-[5px]" role="img" [attr.aria-label]="title() + ': máximo ' + max()">
          @for (v of values(); track $index; let i = $index) {
            <span class="relative flex-1 rounded-2xs" [class]="marks()[i] ? 'bg-accent' : 'bg-accent/45'" [style.height.%]="(v / max()) * 100" [attr.title]="v">
              @if (marks()[i]) { <span class="absolute -top-5 left-1/2 -translate-x-1/2 text-mono-xs whitespace-nowrap text-text-muted">{{ marks()[i] }}</span> }
            </span>
          }
        </div>
      } @else {
        <svg class="h-[190px] w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" [attr.aria-label]="title()">
          @if (goal()) { <line x1="0" x2="100" [attr.y1]="y(goal()!)" [attr.y2]="y(goal()!)" stroke="#6B7280" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" /> }
          <path [attr.d]="line()" fill="none" stroke="#C42B3E" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        </svg>
        @if (goal()) { <span class="absolute right-0 text-mono-xs text-text-muted" [style.top.px]="(y(goal()!) / 100) * 190 - 18">{{ goalLabel() }}</span> }
      }
    </div>
  `,
})
export class BoChartCard {
  readonly kind = input<'bars' | 'line'>('bars');
  readonly title = input.required<string>();
  readonly period = input('');
  readonly values = input<number[]>([]);
  /** Bars: label per index for the milestones (highlighted bar + caption). */
  readonly marks = input<Record<number, string>>({});
  readonly goal = input<number | null>(null);
  readonly goalLabel = input('');
  readonly loading = input(false);
  readonly emptyTitle = input('Sin datos en este periodo');
  readonly emptyText = input('');
  protected readonly t14 = t14;
  protected readonly sk = [30, 45, 38, 60, 52, 70, 64, 80, 72, 90];
  protected readonly max = computed(() => Math.max(1, ...this.values(), this.goal() ?? 0));
  protected y(v: number): number { return 100 - (v / this.max()) * 100; }
  protected readonly line = computed(() => { const v = this.values(), n = Math.max(1, v.length - 1); return v.map((x, i) => `${i ? 'L' : 'M'}${((i / n) * 100).toFixed(2)} ${this.y(x).toFixed(2)}`).join(' '); });
}

/** Figma 49 «BO / Activity item»: real-time feed row (SSE). Entrada · Sorteo · Email · Atleta · Sistema · Error = icon + tone. */
@Component({
  selector: 'bo-activity-item',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-start gap-3 py-3' },
  template: `
    <span class="flex size-8 shrink-0 items-center justify-center rounded-sm" [class]="tiles[tone()]"><gr-icon [name]="icon()" [size]="16" /></span>
    <span class="flex min-w-0 flex-1 flex-col gap-1"><span class="${t14}">{{ title() }}</span>@if (detail()) { <span class="text-body-xs text-text-tertiary">{{ detail() }}</span> }</span>
    <time class="shrink-0 text-mono-xs text-text-muted">{{ time() }}</time>
  `,
})
export class BoActivityItem {
  readonly icon = input.required<GrIconName>();
  readonly tone = input<BoTone>('accent');
  readonly title = input.required<string>();
  readonly detail = input('');
  readonly time = input('');
  protected readonly tiles = tile;
}

/** Figma 49 «BO / Notification item»: Unread (raised + 3 px accent bar, no dot) · Read · Action (botones proyectados). */
@Component({
  selector: 'bo-notification-item',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'relative flex items-start gap-3 rounded-md px-4 py-3 ' + (unread() ? 'bg-bg-raised' : '')" },
  template: `
    @if (unread()) { <span class="absolute top-3 bottom-3 left-0 w-[3px] rounded-2xs bg-accent" aria-label="No leída"></span> }
    <span class="flex size-8 shrink-0 items-center justify-center rounded-sm" [class]="tiles[tone()]"><gr-icon [name]="icon()" [size]="16" /></span>
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="${t14}">{{ title() }}</span>@if (detail()) { <span class="text-body-xs text-text-tertiary">{{ detail() }}</span> }
      <span class="flex flex-wrap gap-2 pt-1 empty:hidden"><ng-content /></span>
    </span>
    <time class="shrink-0 text-mono-xs text-text-muted">{{ time() }}</time>
  `,
})
export class BoNotificationItem {
  readonly icon = input<GrIconName>('bell');
  readonly tone = input<BoTone>('info');
  readonly title = input.required<string>();
  readonly detail = input('');
  readonly time = input('');
  readonly unread = input(false);
  protected readonly tiles = tile;
}

/** Figma 49 «BO / Inline edit»: View (hover lápiz) · Editing (borde acento, ↵ guarda, Esc cancela) · Saving · Error (mensaje debajo). */
@Component({
  selector: 'bo-inline-edit',
  imports: [GrIcon, GrIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1' },
  template: `
    @if (editing() || saving() || error()) {
      <div class="flex h-10 items-center gap-2 rounded-md border bg-bg-field px-2" [class]="error() ? 'border-error' : saving() ? 'border-line-strong' : 'border-accent'">
        <input #inp class="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text-primary outline-none" [value]="draft()" [disabled]="saving()" [attr.aria-label]="label()"
          [attr.aria-invalid]="error() ? true : null" (input)="draft.set($any($event.target).value)" (keydown.enter)="commit()" (keydown.escape)="cancel()" />
        @if (saving()) { <gr-icon name="loader" [size]="14" class="text-text-tertiary motion-safe:animate-spin" /> }
        @else if (error()) { <gr-icon name="circle-alert" [size]="16" class="text-error" /> }
        @else { <button grIconButton icon="check" label="Guardar" class="size-8!" (click)="commit()"></button> }
      </div>
      @if (error()) { <p class="text-body-xs text-error" role="alert">{{ error() }}</p> }
    } @else {
      <button type="button" class="group flex h-10 items-center gap-2 rounded-md px-0 text-left font-mono text-[13px] text-text-primary focus-visible:outline-2 focus-visible:outline-accent-text" (click)="start()" [attr.aria-label]="'Editar ' + label() + ': ' + value()">
        <span class="min-w-0 flex-1 truncate">{{ value() }}</span><gr-icon name="pencil" [size]="14" class="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
      </button>
    }
  `,
})
export class BoInlineEdit {
  readonly value = input.required<string>();
  readonly label = input('valor');
  readonly saving = input(false);
  readonly error = input('');
  readonly save = output<string>();
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  private readonly inp = viewChild<ElementRef<HTMLInputElement>>('inp');
  protected start(): void { this.draft.set(this.value()); this.editing.set(true); setTimeout(() => this.inp()?.nativeElement.select()); }
  protected cancel(): void { this.editing.set(false); }
  protected commit(): void { this.editing.set(false); if (this.draft() !== this.value()) this.save.emit(this.draft()); }
}

export type BoCheckState = 'done' | 'progress' | 'pending' | 'blocked';
const checkIcon: Record<BoCheckState, [GrIconName, string]> = {
  done: ['circle-check', 'text-success'], progress: ['loader', 'text-accent-text motion-safe:animate-spin'], pending: ['clock', 'text-text-tertiary'], blocked: ['lock', 'text-warning'],
};

/** Figma 49 «BO / Checklist item»: puesta en marcha del dashboard. Done (texto apagado) · In progress · Pending · Blocked; acción proyectada. */
@Component({
  selector: 'bo-checklist-item',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-16 items-center gap-3 rounded-md border border-line-subtle bg-bg-card px-4 py-3' },
  template: `
    <gr-icon [name]="ic()[0]" [size]="20" [class]="'shrink-0 ' + ic()[1]" />
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="text-[14px] leading-[17px] font-semibold" [class]="state() === 'done' ? 'text-text-tertiary' : 'text-text-primary'">{{ title() }}</span>
      @if (detail()) { <span class="text-body-xs text-text-tertiary">{{ detail() }}</span> }
    </span>
    <ng-content />
  `,
})
export class BoChecklistItem {
  readonly state = input<BoCheckState>('pending');
  readonly title = input.required<string>();
  readonly detail = input('');
  protected readonly ic = computed(() => checkIcon[this.state()]);
}
