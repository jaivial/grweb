import { A11yModule } from '@angular/cdk/a11y';
import { HttpClient } from '@angular/common/http';
import { AfterContentChecked, AfterViewChecked, ChangeDetectionStrategy, Component, Directive, ElementRef, Injectable, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { GrBadge, GrButton, GrIcon, GrIconButton, GrSelect, type GrTone } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { problemOf } from '../core/api';

/** One breadcrumb: plain text, or a link (`link` = router commands, relative to the page route unless absolute). */
export type BoCrumb = string | { label: string; link: string | unknown[] };

/**
 * Page header (Figma «BO / Page header»): back arrow (`back`), breadcrumbs, title, actions. The breadcrumb wraps on
 * phones (never scrolls sideways) and its links are 44 px tall tap targets there. `back` = router link of the parent
 * page; when omitted, the last linked crumb is used.
 */
@Component({
  selector: 'bo-page-header',
  imports: [GrBadge, GrIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col gap-3' },
  template: `
    @if (crumbs().length || volver()) {
      <div class="flex min-w-0 items-center gap-2">
        @if (volver(); as v) {
          <a [routerLink]="v" class="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-raised hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] md:size-9" aria-label="Volver"><gr-icon name="arrow-left" [size]="20" /></a>
        }
        <nav class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-body-xs text-text-tertiary" aria-label="Migas">
          @for (c of items(); track $index; let last = $last) {
            @if (c.link && !last) {
              <a [routerLink]="c.link" class="flex min-h-11 items-center underline-offset-2 hover:text-text-primary hover:underline md:min-h-0">{{ c.label }}</a>
            } @else {
              <span class="min-w-0 break-words" [class.text-text-secondary]="last" [attr.aria-current]="last ? 'page' : null">{{ c.label }}</span>
            }
            @if (!last) { <gr-icon name="chevron-right" [size]="12" class="shrink-0" /> }
          }
        </nav>
      </div>
    }
    <div class="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <h1 class="min-w-0 break-words" [class]="compact() ? 'text-ui-h3' : 'text-ui-h3 md:text-[28px]'">{{ title() }}</h1>
        @if (badge()) { <gr-badge [tone]="badgeTone()">{{ badge() }}</gr-badge> }
      </div>
      <div class="flex min-w-0 flex-wrap gap-2"><ng-content select="[actions]" /></div>
    </div>
    @if (subtitle()) { <p class="-mt-1 text-body-s text-text-tertiary">{{ subtitle() }}</p> }
  `,
})
export class BoPageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly crumbs = input<BoCrumb[]>([]);
  /** Router link of the back arrow; `false` hides it. Default: the last linked crumb. */
  readonly back = input<string | unknown[] | false | null>(null);
  readonly badge = input('');
  readonly badgeTone = input<GrTone>('warning');
  /** Pages whose Figma title is 24 px at every width (Sistema › WhatsApp, Campañas › WhatsApp). */
  readonly compact = input(false);
  protected readonly items = computed(() => this.crumbs().map((c) => (typeof c === 'string' ? { label: c, link: null } : c)));
  protected readonly volver = computed(() => {
    const b = this.back();
    if (b === false) return null;
    if (b) return b;
    const l = this.items().slice(0, -1).filter((c) => c.link);
    return l.length ? l[l.length - 1].link : null;
  });
}

export interface BoTab {
  label: string;
  path: string;
  count?: number | null;
  /** Active only on this exact path (a tab whose path is the prefix of the others). */
  exact?: boolean;
}

const TAB = 'relative flex h-11 items-center gap-2 px-3 text-label-s whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none';
const TAB_ON = 'rounded-t-sm text-text-primary';
const TAB_OFF = 'rounded-sm text-text-tertiary hover:bg-bg-raised';
const etiquetaTab = (t: { label: string; count?: number | null }) => (t.count != null ? `${t.label} (${t.count})` : t.label);

/**
 * Router tabs with optional counters (Figma «BO / Tab»). Desktop (≥ 768 px): a tab row (wraps, never scrolls sideways).
 * Phones: a selector («Sección: Reservas ▾») that opens the bottom sheet of `gr-select`.
 */
@Component({
  selector: 'bo-tabs',
  imports: [RouterLink, RouterLinkActive, GrSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block md:border-b md:border-line-subtle' },
  template: `
    <gr-select class="w-full md:hidden" [aria-label]="label()" [value]="activa()" (valorChange)="ir($event)">
      @for (t of tabs(); track t.path) { <option [value]="t.path">{{ etiqueta(t) }}</option> }
    </gr-select>
    <nav class="hidden flex-wrap gap-1 md:flex" [attr.aria-label]="label()">
      @for (t of tabs(); track t.path) {
        <a [routerLink]="t.path" routerLinkActive #a="routerLinkActive" [routerLinkActiveOptions]="{ exact: !!t.exact }" [attr.aria-current]="a.isActive ? 'page' : null"
          class="${TAB}" [class]="a.isActive ? '${TAB_ON}' : '${TAB_OFF}'">
          {{ t.label }}
          @if (t.count !== undefined && t.count !== null) {
            <span class="text-mono-xs" [class]="a.isActive ? 'text-accent-text' : 'text-text-tertiary'">{{ t.count }}</span>
          }
          @if (a.isActive) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
        </a>
      }
    </nav>
  `,
})
export class BoTabs {
  readonly tabs = input.required<BoTab[]>();
  readonly label = input('Sección');
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  protected readonly etiqueta = etiquetaTab;
  protected readonly activa = computed(() => {
    this.url();
    const t = this.tabs().find((x) => this.router.isActive(this.router.createUrlTree([x.path], { relativeTo: this.route }), { paths: x.exact ? 'exact' : 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' }));
    return t?.path ?? '';
  });
  protected ir(path: string): void {
    void this.router.navigate([path], { relativeTo: this.route });
  }
}

/**
 * Wraps an existing tab bar (router links or buttons) so that on phones it becomes a selector with the bottom sheet of
 * `gr-select` — no horizontal scroll, every tab reachable. Desktop shows the wrapped bar as is.
 * `<bo-tabs-movil label="Ficha"><nav>…<a routerLink …>…</nav></bo-tabs-movil>`. The active tab is the one with
 * aria-current="page", aria-selected="true" or aria-pressed="true"; picking an option clicks that tab.
 */
@Component({
  selector: 'bo-tabs-movil',
  imports: [GrSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <gr-select class="w-full md:hidden" [aria-label]="label()" [value]="activa()" (valorChange)="elegir($event)">
      @for (o of opciones(); track $index) { <option [value]="'' + $index" [disabled]="o.off">{{ o.texto }}</option> }
    </gr-select>
    <div #cont class="max-md:hidden"><ng-content /></div>
  `,
})
export class BoTabsMovil implements AfterContentChecked {
  readonly label = input('Sección');
  private readonly cont = viewChild.required<ElementRef<HTMLElement>>('cont');
  protected readonly opciones = signal<{ texto: string; off: boolean }[]>([]);
  protected readonly activa = signal('');
  private items: HTMLElement[] = [];
  private firma = '';
  ngAfterContentChecked(): void { queueMicrotask(() => this.leer()); }
  private leer(): void {
    const raiz = this.cont()?.nativeElement;
    if (!raiz) return;
    const sel = 'nav > a, nav > button, [role=tablist] > a, [role=tablist] > button, [role=tab], [role=radiogroup] > button';
    this.items = [...new Set(raiz.querySelectorAll<HTMLElement>(sel))];
    // text nodes joined with a space: «Segmentos» + counter «0» reads «Segmentos 0», not «Segmentos0»
    const texto = (e: HTMLElement) => { const t: string[] = []; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); while (w.nextNode()) t.push(w.currentNode.textContent || ''); return t.join(' ').replace(/\s+/g, ' ').trim(); };
    const ops = this.items.map((e) => ({ texto: texto(e), off: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' }));
    const i = this.items.findIndex((e) => e.getAttribute('aria-current') === 'page' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-checked') === 'true');
    const firma = JSON.stringify(ops) + i;
    if (firma === this.firma) return;
    this.firma = firma;
    this.opciones.set(ops);
    this.activa.set(i >= 0 ? String(i) : '');
  }
  protected elegir(v: string): void { this.items[+v]?.click(); queueMicrotask(() => this.leer()); }
}

/** Phones: the table reads as cards (see styles.css). Copies each column header into its cells' `data-label`. */
@Directive({ selector: 'table[boTablaMovil]', host: { botablamovil: '' } })
export class BoTablaMovil implements AfterViewChecked {
  private readonly el = inject<ElementRef<HTMLTableElement>>(ElementRef).nativeElement;
  ngAfterViewChecked(): void {
    const ths = [...this.el.querySelectorAll('thead th')].map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim());
    if (!ths.length) return;
    for (const tr of this.el.querySelectorAll('tbody tr')) [...tr.children].forEach((td, i) => {
      // a cell spanning columns (empty state, group row) has no single header
      const l = (td as HTMLTableCellElement).colSpan > 1 ? '' : (ths[i] ?? '');
      if (td.getAttribute('data-label') !== l) td.setAttribute('data-label', l);
    });
  }
}

export interface BoTabOpcion { value: string; label: string; count?: number | null; disabled?: boolean }

/**
 * In-page tabs bound to a value (no router). Desktop: tab row (role tablist, wraps). Phones: `gr-select` with bottom
 * sheet, so no tab is ever hidden behind a horizontal scroll. `<bo-tab-bar [tabs]="[...]" [(value)]="tab" />`
 */
@Component({
  selector: 'bo-tab-bar',
  imports: [GrSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block md:border-b md:border-line-subtle' },
  template: `
    <gr-select class="w-full md:hidden" [aria-label]="label()" [value]="value()" (valorChange)="value.set($event)">
      @for (t of tabs(); track t.value) { <option [value]="t.value" [disabled]="t.disabled">{{ etiqueta(t) }}</option> }
    </gr-select>
    <div class="hidden flex-wrap gap-1 md:flex" role="tablist" [attr.aria-label]="label()">
      @for (t of tabs(); track t.value) {
        <button type="button" role="tab" [attr.aria-selected]="t.value === value()" [disabled]="t.disabled" (click)="value.set(t.value)"
          class="${TAB} disabled:opacity-40" [class]="t.value === value() ? '${TAB_ON}' : '${TAB_OFF}'">
          {{ t.label }}
          @if (t.count !== undefined && t.count !== null) { <span class="text-mono-xs" [class]="t.value === value() ? 'text-accent-text' : 'text-text-tertiary'">{{ t.count }}</span> }
          @if (t.value === value()) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
        </button>
      }
    </div>
  `,
})
export class BoTabBar {
  readonly tabs = input.required<BoTabOpcion[]>();
  readonly value = model.required<string>();
  readonly label = input('Sección');
  protected readonly etiqueta = etiquetaTab;
}

/** Switch (Figma «BO / Toggle»), 44 px touch target. */
@Component({
  selector: 'bo-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" role="switch" [attr.aria-checked]="value()" [attr.aria-label]="label()" [disabled]="disabled()" (click)="flip()"
      class="flex h-11 w-12 items-center justify-center disabled:opacity-40">
      <span class="relative h-6 w-10 rounded-pill transition-colors" [class]="value() ? 'bg-accent' : 'bg-line-strong'">
        <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]" [style.left.px]="value() ? 18 : 2"></span>
      </span>
    </button>
  `,
})
export class BoToggle {
  readonly value = model(false);
  readonly label = input('');
  readonly disabled = input(false);
  readonly changed = output<boolean>();
  protected flip(): void {
    this.value.update((v) => !v);
    this.changed.emit(this.value());
  }
}

/** Right-side drawer (Figma «BO / Drawer»): full screen on mobile, 480 px on desktop, focus trapped, Escape closes. */
@Component({
  selector: 'bo-drawer',
  imports: [A11yModule, GrIconButton, GrBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'open() && close()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-40 bg-black/60" (click)="close()"></div>
      <aside class="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line-strong bg-bg-card shadow-card sm:w-[480px] sm:rounded-l-[20px]" role="dialog" aria-modal="true" [attr.aria-label]="title()" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
        <header class="flex items-center gap-3 border-b border-line-subtle px-6 py-5">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h2 class="truncate text-[20px] leading-[26px] font-semibold">{{ title() }}</h2>
            @if (sub()) { <p class="truncate text-body-xs text-text-tertiary">{{ sub() }}</p> }
          </div>
          @if (badge()) { <gr-badge [tone]="badgeTone()">{{ badge() }}</gr-badge> }
          <button grIconButton icon="x" label="Cerrar" (click)="close()"></button>
        </header>
        <div class="flex-1 overflow-y-auto p-6"><ng-content /></div>
        <footer class="flex flex-wrap justify-end gap-2 border-t border-line-subtle bg-bg-card px-6 py-4 sm:rounded-bl-[20px]"><ng-content select="[drawerActions]" /></footer>
      </aside>
    }
  `,
})
export class BoDrawer {
  readonly open = model(false);
  readonly title = input('');
  readonly sub = input('');
  readonly badge = input('');
  readonly badgeTone = input<GrTone>('warning');
  close(): void {
    this.open.set(false);
  }
}

export interface ConfirmRequest {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
  /** Destructive (Figma 49 «BO / Modal · Destructive»): word the user must type to enable the action, e.g. «ANULAR». */
  word?: string;
  resolve: (ok: boolean) => void;
}

/** Extra context for the mobile topbar title (e.g. «Pesaje · sáb 19/12 09:00»), set by the page. */
@Injectable({ providedIn: 'root' })
export class TituloMovil {
  readonly texto = signal('');
}

/** Confirmation dialog (Figma «BO / Modal»): `await confirm.ask({...})`. */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly current = signal<ConfirmRequest | null>(null);
  /** Text typed in the destructive confirmation field; cleared on every request. */
  readonly typed = signal('');
  ask(r: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    this.typed.set('');
    return new Promise((resolve) => this.current.set({ ...r, resolve }));
  }
  answer(ok: boolean): void {
    this.current()?.resolve(ok);
    this.current.set(null);
  }
}

@Component({
  selector: 'bo-confirm-host',
  imports: [A11yModule, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (c.current(); as r) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="c.answer(false)" (keydown.escape)="c.answer(false)">
        <div class="flex w-full max-w-[520px] flex-col gap-5 rounded-xl border border-line-strong bg-bg-card p-6 shadow-card" role="alertdialog" aria-modal="true" [attr.aria-label]="r.title" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start gap-3">
            <h2 class="min-w-0 flex-1 text-[20px] leading-[26px] font-semibold">{{ r.title }}</h2>
            <button type="button" class="-m-1 rounded-xs p-1 text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" aria-label="Cerrar" (click)="c.answer(false)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="text-body-s text-text-secondary">{{ r.text }}</p>
          @if (r.word) {
            <label class="flex flex-col gap-2">
              <span class="text-label-s text-text-secondary">Escribe {{ r.word }} para confirmar</span>
              <input #w class="h-10 rounded-sm border border-line-strong bg-bg-field px-3 text-body-s text-text-primary focus:border-accent focus:outline-none" autocomplete="off" (input)="c.typed.set(w.value)" />
              <span class="text-body-xs text-text-tertiary">Esta acción queda en el registro de auditoría</span>
            </label>
          }
          <div class="flex justify-end gap-2">
            <button grButton variant="ghost" (click)="c.answer(false)">Cancelar</button>
            <button grButton [variant]="r.danger ? 'danger' : 'primary'" [disabled]="!!r.word && c.typed() !== r.word" (click)="c.answer(true)">{{ r.confirm }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmHost {
  protected readonly c = inject(Confirm);
}

/** Uploads a file to /medios and returns its public URL. */
@Injectable({ providedIn: 'root' })
export class Media {
  private readonly http = inject(HttpClient);
  private readonly comps = inject(Competitions);
  /** `ruta`: upload endpoint under the competition, for the images that do not go to the media library (e.g. the access maps, published in the CDN). */
  async upload(file: File, alt = '', ruta = '/medios'): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('alt', alt);
    const r = await firstValueFrom(this.http.post<{ url: string }>(`/api/admin/competiciones/${this.comps.current()?.id}${ruta}`, fd));
    return r.url;
  }
}

/** Character counter shown under text fields (Figma: «38 / 90»). */
@Component({
  selector: 'bo-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'text-mono-xs', '[class.text-text-muted]': '!over()', '[class.text-accent-text]': 'over()' },
  template: `{{ (value() ?? '').length }} / {{ max() }}`,
})
export class BoCount {
  readonly value = input<string | null | undefined>('');
  readonly max = input.required<number>();
  protected readonly over = computed(() => (this.value() ?? '').length > this.max());
}

export function errText(e: unknown, fallback = 'No se pudo guardar.'): string {
  const p = problemOf(e);
  const field = p.errors?.[0];
  if (!field) return p.detail ?? fallback;
  // huma's schema errors come in English («validation failed», «expected number <= 1000»): never show them raw
  return `Revisa los datos: ${campo(field.location)} ${mensajeCampo(field.message ?? '')}.`;
}

/** «body.pesoPlata» → «pesoPlata» (the last segment is the JSON field the form edits). */
function campo(loc?: string): string {
  const k = (loc ?? '').split('.').pop() ?? '';
  return k ? `«${k}»` : 'un campo';
}

/** Spanish version of the huma/JSON-schema messages. */
function mensajeCampo(m: string): string {
  const n = (x: string) => new Intl.NumberFormat('es-ES').format(Number(x));
  let r: RegExpMatchArray | null;
  if ((r = m.match(/expected number <= (-?[\d.]+)/))) return `debe ser como máximo ${n(r[1])}`;
  if ((r = m.match(/expected number >= (-?[\d.]+)/))) return `debe ser como mínimo ${n(r[1])}`;
  if ((r = m.match(/expected (?:length|number of characters) <= (\d+)/))) return `admite como máximo ${r[1]} caracteres`;
  if ((r = m.match(/expected (?:length|number of characters) >= (\d+)/))) return `necesita al menos ${r[1]} caracteres`;
  if ((r = m.match(/expected array length <= (\d+)/))) return `admite como máximo ${r[1]} elementos`;
  if (/expected required property/.test(m)) return 'es obligatorio';
  if (/expected (?:number|integer)/.test(m)) return 'tiene que ser un número';
  if (/expected string/.test(m)) return 'tiene que ser un texto';
  if (/expected value to be one of/.test(m)) return 'no es una opción válida';
  return 'no es válido';
}
