import {
  AfterContentChecked, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Input, PLATFORM_ID, booleanAttribute, computed, forwardRef, inject, input, output,
  signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { GrIcon } from './icon';

/** One choice of a `gr-select`, read from the projected `<option>` elements. */
export interface GrOpcion { valor: string; etiqueta: string; deshabilitada: boolean }

let siguiente = 0;
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * The one dropdown of the web and the backoffice (Figma «Select»: Campo · Filtro · Hoja móvil). It replaces the native
 * `<select>`: write the same `<option>` elements inside, and bind it with `[(ngModel)]` / `formControl` (it is a
 * ControlValueAccessor, values are strings like a native select's).
 *
 * - `tipo="campo"` (forms, full width) or `tipo="filtro"` (listings, 44 px; with a value it reads «Etiqueta: valor» on
 *   an accent background, unless `[resaltar]="false"`, e.g. for a sort order).
 * - `tam="l"` (web forms, 48 px, Body/M) or `tam="m"` (backoffice, 44 px · 40 px on desktop, Body/S).
 * - Keyboard as the WAI-ARIA select-only combobox: Enter/Space/↓/↑ open, ↑↓ Home End move, letters jump, Enter picks,
 *   Esc closes. Focus stays on the control (aria-activedescendant).
 * - Desktop: a menu under the control (above it when there is no room), in the top layer so no container clips it,
 *   six options visible. Phones (< 768 px): a bottom sheet with 52 px options; the page does not scroll behind it.
 * - `id` and `aria-label` go to the control itself, so `<label for>` and `gr-field` work as with a native select.
 */
@Component({
  selector: 'gr-select',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GrSelect), multi: true }],
  host: {
    class: 'relative inline-flex min-w-0 align-middle',
    '[class.w-full]': "tipo() === 'campo'",
    '[attr.id]': 'null',
    '[attr.aria-label]': 'null',
    '[attr.aria-describedby]': 'null',
  },
  template: `
    <div #opciones hidden><ng-content /></div>
    <button #control type="button" role="combobox" aria-haspopup="listbox" [id]="idControl()" [attr.aria-label]="ariaLabel() || null"
      [attr.aria-expanded]="abierto()" [attr.aria-controls]="uid + '-lista'" [attr.aria-activedescendant]="abierto() && activo() >= 0 ? uid + '-' + activo() : null"
      [attr.aria-invalid]="invalido() || null" [attr.aria-describedby]="describedby() || null" [disabled]="bloqueado()"
      [class]="claseControl()" (click)="alternar()" (keydown)="tecla($event)" (blur)="alSalir()">
      @if (tipo() === 'filtro' && etiqueta() && valor() && seleccion()) { <span class="shrink-0 text-text-tertiary">{{ prefijo() }}</span> }
      <span class="min-w-0 flex-1 truncate text-left" [class.text-text-muted]="tipo() === 'campo' && !seleccion()">{{ texto() }}</span>
      <gr-icon name="chevron-down" [size]="16" class="shrink-0 transition-transform duration-150" [class.rotate-180]="abierto()"
        [class]="tipo() === 'filtro' && activa() ? 'text-accent-text' : 'text-text-tertiary'" />
    </button>
    @if (abierto()) {
      @if (hoja()) {
        <div #capa class="fixed inset-0 z-[90] m-0 flex h-dvh max-h-none w-screen max-w-none flex-col justify-end border-0 bg-black/55 p-0" (click)="cerrar(true)">
          <div class="flex max-h-[75dvh] flex-col rounded-t-[20px] border-t border-line-strong bg-bg-raised pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgb(0_0_0/0.5)]" (click)="$event.stopPropagation()">
            <div class="flex flex-col items-center gap-3 px-5 pt-2 pb-3">
              <span class="h-1 w-10 rounded-pill bg-line-strong" aria-hidden="true"></span>
              <div class="flex w-full items-center justify-between gap-3">
                <span class="text-ui-h5 text-text-primary">{{ titulo() }}</span>
                <button type="button" class="-mr-2 flex size-11 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar(true)"><gr-icon name="x" [size]="22" /></button>
              </div>
            </div>
            <ul [id]="uid + '-lista'" role="listbox" [attr.aria-label]="titulo()" class="flex flex-col overflow-y-auto overscroll-contain px-3 pb-6">
              @for (o of lista(); track $index; let i = $index) {
                <li [id]="uid + '-' + i" role="option" [attr.aria-selected]="o.valor === valor()" [attr.aria-disabled]="o.deshabilitada || null"
                  class="flex min-h-[52px] shrink-0 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-body-l"
                  [class]="o.deshabilitada ? 'cursor-not-allowed opacity-40' : o.valor === valor() ? 'bg-accent/14 text-text-primary' : i === activo() ? 'bg-white/5 text-text-secondary' : 'text-text-secondary'"
                  (click)="elegir(i)">
                  <span class="min-w-0 flex-1">{{ o.etiqueta }}</span>
                  @if (o.valor === valor()) { <gr-icon name="check" [size]="20" class="shrink-0 text-accent-text" /> }
                </li>
              } @empty { <li class="px-3 py-4 text-center text-body-s text-text-tertiary">{{ vacio() }}</li> }
            </ul>
          </div>
        </div>
      } @else {
        <ul #capa [id]="uid + '-lista'" role="listbox" [attr.aria-label]="titulo()" (mousedown)="$event.preventDefault()"
          class="fixed inset-auto z-[90] m-0 flex max-h-[284px] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-md border border-line-strong bg-bg-raised p-1.5 text-text-primary shadow-[0_16px_40px_rgb(0_0_0/0.5)]"
          [style.top.px]="pos().top" [style.left.px]="pos().left" [style.min-width.px]="pos().ancho" [style.visibility]="pos().listo ? null : 'hidden'">
          @for (o of lista(); track $index; let i = $index) {
            <li [id]="uid + '-' + i" role="option" [attr.aria-selected]="o.valor === valor()" [attr.aria-disabled]="o.deshabilitada || null"
              class="flex min-h-11 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5"
              [class]="(tam() === 'l' ? 'text-body-m ' : 'text-body-s ') + (o.deshabilitada ? 'cursor-not-allowed opacity-40' : o.valor === valor() ? 'bg-accent/14 text-text-primary' : i === activo() ? 'bg-white/5 text-text-primary' : 'text-text-secondary')"
              (click)="elegir(i)" (mousemove)="o.deshabilitada || activo.set(i)">
              <span class="min-w-0 flex-1 whitespace-nowrap">{{ o.etiqueta }}</span>
              @if (o.valor === valor()) { <gr-icon name="check" [size]="16" class="shrink-0 text-accent-text" /> }
            </li>
          } @empty { <li class="px-3 py-4 text-center text-body-s text-text-tertiary">{{ vacio() }}</li> }
        </ul>
      }
    }
  `,
})
export class GrSelect implements ControlValueAccessor, AfterContentChecked {
  readonly tipo = input<'campo' | 'filtro'>('campo');
  readonly tam = input<'m' | 'l'>('m');
  /** Filtro: label before the value («Categoría: −83 kg») and title of the mobile sheet. */
  readonly etiqueta = input('');
  /** Filtro: accent background while it has a value (off for sort orders, which always have one). */
  readonly resaltar = input(true, { transform: booleanAttribute });
  readonly invalido = input(false, { transform: booleanAttribute });
  readonly id = input('');
  readonly ariaLabel = input('', { alias: 'aria-label' });
  readonly describedby = input('', { alias: 'aria-describedby' });
  /** Text of the menu with no options («Elige primero el sexo…»). */
  readonly vacio = input('Sin opciones');
  /** Emits the picked value (also without ngModel). */
  readonly valorChange = output<string>();
  /** Value without ngModel (e.g. generated forms): `[value]="…" (valorChange)="…"`. */
  @Input() set value(v: unknown) { this.valor.set(v == null ? '' : String(v)); }

