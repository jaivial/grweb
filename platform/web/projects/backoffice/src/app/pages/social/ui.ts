import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrIcon, GrInput, type GrTone } from '@grcup/ui';

/** Small pieces shared by the «Directo social» screens (Figma page 73). */

export type Tier = 'oro' | 'plata' | 'bronce';

export interface TierInfo {
  l: string;
  tone: GrTone;
  /** Dot / fill colour of the tier (Figma «BO / Tier badge»). */
  color: string;
  peso: number;
}

export const TIERS: Record<Tier, TierInfo> = {
  oro: { l: 'Oro', tone: 'warning', color: '#d99a2b', peso: 3 },
  plata: { l: 'Plata', tone: 'neutral', color: '#9ca3af', peso: 2 },
  bronce: { l: 'Bronce', tone: 'danger', color: '#c42b3e', peso: 1 },
};

export const TIER_LIST: Tier[] = ['oro', 'plata', 'bronce'];

/** Tier badge of the Figma (dot + name). */
@Component({
  selector: 'so-tier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"inline-flex h-6 items-center gap-1.5 rounded-2xs border px-2 text-mono-xs whitespace-nowrap " + cls()',
  },
  template: `<span class="size-1.5 rounded-pill" [style.background]="info().color"></span>{{ info().l }}`,
})
export class SoTier {
  readonly tier = input.required<Tier>();
  protected readonly info = computed(() => TIERS[this.tier()]);
  protected readonly cls = computed(() => {
    const t = TIERS[this.tier()];
    return t.tone === 'warning' ? 'border-warning/30 bg-warning/10 text-warning' : t.tone === 'danger' ? 'border-accent-text/30 bg-accent-deep/30 text-accent-text' : 'border-line-strong bg-bg-raised text-text-secondary';
  });
}

/** Tag input (Figma «BO / Tag input»): chips + free text, Enter or comma adds. */
@Component({
  selector: 'so-tags',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex min-h-11 flex-wrap items-center gap-1.5 rounded-sm border border-line-strong bg-bg-field p-2">
      @for (t of items(); track t) {
        <span class="inline-flex h-7 items-center gap-1 rounded-2xs bg-bg-raised px-2 text-label-xs text-text-primary">
          {{ t }}
          <button type="button" class="-mr-1 flex size-5 items-center justify-center rounded-2xs text-text-tertiary hover:bg-bg-card hover:text-text-primary"
            [attr.aria-label]="'Quitar ' + t" (click)="quitar(t)"><gr-icon name="x" [size]="12" /></button>
        </span>
      }
      <input class="min-w-[7rem] flex-1 bg-transparent text-body-s outline-none placeholder:text-text-muted" [placeholder]="placeholder()"
        [value]="nuevo()" (input)="nuevo.set($any($event.target).value)" (keydown)="tecla($event)" (blur)="anadir()" />
    </div>
  `,
})
export class SoTags {
  readonly items = input.required<string[]>();
  readonly placeholder = input('Añadir…');
  readonly changed = output<string[]>();
  protected readonly nuevo = signal('');
  protected quitar(t: string): void {
    this.changed.emit(this.items().filter((x) => x !== t));
  }
  protected anadir(): void {
    const v = this.nuevo().trim().replace(/,$/, '');
    if (!v) return;
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

/**
 * Numeric field with thousands separators (Figma «BO · Juegos · Configuración»): while it is not focused the value is
 * shown as «200.000» and while it is being edited the raw number is shown, so the caret does not jump.
 */
@Component({
  selector: 'so-number',
  imports: [FormsModule, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flex items-center justify-end gap-2">
      <span [class]="ancho() === 's' ? 'block w-[88px] shrink-0' : 'block w-[112px] shrink-0'">
        <input grInput class="text-right font-mono" type="text" inputmode="numeric"
          [disabled]="disabled()" [attr.aria-label]="label()" [ngModel]="mostrar()" (ngModelChange)="cambia($event)" (focus)="enfocar()" (blur)="soltar()" />
      </span>
      @if (unidad()) { <span class="w-[52px] shrink-0 text-right text-body-xs text-text-tertiary">{{ unidad() }}</span> }
    </span>
  `,
})
export class SoNumber {
  readonly valor = input.required<number>();
  readonly label = input('');
  readonly unidad = input('');
  readonly ancho = input<'m' | 's'>('m');
  readonly disabled = input(false);
  readonly changed = output<number>();
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
export const fecha = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace(',', '') : '—');
export const hora = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '—');
export const fechaDia = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) : '');
export const diaCorto = (dia?: string | null) => (dia ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(dia.length === 10 ? dia + 'T12:00:00' : dia)).replace('.', '') : '');
export const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '·';
export const ordinal = (n: number) => `${n}.${n === 1 ? 'er' : 'ª'}`;

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
