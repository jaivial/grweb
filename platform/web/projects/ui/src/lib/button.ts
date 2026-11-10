import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';

export type GrButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'glass' | 'outline' | 'display' | 'display-gradient' | 'pill' | 'instagram';
export type GrButtonSize = 's' | 'm' | 'l';

const base =
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-sans font-semibold transition-[background,box-shadow,border-color,color] duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 select-none';

const variants: Record<GrButtonVariant, string> = {
  primary: 'bg-accent-grain text-white shadow-[0_1px_0_rgb(255_255_255/0.08)_inset] hover:shadow-glow active:brightness-95',
  secondary: 'border border-line-strong bg-bg-raised text-text-primary hover:border-text-muted hover:bg-[#332c2e]',
  ghost: 'text-text-secondary hover:bg-bg-raised hover:text-text-primary',
  danger: 'border border-accent/60 bg-accent-deep/40 text-accent-text hover:bg-accent-deep/70',
  link: 'h-auto! px-0! text-accent-text hover:underline underline-offset-4',
  /* Figma «Button / Glass»: translucent white over photos and gradients (Figma blur 20 = CSS 10). */
  glass: 'border border-white/12 bg-white/5 text-text-primary backdrop-blur-[10px] hover:bg-white/10',
  /* Figma «Button / Outline»: secondary action without fill. */
  outline: 'border border-line-strong text-text-secondary hover:border-accent hover:text-text-primary',
  /* Figma «Button / Display»: deep accent with the display typeface (big calls to action). */
  display: 'rounded-md! bg-accent-deep/85 font-display! font-normal! uppercase tracking-[0.02em] text-white shadow-glow-deep hover:bg-accent-deep',
  /* Figma «Button / DisplayGradient»: brand gradient with the display typeface. */
  'display-gradient': 'bg-accent-grain font-display! font-normal! uppercase tracking-[0.02em] text-white shadow-glow-deep hover:shadow-glow',
  /* Figma «Button / Pill»: solid accent pill («Compra ya»). */
  pill: 'grain-acento rounded-pill! bg-accent text-white hover:shadow-glow',
  /* Figma «Button / Instagram»: follow link with the brand glyph. */
  instagram: 'border border-white/15 bg-white/6 text-text-primary hover:bg-white/10',
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
      @if (icon() ?? (variant() === 'instagram' ? 'instagram' : null); as i) { <gr-icon [name]="i" [size]="iconSize()" /> }
      <ng-content />
      @if (iconRight(); as i) { <gr-icon [name]="i" [size]="iconSize()" /> }
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
  /** Figma: 16 px icons; 20 on the L display buttons. */
  protected readonly iconSize = computed(() => (this.size() === 'l' && this.variant().startsWith('display') ? 20 : 16));
  protected readonly isButton = (inject(ElementRef).nativeElement as HTMLElement).tagName === 'BUTTON';
  protected readonly classes = computed(() => {
    const v = this.variant();
    // display variants use the display type scale (Figma: Display/XS 24 on L, Display/2XS 20 on M)
    const size = v === 'link' ? '' : sizes[this.size()] + (v === 'display' || v === 'display-gradient' ? (this.size() === 'l' ? ' text-[24px]! leading-none!' : ' text-[20px]! leading-none!') : '');
    // Figma «Loading» keeps full opacity (only «Disabled» fades to 40 %)
    return [base, variants[v], size, this.block() ? 'w-full' : '', this.loading() ? 'disabled:opacity-100! disabled:cursor-wait' : ''].join(' ');
  });
}

const iconKinds = {
  ghost: 'text-text-secondary hover:bg-white/6 hover:text-text-primary',
  glass: 'border border-white/12 bg-white/5 text-text-primary hover:bg-white/10',
  primary: 'bg-accent-grain text-white hover:shadow-glow',
} as const;

/**
 * Square icon-only button with mandatory accessible label (Figma «Icon button»: Kind Ghost · Glass · Primary, M 44 · L 48,
 * focus ring 3 px accent). Without `size` it keeps the backoffice sizing (44 mobile · 40 desktop).
 */
@Component({
  selector: 'button[grIconButton], a[grIconButton]',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
  },
  template: `<gr-icon [name]="icon()" [size]="size() === 'l' ? 22 : size() === 'm' ? 18 : 20" /><ng-content />`,
})
export class GrIconButton {
  readonly icon = input.required<GrIconName>();
  readonly label = input.required<string>();
  readonly kind = input<keyof typeof iconKinds>('ghost');
  readonly size = input<'m' | 'l' | null>(null);
  protected readonly classes = computed(() =>
    [
      'relative inline-flex shrink-0 items-center justify-center rounded-sm transition-[background,box-shadow,color] duration-150',
      'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(196_43_62/0.6)] disabled:pointer-events-none disabled:opacity-40',
      iconKinds[this.kind()],
      this.size() === 'l' ? 'size-12' : this.size() === 'm' ? 'size-11' : 'size-11 md:size-10',
    ].join(' '),
  );
}
