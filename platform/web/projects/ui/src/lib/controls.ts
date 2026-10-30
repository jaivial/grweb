import { ChangeDetectionStrategy, Component, Directive, ElementRef, computed, inject, input, model } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';
import { GrSparkline } from './primitives';

let fieldSeq = 0;

/** Text input styles (Figma «BO / Field»: 44 mobile · 40 desktop, bg/field, line/strong, accent focus ring). */
@Directive({
  selector: 'input[grInput], textarea[grInput], select[grInput]',
  host: {
    class:
      'w-full rounded-sm border bg-bg-field px-3 text-body-s text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow] ' +
      'focus:outline-none focus:border-accent-text focus:ring-2 focus:ring-accent/30 disabled:opacity-50',
    // Fixed height for inputs and selects; textareas grow with their rows.
    '[class.h-11]': '!area',
    '[class.md:h-10]': '!area',
    '[class.py-2]': 'area',
    '[class.min-h-24]': 'area',
    '[class.border-line-strong]': '!invalid()',
    '[class.border-accent-text]': 'invalid()',
    '[attr.aria-invalid]': 'invalid() || null',
  },
})
export class GrInput {
  readonly invalid = input(false);
  protected readonly area = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName === 'TEXTAREA';
}

/** Label + control + hint/error. Pass the control's id with `for`. */
@Component({
  selector: 'gr-field',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    <div class="flex items-center justify-between gap-3">
      <label [attr.for]="for()" class="text-label-s text-text-primary">{{ label() }}@if (optional()) {<span class="ml-1 text-body-xs font-normal text-text-muted">(opcional)</span>}</label>
      <ng-content select="[fieldAside]" />
    </div>
    <ng-content />
    @if (error()) {
      <p class="flex items-center gap-1.5 text-body-xs text-accent-text" [id]="for() + '-error'" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ error() }}</p>
    } @else if (hint()) {
      <p class="text-body-xs text-text-tertiary" [id]="for() + '-hint'">{{ hint() }}</p>
    }
  `,
})
export class GrField {
  readonly label = input.required<string>();
  readonly for = input(`gr-field-${++fieldSeq}`);
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly optional = input(false);
}

export interface GrSegment<T extends string = string> {
  value: T;
  label: string;
}

/** Segmented control (Figma «BO / Segmented», 44/40 high). */
@Component({
  selector: 'gr-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex rounded-md border border-line-subtle bg-bg-surface p-1', role: 'radiogroup', '[attr.aria-label]': 'label()' },
  template: `
    @for (o of options(); track o.value) {
      <button type="button" role="radio" [attr.aria-checked]="o.value === value()" (click)="value.set(o.value)"
        class="h-9 rounded-sm px-4 text-label-s transition-colors md:h-8"
        [class]="o.value === value() ? 'bg-bg-raised text-text-primary shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]' : 'text-text-tertiary hover:text-text-primary'">{{ o.label }}</button>
    }
  `,
})
export class GrSegmented {
  readonly options = input.required<GrSegment[]>();
  readonly value = model.required<string>();
  readonly label = input('');
}

/** KPI tile (Figma «BO / KPI»): label, value, optional delta and sparkline. Value `null` = no data yet. */
@Component({
  selector: 'gr-kpi',
  imports: [GrIcon, GrSparkline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5' },
  template: `
    <div class="flex items-start justify-between gap-3">
      <p class="text-label-xs text-text-tertiary">{{ label() }}</p>
      @if (trend().length > 1) { <gr-sparkline [values]="trend()" [color]="trendColor()" /> }
    </div>
    <p class="font-sans text-[32px] leading-none font-bold tracking-tight md:text-[40px]" [class.text-text-disabled]="value() === null">{{ value() ?? '0' }}</p>
    <div class="flex min-h-6 flex-wrap items-center gap-2 text-body-xs text-text-tertiary">
      @if (delta(); as d) {
        <span class="inline-flex h-6 items-center gap-1 rounded-2xs px-2 text-mono-xs" [class]="deltaCls()">
          <gr-icon [name]="d.startsWith('-') ? 'arrow-down' : 'arrow-up'" [size]="12" />{{ d }}
        </span>
      }
      <span>{{ value() === null ? 'Sin datos todavía' : caption() }}</span>
    </div>
  `,
})
export class GrKpi {
  readonly label = input.required<string>();
  readonly value = input<string | null>(null);
  readonly caption = input('');
  readonly delta = input<string | null>(null);
  readonly trend = input<number[]>([]);
  protected readonly trendColor = computed(() => {
    const t = this.trend();
    return t.length > 1 && t[t.length - 1] < t[0] ? '#E6606B' : '#22C55E';
  });
  protected readonly deltaCls = computed(() => ((this.delta() ?? '').startsWith('-') ? 'bg-accent-deep/40 text-accent-text' : 'bg-success/10 text-success'));
}

/** Big icon tile used in lists (activity, notifications, checklist). */
@Component({
  selector: 'gr-icon-tile',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex size-9 shrink-0 items-center justify-center rounded-sm " + cls()' },
  template: `<gr-icon [name]="icon()" [size]="18" />`,
})
export class GrIconTile {
  readonly icon = input.required<GrIconName>();
  readonly tone = input<'neutral' | 'accent' | 'success' | 'warning' | 'info'>('neutral');
  protected readonly cls = computed(
    () =>
      ({
        neutral: 'bg-bg-raised text-text-secondary',
        accent: 'bg-accent-deep/40 text-accent-text',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        info: 'bg-info/10 text-info',
      })[this.tone()],
  );
}
