import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrIcon, GrInput, type GrTone } from '@grcup/ui';
import { Ban, Flag, Keyboard, VolumeX, type IconNode } from 'lucide';

/** Small pieces shared by the «Directo social» screens (Figma page 73, UI v2). */

export type Tier = 'oro' | 'plata' | 'bronce';

export interface TierInfo {
  l: string;
  tone: GrTone;
  /** Medal colour of the tier (Figma variables color/medal/gold · silver · bronze). */
  color: string;
  peso: number;
  /** Badge classes (medal tint, never the brand red: bronze is not an error). */
  badge: string;
}

export const TIERS: Record<Tier, TierInfo> = {
  oro: { l: 'Oro', tone: 'warning', color: '#d4af37', peso: 3, badge: 'border-[#d4af37]/45 bg-[#d4af37]/14 text-[#d4af37]' },
  plata: { l: 'Plata', tone: 'neutral', color: '#c0c4cc', peso: 2, badge: 'border-[#c0c4cc]/45 bg-[#c0c4cc]/14 text-[#c0c4cc]' },
  bronce: { l: 'Bronce', tone: 'neutral', color: '#c8835a', peso: 1, badge: 'border-[#c8835a]/45 bg-[#c8835a]/14 text-[#c8835a]' },
};

export const TIER_LIST: Tier[] = ['oro', 'plata', 'bronce'];

/** Medal colours for the 1st-3rd place markers of the rankings. */
export const MEDALLAS = [TIERS.oro.badge, TIERS.plata.badge, TIERS.bronce.badge];

/** Tier badge (Figma «BO / Tier badge»: medal dot + name). */
@Component({
  selector: 'so-tier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-6 items-center gap-1.5 rounded-2xs border px-2 text-mono-xs whitespace-nowrap " + info().badge' },
  template: `<span class="size-2 rounded-pill" [style.background]="info().color" aria-hidden="true"></span>{{ info().l }}`,
})
export class SoTier {
  readonly tier = input.required<Tier>();
  protected readonly info = computed(() => TIERS[this.tier()]);
}

/** Position marker of a ranking (medal colours for the podium). */
@Component({
  selector: 'so-puesto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex size-7 shrink-0 items-center justify-center rounded-pill border font-mono text-mono-xs " + cls()' },
  template: `{{ n() }}`,
})
export class SoPuesto {
  readonly n = input.required<number>();
  protected readonly cls = computed(() => MEDALLAS[this.n() - 1] ?? 'border-line-strong bg-bg-raised text-text-tertiary');
}

/** Icons the shared set lacks (lucide, same stroke as `gr-icon`). */
const SO_ICONS = { ban: Ban, flag: Flag, keyboard: Keyboard, 'volume-x': VolumeX } satisfies Record<string, IconNode>;
export type SoIconName = keyof typeof SO_ICONS;

@Component({
  selector: 'so-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center', 'aria-hidden': 'true' },
  template: `<svg xmlns="http://www.w3.org/2000/svg" [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    @for (el of nodes(); track $index) {
      @switch (el[0]) {
        @case ('path') { <path [attr.d]="el[1]['d']" /> }
        @case ('circle') { <circle [attr.cx]="el[1]['cx']" [attr.cy]="el[1]['cy']" [attr.r]="el[1]['r']" /> }
        @case ('line') { <line [attr.x1]="el[1]['x1']" [attr.y1]="el[1]['y1']" [attr.x2]="el[1]['x2']" [attr.y2]="el[1]['y2']" /> }
        @case ('rect') { <rect [attr.x]="el[1]['x']" [attr.y]="el[1]['y']" [attr.width]="el[1]['width']" [attr.height]="el[1]['height']" [attr.rx]="el[1]['rx']" /> }
      }
    }
  </svg>`,
})
export class SoIcon {
  readonly name = input.required<SoIconName>();
  readonly size = input(16);
  protected readonly nodes = computed(() => SO_ICONS[this.name()] as unknown as [string, Record<string, string>][]);
}

export interface SoOpcion {
  v: string;
  l: string;
  n?: number | null;
  /** Short label for phones («Silenc.»). */
  c?: string;
  /** «accent»: the counter turns red when > 0 (reported messages, bans). */
  tone?: 'accent';
}