  protected readonly uid = `gr-select-${++siguiente}`;
  protected readonly valor = signal('');
  protected readonly lista = signal<GrOpcion[]>([]);
  protected readonly abierto = signal(false);
  protected readonly hoja = signal(false);
  protected readonly activo = signal(-1);
  protected readonly pos = signal({ top: 0, left: 0, ancho: 0, listo: false });
  private readonly deshabilitadoCva = signal(false);
  private readonly opcionesEl = viewChild.required<ElementRef<HTMLElement>>('opciones');
  private readonly control = viewChild.required<ElementRef<HTMLButtonElement>>('control');
  private readonly capa = viewChild<ElementRef<HTMLElement>>('capa');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private firma = '';
  private busqueda = '';
  private busquedaHasta = 0;
  private quitar: (() => void)[] = [];

  protected readonly idControl = computed(() => this.id() || this.uid);
  protected readonly bloqueado = computed(() => this.deshabilitadoCva());
  protected readonly seleccion = computed(() => this.lista().find((o) => o.valor === this.valor()) ?? null);
  /** The empty-value option (if any) is the placeholder of a field and the «all» choice of a filter. */
  protected readonly activa = computed(() => this.resaltar() && !!this.valor() && !!this.seleccion());
  protected readonly prefijo = computed(() => { const e = this.etiqueta(); return /[:.]$/.test(e) ? e + ' ' : e + ':'; });
  protected readonly texto = computed(() => {
    // an empty filter shows its label («Categoría»); the empty option («Todas») is its «all» choice in the menu
    if (this.tipo() === 'filtro' && !this.valor() && this.etiqueta()) return this.etiqueta();
    const s = this.seleccion();
    if (s) return s.etiqueta;
    return this.lista().find((o) => o.valor === '')?.etiqueta || this.etiqueta() || '';
  });
  protected readonly titulo = computed(() => this.etiqueta() || this.ariaLabel() || this.lista().find((o) => o.valor === '')?.etiqueta || 'Elige una opción');
  protected readonly claseControl = computed(() => {
    const base = 'inline-flex w-full min-w-0 items-center gap-1.5 rounded-sm border text-left transition-[border-color,box-shadow,background-color] duration-150 ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 ';
    const borde = this.invalido() ? 'border-accent-text ' : this.abierto() ? 'border-accent-text ' : '';
    if (this.tipo() === 'filtro') {
      const alto = this.tam() === 'l' ? 'h-11 ' : 'h-11 md:h-10 ';
      return base + alto + 'px-3.5 text-label-s ' + (borde || (this.activa() ? 'border-accent ' : 'border-line-strong hover:border-text-muted ')) +
        (this.activa() ? 'bg-accent/10 text-text-primary' : 'bg-bg-field text-text-secondary');
    }
    const alto = this.tam() === 'l' ? 'h-12 px-3.5 text-body-m ' : 'h-11 px-3 text-body-s md:h-10 ';
    return base + alto + 'bg-bg-field text-text-primary focus-visible:border-accent-text ' + (borde || 'border-line-strong hover:border-text-muted');
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.limpiar());
  }

