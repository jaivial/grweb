/**
 * fantasy/componentes.ts — piezas compartidas de /fantasy (Figma «72 · /fantasy»): tendencia de la cláusula,
 * sparkline, tarjeta de atleta, fila de mercado, feed de movimientos, modal de clausulazo y ficha del atleta.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrBadge, GrButton, GrIcon } from '@grcup/ui';
import { type AtletaMercado, type AtletaDetalle, type MovimientoFeed, pctClausula, monedas } from '../../core/juegos';

/** La flecha de la cláusula (Figma «Clause trend chip»): sube, baja o se queda. */
@Component({
  selector: 'gr-clause-trend',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex h-6 items-center gap-1 rounded-pill px-2 text-mono-xs', '[class]': 'clase()' },
  template: `@if (delta() > 0) { <gr-icon name="arrow-up" [size]="12" />{{ delta() }} % } @else if (delta() < 0) { <gr-icon name="arrow-down" [size]="12" />{{ -delta() }} % } @else { <span>— 0 %</span> }`,
})
export class ClauseTrend {
  /** El cambio en porcentaje (positivo o negativo). */
  readonly delta = input(0);
  protected readonly clase = computed(() =>
    this.delta() > 0 ? 'bg-success/12 text-success' : this.delta() < 0 ? 'bg-warning/12 text-warning' : 'bg-bg-raised text-text-muted',
  );
}

/** La sparkline de la cláusula (SVG propio, sin librerías). */
@Component({
  selector: 'gr-sparkline-clausula',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center', 'aria-hidden': 'true' },
  template: `
    <svg [attr.width]="w" [attr.height]="h" [attr.viewBox]="'0 0 ' + w + ' ' + h" fill="none">
      <path [attr.d]="d()" [attr.stroke]="color()" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
})
export class SparklineClausula {
  readonly valores = input<number[]>([]);
  readonly color = input('#22c55e');
  protected readonly w = 56;
  protected readonly h = 22;
  protected readonly d = computed(() => {
    const v = this.valores();
    if (v.length < 2) return `M0 ${this.h / 2} H${this.w}`;
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v
      .map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * (this.w - 4) + 2).toFixed(1)} ${(this.h - 3 - ((y - min) / span) * (this.h - 6)).toFixed(1)}`)
      .join(' ');
  });
}

/** La tarjeta de un atleta de mi plantilla (Figma «Fantasy athlete card»). */
@Component({
  selector: 'gr-athlete-card',
  imports: [GrBadge, GrButton, GrIcon, ClauseTrend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4' },
  template: `
    <header class="flex items-start justify-between gap-2">
      <span class="flex min-w-0 items-center gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs text-text-secondary">{{ iniciales() }}</span>
        <span class="min-w-0">
          <span class="block truncate text-label-s text-text-primary">{{ atleta().nombre }}</span>
          <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
        </span>
      </span>
      @if (atleta().flightEnCurso) {
        <span class="flex shrink-0 items-center gap-1 rounded-2xs border border-warning/40 bg-warning/10 px-2 py-1 text-mono-xs text-warning"><gr-icon name="lock" [size]="12" />En juego</span>
      } @else if (atleta().titular) {
        <gr-badge tone="danger">Titular</gr-badge>
      } @else {
        <gr-badge>Suplente</gr-badge>
      }
    </header>
    <p class="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-bg-surface/50 px-3 py-2">
      <span class="text-mono-xs text-text-tertiary uppercase">Cláusula actual</span>
      <span class="flex items-center gap-2">
        <span class="font-mono text-label-s text-text-primary">{{ monedas(atleta().clausula) }}</span>
        <gr-clause-trend [delta]="delta()" />
      </span>
    </p>
    <p class="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-bg-surface/50 px-3 py-2">
      <span class="text-mono-xs text-text-tertiary uppercase">Puntos en vivo</span>
      <span class="text-body-xs text-text-tertiary">{{ intentos() }}</span>
    </p>
    @if (atleta().flightEnCurso) {
      <p class="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-body-xs text-warning">
        <gr-icon name="lock" [size]="16" class="mt-0.5 shrink-0" />Compitiendo ahora: no se puede mover
      </p>
    }
    <button grButton variant="secondary" [block]="true" [disabled]="atleta().flightEnCurso" (click)="vender.emit()">Vender</button>
    @if (!atleta().titular) {
      <button grButton variant="primary" [block]="true" [disabled]="atleta().flightEnCurso" (click)="subir.emit()">Subir a titular</button>
    }
    <button type="button" class="text-label-xs text-text-tertiary hover:text-text-primary" (click)="ficha.emit()">Ver la ficha del atleta</button>
  `,
})
export class AthleteCard {
  protected readonly monedas = monedas;
  readonly atleta = input.required<AtletaMercado>();
  readonly puntos = input(0);
  readonly intentos = input('—');
  readonly delta = input(0);
  readonly vender = output<void>();
  readonly subir = output<void>();
  readonly ficha = output<void>();

  protected readonly iniciales = computed(() =>
    (this.atleta().nombre ?? '')
      .split(/\s+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·',
  );
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
  });
}

