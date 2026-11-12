import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { GrIcon } from '@grcup/ui';

/** Figma 48 «BO / Checkbox»: 18 px r4, Off · On · Mixed × Default · Disabled · Error. The whole row (label) is the target. */
@Component({
  selector: 'bo-checkbox',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <label class="group inline-flex min-h-11 cursor-pointer items-center gap-3 text-body-s text-text-secondary has-disabled:cursor-not-allowed md:min-h-0">
      <input type="checkbox" class="peer sr-only" [checked]="value() === true" [indeterminate]="value() === 'mixed'" [disabled]="disabled()"
        [attr.aria-invalid]="error() || null" [attr.aria-label]="label() ? null : aria()" (change)="toggle()" />
      <span class="flex size-[18px] shrink-0 items-center justify-center rounded-2xs border transition-colors peer-focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
        [class]="box()">
        @if (value() === true) { <gr-icon name="check" [size]="12" [stroke]="3" class="text-white" /> }
        @if (value() === 'mixed') { <gr-icon name="minus" [size]="12" [stroke]="3" class="text-white" /> }
      </span>
      @if (label()) { <span>{{ label() }}</span> }
    </label>
  `,
})
export class BoCheckbox {
  readonly value = model<boolean | 'mixed'>(false);
  readonly label = input('');
  readonly aria = input('Seleccionar');
  readonly disabled = input(false);
  readonly error = input(false);
  protected readonly box = computed(() => {
    const on = this.value() !== false;
    const base = this.error() ? (on ? 'border-error bg-accent' : 'border-2 border-error bg-bg-field') : on ? 'border-accent bg-accent' : 'border-line-strong bg-bg-field group-hover:border-line-hover';
    return base + (this.disabled() ? ' opacity-40' : '');
  });
  protected toggle(): void {
    this.value.set(this.value() !== true);
  }
}

/** Figma 48 «BO / Toggle row»: label 14 SemiBold + 12 description, 40×24 switch; Loading shows a spinner and dims the switch. */
@Component({
  selector: 'bo-toggle-row',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button type="button" role="switch" [attr.aria-checked]="value()" [disabled]="disabled() || loading()" [attr.aria-busy]="loading() || null" (click)="flip()"
      class="group flex w-full items-center gap-4 py-3 text-left focus-visible:outline-none disabled:cursor-not-allowed">
      <span class="flex min-w-0 flex-1 flex-col gap-1" [class.opacity-40]="disabled()">
        <span class="text-label-s text-text-primary">{{ label() }}</span>
        @if (description()) { <span class="text-body-xs text-text-tertiary">{{ description() }}</span> }
      </span>
      @if (loading()) { <gr-icon name="loader" [size]="16" class="text-text-tertiary motion-safe:animate-spin" /> }
      <span class="flex h-6 w-10 shrink-0 rounded-pill p-0.5 transition-colors group-focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
        [class]="(value() ? 'justify-end bg-accent' : 'justify-start bg-bg-raised') + (disabled() ? ' opacity-40' : loading() ? ' opacity-60' : '')">
        <span class="size-5 rounded-full bg-white" [class.bg-text-tertiary!]="disabled() || loading()"></span>
      </span>
    </button>
  `,
})
export class BoToggleRow {
  readonly value = model(false);
  readonly label = input.required<string>();
  readonly description = input('');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly changed = output<boolean>();
  protected flip(): void {
    this.value.update((v) => !v);
    this.changed.emit(this.value());
  }
}

/** Figma 48 «BO / Radio card»: exclusive modes, r12 card, 18 px radio. Default · Hover · Selected · Disabled. */
@Component({
  selector: 'bo-radio-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="flex h-full cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors has-focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] has-disabled:cursor-not-allowed has-disabled:opacity-40 motion-reduce:transition-none"
      [class]="checked() ? 'border-accent bg-accent/8' : 'border-line-subtle bg-bg-card hover:bg-bg-raised'">
      <input type="radio" class="sr-only" [name]="name()" [value]="option()" [checked]="checked()" [disabled]="disabled()" (change)="value.set(option())" />
      <span class="mt-px size-[18px] shrink-0 rounded-full" [class]="checked() ? 'border-[5px] border-accent' : 'border-2 border-line-strong'"></span>
      <span class="flex flex-col gap-1">
        <span class="text-label-s text-text-primary">{{ title() }}</span>
        <span class="text-body-xs text-text-tertiary">{{ description() }}</span>
      </span>
    </label>
  `,
})
export class BoRadioCard {
  readonly value = model<string | null>(null);
  readonly option = input.required<string>();
  readonly name = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input('');
  readonly disabled = input(false);
  protected readonly checked = computed(() => this.value() === this.option());
}
