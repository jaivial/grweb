import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrIcon, type GrIconName } from '@grcup/ui';

const focus = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]';
const pill = 'flex size-8 items-center justify-center rounded-sm border text-mono-xs transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed';

/** Figma 49 «BO / Pagination»: desktop 32 px buttons with ellipsis; mobile «Anterior · Página n de N · Siguiente» (44 px). Loading = spinner on the requested page. */
@Component({
  selector: 'bo-pagination',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav aria-label="Páginas" class="hidden items-center gap-1 md:flex">
      <button type="button" class="${pill} border-line-subtle text-text-tertiary hover:bg-bg-hover ${focus}" [disabled]="page() <= 1" (click)="go(page() - 1)" aria-label="Anterior"><gr-icon name="chevron-left" [size]="12" /></button>
      @for (p of visible(); track $index) {
        @if (p === 0) { <span class="w-8 text-center text-mono-xs text-text-tertiary">…</span> }
        @else if (loading() && p === page()) { <span class="${pill} border-line-subtle text-text-primary" aria-busy="true"><gr-icon name="loader" [size]="14" class="motion-safe:animate-spin" /></span> }
        @else {
          <button type="button" [class]="'${pill} ' + (p === current() ? 'border-accent bg-accent text-white' : 'border-line-subtle text-text-secondary hover:bg-bg-hover') + ' ' + focus"
            [attr.aria-current]="p === current() ? 'page' : null" (click)="go(p)">{{ p }}</button>
        }
      }
      <button type="button" class="${pill} border-line-subtle text-text-tertiary hover:bg-bg-hover ${focus}" [disabled]="page() >= pages()" (click)="go(page() + 1)" aria-label="Siguiente"><gr-icon name="chevron-right" [size]="12" /></button>
    </nav>
    <nav aria-label="Páginas" class="flex items-center justify-between gap-2 md:hidden">
      <button type="button" class="flex h-11 items-center gap-2 rounded-sm border border-line-strong px-4 text-label-m text-text-primary hover:bg-bg-hover disabled:border-line-subtle disabled:text-text-muted ${focus}" [disabled]="page() <= 1 && !loading()" (click)="go(page() - 1)"><gr-icon name="chevron-left" [size]="16" />Anterior</button>
      @if (loading()) { <gr-icon name="loader" [size]="16" class="text-text-secondary motion-safe:animate-spin" /> } @else { <span class="text-mono-xs text-text-tertiary" aria-live="polite">Página {{ page() }} de {{ pages() }}</span> }
      <button type="button" class="flex h-11 items-center gap-2 rounded-sm border border-line-strong px-4 text-label-m text-text-primary hover:bg-bg-hover disabled:border-line-subtle disabled:text-text-muted ${focus}" [disabled]="page() >= pages() && !loading()" (click)="go(page() + 1)">Siguiente<gr-icon name="chevron-right" [size]="16" /></button>
    </nav>
  `,
})
export class BoPagination {
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly loading = input(false);
  /** Page shown as current while \`loading\` (the one previously loaded). */
  readonly from = input<number | null>(null);
  readonly change = output<number>();
  protected readonly focus = focus;
  protected readonly current = computed(() => (this.loading() ? (this.from() ?? 0) : this.page()));
  /** 1 … p-1 p p+1 … N (0 = ellipsis), always 1-3 at the start. */
  protected readonly visible = computed(() => {
    const n = this.pages(), p = this.page();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const set = new Set([1, 2, 3, p - 1, p, p + 1, n].filter((x) => x >= 1 && x <= n));
    const out: number[] = [];
    [...set].sort((a, b) => a - b).forEach((x, i, a) => { if (i && x - a[i - 1] > 1) out.push(0); out.push(x); });
    return out;
  });
  protected go(p: number): void {
    if (p >= 1 && p <= this.pages() && p !== this.page()) this.change.emit(p);
  }
}

export type BoSaveState = 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict';
const saveIcon: Record<BoSaveState, [GrIconName, string]> = {
  unsaved: ['pencil', 'text-warning'], saving: ['loader', 'text-text-tertiary motion-safe:animate-spin'], saved: ['circle-check', 'text-success'],
  error: ['circle-x', 'text-error'], conflict: ['triangle-alert', 'text-warning'],
};

/** Figma 49 «BO / Save bar»: sticky bottom bar r16 raised (64 px). Buttons are projected so each form wires its own actions. */
@Component({
  selector: 'bo-save-bar',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-16 flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-bg-raised px-4 py-3 shadow-[0_12px_32px_rgb(0_0_0/0.5)]', '[attr.role]': "state() === 'error' ? 'alert' : 'status'" },
  template: `
    <gr-icon [name]="icon()[0]" [size]="20" [class]="'shrink-0 ' + icon()[1]" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <p class="text-[14px] leading-[17px] font-semibold text-text-primary">{{ title() }}</p>
      @if (text()) { <p class="text-body-xs text-text-tertiary">{{ text() }}</p> }
    </div>
    <div class="flex items-center gap-2"><ng-content /></div>
  `,
})
export class BoSaveBar {
  readonly state = input<BoSaveState>('unsaved');
  readonly title = input.required<string>();
  readonly text = input('');
  protected readonly icon = computed(() => saveIcon[this.state()]);
}

export type BoProgressKind = 'determinate' | 'indeterminate' | 'success' | 'error' | 'paused';
const progSkin: Record<BoProgressKind, [GrIconName, string, string]> = {
  determinate: ['send', 'text-accent-text', 'bg-accent'], indeterminate: ['loader', 'text-accent-text motion-safe:animate-spin', 'bg-accent'],
  success: ['circle-check', 'text-success', 'bg-success'], error: ['circle-x', 'text-error', 'bg-error'], paused: ['pause', 'text-text-tertiary', 'bg-text-tertiary'],
};

/** Figma 49 «BO / Progress»: long jobs fed by SSE (import.progreso / campana.progreso). Track 6 px, mono counter, note line. */
@Component({
  selector: 'bo-progress',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2 rounded-md border border-line-subtle bg-bg-card px-3 py-3' },
  template: `
    <div class="flex items-center gap-2">
      <gr-icon [name]="skin()[0]" [size]="14" [class]="'shrink-0 ' + skin()[1]" />
      <p class="min-w-0 flex-1 truncate text-label-s text-text-primary">{{ title() }}</p>
      <span class="shrink-0 text-mono-xs text-text-secondary">{{ kind() === 'indeterminate' ? 'calculando…' : fmt(value()) + ' / ' + fmt(total()) }}</span>
    </div>
    <div class="relative h-1.5 overflow-hidden rounded-pill bg-bg-raised" role="progressbar" [attr.aria-label]="title()" aria-valuemin="0" [attr.aria-valuemax]="total()" [attr.aria-valuenow]="kind() === 'indeterminate' ? null : value()">
      @if (kind() === 'indeterminate') {
        <span class="absolute inset-y-0 w-1/3 rounded-pill bg-linear-to-r from-transparent via-accent to-transparent motion-safe:animate-[bo-indet_1.4s_ease-in-out_infinite] motion-reduce:left-1/3"></span>
      } @else { <span class="absolute inset-y-0 left-0 rounded-pill transition-[width] motion-reduce:transition-none" [class]="skin()[2]" [style.width.%]="pct()"></span> }
    </div>
    @if (note()) { <p class="text-body-xs" [class]="kind() === 'error' ? 'text-error' : 'text-text-tertiary'">{{ note() }}</p> }
  `,
  styles: `@keyframes bo-indet { from { left: -33%; } to { left: 100%; } }`,
})
export class BoProgress {
  readonly kind = input<BoProgressKind>('determinate');
  readonly title = input.required<string>();
  readonly value = input(0);
  readonly total = input(100);
  readonly note = input('');
  protected readonly skin = computed(() => progSkin[this.kind()]);
  protected readonly pct = computed(() => (this.total() ? Math.min(100, (this.value() / this.total()) * 100) : 0));
  protected fmt(n: number): string { return n.toLocaleString('es-ES'); }
}

/** Figma 49 «BO / Table header»: sortable column (None · Asc · Desc), 11 px caps, aria-sort on the host th. */
@Component({
  selector: 'th[boSort]',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'px-3 py-2 text-left', '[attr.aria-sort]': "sort() === 'asc' ? 'ascending' : sort() === 'desc' ? 'descending' : 'none'" },
  template: `
    <button type="button" class="group flex items-center gap-1 rounded-xs text-[11px] font-semibold tracking-[0.04em] uppercase hover:text-text-primary ${focus}" [class]="sort() ? 'text-text-primary' : 'text-text-tertiary'" (click)="toggle.emit()">
      <ng-content /><gr-icon [name]="sort() === 'asc' ? 'arrow-up' : sort() === 'desc' ? 'arrow-down' : 'chevrons-up-down'" [size]="12" [class]="sort() ? 'text-accent-text' : 'text-text-muted'" />
    </button>
  `,
})
export class BoSortHeader {
  readonly sort = input<'asc' | 'desc' | null>(null);
  readonly toggle = output<void>();
  protected readonly focus = focus;
}

/** Figma 49 «BO / Table row» state skins (56 px rows): apply to a tr with [class]. */
export const BO_ROW = {
  default: 'h-14 border-b border-line-subtle bg-bg-card',
  hover: 'h-14 border-b border-line-subtle bg-bg-raised',
  selected: 'h-14 border-b border-line-subtle bg-accent/10',
  disabled: 'h-14 border-b border-line-subtle bg-bg-card opacity-40',
  error: 'h-14 border-b border-line-subtle bg-error/8',
  new: 'h-14 border-b border-line-subtle bg-success/8 motion-safe:animate-[pulse_1s_ease-out_1]',
} as const;

