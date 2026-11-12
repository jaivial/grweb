import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { GrIcon } from '@grcup/ui';

const RING = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]';

/** Figma 48 «BO / Search field»: 40 desktop / 44 mobile, r12; ⌘K hint (desktop), clear when filled, spinner while loading. */
@Component({
  selector: 'bo-search',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex h-11 items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3 transition-colors focus-within:border-accent hover:border-line-hover md:h-10 motion-reduce:transition-none">
      <gr-icon name="search" [size]="16" class="text-text-tertiary" />
      <input type="search" [placeholder]="placeholder()" [attr.aria-label]="placeholder()" [value]="value()" (input)="value.set($any($event.target).value)"
        class="min-w-0 flex-1 bg-transparent text-body-s text-text-primary placeholder:text-text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
      @if (loading()) {
        <gr-icon name="loader" [size]="16" class="text-text-secondary motion-safe:animate-spin" label="Buscando" />
      } @else if (value()) {
        <button type="button" class="-mr-1 flex size-6 items-center justify-center rounded-xs text-text-secondary hover:text-text-primary ${RING}" aria-label="Limpiar búsqueda" (click)="value.set('')">
          <gr-icon name="x" [size]="16" />
        </button>
      } @else if (shortcut()) {
        <kbd class="hidden h-[22px] items-center rounded-xs border border-line-strong px-1.5 text-mono-xs text-text-tertiary md:flex">⌘K</kbd>
      }
    </div>
  `,
})
export class BoSearch {
  readonly value = model('');
  readonly placeholder = input('Buscar atletas, entradas, emails…');
  readonly loading = input(false);
  readonly shortcut = input(true);
}

/** Figma 48 «BO / Tab» (stand-alone button tab; router tabs live in \`bo-tabs\`): 44 high, r8, 2 px accent indicator, optional counter. */
@Component({
  selector: 'button[boTab]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    role: 'tab',
    '[attr.aria-selected]': 'active()',
    '[class]': 'cls()',
  },
  template: `
    <ng-content />
    @if (count() !== null) {
      <span class="flex h-5 items-center rounded-xs px-1.5 text-mono-xs" [class]="active() ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised text-text-tertiary'">{{ count() }}</span>
    }
    @if (active()) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
  `,
})
export class BoTabButton {
  readonly active = input(false);
  readonly count = input<number | null>(null);
  protected readonly cls = computed(
    () =>
      `relative flex h-11 items-center gap-2 px-3 text-label-s whitespace-nowrap transition-colors disabled:opacity-40 motion-reduce:transition-none ${RING} ` +
      (this.active() ? 'rounded-t-sm text-text-primary' : 'rounded-sm text-text-tertiary enabled:hover:bg-bg-raised'),
  );
}

/** Figma 48 «BO / Filter pill»: Off (+) · On (funnel + check) · Count (funnel + number) · Disabled; 32 desktop / 44 mobile. */
@Component({
  selector: 'bo-filter-pill',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button type="button" [disabled]="disabled()" [attr.aria-pressed]="on()" aria-haspopup="true" (click)="open.emit()"
      class="flex h-11 items-center gap-2 rounded-pill border px-3 text-label-s transition-colors disabled:opacity-40 md:h-8 md:gap-1.5 motion-reduce:transition-none ${RING}"
      [class]="on() ? 'border-accent/60 bg-accent/14 text-text-primary enabled:hover:bg-accent/20' : 'border-line-strong bg-bg-field text-text-secondary enabled:hover:border-line-hover'">
      <gr-icon [name]="on() ? 'filter' : 'plus'" [size]="14" [class]="on() ? 'text-accent-text' : 'text-text-tertiary'" />
      {{ label() }}
      @if (count() > 1) {
        <span class="flex size-5 items-center justify-center rounded-full bg-accent text-mono-xs text-white">{{ count() }}</span>
      } @else if (on()) {
        <gr-icon name="check" [size]="14" class="text-accent-text" />
      }
      <gr-icon name="chevron-down" [size]="14" [class]="on() ? 'text-text-tertiary' : 'text-text-muted'" />
    </button>
  `,
})
export class BoFilterPill {
  readonly label = input.required<string>();
  /** Number of selected values: 0 = Off, 1 = On, >1 = Count. */
  readonly count = input(0);
  readonly disabled = input(false);
  readonly open = output<void>();
  protected readonly on = computed(() => this.count() > 0);
}
