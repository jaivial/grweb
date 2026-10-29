import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';

export type GrButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type GrButtonSize = 's' | 'm' | 'l';

const base =
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-sans font-semibold transition-[background,box-shadow,border-color,color] duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 select-none';

const variants: Record<GrButtonVariant, string> = {
  primary: 'bg-accent-grain text-white shadow-[0_1px_0_rgb(255_255_255/0.08)_inset] hover:shadow-glow active:brightness-95',
  secondary: 'border border-line-strong bg-bg-raised text-text-primary hover:border-text-muted hover:bg-[#332c2e]',
  ghost: 'text-text-secondary hover:bg-bg-raised hover:text-text-primary',
  danger: 'border border-accent/60 bg-accent-deep/40 text-accent-text hover:bg-accent-deep/70',
  link: 'h-auto! px-0! text-accent-text hover:underline underline-offset-4',
};

/* Heights: S 32 · M 40 (44 on touch/mobile, Figma v7 «Button M 44») · L 48; padding X S 12 · M 20 · L 24. */
const sizes: Record<GrButtonSize, string> = {
  s: 'h-8 px-3 text-label-s',
  m: 'h-11 px-5 text-label-s md:h-10',
  l: 'h-12 px-6 text-label-m',
};

/**
 * Button with the Figma variants. Use on <button> or <a>: `<button grButton variant="primary">Entrar</button>`.
 * While `loading`, the label keeps its width (opacity 0) under a centred spinner — the width never jumps.
 */
@Component({
  selector: 'button[grButton], a[grButton]',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', '[attr.aria-busy]': 'loading() || null', '[attr.disabled]': 'isButton && (loading() || disabled()) ? "" : null', '[attr.aria-disabled]': '!isButton && disabled() ? "true" : null' },
  template: `
    <span class="inline-flex items-center gap-2" [class.opacity-0]="loading()">
      @if (icon(); as i) { <gr-icon [name]="i" [size]="size() === 's' ? 16 : 18" /> }
      <ng-content />
      @if (iconRight(); as i) { <gr-icon [name]="i" [size]="size() === 's' ? 16 : 18" /> }
    </span>
    @if (loading()) {
      <span class="absolute inset-0 flex items-center justify-center" aria-hidden="true"><gr-icon name="loader" [size]="18" [spin]="true" /></span>
    }
  `,
})
export class GrButton {
  readonly variant = input<GrButtonVariant>('secondary');
  readonly size = input<GrButtonSize>('m');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly block = input(false);
  readonly icon = input<GrIconName | null>(null);
  readonly iconRight = input<GrIconName | null>(null);
  protected readonly isButton = (inject(ElementRef).nativeElement as HTMLElement).tagName === 'BUTTON';
  protected readonly classes = computed(() => [base, variants[this.variant()], this.variant() === 'link' ? '' : sizes[this.size()], this.block() ? 'w-full' : ''].join(' '));
}

/** Square icon-only button (44 on mobile, 40 desktop) with mandatory accessible label. */
@Component({
  selector: 'button[grIconButton], a[grIconButton]',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-flex size-11 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary md:size-10',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
  },
  template: `<gr-icon [name]="icon()" [size]="20" /><ng-content />`,
})
export class GrIconButton {
  readonly icon = input.required<GrIconName>();
  readonly label = input.required<string>();
}
