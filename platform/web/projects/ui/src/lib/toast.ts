import { ChangeDetectionStrategy, Component, Injectable, inject, input, output, signal } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';

export interface GrToast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  text?: string;
  /** Figma 17 «Toast / Edge» action (e.g. «Reintentar»): runs and closes the toast. */
  action?: { label: string; run: () => void };
}

/** Toast queue (Figma «Toast»: 360 max, #1a1a1a, line/strong, body S; «BO / Toast» placement): bottom-right on desktop, bottom on mobile, raised 96 px over drawer/form action bars; container ignores clicks, 5 s, announced politely. */
@Injectable({ providedIn: 'root' })
export class GrToasts {
  private seq = 0;
  readonly items = signal<GrToast[]>([]);
  show(t: Omit<GrToast, 'id'>, ms = 5000): void {
    const id = ++this.seq;
    this.items.update((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => this.dismiss(id), ms);
  }
  success(title: string, text?: string): void { this.show({ tone: 'success', title, text }); }
  error(title: string, text?: string, action?: GrToast['action']): void { this.show({ tone: 'error', title, text, action }, 8000); }
  info(title: string, text?: string): void { this.show({ tone: 'info', title, text }); }
  dismiss(id: number): void { this.items.update((l) => l.filter((x) => x.id !== id)); }
}

const icons: Record<GrToast['tone'], GrIconName> = { success: 'circle-check', error: 'circle-alert', info: 'info' };

/** One toast (Figma «Toast»; 17 «Toast / Edge»: raised bg, radius 12, optional action link instead of the close). */
@Component({
  selector: 'gr-toast',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'pointer-events-auto flex w-full max-w-[360px] items-start gap-3 border border-line-strong p-4 shadow-card ' + (edge() ? 'rounded-md bg-bg-raised' : 'rounded-sm bg-[#1a1a1a]')",
    role: 'status',
  },
  template: `
    <gr-icon [name]="icons[tone()]" [size]="20" [class]="tone() === 'success' ? 'text-success' : tone() === 'error' ? 'text-accent-text' : 'text-info'" />
    <div class="min-w-0 flex-1">
      <p class="text-body-s text-text-primary [overflow-wrap:anywhere]">{{ title() }}</p>
      @if (text()) { <p class="mt-1 text-body-xs text-text-tertiary">{{ text() }}</p> }
    </div>
    @if (action(); as a) {
      <button type="button" class="shrink-0 rounded-xs text-label-s text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-accent" (click)="a.run(); closed.emit()">{{ a.label }}</button>
    } @else if (closable()) { <button type="button" class="-m-1 rounded-xs p-1 text-text-muted hover:text-text-primary" aria-label="Cerrar" (click)="closed.emit()"><gr-icon name="x" [size]="16" /></button> }
  `,
})
export class GrToastCard {
  readonly tone = input<GrToast['tone']>('info');
  readonly title = input.required<string>();
  readonly text = input<string | undefined>(undefined);
  readonly closable = input(true);
  /** Public site look (Figma 17 «Toast / Edge»); the backoffice keeps «BO / Toast». */
  readonly edge = input(false);
  readonly action = input<GrToast['action']>(undefined);
  readonly closed = output<void>();
  protected readonly icons = icons;
}

@Component({
  selector: 'gr-toaster',
  imports: [GrToastCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'pointer-events-none fixed z-50 flex flex-col items-center gap-2 md:w-[360px] md:items-end ' + (top() ? 'inset-x-[15px] top-[90px] md:inset-x-auto md:top-[108px] md:right-8' : 'inset-x-4 bottom-24 md:inset-x-auto md:right-6')",
    'aria-live': 'polite',
  },
  template: `
    @for (t of toasts.items(); track t.id) {
      <gr-toast [tone]="t.tone" [title]="t.title" [text]="t.text" [action]="t.action" [closable]="!top()" [edge]="top()" (closed)="toasts.dismiss(t.id)" />
    }
  `,
})
export class GrToaster {
  /** Public site (Figma 17 «Toasts»): top-right under the navbar (centred on phones), no close button. */
  readonly top = input(false);
  protected readonly toasts = inject(GrToasts);
}