/**
 * Una fila del mercado de fantasy (Figma «Fantasy market row»): tendencia, cláusula, dueño y acción.
 * En móvil se reorganiza en dos líneas (frame «/fantasy · Mercado» Mobile): arriba el nombre con la cláusula y el
 * chip, abajo el dueño y la acción; la sparkline solo se ve en escritorio.
 */
@Component({
  selector: 'gr-market-row',
  imports: [GrBadge, GrButton, ClauseTrend, SparklineClausula],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line-subtle bg-bg-card px-4 py-3' },
  template: `
    <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs text-text-secondary">{{ iniciales() }}</span>
    <button type="button" class="min-w-0 flex-1 basis-[7rem] text-left" (click)="ficha.emit()">
      <span class="block truncate text-label-s text-text-primary">{{ atleta().nombre }}</span>
      <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
    </button>
    <span class="ml-auto flex w-20 shrink-0 flex-col items-end gap-1 sm:ml-0">
      <span class="font-mono text-label-s text-text-primary">{{ monedas(atleta().clausula) }}</span>
      <gr-clause-trend [delta]="delta()" />
    </span>
    <span class="hidden w-14 shrink-0 sm:block"><gr-sparkline-clausula [valores]="serie()" [color]="color()" /></span>
    <span class="hidden w-28 shrink-0 truncate text-body-xs text-text-tertiary md:block">{{ dueno() }}</span>
    <span class="flex w-full items-center justify-between gap-2 sm:w-32 sm:justify-end">
      @if (accion() === 'protegido') {
        <span class="min-w-0 truncate text-body-xs text-warning">{{ proteccion() }}</span>
      } @else {
        <span class="min-w-0 truncate text-body-xs text-text-tertiary sm:hidden">{{ dueno() }}</span>
      }
      <span class="shrink-0">
        @switch (accion()) {
          @case ('fichar') { <button grButton variant="primary" (click)="fichar.emit()">Fichar</button> }
          @case ('clausulazo') { <button grButton variant="danger" (click)="clausulazo.emit()">Clausulazo</button> }
          @case ('vender') { <button grButton variant="secondary" (click)="vender.emit()">Vender</button> }
          @default { <gr-badge tone="warning">{{ proteccion() }}</gr-badge> }
        }
      </span>
    </span>
  `,
})
export class MarketRow {
  protected readonly monedas = monedas;
  readonly atleta = input.required<AtletaMercado>();
  readonly serie = input<number[]>([]);
  readonly delta = input(0);
  readonly accion = input<'fichar' | 'clausulazo' | 'vender' | 'protegido'>('fichar');
  /** Segundos que le quedan de protección (cuenta atrás «Protegido · mm:ss»). */
  readonly restante = input<number | null>(null);
  readonly fichar = output<void>();
  readonly clausulazo = output<void>();
  readonly vender = output<void>();
  readonly ficha = output<void>();

  /** «Protegido · 07:42» (o solo «Protegido» si el backend no envía `protegidoHasta`). */
  protected readonly proteccion = computed(() => {
    const s = this.restante();
    if (s === null || s <= 0) return 'Protegido';
    const m = Math.floor(s / 60);
    const seg = s % 60;
    return `Protegido · ${m}:${seg < 10 ? '0' : ''}${seg}`;
  });