/** Segmented filter with counters (Figma «Filtro segmentado»): 44 px on phones, 36 px on desktop. */
@Component({
  selector: 'so-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex max-w-full min-w-0 items-center gap-0.5 overflow-x-auto rounded-[10px] border border-line-subtle bg-bg-surface p-[3px] [scrollbar-width:none]', role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    @for (o of opciones(); track o.v) {
      <button type="button" [attr.aria-pressed]="o.v === value()" (click)="value.set(o.v)"
        class="inline-flex h-11 min-w-0 shrink-0 items-center justify-center gap-1 rounded-sm border px-2 text-label-s whitespace-nowrap transition-colors sm:gap-1.5 sm:px-3 md:h-8"
        [class]="o.v === value() ? 'border-line-strong bg-bg-raised text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'"
        [class.flex-1]="llenar()">
        @if (o.c) { <span class="sm:hidden">{{ o.c }}</span><span class="hidden sm:inline">{{ o.l }}</span> } @else { {{ o.l }} }
        @if (o.n !== undefined && o.n !== null) {
          <span class="rounded-2xs px-1.5 font-mono text-mono-xs" [class]="o.tone === 'accent' && o.n > 0 ? 'bg-accent text-white' : 'bg-bg-raised text-text-secondary'">{{ o.n }}</span>
        }
      </button>
    }
  `,
})
export class SoSegmented {
  readonly opciones = input.required<SoOpcion[]>();
  readonly value = model.required<string>();
  readonly label = input('');
  /** Stretch the options to the full width (phones). */
  readonly llenar = input(false);
}

/** Card with a UI/H5 title, help line and optional actions (the block of every «Directo social» screen). */
@Component({
  selector: 'so-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5' },
  template: `
    @if (titulo()) {
      <header class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="text-ui-h5 text-text-primary">{{ titulo() }}</h2>
          @if (ayuda()) { <p class="mt-0.5 text-body-xs text-text-tertiary">{{ ayuda() }}</p> }
        </div>
        <ng-content select="[cardActions]" />
      </header>
    }
    <ng-content />
  `,
})
export class SoCard {
  readonly titulo = input('');
  readonly ayuda = input('');
}

/** Setting row: label and help on the left, control on the right (Figma «BO / Toggle row»). */
@Component({
  selector: 'so-ajuste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center justify-between gap-4' },
  template: `
    <div class="min-w-0">
      <p class="text-label-s text-text-primary">{{ label() }}</p>
      @if (ayuda()) { <p class="mt-0.5 text-body-xs text-text-tertiary">{{ ayuda() }}</p> }
    </div>
    <div class="flex shrink-0 items-center gap-2"><ng-content /></div>
  `,
})
export class SoAjuste {
  readonly label = input.required<string>();
  readonly ayuda = input('');
}

/** Small mono group label of a form section («PESO POR TIER»). */
@Component({
  selector: 'so-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block font-mono text-mono-xs text-text-tertiary' },
  template: `<ng-content />`,
})
export class SoGrupo {}

/** Logo / creative thumbnail with a fallback (display initials) when the URL is empty or broken. */
@Component({
  selector: 'so-thumb',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line-strong bg-bg-raised' },
  template: `
    @if (src() && !roto()) {
      <img [src]="src()" [alt]="alt()" class="size-full object-contain" loading="lazy" (error)="roto.set(true)" />
    } @else if (nombre().trim()) {
      <span class="px-1 text-center font-display text-[13px] leading-none tracking-[0.06em] text-text-secondary uppercase italic" aria-hidden="true">{{ marca() }}</span>
    } @else {
      <gr-icon name="camera" [size]="20" class="text-text-muted" />
    }
  `,
})
export class SoThumb {
  readonly src = input<string | null | undefined>('');
  readonly nombre = input('');
  readonly alt = input('');
  protected readonly roto = signal(false);
  protected readonly marca = computed(() => this.nombre().replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 6) || '·');
}

/** Ghost rows while a list loads (same height as the real rows, so nothing jumps). */
@Component({
  selector: 'so-skel-filas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    @for (i of filas(); track i) {
      <div class="flex animate-pulse items-center gap-3 border-b border-line-subtle px-5 py-3.5 last:border-0">
        @if (avatar()) { <span class="size-8 shrink-0 rounded-pill bg-bg-raised"></span> }
        <span class="flex min-w-0 flex-1 flex-col gap-2">
          <span class="h-2.5 rounded-2xs bg-bg-raised" [style.width.%]="28 + ((i * 17) % 20)"></span>
          <span class="h-2.5 rounded-2xs bg-bg-raised" [style.width.%]="52 - ((i * 11) % 18)"></span>
        </span>
        <span class="hidden h-7 w-40 rounded-sm bg-bg-raised sm:block"></span>
      </div>
    }
  `,
})
export class SoSkelFilas {
  readonly n = input(5);
  readonly avatar = input(true);
  protected readonly filas = computed(() => Array.from({ length: this.n() }, (_, i) => i));
}

