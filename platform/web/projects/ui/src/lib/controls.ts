import { ChangeDetectionStrategy, Component, Directive, ElementRef, computed, inject, input, model } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';
import { GrSparkline } from './primitives';
import { GR_SKIN } from './skin';

let fieldSeq = 0;

/**
 * Text input styles. Size M = Figma «BO / Field» (44 mobile · 40 desktop, body S); size L = public Figma «Field»
 * (48, body M 16/155, focus accent border + 3 px halo, error accent). bg/field, line/strong.
 */
@Directive({
  selector: 'input[grInput], textarea[grInput], select[grInput]',
  host: {
    class:
      'w-full rounded-sm border bg-bg-field px-3 text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow] ' +
      'focus:outline-none disabled:opacity-50',
    // Fixed height for inputs and selects; textareas grow with their rows.
    '[class.h-11]': '!area && grSize() === "m"',
    '[class.md:h-10]': '!area && grSize() === "m"',
    '[class.h-12]': '!area && grSize() === "l"',
    '[class.text-body-s]': 'grSize() === "m"',
    // iOS zooms on focus below 16 px (UX3-R1-2)
    '[class.max-md:text-[16px]]': 'grSize() === "m"',
    '[class.text-body-m]': 'grSize() === "l"',
    '[class.focus:border-accent-text]': 'grSize() === "m" && !bo',
    '[class.focus:ring-2]': 'grSize() === "m" && !bo',
    '[class.focus:ring-accent/30]': 'grSize() === "m" && !bo',
    // Figma 48 «BO / Field»: r12, hover #5a4f51, focus accent + 3 px halo, error #f87171, read-only dashed
    '[class.rounded-md!]': 'bo',
    '[class.hover:border-line-hover]': 'bo && !invalid()',
    '[class.focus:border-accent!]': 'bo && !invalid()',
    '[class.focus:shadow-[0_0_0_3px_rgb(230_96_107/0.35)]]': 'bo',
    '[class.read-only:border-dashed]': 'bo',
    '[class.read-only:bg-transparent]': 'bo',
    '[class.disabled:opacity-45!]': 'bo',
    '[class.focus:border-accent]': 'grSize() === "l"',
    '[class.focus:shadow-[0_0_0_3px_rgb(196_43_62/0.25)]]': 'grSize() === "l"',
    '[class.py-2]': 'area',
    '[class.min-h-24]': 'area',
    '[class.border-line-strong]': '!invalid()',
    '[class.border-accent-text]': 'invalid() && grSize() === "m" && !bo',
    '[class.border-error]': 'invalid() && bo',
    '[class.border-accent]': 'invalid() && grSize() === "l"',
    '[attr.aria-invalid]': 'invalid() || null',
  },
})
export class GrInput {
  readonly invalid = input(false);
  readonly grSize = input<'m' | 'l'>('m');
  protected readonly bo = inject(GR_SKIN) === 'bo';
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
      <label [attr.for]="for()" class="text-label-s" [class]="bo ? 'text-text-secondary' : 'text-text-primary'">{{ label() }}@if (optional()) {<span class="ml-1 text-body-xs font-normal text-text-muted">(opcional)</span>}</label>
      <ng-content select="[fieldAside]" />
    </div>
    <ng-content />
    @if (error()) {
      <p class="flex items-center gap-1.5 text-body-xs" [class]="bo ? 'text-error' : 'text-accent-text'" [id]="for() + '-error'" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ error() }}</p>
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
  protected readonly bo = inject(GR_SKIN) === 'bo';
}

export interface GrSegment<T extends string = string> {
  value: T;
  label: string;
}

/** Segmented control (Figma «BO / Segmented», 44/40 high). */
@Component({
  selector: 'gr-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex gap-1 rounded-md border border-line-subtle bg-bg-field p-1', role: 'radiogroup', '[attr.aria-label]': 'label()' },
  template: `
    @for (o of options(); track o.value) {
      <button type="button" role="radio" [attr.aria-checked]="o.value === value()" (click)="value.set(o.value)"
        class="h-9 rounded-xs px-4 text-[14px] leading-[17px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none md:h-8"
        [class]="o.value === value() ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-secondary'">{{ o.label }}</button>
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
      <p class="min-w-0 text-label-xs text-text-tertiary">{{ label() }}</p>
      @if (trend().length > 1) { <gr-sparkline class="shrink-0" [values]="trend()" [color]="trendColor()" /> }
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
    if (t.every((v) => v === t[0])) return '#9ca3af'; // flat: neutral (Figma)
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