  protected readonly iniciales = computed(() =>
    (this.atleta().nombre ?? '')
      .split(/\s+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·',
  );
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    const base = `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
    return a.esMio ? `${base} · Tuyo` : base;
  });
  protected readonly dueno = computed(() => {
    const a = this.atleta();
    if (a.esMio) return '@tú';
    if (a.duenoAlias) return '@' + a.duenoAlias;
    return 'Libre';
  });
  protected readonly color = computed(() => (this.delta() < 0 ? '#f59e0b' : '#22c55e'));
}

/** Una fila del feed de movimientos del mercado (Figma «Feed row»). */
@Component({
  selector: 'gr-feed-row',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-start gap-3 rounded-lg border border-line-subtle bg-bg-card px-4 py-3' },
  template: `
    <span class="flex size-8 shrink-0 items-center justify-center rounded-full" [class]="tono()">
      <gr-icon [name]="icono()" [size]="15" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-body-s text-text-primary">{{ titulo() }}</span>
      <span class="block truncate text-body-xs text-text-tertiary">{{ detalle() }}</span>
    </span>
  `,
})
export class FeedRow {
  readonly mov = input.required<MovimientoFeed>();
  /** El nombre del atleta (el evento solo trae su id). */
  readonly nombreAtleta = input('');
  protected readonly icono = computed(() => {
    const t = this.mov().tipo;
    return t === 'clausulazo' ? ('zap' as const) : t === 'compra' ? ('users' as const) : ('arrow-right' as const);
  });
  protected readonly tono = computed(() => {
    const t = this.mov().tipo;
    return t === 'clausulazo' ? 'bg-accent-deep/40 text-accent-text' : t === 'compra' ? 'bg-success/12 text-success' : 'bg-info/12 text-info';
  });
  protected readonly titulo = computed(() => {
    const m = this.mov();
    const nombre = this.nombreAtleta();
    if (m.tipo === 'compra') return `@${m.aliasA} fichó a ${nombre} (libre)`;
    if (m.tipo === 'venta') return `@${m.aliasDe} vendió a ${nombre}`;
    return `@${m.aliasA} clausuló a ${nombre} por ${monedas(m.precio)}`;
  });
  protected readonly detalle = computed(() => {
    const m = this.mov();
    const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.fecha));
    if (m.tipo === 'compra') return `Compra · ${hora} · valor ${monedas(m.precio)}`;
    if (m.tipo === 'venta') return `Venta · ${hora} · recuperó ${monedas(m.precio)}`;
    return `Clausulazo · ${hora} · el dinero fue a @${m.aliasDe}`;
  });
}

/** El modal de clausulazo (Figma «Modal Clausulazo»): saldo antes y después, a quién va el dinero y la protección. */
@Component({
  selector: 'gr-clausulazo-modal',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label="Clausulazo">
      <button type="button" class="absolute inset-0 bg-black/70" aria-label="Cerrar" (click)="cerrar.emit()"></button>
      <div class="relative flex max-h-[92dvh] w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-t-xl border border-line-strong bg-bg-raised p-5 shadow-card md:rounded-xl">
        <header class="flex items-center justify-between gap-3">
          <h2 class="text-display-2xs">Clausulazo</h2>
          <button type="button" class="-m-2 flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>
        <p class="flex items-center gap-3 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs text-text-secondary">{{ iniciales() }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-label-s">{{ atleta().nombre }}</span>
            <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block font-mono text-label-s text-accent-text">{{ monedas(atleta().clausula) }}</span>
            <span class="block text-body-xs text-text-tertiary">dueño actual: {{ dueno() }}</span>
          </span>
        </p>
        <p class="flex items-center justify-between gap-3 text-body-xs">
          <span class="text-text-secondary">Cláusula a pagar</span>
          <span class="text-right text-text-tertiary">Se suma al movimiento del día (+3 % por demanda) <b class="font-mono text-accent-text">{{ monedas(atleta().clausula) }}</b></span>
        </p>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <p class="rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
            <span class="block text-mono-xs text-text-tertiary uppercase">Antes</span>
            <span class="block font-mono text-label-m text-text-primary">{{ monedas(saldo()) }}</span>
          </p>
          <gr-icon name="arrow-right" [size]="18" class="text-text-tertiary" />
          <p class="rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
            <span class="block text-mono-xs text-text-tertiary uppercase">Después</span>
            <span class="block font-mono text-label-m" [class]="despues() < 0 ? 'text-accent-text' : 'text-text-primary'">{{ monedas(despuesMostrado()) }}</span>
          </p>
        </div>
        <p class="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-body-xs text-warning">
          <gr-icon name="info" [size]="16" class="mt-0.5 shrink-0" />
          <span>El dinero va a <b>{{ dueno() }}</b>. Protección de {{ proteccionMin() }} min tras el fichaje: hasta entonces puede quedar bloqueado. Máximo {{ maxClausulazos() }} clausulazos por usuario y jornada; sin deuda: no se puede dejar el saldo en negativo.</span>
        </p>
        @if (error()) {
          <p class="flex items-start gap-2 rounded-md border border-accent-text/40 bg-accent-deep/30 px-3 py-2.5 text-body-xs text-accent-text" role="alert">
            <gr-icon name="circle-alert" [size]="16" class="mt-0.5 shrink-0" />{{ error() }}
          </p>
        }
        <button grButton variant="primary" size="l" [block]="true" [loading]="cargando()" [disabled]="!puede()" (click)="pagar.emit()">
          Pagar {{ monedas(atleta().clausula) }} y fichar
        </button>
      </div>
    </div>
  `,
})
export class ClausulazoModal {
  protected readonly monedas = monedas;
  readonly atleta = input.required<AtletaMercado>();
  readonly saldo = input(0);
  readonly cargando = input(false);
  readonly error = input<string | null>(null);
  readonly clausulazosUsados = input(0);
  readonly maxClausulazos = input(3);
  /** Minutos de protección tras un fichaje (de la configuración pública). */
  readonly proteccionMin = input(10);