/** Ghost KPI tiles. */
@Component({
  selector: 'so-skel-kpis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid grid-cols-2 gap-3 lg:grid-cols-4', 'aria-hidden': 'true' },
  template: `
    @for (i of filas(); track i) {
      <div class="flex animate-pulse flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5">
        <span class="h-2.5 w-20 rounded-2xs bg-bg-raised"></span><span class="h-8 w-24 rounded-2xs bg-bg-raised"></span><span class="h-2.5 w-28 rounded-2xs bg-bg-raised"></span>
      </div>
    }
  `,
})
export class SoSkelKpis {
  readonly n = input(4);
  protected readonly filas = computed(() => Array.from({ length: this.n() }, (_, i) => i));
}

/** Sticky save bar shown only with pending changes (Figma «BO / Save bar · Unsaved»). */
@Component({
  selector: 'so-guardar',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sticky bottom-20 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-bg-raised p-4 shadow-card md:bottom-4', role: 'status' },
  template: `
    <gr-icon name="pencil" [size]="20" class="text-warning" />
    <div class="min-w-0 flex-1">
      <p class="text-label-s">{{ titulo() }}</p>
      @if (detalle()) { <p class="text-body-xs text-text-tertiary">{{ detalle() }}</p> }
    </div>
    <div class="flex w-full gap-2 sm:w-auto"><ng-content /></div>
  `,
})
export class SoGuardar {
  readonly titulo = input.required<string>();
  readonly detalle = input('');
}

