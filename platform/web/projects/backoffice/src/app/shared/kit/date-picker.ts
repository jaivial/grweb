import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Input, PLATFORM_ID, booleanAttribute, computed, forwardRef, inject, input, output, signal, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { GrIcon, abrirHoja } from '@grcup/ui';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => new Date(`${s}T00:00:00`);
const fmtDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
let seq = 0;
let abiertoAhora: BoDatePicker | null = null;

/**
 * The one date / time / date-time field of the backoffice (same look as «BO / Date range» and `gr-select`). It replaces
 * `<input type="date|time|datetime-local">` and keeps their value formats: `YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`.
 * ControlValueAccessor (`[(ngModel)]`, `formControl`) or `[value]` + `(valueChange)`.
 * Desktop: popover under the field (top layer). Phones (< 768 px): bottom sheet, same motion as `gr-select`.
 */
@Component({
  selector: 'bo-date-picker',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => BoDatePicker), multi: true }],
  host: { class: 'relative flex w-full min-w-0', '[attr.id]': 'null', '[attr.aria-label]': 'null' },
  template: `
    <button #control type="button" aria-haspopup="dialog" [id]="id() || uid" [attr.aria-label]="ariaLabel() || null" [attr.aria-expanded]="abierto()"
      [attr.aria-invalid]="invalido() || null" [disabled]="bloqueado()" (click)="abierto() ? cerrar(true) : abrir()" (keydown.arrowdown)="$event.preventDefault(); abrir()"
      class="inline-flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border bg-bg-field px-3 text-left text-body-s transition-[border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 md:pointer-fine:h-10"
      [class]="invalido() || abierto() ? 'border-accent-text' : 'border-line-strong hover:border-text-muted'">
      <gr-icon [name]="tipo() === 'time' ? 'clock' : 'calendar'" [size]="16" class="shrink-0 text-text-tertiary" />
      <span class="min-w-0 flex-1 truncate" [class]="valor() ? 'text-text-primary' : 'text-text-muted'">{{ texto() || placeholder() }}</span>
      <gr-icon [name]="abierto() ? 'chevron-up' : 'chevron-down'" [size]="16" class="shrink-0 text-text-tertiary" />
    </button>
    @if (abierto()) {
      <div #capa (click)="hoja() && cerrar(true)" (keydown.escape)="cerrar(true)"
        [class]="hoja() ? 'fixed inset-0 z-[90] m-0 flex h-dvh max-h-none w-screen max-w-none flex-col justify-end border-0 bg-black/55 p-0 opacity-0' : 'fixed inset-auto z-[90] m-0 overflow-visible border-0 bg-transparent p-0'"
        [style.top.px]="hoja() ? null : pos().top" [style.left.px]="hoja() ? null : pos().left" [style.visibility]="hoja() || pos().listo ? null : 'hidden'">
        <div #panel role="dialog" aria-modal="true" [attr.aria-label]="ariaLabel() || 'Elegir fecha'" (click)="$event.stopPropagation()" (mousedown)="hoja() || $event.preventDefault()"
          [class]="hoja() ? 'flex max-h-[85dvh] translate-y-full flex-col overflow-y-auto rounded-t-[20px] border-t border-line-strong bg-bg-raised pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgb(0_0_0/0.5)]'
            : 'flex w-max max-w-[calc(100vw-16px)] flex-col rounded-lg border border-line-strong bg-bg-raised shadow-[0_12px_32px_rgb(0_0_0/0.5)]'">
          @if (hoja()) {
            <div class="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
              <span class="text-ui-h5 text-text-primary">{{ ariaLabel() || (tipo() === 'time' ? 'Elige la hora' : 'Elige la fecha') }}</span>
              <button type="button" class="-mr-2 flex size-11 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar(true)"><gr-icon name="x" [size]="22" /></button>
            </div>
          }
          <div class="flex flex-col md:flex-row">
            @if (tipo() !== 'time') {
              <div class="flex flex-col gap-2 p-4 md:w-[300px]">
                <div class="flex items-center justify-between text-label-s capitalize">
                  <button type="button" class="flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover md:size-8" aria-label="Mes anterior" (click)="mes(-1)"><gr-icon name="chevron-left" [size]="16" /></button>
                  {{ tituloMes() }}
                  <button type="button" class="flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover md:size-8" aria-label="Mes siguiente" (click)="mes(1)"><gr-icon name="chevron-right" [size]="16" /></button>
                </div>
                <div class="grid grid-cols-7 gap-1 text-center">
                  @for (h of cabeceras; track $index) { <span class="flex h-6 items-center justify-center text-mono-xs text-text-muted">{{ h }}</span> }
                  @for (c of celdas(); track $index) {
                    @if (c) {
                      <button type="button" (click)="dia(c)" [disabled]="fuera(c)" [attr.aria-pressed]="c === fecha()" [attr.aria-label]="c"
                        class="h-10 rounded-sm text-body-s focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] disabled:opacity-30 md:h-8"
                        [class]="c === fecha() ? 'bg-accent font-semibold text-white' : c === hoy ? 'text-text-primary ring-1 ring-line-strong ring-inset hover:bg-bg-hover' : 'text-text-secondary enabled:hover:bg-bg-hover'">{{ +c.slice(8) }}</button>
                    } @else { <span></span> }
                  }
                </div>
              </div>
            }
            @if (tipo() !== 'date') {
              <div class="flex gap-2 border-line-subtle p-4 md:border-l" [class.border-t]="tipo() === 'datetime'" [class.md:border-t-0]="true">
                @for (col of columnas(); track col.k) {
                  <div class="flex min-w-0 flex-1 flex-col gap-1 md:w-16 md:flex-none">
                    <span class="text-center text-mono-xs text-text-muted">{{ col.k === 'h' ? 'Hora' : 'Min' }}</span>
                    <div class="flex h-[220px] flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]" [attr.data-col]="col.k">
                      @for (v of col.v; track v) {
                        <button type="button" (click)="hora(col.k, v)" [attr.data-sel]="v === (col.k === 'h' ? hh() : mm()) || null"
                          class="flex h-10 shrink-0 items-center justify-center rounded-sm text-body-s tabular-nums md:h-8"
                          [class]="v === (col.k === 'h' ? hh() : mm()) ? 'bg-accent font-semibold text-white' : 'text-text-secondary hover:bg-bg-hover'">{{ v }}</button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
          <div class="flex items-center justify-between gap-2 border-t border-line-subtle px-4 py-3">
            <div class="flex gap-1">
              @if (tipo() !== 'time') { <button type="button" class="h-10 rounded-sm px-3 text-label-s text-text-secondary hover:bg-bg-hover md:h-9" (click)="ahora()">{{ tipo() === 'date' ? 'Hoy' : 'Ahora' }}</button> }
              @if (borrable()) { <button type="button" class="h-10 rounded-sm px-3 text-label-s text-text-tertiary hover:bg-bg-hover md:h-9" (click)="emitir(''); cerrar(true)">Borrar</button> }
            </div>
            @if (tipo() !== 'date') {
              <button type="button" class="h-10 rounded-sm bg-accent px-4 text-label-s text-white hover:bg-accent/90 disabled:opacity-40 md:h-9" [disabled]="!listo()" (click)="aplicar()">Aplicar</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class BoDatePicker implements ControlValueAccessor {
  readonly tipo = input<'date' | 'time' | 'datetime'>('date');
  readonly placeholder = input('Sin fecha');
  /** Earliest / latest selectable day (`YYYY-MM-DD`, also accepts a datetime). */
  readonly min = input('');
  readonly max = input('');
  /** Minute step of the time column. */
  readonly paso = input(5);
  /** Shows «Borrar» (empty value allowed). */
  readonly borrable = input(true, { transform: booleanAttribute });
  readonly invalido = input(false, { transform: booleanAttribute });
  readonly id = input('');
  readonly ariaLabel = input('', { alias: 'aria-label' });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly valueChange = output<string>();
  @Input() set value(v: unknown) { this.valor.set(v == null ? '' : String(v)); }

  protected readonly uid = `bo-date-${++seq}`;
  protected readonly valor = signal('');
  protected readonly abierto = signal(false);
  protected readonly hoja = signal(false);
  protected readonly pos = signal({ top: 0, left: 0, listo: false });
  protected readonly vista = signal(new Date());
  /** Draft while the panel is open. */
  protected readonly fecha = signal('');
  protected readonly hh = signal('');
  protected readonly mm = signal('');
  protected readonly hoy = iso(new Date());
  protected readonly cabeceras = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  private readonly cva = signal(false);
  protected readonly bloqueado = computed(() => this.disabled() || this.cva());
  private readonly control = viewChild.required<ElementRef<HTMLButtonElement>>('control');
  private readonly capa = viewChild<ElementRef<HTMLElement>>('capa');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private quitar: (() => void)[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.limpiar(); if (abiertoAhora === this) abiertoAhora = null; });
  }

  protected readonly texto = computed(() => {
    const v = this.valor();
    if (!v) return '';
    if (this.tipo() === 'time') return v.slice(0, 5);
    const d = v.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return v;
    const f = fmtDia.format(parse(d)).replace(/\./g, '');
    return this.tipo() === 'datetime' && v.length >= 16 ? `${f} · ${v.slice(11, 16)}` : f;
  });
  protected readonly tituloMes = computed(() => fmtMes.format(this.vista()));
  protected readonly celdas = computed(() => {
    const v = this.vista();
    const n = new Date(v.getFullYear(), v.getMonth() + 1, 0).getDate();
    const lead = (new Date(v.getFullYear(), v.getMonth(), 1).getDay() + 6) % 7;
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => iso(new Date(v.getFullYear(), v.getMonth(), i + 1)))] as (string | null)[];
  });
  protected readonly columnas = computed(() => [
    { k: 'h' as const, v: Array.from({ length: 24 }, (_, i) => pad(i)) },
    { k: 'm' as const, v: Array.from({ length: Math.ceil(60 / Math.max(1, this.paso())) }, (_, i) => pad(i * Math.max(1, this.paso()))) },
  ]);
  protected readonly listo = computed(() => (this.tipo() === 'time' || !!this.fecha()) && !!this.hh() && !!this.mm());

  writeValue(v: unknown): void { this.valor.set(v == null ? '' : String(v)); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.cva.set(d); if (d) this.cerrar(false); }

  protected fuera(c: string): boolean {
    const min = this.min().slice(0, 10), max = this.max().slice(0, 10);
    return (!!min && c < min) || (!!max && c > max);
  }

  protected abrir(): void {
    if (this.bloqueado() || !this.browser || this.abierto()) return;
    if (abiertoAhora && abiertoAhora !== this) abiertoAhora.cerrar(false);
    abiertoAhora = this;
    const v = this.valor();
    const t = this.tipo();
    this.fecha.set(t === 'time' ? '' : v.slice(0, 10));
    const hm = t === 'time' ? v.slice(0, 5) : v.slice(11, 16);
    this.hh.set(hm.slice(0, 2)); this.mm.set(hm.slice(3, 5));
    this.vista.set(this.fecha() ? parse(this.fecha()) : new Date());
    this.hoja.set(window.matchMedia('(max-width: 767px)').matches);
    this.pos.set({ top: 0, left: 0, listo: false });
    this.abierto.set(true);
    requestAnimationFrame(() => {
      const capa = this.capa()?.nativeElement, panel = this.panel()?.nativeElement;
      if (!capa || !panel) return;
      if ('showPopover' in capa) { capa.setAttribute('popover', 'manual'); try { (capa as HTMLElement & { showPopover(): void }).showPopover(); } catch { /* shown */ } }
      if (this.hoja()) this.quitar.push(abrirHoja(capa, panel));
      else this.colocar();
      // scroll the time columns to the chosen value
      // only the column scrolls (scrollIntoView would also move the sheet and the page)
      panel.querySelectorAll<HTMLElement>('[data-sel]').forEach((b) => { const col = b.parentElement!; col.scrollTop = b.offsetTop - col.offsetTop - col.clientHeight / 2 + b.offsetHeight / 2; });
      (panel.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
      const fuera = (e: Event) => { if (!this.host.contains(e.target as Node) && !capa.contains(e.target as Node)) this.cerrar(false); };
      const recolocar = () => this.colocar();
      document.addEventListener('pointerdown', fuera, true);
      window.addEventListener('resize', recolocar);
      window.addEventListener('scroll', recolocar, true);
      this.quitar.push(() => { document.removeEventListener('pointerdown', fuera, true); window.removeEventListener('resize', recolocar); window.removeEventListener('scroll', recolocar, true); });
    });
  }

  private colocar(): void {
    const capa = this.capa()?.nativeElement;
    if (!capa || this.hoja()) return;
    const r = this.control().nativeElement.getBoundingClientRect();
    const alto = capa.offsetHeight, ancho = capa.offsetWidth;
    const abajo = window.innerHeight - r.bottom - 8, arriba = r.top - 8;
    const top = alto + 6 <= abajo || abajo >= arriba ? r.bottom + 6 : Math.max(8, r.top - 6 - alto);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - ancho - 8));
    this.pos.set({ top, left, listo: true });
  }

  protected cerrar(foco: boolean): void {
    if (!this.abierto()) return;
    if (abiertoAhora === this) abiertoAhora = null;
    this.limpiar();
    this.abierto.set(false);
    this.onTouched();
    if (foco) this.control().nativeElement.focus();
  }

  private limpiar(): void { for (const q of this.quitar.splice(0)) q(); }

  protected mes(n: number): void { const v = this.vista(); this.vista.set(new Date(v.getFullYear(), v.getMonth() + n, 1)); }

  protected dia(c: string): void {
    this.fecha.set(c);
    if (this.tipo() === 'date') { this.emitir(c); this.cerrar(true); }
    else if (!this.hh()) { this.hh.set('10'); this.mm.set('00'); }
  }

  protected hora(k: 'h' | 'm', v: string): void {
    if (k === 'h') { this.hh.set(v); if (!this.mm()) this.mm.set('00'); } else { this.mm.set(v); if (!this.hh()) this.hh.set('00'); }
  }

  protected ahora(): void {
    const d = new Date();
    if (this.tipo() === 'date') { this.emitir(iso(d)); return this.cerrar(true); }
    const p = Math.max(1, this.paso());
    this.fecha.set(iso(d)); this.vista.set(d);
    this.hh.set(pad(d.getHours())); this.mm.set(pad(Math.floor(d.getMinutes() / p) * p));
  }

  protected aplicar(): void {
    if (!this.listo()) return;
    const hm = `${this.hh()}:${this.mm()}`;
    this.emitir(this.tipo() === 'time' ? hm : `${this.fecha()}T${hm}`);
    this.cerrar(true);
  }

  protected emitir(v: string): void {
    if (v === this.valor()) return;
    this.valor.set(v);
    this.onChange(v);
    this.valueChange.emit(v);
  }
}
