import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';

export interface BoRange {
  from: string; // YYYY-MM-DD
  to: string;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(`${s}T00:00:00`);
const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const month = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

/** Figma 48 «BO / Date range»: button r8 + popover (shortcuts | month grid, r16). Closed · Open. */
@Component({
  selector: 'bo-date-range',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-block', '(document:click)': 'outside($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    <button type="button" aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="toggle()"
      class="flex h-11 items-center gap-2 rounded-sm border bg-bg-raised px-3 text-label-s text-text-primary transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] md:h-10 motion-reduce:transition-none"
      [class]="open() ? 'border-accent' : 'border-line-strong hover:border-line-hover'">
      <gr-icon name="calendar" [size]="16" class="text-text-tertiary" />{{ text() }}<gr-icon name="chevron-down" [size]="14" class="text-text-tertiary" />
    </button>
    @if (open()) {
      <div role="dialog" aria-label="Rango de fechas" class="absolute top-12 left-0 z-30 flex w-[min(544px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line-strong bg-bg-raised shadow-[0_12px_32px_rgb(0_0_0/0.5)] md:flex-row">
        <div class="flex flex-row gap-1 overflow-x-auto border-b border-line-subtle p-2 md:w-46 md:flex-col md:border-r md:border-b-0">
          @for (s of shortcuts(); track s.label) {
            <button type="button" (click)="apply(s.range)" class="flex h-9 shrink-0 items-center rounded-sm px-2 text-body-s whitespace-nowrap hover:bg-bg-hover focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
              [class]="same(s.range) ? 'bg-accent/12 text-text-primary' : 'text-text-secondary'">{{ s.label }}</button>
          }
          <span class="flex h-9 shrink-0 items-center rounded-sm px-2 text-body-s" [class]="custom() ? 'bg-accent/12 text-text-primary' : 'text-text-secondary'">Personalizado</span>
        </div>
        <div class="flex flex-1 flex-col gap-2 p-4">
          <div class="flex items-center justify-between text-label-s capitalize">
            <button type="button" class="flex size-8 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover" aria-label="Mes anterior" (click)="shift(-1)"><gr-icon name="chevron-left" [size]="16" /></button>
            {{ title() }}
            <button type="button" class="flex size-8 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover" aria-label="Mes siguiente" (click)="shift(1)"><gr-icon name="chevron-right" [size]="16" /></button>
          </div>
          <div class="grid grid-cols-7 gap-1 text-center">
            @for (h of heads; track $index) { <span class="flex h-6 items-center justify-center text-mono-xs text-text-muted">{{ h }}</span> }
            @for (c of cells(); track $index) {
              @if (c) {
                <button type="button" (click)="tap(c)" class="h-8 rounded-sm text-body-s focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [attr.aria-pressed]="edge(c)"
                  [class]="edge(c) ? 'bg-accent font-semibold text-white' : inside(c) ? 'bg-accent/12 text-text-primary' : 'text-text-secondary hover:bg-bg-hover'">{{ +c.slice(8) }}</button>
              } @else { <span></span> }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class BoDateRange {
  readonly value = model.required<BoRange>();
  /** First day of the competition, for «Desde el lanzamiento». */
  readonly launch = input<string | null>(null);
  protected readonly open = signal(false);
  protected readonly view = signal(new Date());
  private readonly pending = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly heads = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  protected readonly text = computed(() => {
    const { from, to } = this.value();
    return `${day.format(parse(from))} – ${day.format(parse(to))} ${parse(to).getFullYear()}`.replace(/\./g, '');
  });
  protected readonly title = computed(() => month.format(this.view()));
  protected readonly cells = computed(() => {
    const v = this.view();
    const first = new Date(v.getFullYear(), v.getMonth(), 1);
    const n = new Date(v.getFullYear(), v.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => iso(new Date(v.getFullYear(), v.getMonth(), i + 1)))] as (string | null)[];
  });
  protected readonly shortcuts = computed(() => {
    const t = new Date();
    const back = (d: number) => iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - d));
    const s = [
      { label: 'Hoy', range: { from: iso(t), to: iso(t) } },
      { label: 'Últimos 7 días', range: { from: back(6), to: iso(t) } },
      { label: 'Últimos 30 días', range: { from: back(29), to: iso(t) } },
    ];
    const l = this.launch();
    return l ? [...s, { label: 'Desde el lanzamiento', range: { from: l, to: iso(t) } }] : s;
  });
  protected readonly custom = computed(() => !this.shortcuts().some((s) => this.same(s.range)));
  protected same(r: BoRange): boolean {
    return r.from === this.value().from && r.to === this.value().to;
  }
  protected edge(c: string): boolean {
    return c === (this.pending() ?? this.value().from) || (!this.pending() && c === this.value().to);
  }
  protected inside(c: string): boolean {
    return !this.pending() && c > this.value().from && c < this.value().to;
  }
  protected toggle(): void {
    this.view.set(parse(this.value().from));
    this.open.update((o) => !o);
  }
  protected shift(n: number): void {
    const v = this.view();
    this.view.set(new Date(v.getFullYear(), v.getMonth() + n, 1));
  }
  protected tap(c: string): void {
    const p = this.pending();
    if (!p) return this.pending.set(c);
    this.pending.set(null);
    this.apply(c < p ? { from: c, to: p } : { from: p, to: c });
  }
  protected apply(r: BoRange): void {
    this.value.set(r);
    this.open.set(false);
  }
  protected outside(e: Event): void {
    if (!this.host.contains(e.target as Node)) this.open.set(false);
  }
}
