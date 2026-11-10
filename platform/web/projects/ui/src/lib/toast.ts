import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { GrIcon, type GrIconName } from './icon';

export interface GrToast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  text?: string;
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
  error(title: string, text?: string): void { this.show({ tone: 'error', title, text }, 8000); }
  info(title: string, text?: string): void { this.show({ tone: 'info', title, text }); }
  dismiss(id: number): void { this.items.update((l) => l.filter((x) => x.id !== id)); }
}

const icons: Record<GrToast['tone'], GrIconName> = { success: 'circle-check', error: 'circle-alert', info: 'info' };

@Component({
  selector: 'gr-toaster',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:items-end', 'aria-live': 'polite' },
  template: `
    @for (t of toasts.items(); track t.id) {
      <div class="pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-sm border border-line-strong bg-[#1a1a1a] p-4 shadow-card" role="status">
        <gr-icon [name]="icons[t.tone]" [size]="20" [class]="t.tone === 'success' ? 'text-success' : t.tone === 'error' ? 'text-accent-text' : 'text-info'" />
        <div class="min-w-0 flex-1">
          <p class="text-body-s text-text-primary">{{ t.title }}</p>
          @if (t.text) { <p class="mt-1 text-body-xs text-text-tertiary">{{ t.text }}</p> }
        </div>
        <button type="button" class="-m-1 rounded-xs p-1 text-text-muted hover:text-text-primary" aria-label="Cerrar" (click)="toasts.dismiss(t.id)"><gr-icon name="x" [size]="16" /></button>
      </div>
    }
  `,
})
export class GrToaster {
  protected readonly toasts = inject(GrToasts);
  protected readonly icons = icons;
}