  /** Reads the projected options after every check of the parent (they can change with the data). */
  ngAfterContentChecked(): void {
    const els = Array.from(this.opcionesEl().nativeElement.querySelectorAll('option'));
    const lista: GrOpcion[] = els.map((o) => {
      const v = (o as HTMLOptionElement & { value?: unknown }).value;
      const etiqueta = (o.textContent || '').replace(/\s+/g, ' ').trim();
      return { valor: v != null ? String(v) : o.getAttribute('value') ?? etiqueta, etiqueta, deshabilitada: !!(o as HTMLOptionElement).disabled || o.hasAttribute('disabled') };
    });
    const firma = JSON.stringify(lista);
    if (firma !== this.firma) { this.firma = firma; this.lista.set(lista); }
  }

  writeValue(v: unknown): void { this.valor.set(v == null ? '' : String(v)); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.deshabilitadoCva.set(d); if (d) this.cerrar(false); }

  protected alternar(): void { if (this.abierto()) this.cerrar(true); else this.abrir(); }

  protected alSalir(): void { if (!this.abierto()) this.onTouched(); }

  private indiceSel(): number { return this.lista().findIndex((o) => o.valor === this.valor()); }

  private abrir(activo = this.indiceSel()): void {
    if (this.bloqueado() || !this.browser) return;
    this.hoja.set(window.matchMedia('(max-width: 767px)').matches);
    this.activo.set(activo >= 0 ? activo : this.mover(-1, 1));
    this.pos.set({ top: 0, left: 0, ancho: 0, listo: false });
    this.abierto.set(true);
    requestAnimationFrame(() => {
      const capa = this.capa()?.nativeElement;
      if (!capa) return;
      // top layer: no overflow-hidden or transformed ancestor can clip or offset it
      if ('showPopover' in capa) { capa.setAttribute('popover', 'manual'); try { (capa as HTMLElement & { showPopover(): void }).showPopover(); } catch { /* already shown */ } }
      if (this.hoja()) { document.documentElement.style.overflow = 'hidden'; this.quitar.push(() => (document.documentElement.style.overflow = '')); }
      else this.colocar();
      this.verActivo();
      const fuera = (e: Event) => { if (!this.host.nativeElement.contains(e.target as Node)) this.cerrar(false); };
      const recolocar = () => this.colocar();
      document.addEventListener('pointerdown', fuera, true);
      window.addEventListener('resize', recolocar);
      window.addEventListener('scroll', recolocar, true);
      this.quitar.push(() => { document.removeEventListener('pointerdown', fuera, true); window.removeEventListener('resize', recolocar); window.removeEventListener('scroll', recolocar, true); });
    });
  }