/** Tag input (Figma «BO / Tag input»): chips + free text, Enter or comma adds. */
@Component({
  selector: 'so-tags',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex min-h-11 flex-wrap items-center gap-1.5 rounded-sm border border-line-strong bg-bg-field p-1.5 transition-[border-color,box-shadow] focus-within:border-accent-text focus-within:ring-2 focus-within:ring-accent/30"
      [class.opacity-50]="disabled()">
      @for (t of items(); track t) {
        <span class="inline-flex h-8 items-center gap-1 rounded-2xs bg-bg-raised pr-1 pl-2 text-label-s text-text-primary">
          {{ t }}
          <button type="button" class="flex size-6 items-center justify-center rounded-2xs text-text-tertiary hover:bg-bg-card hover:text-text-primary"
            [attr.aria-label]="'Quitar ' + t" [disabled]="disabled()" (click)="quitar(t)"><gr-icon name="x" [size]="12" /></button>
        </span>
      }
      <input class="h-8 min-w-[7rem] flex-1 bg-transparent px-1 text-body-s outline-none placeholder:text-text-muted" [placeholder]="placeholder()" [attr.aria-label]="label() || placeholder()"
        [disabled]="disabled()" [value]="nuevo()" [attr.aria-invalid]="error() ? true : null" (input)="escribir($any($event.target).value)" (keydown)="tecla($event)" (blur)="anadir()" />
    </div>
    @if (error()) { <p class="mt-1.5 text-body-xs text-error" role="alert">{{ error() }}</p> }
  `,
})
export class SoTags {
  readonly items = input.required<string[]>();
  readonly placeholder = input('Añadir…');
  readonly label = input('');
  readonly disabled = input(false);
  /** Returns the error of a candidate chip (Spanish, shown under the field) or null when it is valid. */
  readonly validar = input<((v: string) => string | null) | null>(null);
  readonly changed = output<string[]>();
  protected readonly nuevo = signal('');
  protected readonly error = signal('');
  protected quitar(t: string): void {
    this.changed.emit(this.items().filter((x) => x !== t));
  }
  /**
   * A comma typed or pasted adds the chip right away (some inputs never fire keydown for it): if the chip only
   * appeared on blur, the layout would jump under the pointer and the first click on «Guardar» would be lost.
   */
  protected escribir(v: string): void {
    this.error.set('');
    if (!v.includes(',')) {
      this.nuevo.set(v);
      return;
    }
    const partes = v.split(',');
    const resto = partes.pop() ?? '';
    let items = this.items();
    for (const p of partes) {
      const t = p.trim();
      if (!t || items.includes(t)) continue;
      const err = this.validar()?.(t);
      if (err) {
        this.error.set(err);
        this.nuevo.set(t + resto);
        return;
      }
      items = [...items, t];
    }
    this.nuevo.set(resto);
    if (items !== this.items()) this.changed.emit(items);
  }
  protected anadir(): void {
    const v = this.nuevo().trim().replace(/,$/, '').trim();
    if (!v) return;
    const err = this.validar()?.(v);
    if (err) {
      this.error.set(err);
      return;
    }
    this.nuevo.set('');
    if (!this.items().includes(v)) this.changed.emit([...this.items(), v]);
  }
  protected tecla(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.anadir();
    } else if (e.key === 'Backspace' && !this.nuevo() && this.items().length) {
      this.changed.emit(this.items().slice(0, -1));
    }
  }
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const euros = (c?: number | null) => eur.format((c ?? 0) / 100);
export const num = (v?: number | null) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('es-ES').format(v));
/** «1,24 M», «753,9 k»: big figures that must fit a KPI tile. */
export const compacto = (v?: number | null) => {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  const f = (x: number, d: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(x);
  if (a >= 1_000_000) return `${f(v / 1_000_000, 2)} M`;
  if (a >= 100_000) return `${f(v / 1_000, 1)} k`;
  return num(v);
};
/** «35,3 %» (one decimal, Spanish comma). */
export const pct = (parte: number, total: number) => (total ? `${((parte / total) * 100).toFixed(1).replace('.', ',')} %` : '—');

/**
 * Numeric field with thousands separators: while it is not focused the value is shown as «200.000» and while it is
 * being edited the raw number is shown, so the caret does not jump. `cambiado` marks a value that differs from the
 * saved one (amber border).
 */
@Component({
  selector: 'so-number',
  imports: [FormsModule, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.cambiado { border-color: var(--color-warning) !important; } .invalido { border-color: var(--color-error) !important; }`,
  template: `
    <span class="flex flex-col items-end gap-1">
    <span class="flex items-center justify-end gap-2">
      <span [class]="ancho() === 'xs' ? 'block w-[72px] shrink-0' : ancho() === 's' ? 'block w-[88px] shrink-0' : 'block w-[112px] shrink-0'">
        <input grInput class="text-right font-mono" type="text" inputmode="numeric" [class.cambiado]="cambiado()"
          [class.invalido]="!!fuera()" [attr.aria-invalid]="fuera() ? true : null"
          [disabled]="disabled()" [attr.aria-label]="label()" [ngModel]="mostrar()" (ngModelChange)="cambia($event)" (focus)="enfocar()" (blur)="soltar()" />
      </span>
      @if (unidad()) { <span class="w-11 shrink-0 text-body-xs text-text-tertiary">{{ unidad() }}</span> }
    </span>
    @if (fuera()) { <span class="text-right text-body-xs text-error" role="alert">{{ fuera() }}</span> }
    </span>
  `,
})
export class SoNumber {
  readonly valor = input.required<number>();
  readonly label = input('');
  readonly unidad = input('');
  readonly ancho = input<'m' | 's' | 'xs'>('m');
  readonly disabled = input(false);
  readonly cambiado = input(false);
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly changed = output<number>();
  /** Spanish range error next to the field (the page also blocks saving with rangoError). */
  protected readonly fuera = computed(() => rangoError(this.valor(), this.min(), this.max()));
  protected readonly foco = signal(false);
  protected readonly crudo = signal('');
  /** «200.000» (separador de miles de es-ES) mientras no se está escribiendo. */
  protected mostrar(): string {
    return this.foco() ? this.crudo() : num(this.valor());
  }
  protected enfocar(): void {
    this.crudo.set(String(this.valor()));
    this.foco.set(true);
  }
  protected soltar(): void {
    this.foco.set(false);
  }
  protected cambia(v: string): void {
    this.crudo.set(v);
    const limpio = v.replace(/[^\d-]/g, '');
    if (limpio === '' || limpio === '-') return;
    const n = Number(limpio);
    if (!Number.isNaN(n)) this.changed.emit(n);
  }
}
/** «Mínimo 0» / «Máximo 1.000» when v is out of [min, max]; '' when it fits. */
export function rangoError(v: number, min: number | null = null, max: number | null = null): string {
  if (min !== null && v < min) return `Mínimo ${num(min)}`;
  if (max !== null && v > max) return `Máximo ${num(max)}`;
  return '';
}

