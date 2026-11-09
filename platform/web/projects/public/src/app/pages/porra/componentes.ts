/**
 * porra/componentes.ts — piezas compartidas de /porra (Figma «71 · /porra»): saldo de monedas, fila de cuota,
 * tarjeta de mercado, boleto de apuesta, gancho de premios y fila de clasificación.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrBadge, GrButton, GrIcon, GrSelect } from '@grcup/ui';
import { FanSession } from '../../core/fan';
import { type Mercado, type OpcionMercado, type Premio, cuota, monedas, sexoTxt } from '../../core/juegos';

/** El saldo de monedas (Figma «Coin balance»): «⚡ 100.000 · PORRA». Sin sesión, «Entrar para jugar». */
@Component({
  selector: 'gr-coin-balance',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex h-9 max-w-full items-center gap-2 rounded-pill border border-line-subtle bg-bg-raised px-3 text-label-s text-text-primary' },
  template: `
    @if (fan.conSesion()) {
      <gr-icon name="zap" [size]="14" class="shrink-0" [class]="moneda() === 'porra' ? 'text-accent-text' : 'text-info'" />
      <span class="font-mono">{{ monedas(valor()) }}</span>
      <span class="text-text-tertiary">· {{ moneda() === 'porra' ? 'PORRA' : 'FANTASY' }}</span>
    } @else {
      <button type="button" class="-mx-3 flex h-full items-center gap-2 px-3 text-accent-text" (click)="entrar()">
        <gr-icon name="user-plus" [size]="14" class="shrink-0" />Entrar para jugar
      </button>
    }
  `,
})
export class CoinBalance {
  readonly valor = input(0);
  readonly moneda = input<'porra' | 'fantasy'>('porra');
  /** El motivo del acceso: 'porra' o 'fantasy' (lo usa el modal de acceso). */
  readonly motivo = input<'porra' | 'fantasy'>('porra');
  private readonly fan = inject(FanSession);
  protected readonly monedas = monedas;
  protected entrar(): void {
    this.fan.abrirAcceso(this.motivo());
  }
}

/**
 * Un grupo de filtros (chips). En móvil es una fila con scroll horizontal (sin barra visible y con snap) para no
 * partir los filtros en cuatro o cinco líneas; en escritorio se ajustan en varias líneas.
 */
@Component({
  selector: 'gr-grupo-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-x-visible md:px-0 md:pb-0">
      @for (o of opciones(); track o.v) {
        <button type="button" class="h-9 shrink-0 snap-start rounded-pill border px-4 text-label-xs transition-colors"
          [class]="o.v === valor() ? 'border-accent bg-accent-deep/50 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted'"
          [attr.aria-pressed]="o.v === valor()" (click)="valorChange.emit(o.v)">{{ o.l }}</button>
      }
    </div>
  `,
})
export class GrupoChips<T extends string = string> {
  readonly opciones = input.required<{ v: T; l: string }[]>();
  readonly valor = input<T | ''>('');
  readonly valorChange = output<T>();
}

/** El aviso legal obligatorio (contrato §6.1): las monedas no son dinero. */
@Component({
  selector: 'gr-aviso-juegos',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent-deep/25 px-4 py-3 text-body-xs text-text-secondary' },
  template: `
    <gr-icon name="info" [size]="16" class="mt-0.5 shrink-0 text-accent-text" />
    <span>Juego sin dinero real: las monedas no se compran ni se canjean por dinero.</span>
  `,
})
export class AvisoJuegos {}

/** Una opción del mercado con su cuota en vivo y el porcentaje apostado (Figma «Odds row»). */
@Component({
  selector: 'gr-odds-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <button type="button" class="flex w-full items-center gap-3 py-2.5 text-left" (click)="elegir.emit()" [attr.aria-label]="'Apostar por ' + opcion().nombre">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs text-text-secondary">{{ iniciales() }}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-label-s text-text-primary">{{ opcion().nombre }}</span>
        <span class="block truncate text-body-xs text-text-tertiary">{{ opcion().sexoTxt }} · {{ opcion().categoria }}</span>
      </span>
      <span class="shrink-0 text-right">
        <span class="block font-mono text-label-s" [class]="cuotaNum() > 0 ? 'text-accent-text' : 'text-text-muted'">{{ cuotaTxt() }}</span>
        <span class="block text-body-xs text-text-tertiary">{{ apostado() }} % apostado</span>
      </span>
    </button>
    <span class="block h-1 w-full overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true">
      <span class="block h-full rounded-pill bg-accent" [style.width.%]="porcentaje()"></span>
    </span>
  `,
})
export class OddsRow {
  readonly opcion = input.required<OpcionMercado & { sexoTxt: string; categoria: string }>();
  readonly bote = input(0);
  readonly total = input(0);
  readonly elegir = output<void>();