  /** Under the control, or above it when there is no room below; inside the viewport. */
  private colocar(): void {
    const capa = this.capa()?.nativeElement;
    if (!capa || this.hoja()) return;
    const r = this.control().nativeElement.getBoundingClientRect();
    const ancho = Math.max(r.width, this.tipo() === 'filtro' ? 220 : 0);
    const alto = capa.offsetHeight, anchoReal = Math.max(ancho, capa.offsetWidth);
    const abajo = window.innerHeight - r.bottom - 8, arriba = r.top - 8;
    const top = alto + 6 <= abajo || abajo >= arriba ? r.bottom + 6 : Math.max(8, r.top - 6 - alto);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - anchoReal - 8));
    this.pos.set({ top, left, ancho, listo: true });
  }

  protected cerrar(devolverFoco: boolean): void {
    if (!this.abierto()) return;
    this.limpiar();
    this.abierto.set(false);
    this.onTouched();
    if (devolverFoco) this.control().nativeElement.focus();
  }

  private limpiar(): void { for (const q of this.quitar.splice(0)) q(); }

  protected elegir(i: number): void {
    const o = this.lista()[i];
    if (!o || o.deshabilitada) return;
    if (o.valor !== this.valor()) {
      this.valor.set(o.valor);
      this.onChange(o.valor);
      this.valorChange.emit(o.valor);
    }
    this.cerrar(true);
  }

  /** Next enabled option from `desde` in direction `paso` (stays put at the ends). */
  private mover(desde: number, paso: 1 | -1): number {
    const l = this.lista();
    for (let i = desde + paso; i >= 0 && i < l.length; i += paso) if (!l[i].deshabilitada) return i;
    return desde;
  }

  private verActivo(): void {
    const i = this.activo();
    if (i < 0) return;
    requestAnimationFrame(() => document.getElementById(`${this.uid}-${i}`)?.scrollIntoView({ block: 'nearest' }));
  }

  protected tecla(e: KeyboardEvent): void {
    const abierto = this.abierto(), n = this.lista().length;
    const tecla = e.key;
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(tecla)) {
        e.preventDefault();
        const sel = this.indiceSel();
        this.abrir(tecla === 'Home' ? this.mover(-1, 1) : tecla === 'End' ? this.mover(n, -1) : sel);
      } else if (tecla.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const i = this.buscar(tecla);
        if (i >= 0) { e.preventDefault(); this.abrir(i); }
      }
      return;
    }
    switch (tecla) {
      case 'ArrowDown': e.preventDefault(); this.activo.set(this.mover(this.activo(), 1)); break;
      case 'ArrowUp': e.preventDefault(); this.activo.set(this.mover(this.activo(), -1)); break;
      case 'Home': e.preventDefault(); this.activo.set(this.mover(-1, 1)); break;
      case 'End': e.preventDefault(); this.activo.set(this.mover(n, -1)); break;
      case 'PageDown': e.preventDefault(); this.activo.set(Math.min(n - 1, this.activo() + 6)); break;
      case 'PageUp': e.preventDefault(); this.activo.set(Math.max(0, this.activo() - 6)); break;
      case 'Enter': case ' ': e.preventDefault(); this.elegir(this.activo()); return;
      case 'Escape': e.preventDefault(); e.stopPropagation(); this.cerrar(true); return;
      case 'Tab': this.cerrar(false); return;
      default:
        if (tecla.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const i = this.buscar(tecla); if (i >= 0) { e.preventDefault(); this.activo.set(i); } }
        return;
    }
    this.verActivo();
  }

  /** Type-ahead: letters typed within 600 ms build a prefix (accents ignored); the next match after the active one. */
  private buscar(letra: string): number {
    const ahora = Date.now();
    this.busqueda = (ahora < this.busquedaHasta ? this.busqueda : '') + sinAcentos(letra);
    this.busquedaHasta = ahora + 600;
    const l = this.lista(), desde = Math.max(0, this.abierto() ? this.activo() : this.indiceSel());
    const repetida = this.busqueda.length > 1 && this.busqueda.split('').every((c) => c === this.busqueda[0]);
    const q = repetida ? this.busqueda[0] : this.busqueda;
    for (let k = 1; k <= l.length; k++) {
      const i = (desde + (q.length === 1 ? k : k - 1)) % l.length;
      if (!l[i].deshabilitada && sinAcentos(l[i].etiqueta).startsWith(q)) return i;
    }
    return -1;
  }
}