/** «grcup.es», «youtube.com»: a host name without scheme or path. */
export const esDominio = (v: string) => /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v.trim());

/**
 * Date field with the Spanish format (Figma «sáb 21 nov · AEP-2» / «01/11/2026»): the native picker still opens,
 * but its US-locale text is hidden under our label.
 */
@Component({
  selector: 'so-fecha',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"relative inline-flex h-11 items-center gap-2 rounded-sm border border-line-strong bg-bg-field px-3 text-label-s text-text-primary focus-within:border-accent-text focus-within:ring-2 focus-within:ring-accent/30 md:h-9 " + (bloque() ? "w-full" : "")' },
  template: `
    <gr-icon name="calendar" [size]="16" class="text-text-tertiary" />
    <span class="truncate whitespace-nowrap" [class.text-text-muted]="!value()" aria-hidden="true">{{ texto() }}</span>
    <input type="date" class="absolute inset-0 size-full cursor-pointer opacity-0 [color-scheme:dark]" [attr.aria-label]="label()" [value]="value()" [disabled]="disabled()"
      (click)="abrir($event)" (change)="changed.emit($any($event.target).value)" />
  `,
})
export class SoFecha {
  readonly value = input('');
  readonly label = input.required<string>();
  /** «corto»: «sáb 21 nov»; «num»: «01/11/2026». */
  readonly formato = input<'corto' | 'num'>('corto');
  readonly sufijo = input('');
  readonly disabled = input(false);
  readonly bloque = input(false);
  readonly changed = output<string>();
  protected readonly texto = computed(() => {
    const v = this.value();
    if (!v) return this.formato() === 'num' ? 'dd/mm/aaaa' : 'Elegir día';
    const t = this.formato() === 'num' ? v.split('-').reverse().join('/') : diaCorto(v);
    return this.sufijo() ? `${t} · ${this.sufijo()}` : t;
  });
  protected abrir(e: Event): void {
    try {
      (e.target as HTMLInputElement).showPicker?.();
    } catch {
      /* not allowed (no user gesture): the native input still opens */
    }
  }
}

export const fecha = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace(',', '') : '—');
export const hora = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '—');
export const fechaDia = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) : '');
export const diaCorto = (dia?: string | null) => (dia ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(dia.length === 10 ? dia + 'T12:00:00' : dia)).replace('.', '') : '');
/** «1 nov» (vigencia of a banner). */
export const diaMes = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace('.', '') : '');
export const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '·';
export const ordinal = (n: number) => `${n}.${n === 1 || n === 3 ? 'er' : 'º'}`;

/** Client-side CSV (the paso 17 services have no export endpoint). */
export function descargarCsv(nombre: string, cabeceras: string[], filas: (string | number | null | undefined)[][]): void {
  const celda = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cabeceras.map(celda).join(';'), ...filas.map((f) => f.map(celda).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** «Solo http/https» (the banner destination and the prize links). */
export function urlSegura(v: string): boolean {
  const s = v.trim();
  return /^https?:\/\/[^\s]+$/i.test(s);
}
