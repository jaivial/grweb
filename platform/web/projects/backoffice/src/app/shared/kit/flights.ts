import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GrIcon } from '@grcup/ui';

export type BoChip = 'default' | 'dragging' | 'conflict' | 'withdrawn';
const CHIP: Record<BoChip, string> = {
  default: 'border-line-subtle bg-bg-surface hover:border-line-hover',
  dragging: 'border-accent bg-bg-raised -rotate-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)] motion-reduce:rotate-0',
  conflict: 'border-warning/70 bg-bg-surface',
  withdrawn: 'border-line-subtle bg-bg-surface',
};

/** Figma 50 «BO / Athlete chip»: athlete in the flight planner (drag & drop). Conflict = overlapping weigh-in / category. */
@Component({
  selector: 'bo-athlete-chip',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex h-12 items-center gap-2 rounded-sm border px-3 transition-colors motion-reduce:transition-none " + c()' },
  template: `
    <gr-icon name="grip" [size]="14" class="shrink-0 text-text-muted" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[14px] leading-[18px] font-semibold" [class]="estado() === 'withdrawn' ? 'text-text-muted ' : 'text-text-primary'">{{ nombre() }}</span>
      <span class="block truncate text-[12px] leading-[17px]" [class]="estado() === 'conflict' ? 'text-warning' : 'text-text-tertiary'">{{ detalle() }}</span>
    </span>
    @if (estado() === 'conflict') { <gr-icon name="triangle-alert" [size]="14" class="shrink-0 text-warning" label="Conflicto" /> }
  `,
})
export class BoAthleteChip {
  readonly nombre = input('');
  /** «−63 · tot. prev. 360», the conflict («Pesaje se solapa con A») or the withdrawal («Baja · 12/07»). */
  readonly detalle = input('');
  readonly estado = input<BoChip>('default');
  protected readonly c = computed(() => CHIP[this.estado()]);
}

export type BoFlight = 'default' | 'dragging' | 'drop' | 'conflict' | 'locked';
const FLIGHT: Record<BoFlight, string> = {
  default: 'border-line-subtle bg-bg-card',
  dragging: 'border-line-subtle bg-bg-card -rotate-2 shadow-[0_12px_32px_rgba(0,0,0,0.5)] motion-reduce:rotate-0',
  drop: 'border-dashed border-accent bg-accent/8',
  conflict: 'border-warning/70 bg-bg-card',
  locked: 'border-line-subtle bg-bg-card opacity-80',
};

/** Figma 50 «BO / Flight card»: `Borrador.flights[]` of schedule; chips projected as content; locked = published and running. */
@Component({
  selector: 'bo-flight-card',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex flex-col gap-2 rounded-md border p-3 " + c()', '[attr.aria-disabled]': 'estado() === "locked" || null' },
  template: `
    <header class="flex items-center justify-between gap-2">
      <h3 class="text-[16px] leading-[19px] font-semibold" [class]="estado() === 'locked' ? 'text-text-secondary' : 'text-text-primary'">{{ nombre() }}</h3>
      <span class="flex items-center gap-1.5 font-mono text-[13px] text-accent-text">
        @if (estado() === 'locked') { <gr-icon name="lock" [size]="14" class="text-text-tertiary" label="Publicado y en curso" /> }{{ hora() }}
      </span>
    </header>
    <p class="text-[12px] leading-[17px] text-text-tertiary">{{ detalle() }}</p>
    <p class="text-[12px] leading-[17px] text-text-tertiary">{{ pesaje() }}</p>
    @if (estado() === 'conflict' && aviso()) {
      <p class="flex items-center gap-1.5 rounded-sm bg-warning/14 px-2 py-1.5 text-[12px] leading-[17px] text-warning"><gr-icon name="triangle-alert" [size]="14" />{{ aviso() }}</p>
    }
    <div class="flex flex-col gap-2" [class.opacity-70]="estado() === 'locked'"><ng-content /></div>
    @if (estado() === 'drop') {
      <p class="text-[12px] leading-[17px] text-accent-text">Suelta aquí · {{ ocupados() + 1 }}/{{ plazas() }}</p>
    } @else if (resto() > 0) {
      <p class="text-[12px] leading-[17px] text-text-tertiary">+ {{ resto() }} atletas</p>
    }
  `,
})
export class BoFlightCard {
  readonly nombre = input('');
  readonly hora = input('');
  readonly detalle = input('');
  readonly pesaje = input('');
  readonly aviso = input('');
  readonly resto = input(0);
  readonly ocupados = input(0);
  readonly plazas = input(0);
  readonly estado = input<BoFlight>('default');
  protected readonly c = computed(() => FLIGHT[this.estado()]);
}

export type BoAttempt = 'empty' | 'declared' | 'current' | 'good' | 'nolift' | 'corrected' | 'pass';
const ATT: Record<BoAttempt, string> = {
  empty: 'border border-dashed border-line-subtle text-text-muted',
  declared: 'bg-bg-raised text-text-primary',
  current: 'border border-accent bg-accent/16 text-text-primary',
  good: 'bg-success/16 text-success',
  nolift: 'bg-error/16 text-error',
  corrected: 'bg-warning/14 text-warning',
  pass: 'border border-dashed border-line-subtle text-text-muted',
};

/** Figma 50 «BO / Attempt cell»: one attempt in the control table. Corrected carries its reason in the audit log. */
@Component({
  selector: 'bo-attempt-cell',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-9 w-[72px] items-center justify-center gap-1 rounded-sm font-mono text-[13px] " + c()' },
  template: `{{ estado() === 'empty' ? '—' : estado() === 'pass' ? 'pase' : peso() }}@if (estado() === 'corrected') { <gr-icon name="pencil" [size]="10" label="Corregido" /> }`,
})
export class BoAttemptCell {
  readonly peso = input('');
  readonly estado = input<BoAttempt>('declared');
  protected readonly c = computed(() => ATT[this.estado()]);
}

/** Figma 50 «BO / Judge lights»: `votos` = 3 chars L1·C·L2 (V válido / N nulo / - pendiente), from `directo.veredicto`. */
@Component({
  selector: 'bo-judge-lights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex h-[42px] items-center gap-2 rounded-pill border border-line-subtle bg-bg-card px-2.5', role: 'status' },
  template: `
    @for (v of luces(); track $index) {
      <span class="size-6 rounded-full transition-colors motion-reduce:transition-none" [class]="v === 'V' ? 'bg-white' : v === 'N' ? 'bg-accent' : 'border border-dashed border-line-strong'"
        [attr.aria-label]="['Lateral 1', 'Central', 'Lateral 2'][$index] + ': ' + (v === 'V' ? 'válido' : v === 'N' ? 'nulo' : 'pendiente')"></span>
    }
    <span class="pr-1 text-[14px] font-semibold" [class]="r()[1]">{{ r()[0] }}</span>
  `,
})
export class BoJudgeLights {
  readonly votos = input('---');
  protected readonly luces = computed(() => (this.votos() + '---').slice(0, 3).split(''));
  protected readonly r = computed((): [string, string] => {
    const l = this.luces();
    if (l.includes('-')) return ['Esperando jueces', 'text-text-tertiary'];
    const v = l.filter((x) => x === 'V').length;
    return v >= 2 ? [`Válido ${v}-${3 - v}`, 'text-success'] : [`Nulo ${v}-${3 - v}`, 'text-error'];
  });
}
