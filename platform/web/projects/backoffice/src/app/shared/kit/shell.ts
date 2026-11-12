import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { GrIcon, type GrIconName } from '@grcup/ui';

const focus = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]';
/** Skeleton block of page 49 (pulse, static with reduced motion). */
export const BO_SK = 'block animate-pulse rounded-xs bg-bg-raised motion-reduce:animate-none';

/**
 * Figma 49 «BO / Nav item» + «BO / Nav icon»: 40 px row, 232 expanded / 48 collapsed. Default · Hover · Active · Disabled × Badge None · Count · Alert.
 * Active = accent 14 % tint + 3 px bar on the right + accent icon. Host is the link itself so routerLink keeps working.
 */
@Component({
  selector: 'a[boNavItem], button[boNavItem]',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'cls()',
    '[attr.aria-current]': "active() ? 'page' : null",
    '[attr.aria-disabled]': 'disabled() || null',
    '[attr.title]': 'collapsed() ? label() + (num() ? " · " + num() + " pendientes" : "") : null',
    '[attr.aria-label]': 'collapsed() ? label() + (num() ? " · " + num() + " pendientes" : "") : null',
  },
  template: `
    <gr-icon [name]="icon()" [size]="20" [class]="'shrink-0 ' + (active() ? 'text-accent-text' : '')" />
    @if (!collapsed()) { <span class="min-w-0 flex-1 truncate">{{ label() }}</span> }
    @if (badge() === 'alert') {
      <span [class]="collapsed() ? 'absolute top-2 right-2 size-2 rounded-full bg-accent' : 'size-2 shrink-0 rounded-full bg-accent'" aria-label="Requiere atención"></span>
    } @else if (badge() && !collapsed()) {
      <span class="flex h-5 shrink-0 items-center rounded-xs bg-bg-raised px-1.5 text-mono-xs text-text-secondary">{{ num() }}</span>
    } @else if (badge()) {
      <span class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-bold text-white" aria-hidden="true">{{ num() }}</span>
    }
    @if (active()) { <span class="absolute top-2.5 right-0 h-5 w-[3px] rounded-2xs bg-accent"></span> }
  `,
})
export class BoNavItem {
  readonly icon = input.required<GrIconName>();
  readonly label = input.required<string>();
  readonly active = input(false);
  readonly collapsed = input(false);
  readonly disabled = input(false);
  /** Count chip, `'alert'` dot, or nothing. */
  readonly badge = input<number | 'alert' | null>(null);
  protected readonly num = computed(() => { const b = this.badge(); return typeof b === 'number' && b > 0 ? (b > 99 ? '99+' : String(b)) : ''; });
  protected readonly cls = computed(() =>
    `relative flex h-10 items-center gap-3 rounded-sm text-[14px] leading-[17px] transition-colors motion-reduce:transition-none ${focus} ` +
    (this.collapsed() ? 'w-12 justify-center ' : 'px-3 ') +
    (this.disabled() ? 'pointer-events-none text-text-disabled' : this.active() ? 'bg-accent/14 font-semibold text-text-primary' : 'text-text-secondary hover:bg-bg-card hover:text-text-primary'));
}

export interface BoWorkspace { slug: string; nombre: string; detalle: string; }

/** Figma 49 «BO / Workspace switcher»: Closed · Open · Loading. «Nueva competición» only for Root. */
@Component({
  selector: 'bo-workspace-switcher',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '(document:keydown.escape)': 'open.set(false)' },
  template: `
    @if (loading()) {
      <div class="flex h-13 items-center gap-2 rounded-md border border-line-subtle bg-bg-card px-2" aria-busy="true" aria-label="Cargando competiciones">
        <span class="${BO_SK} size-8 rounded-sm!"></span>
        <span class="flex flex-1 flex-col gap-1.5"><span class="${BO_SK} h-2.5 w-[110px]"></span><span class="${BO_SK} h-2 w-[70px]"></span></span>
      </div>
    } @else {
      <button type="button" (click)="open.update(v => !v)" [attr.aria-expanded]="open()" aria-haspopup="listbox"
        class="flex h-13 w-full items-center gap-2 rounded-md border bg-bg-card px-2 text-left transition-colors hover:border-line-hover motion-reduce:transition-none ${focus}"
        [class.border-accent]="open()" [class.border-line-subtle]="!open()" [attr.aria-label]="collapsed() ? 'Competición: ' + current()?.nombre : null">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent/16 text-accent-text"><gr-icon name="trophy" [size]="16" /></span>
        @if (!collapsed()) {
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="truncate text-[14px] leading-[17px] font-semibold text-text-primary">{{ current()?.nombre }}</span>
            <span class="truncate text-body-xs text-text-tertiary">{{ current()?.detalle }}</span>
          </span>
          <gr-icon name="chevrons-up-down" [size]="14" class="shrink-0 text-text-tertiary" />
        }
      </button>
      @if (open()) {
        <div class="absolute top-full left-0 z-40 mt-2 flex w-[232px] flex-col rounded-md border border-line-strong bg-bg-raised p-1 shadow-card" role="listbox" aria-label="Competiciones">
          @for (w of items(); track w.slug) {
            <button type="button" role="option" [attr.aria-selected]="w.slug === current()?.slug" (click)="choose(w.slug)"
              class="flex items-center gap-2 rounded-sm p-2 text-left hover:bg-bg-hover ${focus}" [class.bg-accent/12]="w.slug === current()?.slug">
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="truncate text-[14px] leading-[17px] font-semibold text-text-primary">{{ w.nombre }}</span>
                <span class="truncate text-body-xs text-text-tertiary">{{ w.detalle }}</span>
              </span>
              @if (w.slug === current()?.slug) { <gr-icon name="check" [size]="16" class="text-accent-text" /> }
            </button>
          }
          @if (root()) {
            <span class="my-1 h-px bg-line-subtle"></span>
            <button type="button" class="flex h-9 items-center gap-2 rounded-sm px-2 text-body-s text-text-secondary hover:bg-bg-hover ${focus}" (click)="open.set(false); nueva.emit()">
              <gr-icon name="plus" [size]="16" class="text-text-tertiary" />Nueva competición
            </button>
          }
        </div>
      }
    }
  `,
})
export class BoWorkspaceSwitcher {
  readonly items = input<BoWorkspace[]>([]);
  readonly current = input<BoWorkspace | null>(null);
  readonly loading = input(false);
  readonly collapsed = input(false);
  readonly root = input(false);
  readonly pick = output<string>();
  readonly nueva = output<void>();
  readonly open = signal(false);
  protected choose(slug: string): void {
    this.open.set(false);
    if (slug !== this.current()?.slug) this.pick.emit(slug);
  }
}
