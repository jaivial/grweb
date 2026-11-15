import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, model, output, signal, viewChild } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { GrIcon, type GrIconName } from '@grcup/ui';
import { BO_SK } from './shell';

export interface BoPaletteItem { id: string; icon: GrIconName; title: string; sub?: string; kbd?: string; }
export interface BoPaletteGroup { label: string; items: BoPaletteItem[]; }

/**
 * Figma 49 «BO / Command palette» (⌘K): 640 px r20 raised. Empty (acciones + recientes) · Results (grupos con contador) · No results · Loading.
 * Presentational: the shell runs the searches and passes `groups`. ↑↓ move, ↵ opens, ⌘↵ opens in a new tab, Esc closes.
 */
@Component({
  selector: 'bo-command-palette',
  imports: [A11yModule, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] border border-line-strong bg-bg-raised shadow-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar o ejecutar una acción' },
  template: `
    <div class="flex h-14 items-center gap-3 border-b border-line-subtle px-5" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
      <gr-icon name="search" [size]="18" class="shrink-0 text-text-tertiary" />
      <input #inp class="h-full min-w-0 flex-1 bg-transparent text-[16px] text-text-primary outline-none placeholder:text-text-muted" placeholder="Escribe un nombre, código o acción…"
        role="combobox" aria-expanded="true" aria-controls="bo-palette-list" [attr.aria-activedescendant]="flat()[cursor()] ? 'bo-pal-' + cursor() : null"
        [value]="query()" (input)="query.set($any($event.target).value)" (keydown)="key($event)" autocomplete="off" />
      @if (loading()) { <gr-icon name="loader" [size]="16" class="shrink-0 text-text-tertiary motion-safe:animate-spin" /> }
      <kbd class="flex h-[22px] items-center rounded-xs border border-line-strong px-1.5 text-mono-xs text-text-tertiary">esc</kbd>
    </div>
    <div id="bo-palette-list" role="listbox" class="flex max-h-[min(60dvh,420px)] flex-col gap-1 overflow-y-auto p-2" aria-label="Resultados">
      @if (loading() && !flat().length) {
        @for (w of [220, 190, 160, 130]; track w) {
          <div class="flex h-11 items-center gap-3 px-3"><span class="${BO_SK} size-4"></span><span class="flex flex-col gap-1.5"><span class="${BO_SK} h-2.5" [style.width.px]="w"></span><span class="${BO_SK} h-2 w-[140px]"></span></span></div>
        }
      } @else if (!flat().length) {
        <div class="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <gr-icon name="search" [size]="24" class="text-text-muted" />
          <p class="text-[14px] leading-[17px] font-semibold text-text-primary">Sin resultados para “{{ query() }}”</p>
          @if (hint()) { <p class="text-body-xs text-text-tertiary">{{ hint() }}</p> }
        </div>
      } @else {
        @for (g of groups(); track g.label) {
          @if (g.items.length) {
            <p class="px-3 pt-2 pb-1 text-mono-xs text-text-muted uppercase">{{ g.label }}</p>
            @for (it of g.items; track it.id) {
              <button type="button" role="option" [id]="'bo-pal-' + idx(it)" [attr.aria-selected]="idx(it) === cursor()" tabindex="-1"
                class="flex min-h-11 w-full items-center gap-3 rounded-sm px-3 py-1 text-left" [class]="idx(it) === cursor() ? 'bg-accent/12' : 'hover:bg-bg-hover'"
                (mouseenter)="cursor.set(idx(it))" (click)="pick.emit({ item: it, newTab: $event.metaKey || $event.ctrlKey })">
                <gr-icon [name]="it.icon" [size]="16" class="shrink-0 text-text-tertiary" />
                <span class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="truncate text-[14px] leading-[17px] font-semibold text-text-primary">{{ it.title }}</span>
                  @if (it.sub) { <span class="truncate text-body-xs text-text-tertiary">{{ it.sub }}</span> }
                </span>
                @if (it.kbd) { <span class="shrink-0 text-mono-xs text-text-muted">{{ it.kbd }}</span> }
              </button>
            }
          }
        }
      }
    </div>
    <div class="hidden h-10 items-center gap-4 border-t border-line-subtle bg-bg-card px-5 text-mono-xs text-text-muted md:flex">
      <span>↑↓ navegar</span><span>↵ abrir</span><span>⌘↵ nueva pestaña</span>
    </div>
  `,
})
export class BoCommandPalette {
  readonly groups = input<BoPaletteGroup[]>([]);
  readonly loading = input(false);
  readonly hint = input('');
  readonly query = model('');
  readonly pick = output<{ item: BoPaletteItem; newTab: boolean }>();
  readonly close = output<void>();
  protected readonly cursor = signal(0);
  protected readonly flat = computed(() => this.groups().flatMap((g) => g.items));
  private readonly inp = viewChild<ElementRef<HTMLInputElement>>('inp');

  constructor() {
    effect(() => { this.flat(); this.cursor.set(0); });
    effect(() => this.inp()?.nativeElement.focus());
  }
  protected idx(it: BoPaletteItem): number { return this.flat().indexOf(it); }
  protected key(e: KeyboardEvent): void {
    const n = this.flat().length;
    if (e.key === 'Escape') { e.preventDefault(); this.close.emit(); }
    else if (e.key === 'ArrowDown' && n) { e.preventDefault(); this.cursor.update((c) => (c + 1) % n); this.scroll(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); this.cursor.update((c) => (c - 1 + n) % n); this.scroll(); }
    else if (e.key === 'Enter' && n) { e.preventDefault(); this.pick.emit({ item: this.flat()[this.cursor()], newTab: e.metaKey || e.ctrlKey }); }
  }
  private scroll(): void { setTimeout(() => document.getElementById('bo-pal-' + this.cursor())?.scrollIntoView({ block: 'nearest' })); }
}
