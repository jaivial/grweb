import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';

export type GrTone = 'neutral' | 'accent' | 'success' | 'warning' | 'info' | 'danger';

const toneBadge: Record<GrTone, string> = {
  neutral: 'bg-bg-raised text-text-secondary border-line-strong',
  accent: 'bg-accent-deep/50 text-accent-text border-accent/40',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  info: 'bg-info/10 text-info border-info/30',
  danger: 'bg-accent-deep/40 text-accent-text border-accent-text/30',
};

/** Status badge (mono, uppercase). Per the design system badges carry no dot. */
@Component({
  selector: 'gr-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-6 items-center gap-1 rounded-2xs border px-2 text-mono-xs whitespace-nowrap " + cls()' },
  template: `<ng-content />`,
})
export class GrBadge {
  readonly tone = input<GrTone>('neutral');
  protected readonly cls = computed(() => toneBadge[this.tone()]);
}

/** Card surface (bg/card, line/subtle, radius 16). */
@Component({
  selector: 'gr-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"block rounded-lg border border-line-subtle bg-bg-card " + (pad() ? "p-5 md:p-6" : "")' },
  template: `
    @if (title()) {
      <header class="mb-4 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-ui-h5 text-text-primary">{{ title() }}</h2>
          @if (subtitle()) { <p class="mt-1 text-body-xs text-text-tertiary">{{ subtitle() }}</p> }
        </div>
        <ng-content select="[cardActions]" />
      </header>
    }
    <ng-content />
  `,
})
export class GrCard {
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly pad = input(true);
}

@Component({
  selector: 'gr-spinner',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex text-text-tertiary', role: 'status', '[attr.aria-label]': 'label()' },
  template: `<gr-icon name="loader" [size]="size()" [spin]="true" />`,
})
export class GrSpinner {
  readonly size = input(20);
  readonly label = input('Cargando');
}

/** Loading placeholder (Figma «BO / Skeleton»). */
@Component({
  selector: 'gr-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block animate-pulse rounded-sm bg-bg-raised', 'aria-hidden': 'true' },
  template: ``,
})
export class GrSkeleton {}

@Component({
  selector: 'gr-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs text-text-secondary', '[attr.aria-label]': 'name()', role: 'img' },
  template: `{{ initials() }}`,
})
export class GrAvatar {
  readonly name = input('');
  protected readonly initials = computed(() =>
    this.name().split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0] ?? '').filter(Boolean).slice(0, 2).join('').toUpperCase() || '·',
  );
}

const toneAlert: Record<GrTone, { box: string; icon: GrIconName; title: string }> = {
  neutral: { box: 'border-line-strong bg-bg-raised', icon: 'info', title: 'text-text-primary' },
  accent: { box: 'border-accent/40 bg-accent-deep/25', icon: 'info', title: 'text-accent-text' },
  success: { box: 'border-success/30 bg-success/5', icon: 'circle-check', title: 'text-success' },
  warning: { box: 'border-warning/40 bg-warning/5', icon: 'triangle-alert', title: 'text-warning' },
  info: { box: 'border-info/30 bg-info/5', icon: 'info', title: 'text-info' },
  danger: { box: 'border-accent-text/40 bg-accent-deep/25', icon: 'circle-x', title: 'text-accent-text' },
};

/** Inline alert with optional action slot (Figma «BO / Alert»). */
@Component({
  selector: 'gr-alert',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex gap-3 rounded-md border p-4 " + t().box', '[attr.role]': 'tone() === "danger" || tone() === "warning" ? "alert" : "status"' },
  template: `
    <gr-icon [name]="icon() ?? t().icon" [size]="20" [class]="t().title + ' mt-0.5'" />
    <div class="min-w-0 flex-1">
      <p class="text-label-s" [class]="t().title">{{ title() }}</p>
      <div class="mt-1 text-body-s text-text-secondary"><ng-content /></div>
      <ng-content select="[alertAction]" />
    </div>
  `,
})
export class GrAlert {
  readonly tone = input<GrTone>('neutral');
  readonly title = input.required<string>();
  readonly icon = input<GrIconName | null>(null);
  protected readonly t = computed(() => toneAlert[this.tone()]);
}

/** Empty / error state (Figma «BO / Empty state»). */
@Component({
  selector: 'gr-empty',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center' },
  template: `
    <span class="flex size-12 items-center justify-center rounded-md border border-line-strong bg-bg-raised text-text-tertiary"><gr-icon [name]="icon()" [size]="22" /></span>
    <p class="text-ui-h5 text-text-primary">{{ title() }}</p>
    @if (text()) { <p class="max-w-md text-body-s text-text-tertiary">{{ text() }}</p> }
    <div class="mt-2 flex flex-wrap justify-center gap-2"><ng-content /></div>
  `,
})
export class GrEmpty {
  readonly icon = input<GrIconName>('info');
  readonly title = input.required<string>();
  readonly text = input<string | null>(null);
}

/** GR Strength Cup logo (CDN). */
@Component({
  selector: 'gr-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<img [src]="src" alt="GR Strength Cup" [style.height.px]="height()" class="w-auto select-none" draggable="false" fetchpriority="high" />`,
})
export class GrLogo {
  readonly height = input(40);
  protected readonly src = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';
}

/** Tiny trend line for KPI tiles. */
@Component({
  selector: 'gr-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex', 'aria-hidden': 'true' },
  template: `<svg [attr.width]="w" [attr.height]="h" [attr.viewBox]="'0 0 ' + w + ' ' + h" fill="none"><path [attr.d]="d()" [attr.stroke]="color()" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
})
export class GrSparkline {
  readonly values = input<number[]>([]);
  readonly color = input('#22C55E');
  protected readonly w = 64;
  protected readonly h = 20;
  protected readonly d = computed(() => {
    const v = this.values();
    if (v.length < 2) return `M0 ${this.h / 2} H${this.w}`;
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    return v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * this.w).toFixed(1)} ${(this.h - 2 - ((y - min) / span) * (this.h - 4)).toFixed(1)}`).join(' ');
  });
}
