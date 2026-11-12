import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GrIcon, GrToasts, type GrIconName } from '@grcup/ui';

const focus = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]';

export type BoToastTone = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'undo';
const toastIcon: Record<BoToastTone, [GrIconName, string]> = {
  success: ['circle-check', 'text-success'], error: ['circle-x', 'text-error'], warning: ['triangle-alert', 'text-warning'],
  info: ['info', 'text-info'], loading: ['loader', 'text-text-tertiary motion-safe:animate-spin'], undo: ['trash', 'text-text-tertiary'],
};

/** Figma 49 «BO / Toast»: 380 px, raised r12, 14 Semi Bold + 12 detail. Undo: «Deshacer» button + 5 s countdown bar. */
@Component({
  selector: 'bo-toast',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pointer-events-auto relative flex w-full max-w-[380px] items-center gap-3 overflow-hidden rounded-md border border-line-strong bg-bg-raised px-4 py-3 shadow-[0_12px_32px_rgb(0_0_0/0.5)]',
    '[attr.role]': "tone() === 'error' ? 'alert' : 'status'",
  },
  template: `
    <gr-icon [name]="icon()[0]" [size]="20" [class]="'shrink-0 ' + icon()[1]" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <p class="text-[14px] leading-[17px] font-semibold text-text-primary [overflow-wrap:anywhere]">{{ title() }}</p>
      @if (text()) { <p class="text-body-xs text-text-tertiary">{{ text() }}</p> }
    </div>
    @if (action()) {
      <button type="button" class="h-8 shrink-0 rounded-sm border border-line-strong bg-bg-card px-2.5 text-[14px] font-semibold text-accent-text hover:bg-bg-hover ${focus}" (click)="act.emit()">{{ action() }}</button>
    } @else {
      <button type="button" class="-m-1 shrink-0 rounded-xs p-1 text-text-muted hover:text-text-primary ${focus}" aria-label="Cerrar" (click)="closed.emit()"><gr-icon name="x" [size]="16" /></button>
    }
    @if (tone() === 'undo') { <span class="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-accent motion-safe:animate-[bo-countdown_5s_linear_forwards]"></span> }
  `,
  styles: `@keyframes bo-countdown { to { transform: scaleX(0); } }`,
})
export class BoToast {
  readonly tone = input<BoToastTone>('info');
  readonly title = input.required<string>();
  readonly text = input<string | undefined>(undefined);
  /** Inline action label (Undo: «Deshacer»). Replaces the close button. */
  readonly action = input<string | undefined>(undefined);
  readonly closed = output<void>();
  readonly act = output<void>();
  protected readonly icon = computed(() => toastIcon[this.tone()]);
  protected readonly focus = focus;
}

export type BoAlertTone = 'info' | 'success' | 'warning' | 'danger' | 'legal';
const alertSkin: Record<BoAlertTone, [GrIconName, string, string]> = {
  info: ['info', 'text-info', 'border-info bg-info/8'],
  success: ['circle-check', 'text-success', 'border-success/40 bg-success/8'],
  warning: ['triangle-alert', 'text-warning', 'border-warning/40 bg-warning/8'],
  danger: ['circle-x', 'text-error', 'border-error/40 bg-error/8'],
  legal: ['scale', 'text-[#c4b5fd]', 'border-[#c4b5fd]/60 bg-[#c4b5fd]/8'],
};

/** Figma 49 «BO / Alert»: in-page notice r12, tinted 8 %, title + detail + optional link action with arrow. */
@Component({
  selector: 'bo-alert',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'flex items-start gap-3 rounded-md border p-4 ' + skin()[2]", '[attr.role]': "tone() === 'danger' ? 'alert' : 'status'" },
  template: `
    <gr-icon [name]="skin()[0]" [size]="20" [class]="'shrink-0 ' + skin()[1]" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <p class="text-[14px] leading-[17px] font-semibold" [class]="skin()[1]">{{ title() }}</p>
      @if (text()) { <p class="text-body-s text-text-secondary">{{ text() }}</p> }
      <ng-content />
      @if (action()) {
        <button type="button" class="flex w-fit items-center gap-1 rounded-xs text-[14px] font-semibold hover:underline ${focus}" [class]="skin()[1]" (click)="act.emit()">
          {{ action() }}<gr-icon name="arrow-right" [size]="14" />
        </button>
      }
    </div>
  `,
})
export class BoAlert {
  readonly tone = input<BoAlertTone>('info');
  readonly title = input.required<string>();
  readonly text = input('');
  readonly action = input('');
  readonly act = output<void>();
  protected readonly skin = computed(() => alertSkin[this.tone()]);
  protected readonly focus = focus;
}

export type BoEmptyKind = 'first-run' | 'no-results' | 'no-data' | 'no-permission' | 'error' | 'offline';
const emptyIcon: Record<BoEmptyKind, GrIconName> = {
  'first-run': 'wand', 'no-results': 'search', 'no-data': 'inbox', 'no-permission': 'lock', error: 'circle-alert', offline: 'wifi-off',
};

/** Figma 49 «BO / Empty state»: card r16 p40, 56 px tinted icon, 20 Semi Bold title, next step as projected buttons. */
@Component({
  selector: 'bo-empty-state',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-10 text-center md:px-10', '[attr.role]': "kind() === 'error' ? 'alert' : null" },
  template: `
    <span class="mb-1 flex size-14 items-center justify-center rounded-lg bg-accent/12 text-accent-text"><gr-icon [name]="icon()" [size]="24" /></span>
    <h3 class="text-[20px] leading-[26px] font-semibold text-text-primary">{{ title() }}</h3>
    @if (text()) { <p class="max-w-[438px] text-body-s text-text-tertiary">{{ text() }}</p> }
    <div class="mt-1 flex flex-wrap items-center justify-center gap-2 empty:hidden"><ng-content /></div>
  `,
})
export class BoEmptyState {
  readonly kind = input<BoEmptyKind>('no-data');
  readonly title = input.required<string>();
  readonly text = input('');
  protected readonly icon = computed(() => emptyIcon[this.kind()]);
}


/** BO toaster (Figma 49 «BO / Toast»): top-right on desktop, bottom on mobile; same GrToasts queue as the public site. */
@Component({
  selector: 'bo-toaster',
  imports: [BoToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed inset-x-4 bottom-24 z-[70] flex flex-col items-center gap-2 md:inset-x-auto md:top-6 md:right-6 md:bottom-auto md:w-[380px] md:items-end', 'aria-live': 'polite' },
  template: `
    @for (t of toasts.items(); track t.id) {
      <bo-toast [tone]="t.tone" [title]="t.title" [text]="t.text" [action]="t.action?.label" (act)="t.action?.run(); toasts.dismiss(t.id)" (closed)="toasts.dismiss(t.id)" />
    }
  `,
})
export class BoToaster {
  protected readonly toasts = inject(GrToasts);
}

