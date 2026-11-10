/*
 * Public-web components of Figma page «02 · Componentes» shared by several pages: status badge, live status, chips,
 * checkbox, countdown and the raffle item card / notice. Backoffice look-alikes stay in primitives.ts / controls.ts.
 */
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, input, model, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrIcon, type GrIconName } from './icon';

/** Pill shell of «Badge», «Chip / Status» and «Live status»: 28 high, tone fill 12 % + border 45 %, label XS. */
const PILL = 'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-label-xs';

export type GrStatusTone = 'abierto' | 'proximamente' | 'ultimas' | 'agotado' | 'directo' | 'finalizado' | 'confirmar';

const STATUS: Record<GrStatusTone, string> = {
  abierto: 'border-success/45 bg-success/12 text-success',
  proximamente: 'border-warning/45 bg-warning/12 text-warning',
  ultimas: 'border-accent/45 bg-accent/12 text-accent-text',
  agotado: 'border-text-tertiary/45 bg-text-tertiary/12 text-text-tertiary',
  directo: 'border-accent/45 bg-accent/12 text-accent-text',
  finalizado: 'border-text-muted/45 bg-text-muted/12 text-text-muted',
  confirmar: 'border-info/45 bg-info/12 text-info',
};

/** Figma «Badge»: availability of registrations / raffle / event. `<gr-status tone="abierto">Inscripciones abiertas</gr-status>` */
@Component({
  selector: 'gr-status',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'cls()' },
  template: `@if (icon(); as i) { <gr-icon [name]="i" [size]="14" /> }<ng-content />`,
})
export class GrStatus {
  readonly tone = input<GrStatusTone>('abierto');
  readonly icon = input<GrIconName | null>(null);
  protected readonly cls = computed(() => `${PILL} ${STATUS[this.tone()]}`);
}

export type GrLiveEstado = 'en-directo' | 'reconectando' | 'sin-conexion';

const LIVE: Record<GrLiveEstado, { tone: GrStatusTone; icon: GrIconName; label: string }> = {
  'en-directo': { tone: 'directo', icon: 'radio', label: 'En directo' },
  reconectando: { tone: 'proximamente', icon: 'refresh', label: 'Reconectando…' },
  'sin-conexion': { tone: 'agotado', icon: 'circle-alert', label: 'Sin conexión · reintentando' },
};

/** Figma «Live status»: state of the real-time stream (no dot, broadcast icon), announced politely when it changes. */
@Component({
  selector: 'gr-live-status',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'cls()', role: 'status' },
  template: `<gr-icon [name]="l().icon" [size]="14" [class.motion-safe:animate-spin]="estado() === 'reconectando'" />{{ l().label }}`,
})
export class GrLiveStatus {
  readonly estado = input<GrLiveEstado>('en-directo');
  protected readonly l = computed(() => LIVE[this.estado()]);
  protected readonly cls = computed(() => `${PILL} ${STATUS[this.l().tone]}`);
}

/**
 * Figma «Chip» (Weight · Weight active): weight class in Contrail One, 44 high, radius 6.
 * On a <button> it is a filter: `<button grWeightChip [active]="sel">−83kg</button>`.
 */
@Component({
  selector: 'button[grWeightChip], span[grWeightChip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex h-11 shrink-0 items-center justify-center rounded-xs border px-4 text-display-body text-white transition-colors disabled:opacity-40',
    '[class.border-accent]': 'active()',
    '[class.bg-accent/15]': 'active()',
    '[class.border-transparent]': '!active()',
    '[class.hover:bg-white/5]': '!active()',
    '[attr.aria-pressed]': 'active()',
  },
  template: `<ng-content />`,
})
export class GrWeightChip {
  readonly active = input(false);
}

/** Figma «Chip / Step»: numbered step, 32 round accent with glow. */
@Component({
  selector: 'gr-step-number',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-accent text-label-s text-white shadow-glow' },
  template: `<ng-content />`,
})
export class GrStepNumber {}

/**
 * Figma «Checkbox»: Kind Legal (bare, text 14/150) or Instagram (boxed row with the glyph). 20 box, radius 4, accent
 * when checked; `invalid` paints the box accent («Checkbox / Edge · Error»). Links go in the content.
 */