  protected readonly iniciales = computed(() =>
    (this.opcion().nombre ?? '')
      .split(/\s+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·',
  );
  protected readonly cuotaNum = computed(() => {
    const o = this.opcion();
    if (o.cuota && o.cuota > 0) return o.cuota;
    return o.apostado > 0 ? this.bote() / o.apostado : 0;
  });
  protected readonly cuotaTxt = computed(() => (this.cuotaNum() > 0 ? cuota(this.cuotaNum()) : '—'));
  protected readonly apostado = computed(() => {
    const t = this.total();
    return t > 0 ? Math.round((this.opcion().apostado / t) * 100) : 0;
  });
  protected readonly porcentaje = computed(() => Math.min(100, this.apostado()));
}

/** Una tarjeta de mercado de porra (Figma «Market card»): bote, cuotas en vivo y el botón de apostar. */
@Component({
  selector: 'gr-market-card',
  imports: [GrBadge, GrButton, GrIcon, OddsRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col rounded-lg border border-line-subtle bg-bg-card' },
  template: `
    <header class="flex items-start justify-between gap-3 p-4">
      <div class="min-w-0">
        <span class="inline-flex h-6 items-center rounded-2xs border border-accent/40 bg-accent-deep/40 px-2 text-mono-xs text-accent-text uppercase">{{ tipo() }}</span>
        <h3 class="mt-2 text-display-2xs leading-tight">{{ mercado().titulo }}</h3>
        <p class="mt-1 text-body-xs text-text-tertiary">{{ descripcion() }}</p>
      </div>
      <gr-badge [tone]="tono()">{{ estadoTxt() }}</gr-badge>
    </header>
    <p class="flex items-center justify-between gap-2 border-y border-line-subtle bg-bg-surface/40 px-4 py-2.5">
      <span class="text-body-xs text-text-tertiary">Bote total</span>
      <span class="flex items-baseline gap-1.5">
        <span class="font-mono text-label-s text-text-primary">{{ monedas(mercado().bote) }}</span>
        <span class="text-body-xs text-text-tertiary">monedas</span>
      </span>
    </p>
    <ul class="flex flex-1 flex-col divide-y divide-line-subtle px-4">
      @for (o of top(); track o.atletaId) {
        <li>
          <gr-odds-row [opcion]="o" [bote]="mercado().bote" [total]="mercado().bote" (elegir)="apostar.emit({ mercado: mercado(), atletaId: o.atletaId })" />
        </li>
      } @empty {
        <li class="py-4 text-body-xs text-text-tertiary">Aún no hay apuestas en este mercado.</li>
      }
    </ul>
    @if (mercado().estado === 'abierto' && !soloLectura()) {
      <div class="p-4">
        <button grButton variant="primary" [block]="true" (click)="apostar.emit({ mercado: mercado(), atletaId: '' })">Apostar en este mercado</button>
        <p class="mt-2 text-body-xs text-text-tertiary">Mín. {{ minimo() }} · Máx. {{ monedas(maximoApuesta()) }} por apuesta · parimutuel, sin casa</p>
      </div>
    } @else if (mercado().estado === 'abierto') {
      <div class="p-4">
        <span class="flex h-11 w-full items-center justify-center rounded-sm border border-line-strong text-label-s text-text-tertiary">Jornada cerrada</span>
        <p class="mt-2 text-body-xs text-text-tertiary">Esta jornada solo se puede consultar</p>
      </div>
    } @else if (mercado().estado === 'cerrado') {
      <div class="p-4">
        <span class="flex h-11 w-full items-center justify-center rounded-sm border border-line-strong text-label-s text-text-tertiary">Mercado cerrado</span>
        <p class="mt-2 text-body-xs text-text-tertiary">Se liquida al publicarse los resultados</p>
      </div>
    } @else {
      <div class="p-4">
        <p class="flex items-start gap-2 rounded-md border border-success/30 bg-success/8 px-3 py-2.5 text-body-xs text-success">
          <gr-icon name="circle-check" [size]="16" class="mt-0.5 shrink-0" />{{ liquidado() }}
        </p>
        <p class="mt-2 text-body-xs text-text-tertiary">{{ subLiquidado() }}</p>
      </div>
    }
  `,
})
export class MarketCard {
  protected readonly monedas = monedas;
  readonly mercado = input.required<Mercado>();
  /** La jornada está cerrada: los mercados solo se consultan. */
  readonly soloLectura = input(false);
  /** Mínimo y máximo por apuesta (de la configuración pública del backend). */
  readonly minimo = input(100);
  readonly maximoApuesta = input(50000);
  readonly apostar = output<{ mercado: Mercado; atletaId: string }>();

  protected readonly tipo = computed(() => {
    const m = this.mercado();
    return m.tipo === 'categoria' ? 'Categoría de peso' : m.tipo === 'gl' ? 'Mejor IPF GL' : 'Movimiento';
  });
  protected readonly estadoTxt = computed(() => {
    const e = this.mercado().estado;
    return e === 'abierto' ? 'Abierto' : e === 'cerrado' ? 'Cerrado' : 'Liquidado';
  });
  protected readonly tono = computed<'success' | 'danger' | 'neutral'>(() =>
    this.mercado().estado === 'cerrado' ? 'danger' : 'success',
  );
  protected readonly descripcion = computed(() => {
    const m = this.mercado();
    const n = m.opciones.length;
    if (m.tipo === 'movimiento') return `Mayor peso válido · ${m.apuestas} ${m.apuestas === 1 ? 'apuesta' : 'apuestas'} · bote repartido`;
    if (m.tipo === 'gl') return m.estado === 'abierto' ? `Se liquida al publicar las ${n} categorías` : `Cerró al juzgarse el 1.er intento · ${n} categorías`;
    return `${sexoTxt(m.sexo)} · ${n} ${n === 1 ? 'atleta' : 'atletas'} · cierra con el 1.er intento juzgado`;
  });
  protected readonly liquidado = computed(() => {
    const m = this.mercado();
    if (m.devuelto) return 'Nadie acertó: se devolvieron todas las apuestas';
    if (!m.ganador?.length) return 'Liquidada: el bote se repartió entre los acertantes';
    const nombres = m.opciones.filter((o) => m.ganador!.includes(o.atletaId)).map((o) => o.nombre);
    return `Liquidada: ${nombres.join(' y ')}`;
  });
  /** La línea de debajo del estado liquidado: con el bote devuelto no se liquidó por la categoría. */
  protected readonly subLiquidado = computed(() =>
    this.mercado().devuelto ? 'El bote volvió a las apuestas' : 'Liquidada al publicarse los resultados de la categoría',
  );
  /** Las tres opciones con más apostado (o las tres primeras si nadie ha apostado). */
  protected readonly top = computed(() => {
    const o = [...this.mercado().opciones].sort((a, b) => b.apostado - a.apostado);
    return o.slice(0, 3).map((x) => ({ ...x, sexoTxt: sexoTxt(this.mercado().sexo), categoria: (this.mercado().categoria ?? '').replace('-', '−') + ' kg' }));
  });
}

/** El boleto de apuesta (Figma «Bet slip»): importe, atajos, lo que recibirías y la confirmación. */
@Component({
  selector: 'gr-boleto-apuesta',
  imports: [FormsModule, GrButton, GrIcon, GrSelect, AvisoJuegos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-label="Boleto de apuesta">
      <button type="button" class="absolute inset-0 bg-black/65" aria-label="Cerrar el boleto" (click)="cerrar.emit()"></button>
      <div class="relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-xl border border-line-strong bg-bg-raised p-5 shadow-card md:max-h-none md:max-w-[420px] md:rounded-none md:border-y-0 md:border-r-0">
        <header class="flex items-start justify-between gap-3">
          <h2 class="text-display-2xs">Boleto de apuesta</h2>
          <button type="button" class="-m-2 flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>
        <div class="flex flex-col gap-1">
          <p class="text-mono-xs text-text-tertiary">Mercado · {{ jornada() }}</p>
          <p class="text-label-s text-text-primary">{{ mercado().titulo }}</p>
          <gr-select class="mt-1 w-full" tipo="campo" tam="l" aria-label="Elige el atleta" [ngModel]="atletaId()" (ngModelChange)="elegir.emit($event)">
            <option value="">Elige el atleta</option>
            @for (o of opciones(); track o.atletaId) { <option [value]="o.atletaId">{{ o.nombre }}</option> }
          </gr-select>
          @if (elegido(); as e) {
            <p class="flex items-center gap-3 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs text-text-secondary">{{ iniciales() }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-label-s">{{ e.nombre }}</span>
                <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
              </span>
              <span class="font-mono text-label-s" [class]="cuotaSel() > 0 ? 'text-accent-text' : 'text-text-muted'">{{ cuotaTxt() }}</span>
            </p>
          }
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-mono-xs text-text-tertiary" for="importe-apuesta">Importe</label>
          <span class="relative block">
            <input id="importe-apuesta" grInput class="font-mono text-[20px]" type="text" inputmode="numeric" [value]="texto()" (input)="cambiar($event)"
              [class]="insuficiente() ? 'border-accent-text text-accent-text' : ''" [attr.aria-invalid]="insuficiente() || null" aria-describedby="importe-apuesta-ayuda" />
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body-xs text-text-tertiary">monedas</span>
          </span>
          <span id="importe-apuesta-ayuda" class="flex flex-wrap gap-2">
            @for (a of atajos(); track a) {
              <button type="button" class="h-9 rounded-pill border px-3 text-label-xs transition-colors"
                [class]="a === 'max' ? 'border-accent/60 bg-accent/12 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted'"
                (click)="atajo(a)">{{ a === 'max' ? 'Máx. ' + monedas(maximo()) : monedas(a) }}</button>
            }
          </span>
        </div>
        <p class="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
          <span class="min-w-0">
            <span class="block text-label-s">Si gana recibirías</span>
            <span class="block text-body-xs text-text-tertiary">{{ detalleCobro() }}</span>
          </span>
          <span class="shrink-0 font-mono text-label-m" [class]="insuficiente() ? 'text-warning' : 'text-success'">{{ cobro() }}</span>
        </p>
        <gr-aviso-juegos />
        @if (error()) {
          <p class="flex items-start gap-2 rounded-md border border-accent-text/40 bg-accent-deep/30 px-3 py-2.5 text-body-xs text-accent-text" role="alert">
            <gr-icon name="circle-alert" [size]="16" class="mt-0.5 shrink-0" />{{ error() }}
          </p>
        }
        @if (exito()) {
          <p class="flex items-start gap-2 rounded-md border border-success/30 bg-success/8 px-3 py-2.5 text-body-xs text-success" role="status">
            <gr-icon name="circle-check" [size]="16" class="mt-0.5 shrink-0" />{{ exito() }}
          </p>
        }
        @if (exito()) {
          <a grButton variant="primary" size="l" [block]="true" href="/porra/mis-apuestas">Ver mis apuestas</a>
        } @else {
          <button grButton variant="primary" size="l" [block]="true" [loading]="cargando()" [disabled]="!puedeApostar()" (click)="confirmar.emit({ atletaId: elegido()?.atletaId ?? '', importe: importe() })">
            Confirmar apuesta
          </button>
        }
        <p class="flex items-center justify-between gap-3 text-body-xs text-text-tertiary">
          <span>Saldo disponible</span>
          <span class="font-mono text-label-s text-text-primary">{{ monedas(saldo()) }}</span>
        </p>
      </div>
    </div>
  `,
})
export class BoletoApuesta {
  protected readonly monedas = monedas;
  readonly mercado = input.required<Mercado>();
  readonly opciones = input.required<(OpcionMercado & { sexoTxt: string; categoria: string })[]>();
  readonly atletaId = input('');
  readonly saldo = input(0);
  readonly jornada = input('');
  readonly cargando = input(false);
  readonly error = input<string | null>(null);
  readonly exito = input<string | null>(null);

  readonly cerrar = output<void>();
  readonly confirmar = output<{ atletaId: string; importe: number }>();
  /** El usuario ha elegido otro atleta del mercado. */
  readonly elegir = output<string>();

  protected readonly importe = signal(5000);
  protected readonly texto = signal('5.000');
  /** Mínimo y máximo por apuesta (de la configuración pública del backend). */
  readonly minimo = input(100);
  readonly maximoApuesta = input(50000);

  protected readonly elegido = computed(() => this.opciones().find((o) => o.atletaId === this.atletaId()) ?? null);
  protected readonly cuotaSel = computed(() => {
    const o = this.elegido();
    if (!o) return 0;
    if (o.cuota && o.cuota > 0) return o.cuota;
    return o.apostado > 0 ? this.mercado().bote / o.apostado : 0;
  });
  protected readonly cuotaTxt = computed(() => (this.cuotaSel() > 0 ? cuota(this.cuotaSel()) : '—'));
  protected readonly iniciales = computed(() =>
    (this.elegido()?.nombre ?? '')
      .split(/\s+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·',
  );
  protected readonly subtitulo = computed(() => {
    const o = this.elegido();
    return o ? `${o.sexoTxt} · ${o.categoria}` : '';
  });
  protected readonly maximo = computed(() => Math.min(this.maximoApuesta(), this.saldo()));
  protected readonly atajos = computed(() => [1000, 5000, 10000, 'max' as const]);
  protected readonly insuficiente = computed(() => this.importe() > this.saldo());
  protected readonly cobro = computed(() => (this.cuotaSel() > 0 ? '~' + monedas(Math.floor(this.importe() * this.cuotaSel())) : '—'));
  protected readonly detalleCobro = computed(() => {
    const c = this.cuotaSel();
    return c > 0 ? `cuota ${cuota(c)} · bote ${monedas(this.mercado().bote)}` : 'bote en vivo';
  });
  protected readonly puedeApostar = computed(() => !!this.elegido() && !this.insuficiente() && this.importe() >= this.minimo() && this.importe() <= this.maximoApuesta());

  protected cambiar(e: Event): void {
    const v = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    this.texto.set(v);
    this.importe.set(v ? Number(v) : 0);
  }
  protected atajo(a: number | 'max'): void {
    const v = a === 'max' ? this.maximo() : a;
    this.importe.set(v);
    this.texto.set(monedas(v));
  }
}

/** El gancho de premios (Figma «Prize hook card»): el premio del puesto, con su imagen o la medalla. */
@Component({
  selector: 'gr-premio-card',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col overflow-hidden rounded-lg border border-accent/45 bg-bg-card' },
  template: `
    <div class="relative flex items-center gap-4 bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] p-4">
      @if (premio().imagenUrl) {
        <img [src]="premio().imagenUrl" [alt]="premio().titulo" class="size-20 shrink-0 rounded-md object-cover" loading="lazy" />
      } @else {
        <span class="flex size-16 shrink-0 items-center justify-center" aria-hidden="true">
          @switch (puesto()) {
            @case (1) { <svg viewBox="0 0 48 48" class="size-16"><rect x="10" y="8" width="28" height="26" rx="4" fill="#c9a227" /><rect x="6" y="18" width="36" height="18" rx="4" fill="#8a6f1f" /><text x="24" y="33" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">1</text></svg> }
            @case (2) { <svg viewBox="0 0 48 48" class="size-16"><circle cx="24" cy="24" r="14" fill="#a9b0b8" /><path d="M24 15l2.6 6 6.4.5-4.9 4.2 1.5 6.3L24 28.6l-5.6 3.4 1.5-6.3L15 21.5l6.4-.5z" fill="#fff" /></svg> }
            @default { <svg viewBox="0 0 48 48" class="size-16"><path d="M10 14h28l-3 20H13z" fill="#b0703e" /><text x="24" y="31" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">3</text></svg> }
          }
        </span>
      }
      <span class="min-w-0">
        <span class="block font-display text-[22px] leading-none italic text-white">{{ puestoTxt() }}</span>
        <span class="mt-1 block text-mono-xs text-text-secondary uppercase">{{ premio().titulo }}</span>
      </span>
    </div>
    <div class="flex flex-1 flex-col gap-2 p-4">
      <p class="text-ui-h5 text-text-primary">{{ premio().titulo }}</p>
      @if (premio().descripcion) { <p class="text-body-xs text-text-secondary">{{ premio().descripcion }}</p> }
      @if (premio().valorTexto) { <p class="font-mono text-label-s text-accent-text">{{ premio().valorTexto }}</p> }
      @if (premio().patrocinador) { <p class="flex items-center gap-1.5 text-mono-xs text-text-tertiary uppercase"><gr-icon name="gift" [size]="14" />{{ premio().patrocinador }}</p> }
    </div>
  `,
})
export class PremioCard {
  readonly premio = input.required<Premio>();
  protected readonly puesto = computed(() => this.premio().puestoDesde);
  protected readonly puestoTxt = computed(() => {
    const p = this.premio();
    const ord = (n: number) => (n === 1 ? '1.er' : n === 2 ? '2.º' : n === 3 ? '3.er' : `${n}.º`);
    if (p.puestoDesde === p.puestoHasta) return `${ord(p.puestoDesde)} puesto`;
    return `${ord(p.puestoDesde)} – ${ord(p.puestoHasta)} puesto`;
  });
}

/** Una fila de la clasificación (Figma «Leaderboard row»): avatar, alias, valor y el distintivo de «TU PUESTO». */
@Component({
  selector: 'gr-leaderboard-row',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex items-center gap-3 rounded-lg border bg-bg-card px-4 py-3',
    '[class.border-accent-text/60]': 'yo()',
    '[class.border-line-subtle]': '!yo()',
  },
  template: `
    <span class="flex size-9 shrink-0 items-center justify-center rounded-sm" [class]="medalla()">
      @if (medallaIcono()) { <gr-icon [name]="medallaIcono()!" [size]="18" /> } @else { <span class="text-label-xs">{{ fila().puesto }}</span> }
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-label-s text-text-primary">{{ alias() }}</span>
      <span class="block truncate text-body-xs text-text-tertiary">{{ nota() }}</span>
    </span>
    <span class="shrink-0 text-right">
      <span class="block font-mono text-label-s" [class]="yo() ? 'text-accent-text' : 'text-text-primary'">{{ valor() }}</span>
      <span class="block text-body-xs text-text-tertiary">{{ valorLabel() }}</span>
    </span>
    @if (yo()) { <span class="shrink-0 rounded-2xs bg-accent-deep/60 px-2 py-1 text-mono-xs text-accent-text uppercase">Tu puesto</span> }
  `,
})
export class LeaderboardRow {
  protected readonly monedas = monedas;
  readonly fila = input.required<{ puesto: number; alias: string; saldo?: number; puntos?: number; valor?: number }>();
  readonly nota = input('');
  readonly yo = input(false);
  readonly valorLabel = input('saldo porra');

  protected readonly alias = computed(() => {
    const a = this.fila().alias;
    return a ? '@' + a : 'Anónimo';
  });
  protected readonly valor = computed(() => {
    const f = this.fila();
    if (f.puntos !== undefined) return f.puntos + ' pts';
    return monedas(f.saldo ?? 0);
  });
  protected readonly medalla = computed(() => {
    const p = this.fila().puesto;
    if (this.yo()) return 'bg-accent-deep/40 text-accent-text';
    if (p === 1) return 'bg-[#c9a227]/20 text-[#e3c25a]';
    if (p === 2) return 'bg-[#a9b0b8]/15 text-[#d4dae0]';
    if (p === 3) return 'bg-[#b0703e]/20 text-[#d79a66]';
    return 'bg-bg-raised text-text-secondary';
  });
  protected readonly medallaIcono = computed(() => {
    const p = this.fila().puesto;
    if (this.yo()) return 'user' as const;
    if (p === 1) return 'trophy' as const;
    if (p === 2 || p === 3) return 'award' as const;
    return null;
  });
}