  readonly cerrar = output<void>();
  readonly pagar = output<void>();

  protected readonly iniciales = computed(() =>
    (this.atleta().nombre ?? '')
      .split(/\s+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·',
  );
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
  });
  protected readonly dueno = computed(() => {
    const a = this.atleta();
    if (!a.duenoAlias) return 'su dueño';
    return '@' + a.duenoAlias;
  });
  protected readonly despues = computed(() => this.saldo() - this.atleta().clausula);
  protected readonly despuesMostrado = computed(() => Math.max(0, this.despues()));
  protected readonly puede = computed(() => this.despues() >= 0 && this.clausulazosUsados() < this.maxClausulazos());
}

/** La ficha del atleta (Figma «Ficha del atleta»): la curva de la cláusula y el desglose de puntos. */
@Component({
  selector: 'gr-athlete-sheet',
  imports: [GrIcon, ClauseTrend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-label="Ficha del atleta">
      <button type="button" class="absolute inset-0 bg-black/70" aria-label="Cerrar" (click)="cerrar.emit()"></button>
      <div class="relative flex max-h-[92dvh] w-full max-w-[460px] flex-col gap-4 overflow-y-auto rounded-t-xl border border-line-strong bg-bg-raised p-5 shadow-card md:max-h-none md:rounded-none md:border-y-0 md:border-r-0">
        <header class="flex items-start justify-between gap-3">
          <span class="flex min-w-0 items-center gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-s text-text-secondary">{{ iniciales() }}</span>
            <span class="min-w-0">
              <span class="block truncate text-ui-h5">{{ atleta()?.nombre ?? 'Atleta' }}</span>
              <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
            </span>
          </span>
          <button type="button" class="-m-2 flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>

        <p class="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
          <span class="min-w-0">
            <span class="block text-mono-xs text-text-tertiary uppercase">Cláusula actual · dueño {{ dueno() }}</span>
            <span class="block font-mono text-[20px] text-accent-text">{{ monedas(clausulaActual()) }}</span>
          </span>
          <gr-clause-trend [delta]="delta()" />
        </p>

        <section class="rounded-md border border-line-subtle bg-bg-card p-3">
          <p class="text-mono-xs text-text-tertiary uppercase">Evolución de la cláusula · hoy</p>
          <svg class="mt-2 h-24 w-full" [attr.viewBox]="'0 0 ' + ancho + ' 96'" preserveAspectRatio="none" fill="none" role="img" [attr.aria-label]="'Evolución de la cláusula de ' + (atleta()?.nombre ?? '')">
            <path [attr.d]="curva()" stroke="#e6606b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
            @for (p of puntosCurva(); track p.x) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" fill="#e6606b" /> }
          </svg>
          <p class="mt-2 text-body-xs text-text-tertiary">{{ resumenCurva() }}</p>
        </section>

        <section class="rounded-md border border-line-subtle bg-bg-card p-3">
          <p class="flex items-center justify-between gap-3 text-mono-xs text-text-tertiary uppercase">
            <span>Desglose de puntos</span><span class="text-success">{{ totalPuntos() >= 0 ? '+' : '' }}{{ totalPuntos() }} pts</span>
          </p>
          @if (puntos().length) {
            <ul class="mt-2 flex flex-col gap-1.5">
              @for (p of puntos(); track p.ref) {
                <li class="flex items-center justify-between gap-3 text-body-xs">
                  <span class="min-w-0 truncate text-text-secondary">{{ p.concepto }}</span>
                  <span class="shrink-0 font-mono" [class]="p.puntos >= 0 ? 'text-success' : 'text-accent-text'">{{ p.puntos >= 0 ? '+' : '' }}{{ p.puntos }}</span>
                </li>
              }
            </ul>
            <p class="mt-2 text-body-xs text-text-tertiary">Los puntos de cada intento cuentan al titular en el momento del veredicto.</p>
          } @else {
            <p class="mt-2 text-body-xs text-text-tertiary">Todavía no hay puntos registrados para este atleta.</p>
          }
        </section>

        @if (fichajes().length) {
          <section class="rounded-md border border-line-subtle bg-bg-card p-3">
            <p class="text-mono-xs text-text-tertiary uppercase">Historial de fichajes</p>
            <ul class="mt-2 flex flex-col gap-2">
              @for (f of fichajes(); track f.fecha) {
                <li class="flex items-start gap-2.5">
                  <gr-icon [name]="f.tipo === 'clausulazo' ? 'zap' : f.tipo === 'compra' ? 'users' : 'arrow-right'" [size]="16" class="mt-0.5 shrink-0 text-text-tertiary" />
                  <span class="min-w-0">
                    <span class="block text-body-xs text-text-primary">{{ textoFichaje(f) }}</span>
                    <span class="block text-body-xs text-text-tertiary">{{ hora(f.fecha) }} · {{ monedas(f.precio) }}</span>
                  </span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </div>
  `,
})
export class AthleteSheet {
  protected readonly monedas = monedas;
  readonly detalle = input<AtletaDetalle | null>(null);
  readonly cargando = input(false);
  readonly fichajes = input<MovimientoFeed[]>([]);
  readonly cerrar = output<void>();

  protected readonly ancho = 320;
  protected readonly atleta = computed(() => this.detalle()?.atleta ?? null);
  protected readonly clausulaActual = computed(() => this.atleta()?.clausula ?? 0);
  protected readonly delta = computed(() => {
    const h = this.detalle()?.clausulas ?? [];
    return h.length ? pctClausula(h[0].clausula, h[0].delta) : 0;
  });
  protected readonly dueno = computed(() => {
    const a = this.atleta();
    if (!a) return '—';
    if (a.esMio) return '@tú';
    if (a.duenoAlias) return '@' + a.duenoAlias;
    return 'libre';
  });
  protected readonly iniciales = computed(() =>
    (this.atleta()?.nombre ?? '')
      .split(/\s+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·',
  );
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    if (!a) return '';
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
  });
  protected readonly puntos = computed(() => this.detalle()?.puntos ?? []);
  protected readonly totalPuntos = computed(() => this.puntos().reduce((s, p) => s + p.puntos, 0));
  /** La serie de la curva: del historial más antiguo al más reciente. */
  protected readonly serie = computed(() => {
    const h = [...(this.detalle()?.clausulas ?? [])].reverse();
    return h.map((c) => c.clausula);
  });
  protected readonly puntosCurva = computed(() => {
    const v = this.serie();
    if (!v.length) return [];
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v.map((y, i) => ({
      x: v.length === 1 ? this.ancho / 2 : (i / (v.length - 1)) * this.ancho,
      y: 90 - ((y - min) / span) * 80,
    }));
  });
  protected readonly curva = computed(() =>
    this.puntosCurva()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' '),
  );
  protected readonly resumenCurva = computed(() => {
    const s = this.serie();
    if (!s.length) return 'Sin cambios de cláusula registrados.';
    const primero = s[0];
    const ultimo = s[s.length - 1];
    const pct = primero ? Math.round(((ultimo - primero) / primero) * 100) : 0;
    return `${monedas(primero)} → ${monedas(ultimo)} · ${pct >= 0 ? '+' : ''}${pct} % en la jornada · cada cambio queda en el historial`;
  });
  protected textoFichaje(f: MovimientoFeed): string {
    const nombre = this.atleta()?.nombre ?? 'el atleta';
    if (f.tipo === 'compra') return `@${f.aliasA} compró a ${nombre} (libre)`;
    if (f.tipo === 'venta') return `@${f.aliasDe} vendió a ${nombre}`;
    return `@${f.aliasA} clausuló a ${nombre} por ${monedas(f.precio)}`;
  }
  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }
}