@Component({
  selector: 'gr-checkbox',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="flex cursor-pointer gap-3 text-body-s text-text-primary has-disabled:cursor-not-allowed has-disabled:opacity-40"
      [class]="kind() === 'instagram' ? 'items-center rounded-sm border border-line-strong bg-bg-field p-3' : 'items-start'">
      <span class="relative flex size-5 shrink-0 items-center justify-center" [class.mt-0.5]="kind() === 'legal'">
        <input type="checkbox" class="peer size-5 appearance-none rounded-2xs border bg-bg-base transition-colors checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          [class]="invalid() ? 'border-accent' : 'border-line-strong'" [checked]="checked()" [disabled]="disabled()" [attr.name]="name()" [attr.aria-invalid]="invalid() || null"
          (change)="checked.set($any($event.target).checked)" />
        @if (checked()) { <gr-icon name="check" [size]="14" class="pointer-events-none absolute text-white" /> }
      </span>
      @if (kind() === 'instagram') { <gr-icon name="instagram" [size]="16" class="text-accent-text" /> }
      <span class="min-w-0 flex-1"><ng-content /></span>
    </label>
  `,
})
export class GrCheckbox {
  readonly checked = model(false);
  readonly kind = input<'legal' | 'instagram'>('legal');
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly name = input<string | null>(null);
}

/** Calendar day (YYYY-MM-DD) in `tz` for a timestamp. */
const diaEn = (t: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(t);

/** Offset (ms) of `tz` from UTC at instant `t`. */
function offsetEn(t: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(t)
      .map((x) => [x.type, +x.value]),
  );
  return Date.UTC(p['year'], p['month'] - 1, p['day'], p['hour'], p['minute'], p['second']) - Math.floor(t / 1000) * 1000;
}

/** UTC instant of the wall-clock `fecha` (YYYY-MM-DD) + `hora` (HH:MM) in `tz` (DST-aware). */
function instanteEn(fecha: string, hora: string, tz: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, h, mi);
  const t = local - offsetEn(local, tz);
  return local - offsetEn(t, tz);
}

/**
 * Figma «Countdown» (Size L 420 × 105 from tablet · S 312 × 80 on phones): days / hours / min / sec to the start
 * (`hora` in `zona`, 08:30 Europe/Madrid by default). State «Hoy» on the competition day(s) and «Finalizado» (link to the results) once `fin` has passed.
 */
@Component({
  selector: 'gr-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"block max-w-full " + (size() === "l" ? "w-[420px]" : size() === "s" ? "w-[312px]" : "w-[312px] md:w-[420px]")' },
  template: `
    @switch (estado()) {
      @case ('hoy') {
        <p class="grain-acento flex items-center justify-center rounded-pill bg-[linear-gradient(90deg,#c42b3e,#6e1420)] px-4 text-white" [class]="c().txt + ' ' + c().hoy">Hoy se compite · en directo</p>
      }
      @case ('finalizado') {
        <a [href]="resultados()" class="flex items-center justify-center rounded-pill border border-line-strong bg-bg-card px-4 text-white transition-colors hover:border-accent" [class]="c().txt + ' ' + c().fin">Edición {{ target().slice(0, 4) }} finalizada · ver resultados</a>
      }
      @default {
        <div class="grid grid-cols-4" [class]="c().grid" role="timer" [attr.aria-label]="aria()">
          @for (p of parts(); track p.label) {
            <div class="flex flex-col items-center justify-center gap-1 rounded-md border border-line-subtle bg-bg-card" [class]="c().box">
              <span class="tabular-nums" [class]="c().num">{{ p.value }}</span>
              <span class="text-label-xs text-text-muted">{{ p.label }}</span>
            </div>
          }
        </div>
      }
    }
  `,
})
export class GrCountdown {
  /** First day of competition (ISO date). */
  readonly target = input.required<string>();
  /** Last day (ISO date); defaults to `target`. */
  readonly fin = input<string | null | undefined>(null);
  readonly resultados = input('/resultados');
  /** Start time (HH:MM, wall clock in `zona`). */
  readonly hora = input('08:30');
  /** IANA time zone of the competition. */
  readonly zona = input('Europe/Madrid');
  /** Figma Size: L, S or (default) S on phones and L from tablet. */
  readonly size = input<'l' | 's' | null>(null);
  protected readonly c = computed(() =>
    ({
      l: { grid: 'gap-3', box: 'h-[105px]', num: 'text-display-l', txt: 'text-label-m', hoy: 'h-[51px]', fin: 'h-[53px]' },
      s: { grid: 'gap-2', box: 'h-20', num: 'text-display-s', txt: 'text-label-s', hoy: 'h-[41px]', fin: 'h-[43px]' },
      r: { grid: 'gap-2 md:gap-3', box: 'h-20 md:h-[105px]', num: 'text-display-s md:text-display-l', txt: 'text-label-s md:text-label-m', hoy: 'h-[41px] md:h-[51px]', fin: 'h-[43px] md:h-[53px]' },
    })[this.size() ?? 'r'],
  );
  /** Fixed «now» (ms) for previews; live clock otherwise. */
  readonly ahora = input<number | null>(null);
  private readonly reloj = signal(Date.now());
  private readonly now = computed(() => this.ahora() ?? this.reloj());
  private readonly ms = computed(() => Math.max(0, instanteEn(this.target().slice(0, 10), this.hora(), this.zona()) - this.now()));
  protected readonly estado = computed<'cuenta' | 'hoy' | 'finalizado'>(() => {
    const hoy = diaEn(this.now(), this.zona());
    if (hoy > (this.fin() || this.target()).slice(0, 10)) return 'finalizado';
    return hoy >= this.target().slice(0, 10) ? 'hoy' : 'cuenta';
  });
  protected readonly parts = computed(() => {
    const s = Math.floor(this.ms() / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      { value: pad(Math.floor(s / 86400)), label: 'días' },
      { value: pad(Math.floor((s % 86400) / 3600)), label: 'horas' },
      { value: pad(Math.floor((s % 3600) / 60)), label: 'min' },
      { value: pad(s % 60), label: 'seg' },
    ];
  });
  protected readonly aria = computed(() => `Faltan ${this.parts()[0].value} días y ${this.parts()[1].value} horas`);
  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser || this.ahora() !== null) return;
      const t = setInterval(() => this.reloj.set(Date.now()), 1000);
      destroy.onDestroy(() => clearInterval(t));
    });
  }
}

/**
 * Figma «Tarjeta item rifa» (antes «Product card»): photo 200 (or the «?» placeholder), name, description, units and
 * the optional estimated value, donor and winner (props Valor / Donante / Ganador).
 */
@Component({
  selector: 'gr-raffle-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card' },
  template: `
    @if (imagen()) {
      <img [src]="imagen()" [alt]="nombre()" loading="lazy" class="h-[200px] w-full shrink-0 border-b border-white/8 object-cover" />
    } @else {
      <span class="grain-acento flex h-[200px] shrink-0 items-center justify-center bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] font-display text-[72px] leading-none text-accent-text" aria-hidden="true">?</span>
    }
    <div class="flex flex-col items-start gap-2 p-5">
      <h3 class="text-ui-h5">{{ nombre() }}</h3>
      @if (descripcion()) { <p class="text-body-s text-text-tertiary">{{ descripcion() }}</p> }
      <p class="flex flex-wrap items-center gap-2">
        <span class="inline-flex h-[23px] items-center rounded-pill bg-accent-text/16 px-2.5 text-[12px] font-semibold text-accent-text">× {{ unidades() }} {{ unidades() === 1 ? 'unidad' : 'unidades' }}</span>
        @if (valor()) { <span class="text-[13px] font-medium text-text-secondary">Valor aprox. {{ valor() }}</span> }
      </p>
      @if (donante()) { <p class="text-[13px] text-text-tertiary">Donado por {{ donante() }}</p> }
      @if (ganador()) { <p class="rounded-sm bg-[#facc15]/12 px-3 py-2 text-[13px] font-semibold text-[#facc15]">Ganador · boleto nº {{ ganador() }}</p> }
    </div>
  `,
})
export class GrRaffleItem {
  readonly nombre = input.required<string>();
  readonly descripcion = input('');
  readonly imagen = input<string | null>(null);
  readonly unidades = input(1);
  /** Already formatted («120 €»). */
  readonly valor = input<string | null>(null);
  readonly donante = input<string | null>(null);
  /** Winning ticket number. */
  readonly ganador = input<string | null>(null);
}

/** Figma «Aviso · Rifa presencial»: the raffle is sold only at the venue, in cash. */
@Component({
  selector: 'gr-raffle-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2 rounded-lg border border-line-subtle bg-[#1a1517] p-5' },
  template: `
    <p class="text-label-m text-[#f2f2f3]">{{ titulo() }}</p>
    <p class="text-body-s leading-[1.2] text-[#a9adb4]"><ng-content /></p>
    @if (href()) { <a [href]="href()" class="text-label-s text-[#e0485c] hover:underline">{{ enlace() }}</a> }
  `,
})
export class GrRaffleNotice {
  readonly titulo = input('Rifa presencial · solo en efectivo');
  readonly href = input<string | null>('/sorteo');
  readonly enlace = input('Ver objetos de la rifa →');
}
