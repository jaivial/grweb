import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';

export interface BoOption {
  value: string;
  label: string;
  disabled?: boolean;
}

let seq = 0;

/**
 * Figma 48 «BO / Select»: Closed · Open · Disabled · Error. Desktop opens a listbox (r12, raised, check on the
 * selected option); mobile uses the native picker (bottom sheet), as the design asks.
 */
@Component({
  selector: 'bo-select',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex flex-col gap-2', '(document:click)': 'outside($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    <label [attr.for]="id" class="text-label-s" [class]="disabled() ? 'text-text-muted' : 'text-text-secondary'">{{ label() }}</label>
    <div class="relative md:hidden">
      <select [id]="id" [disabled]="disabled()" [attr.aria-invalid]="!!error() || null" (change)="value.set($any($event.target).value)" [class]="box() + ' h-11 w-full appearance-none pr-9'">
        @if (!current()) { <option value="" disabled [selected]="true">{{ placeholder() }}</option> }
        @for (o of options(); track o.value) { <option [value]="o.value" [disabled]="o.disabled" [selected]="o.value === value()">{{ o.label }}</option> }
      </select>
      <gr-icon name="chevron-down" [size]="16" class="pointer-events-none absolute top-3.5 right-3 text-text-tertiary" />
    </div>
    <button type="button" class="hidden h-10 w-full items-center gap-2 md:flex" [class]="box()" [disabled]="disabled()" aria-haspopup="listbox"
      [attr.aria-expanded]="open()" [attr.aria-invalid]="!!error() || null" [attr.aria-label]="label()" [attr.aria-controls]="open() ? id + '-lb' : null"
      [attr.aria-activedescendant]="open() && active() >= 0 ? id + '-o' + active() : null" (click)="toggle()" (keydown)="key($event)">
      <span class="flex-1 truncate text-left" [class.text-text-muted]="!current()">{{ current()?.label ?? placeholder() }}</span>
      <gr-icon [name]="open() ? 'chevron-up' : 'chevron-down'" [size]="16" class="text-text-tertiary" />
    </button>
    @if (open()) {
      <ul role="listbox" [id]="id + '-lb'" [attr.aria-label]="label()" class="absolute inset-x-0 top-[73px] z-30 hidden flex-col rounded-md border border-line-strong bg-bg-raised p-1 shadow-[0_12px_32px_rgb(0_0_0/0.5)] md:flex">
        @for (o of options(); track o.value; let i = $index) {
          <li role="option" [id]="id + '-o' + i" [attr.aria-selected]="o.value === value()" [attr.aria-disabled]="o.disabled || null" (click)="pick(o)" (mouseenter)="active.set(i)"
            class="flex h-9 cursor-pointer items-center gap-2 rounded-xs px-2 text-body-s aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
            [class]="o.value === value() ? 'bg-accent/12 text-text-primary' : i === active() ? 'bg-bg-hover text-text-secondary' : 'text-text-secondary'">
            <span class="flex-1 truncate">{{ o.label }}</span>
            @if (o.value === value()) { <gr-icon name="check" [size]="16" class="text-accent-text" /> }
          </li>
        }
      </ul>
    }
    @if (error()) { <p class="text-body-xs text-error" role="alert">{{ error() }}</p> }
  `,
})
export class BoSelect {
  readonly value = model<string | null>(null);
  readonly label = input.required<string>();
  readonly options = input.required<BoOption[]>();
  readonly placeholder = input('Selecciona…');
  readonly disabled = input(false);
  readonly error = input<string | null>(null);
  protected readonly id = `bo-select-${++seq}`;
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  protected readonly box = computed(
    () =>
      'rounded-md border bg-bg-field px-3 text-body-s text-text-primary transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(230_96_107/0.35)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none ' +
      (this.error() ? 'border-error' : this.open() ? 'border-accent' : 'border-line-strong enabled:hover:border-line-hover'),
  );
  protected toggle(): void {
    this.open.update((o) => !o);
    this.active.set(this.options().findIndex((o) => o.value === this.value()));
  }
  protected pick(o: BoOption): void {
    if (o.disabled) return;
    this.value.set(o.value);
    this.open.set(false);
  }
  protected key(e: KeyboardEvent): void {
    const n = this.options().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.open()) return this.toggle();
      this.active.update((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if ((e.key === 'Enter' || e.key === ' ') && this.open() && this.active() >= 0) {
      e.preventDefault();
      this.pick(this.options()[this.active()]);
    }
  }
  protected outside(e: Event): void {
    if (!this.host.contains(e.target as Node)) this.open.set(false);
  }
}
