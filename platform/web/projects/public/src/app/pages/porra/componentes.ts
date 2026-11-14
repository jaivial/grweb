import { RouterLink } from '@angular/router';
/**
 * porra/componentes.ts — piezas compartidas de /porra y /fantasy (Figma «71 · /porra», rediseño UI v2): barra del
 * juego, aviso legal, saldo de monedas, chips de filtro, botón de cuota, tarjeta de mercado, boleto de apuesta, gancho
 * de premios, podio y fila de clasificación.
 */
import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSelect } from '@grcup/ui';
import { FanSession } from '../../core/fan';
import { type Mercado, type OpcionMercado, type Premio, cuota, sexoTxt } from '../../core/juegos';
import { monedas } from './formato';

/** Iniciales de un nombre («Laura Gómez» → «LG»). */
export function iniciales(nombre: string | null | undefined): string {
  return (
    (nombre ?? '')
      .replace(/^@/, '')
      .split(/[\s._-]+/)
      .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  );
}

/**
 * Los colores de medalla (Figma «GR Cup · Tokens» color/medal/gold · silver · bronze). La librería de tokens no los
 * exporta todavía, así que viven aquí, en un único sitio.
 */
export const MEDALLA = {
  1: { solido: 'bg-[#d4af37]', texto: 'text-[#d4af37]', borde: 'border-[#d4af37]', fondo: 'bg-[#d4af37]/14', anillo: 'border-[#d4af37]/80' },
  2: { solido: 'bg-[#c0c4cc]', texto: 'text-[#c0c4cc]', borde: 'border-[#c0c4cc]', fondo: 'bg-[#c0c4cc]/12', anillo: 'border-[#c0c4cc]/80' },
  3: { solido: 'bg-[#c8835a]', texto: 'text-[#c8835a]', borde: 'border-[#c8835a]', fondo: 'bg-[#c8835a]/14', anillo: 'border-[#c8835a]/80' },
} as const;

/** El aviso legal obligatorio (contrato §6.1), como una línea discreta con escudo (Figma «Aviso juego»). */
@Component({
  selector: 'gr-aviso-juegos',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-start gap-2 text-body-xs text-text-tertiary', role: 'note' },
  template: `
    <gr-icon name="shield" [size]="14" class="mt-px shrink-0 text-text-tertiary" />
    <span><b class="text-label-xs font-medium text-text-secondary">Juego sin dinero real</b>
      <span class="ml-1">· {{ corto() ? 'sin valor económico' : 'las monedas no se compran ni se canjean por dinero' }}</span></span>
  `,
})
export class AvisoJuegos {
  /** Versión corta (móvil o espacios estrechos). */
  readonly corto = input(false);
}

/** Una opción de un selector: con `href` es un enlace (navegación); sin él, un botón que emite `elegir`. */
export interface OpcionSelector {
  v: string;
  l: string;
  href?: string;
}

let selectorSeq = 0;

/**
 * Selector con desplegable (Figma «Selector · …» y «Desplegable»): en móvil sustituye a toda barra de pestañas (de
 * juego, de sala, filtros con pestañas y días del palmarés): un campo con la opción activa y el chevron. Se cierra
 * con Escape o al pulsar fuera.
 */
@Component({
  selector: 'gr-selector',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '(document:keydown.escape)': 'abierto.set(false)', '(document:click)': 'fuera($event)' },
  template: `
    <button type="button" class="flex h-12 w-full items-center gap-3 rounded-md border bg-bg-field px-4 text-left text-label-s text-text-primary"
      [class]="abierto() ? 'border-line-accent' : 'border-line-strong'" [attr.aria-expanded]="abierto()" [attr.aria-controls]="id"
      [attr.aria-label]="(etiqueta() ? etiqueta() + ': ' : '') + actual()" (click)="abierto.set(!abierto())">
      <span class="min-w-0 flex-1 truncate">{{ actual() }}</span>
      <gr-icon name="chevron-down" [size]="20" class="transition-transform motion-reduce:transition-none" [class.rotate-180]="abierto()" />
    </button>
    @if (abierto()) {
      <ul [id]="id" class="absolute inset-x-0 top-full z-30 mt-2 flex flex-col gap-1 rounded-md border border-line-strong bg-bg-raised p-2 shadow-card">
        @for (o of opciones(); track o.v) {
          <li>
            @if (o.href) {
              <a [href]="o.href" class="flex h-11 items-center gap-3 rounded-sm px-3 text-label-s" [class]="o.v === valor() ? 'bg-bg-field text-text-primary' : 'text-text-secondary'" [attr.aria-current]="o.v === valor() ? 'page' : null">
                <span class="min-w-0 flex-1 truncate">{{ o.l }}</span>@if (o.v === valor()) { <gr-icon name="check" [size]="20" /> }
              </a>
            } @else {
              <button type="button" class="flex h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-label-s" [class]="o.v === valor() ? 'bg-bg-field text-text-primary' : 'text-text-secondary'" [attr.aria-pressed]="o.v === valor()" (click)="elige(o.v)">
                <span class="min-w-0 flex-1 truncate">{{ o.l }}</span>@if (o.v === valor()) { <gr-icon name="check" [size]="20" /> }
              </button>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class GrSelector {
  readonly opciones = input.required<OpcionSelector[]>();
  readonly valor = input('');
  /** Para qué es el selector (lo lee el lector de pantalla). */
  readonly etiqueta = input('');
  readonly elegir = output<string>();
  protected readonly abierto = signal(false);
  protected readonly id = 'gr-selector-' + ++selectorSeq;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly actual = computed(() => this.opciones().find((o) => o.v === this.valor())?.l ?? this.opciones()[0]?.l ?? '');
  protected elige(v: string): void {
    this.abierto.set(false);
    this.elegir.emit(v);
  }
  protected fuera(e: Event): void {
    if (this.abierto() && !this.el.nativeElement.contains(e.target as Node)) this.abierto.set(false);
  }
}

/**
 * La barra del juego (Figma «Barra de juego»): las pestañas de la porra o de GRS Fantasy y el aviso legal. Son
 * enlaces normales (SSR y SEO). En GRS Fantasy, en móvil las pestañas son un selector con desplegable (sin scroll
 * horizontal); la pestaña activa no lleva punto.
 */
@Component({
  selector: 'gr-juegos-nav',
  imports: [RouterLink, AvisoJuegos, GrSelector],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4' },
  template: `
    @if (juego() === 'fantasy') { <gr-selector class="md:hidden" etiqueta="GRS Fantasy" [opciones]="opciones()" [valor]="activa()" /> }
    <nav class="w-full rounded-pill border border-line-subtle bg-bg-surface p-1 md:w-auto" [class]="juego() === 'fantasy' ? 'hidden gap-1 md:flex' : 'flex'" [attr.aria-label]="juego() === 'porra' ? 'Porra' : 'GRS Fantasy'">
      @for (t of tabs(); track t.href) {
        <a [routerLink]="t.href" class="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-pill px-2 text-label-s whitespace-nowrap transition-colors md:h-10 md:flex-none"
          [class]="(juego() === 'fantasy' ? 'md:w-[120px] md:px-0 ' : 'md:px-4 ') + (t.id === activa() ? 'border border-line-strong bg-bg-raised text-text-primary shadow-[0_2px_8px_rgb(0_0_0/0.35)]' : 'border border-transparent text-text-tertiary hover:text-text-primary')"
          [attr.aria-current]="t.id === activa() ? 'page' : null">
          <span class="truncate sm:hidden">{{ t.corto }}</span><span class="hidden truncate sm:inline">{{ t.label }}</span>
        </a>
      }
    </nav>
    <gr-aviso-juegos class="md:hidden" [corto]="true" />
    <gr-aviso-juegos class="hidden md:flex" />
  `,
})
export class JuegosNav {
  readonly juego = input<'porra' | 'fantasy'>('porra');
  /** La pestaña activa: mercados · apuestas · clasificacion (porra) o salas · equipo · mercado · clasificacion · palmares · reglas (fantasy). */
  readonly activa = input('');
  protected readonly tabs = computed(() =>
    this.juego() === 'porra'
      ? [
          { id: 'mercados', href: '/porra', label: 'Mercados', corto: 'Mercados' },
          { id: 'apuestas', href: '/porra/mis-apuestas', label: 'Mis apuestas', corto: 'Mis apuestas' },
          { id: 'clasificacion', href: '/porra/clasificacion', label: 'Clasificación', corto: 'Ranking' },
        ]
      : [
          { id: 'salas', href: '/fantasy/salas', label: 'Salas', corto: 'Salas' },
          { id: 'equipo', href: '/fantasy', label: 'Mi equipo', corto: 'Mi equipo' },
          { id: 'mercado', href: '/fantasy/mercado', label: 'Mercado', corto: 'Mercado' },
          { id: 'clasificacion', href: '/fantasy/clasificacion', label: 'Clasificación', corto: 'Clasificación' },
          { id: 'palmares', href: '/fantasy/palmares', label: 'Palmarés', corto: 'Palmarés' },
          { id: 'reglas', href: '/fantasy/como-se-juega', label: 'Cómo se juega', corto: 'Cómo se juega' },
        ],
  );
  protected readonly opciones = computed<OpcionSelector[]>(() => this.tabs().map((t) => ({ v: t.id, l: t.label, href: t.href })));
}

/** El saldo de monedas (Figma «Coin balance»): la moneda con brillo, la cifra y la cartera. Sin sesión, «Entrar para jugar». */
@Component({
  selector: 'gr-coin-balance',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"inline-flex h-10 max-w-full items-center gap-2 rounded-pill border bg-bg-raised py-1 pr-3.5 pl-1 text-text-primary " + (moneda() === "porra" ? "border-accent/45" : "border-info/45")',
  },
  template: `
    @if (fan.conSesion()) {
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full border" aria-hidden="true"
        [class]="moneda() === 'porra' ? 'border-accent-text/60 bg-accent text-white shadow-glow' : 'border-info/60 bg-info/20 text-info'">
        <gr-icon name="zap" [size]="15" />
      </span>
      <span class="font-mono text-[1rem] font-bold tabular-nums">{{ monedas(valor()) }}</span>
      <span class="text-mono-xs text-text-secondary">· {{ moneda() === 'porra' ? 'Porra' : 'Fantasy' }}</span>
    } @else if (!fan.cargada()) {
      <!-- UX5-R1-6: sesión sin resolver (SSR / primera carga): esqueleto del saldo, nunca «Entrar» -->
      <span class="size-8 shrink-0 animate-pulse rounded-full bg-bg-field motion-reduce:animate-none" aria-hidden="true"></span>
      <span class="h-4 w-[5.5rem] animate-pulse rounded-xs bg-bg-field motion-reduce:animate-none" aria-hidden="true"></span><span class="sr-only">Cargando saldo</span>
    } @else {
      <button type="button" class="-my-1 -mr-3.5 -ml-1 flex h-10 items-center gap-2 rounded-pill pr-4 pl-1 text-label-s text-accent-text" (click)="entrar()">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-white"><gr-icon name="user-plus" [size]="15" /></span>Entrar para jugar
      </button>
    }
  `,
})
export class CoinBalance {
  readonly valor = input(0);
  readonly moneda = input<'porra' | 'fantasy'>('porra');
  /** El motivo del acceso: 'porra' o 'fantasy' (lo usa el modal de acceso). */
  readonly motivo = input<'porra' | 'fantasy'>('porra');
  protected readonly fan = inject(FanSession);
  protected readonly monedas = monedas;
  protected entrar(): void {
    this.fan.abrirAcceso(this.motivo());
  }
}

/**
 * Un grupo de filtros (chips). En móvil es una fila con scroll horizontal (sin barra visible y con snap) y chips de
 * 44 px; en escritorio se ajustan en varias líneas a 36 px.
 */
@Component({
  selector: 'gr-grupo-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div [class]="envuelve() ? 'flex flex-wrap gap-2' : '-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-x-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden'"
      role="group" [attr.aria-label]="etiqueta() || null">
      @for (o of opciones(); track o.v) {
        <button type="button" class="h-11 shrink-0 snap-start rounded-pill border px-4 text-label-xs transition-colors md:h-9"
          [class]="o.v === valor() ? 'border-accent bg-accent-deep/50 text-accent-text' : 'border-line-strong bg-bg-surface/60 text-text-secondary hover:border-text-muted hover:text-text-primary'"
          [attr.aria-pressed]="o.v === valor()" (click)="valorChange.emit(o.v)">{{ o.l }}@if (o.n !== undefined) { <span class="ml-1 font-mono opacity-70">{{ o.n }}</span> }</button>
      }
    </div>
  `,
})
export class GrupoChips<T extends string = string> {
  readonly opciones = input.required<{ v: T; l: string; n?: number }[]>();
  readonly valor = input<T | ''>('');
  readonly etiqueta = input('');
  /** En móvil los chips se ajustan en varias líneas en vez de ir en una fila con scroll horizontal. */
  readonly envuelve = input(false);
  readonly valorChange = output<T>();
}

/**
 * Una opción del mercado (Figma «Odds row»): el atleta, la barra del % apostado y el botón de cuota. Toda la fila es
 * pulsable (abre el boleto con ese atleta); la favorita lleva la cuota en rojo de marca.
 */
@Component({
  selector: 'gr-odds-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <button type="button" class="group flex w-full max-w-[336px] flex-col gap-2 rounded-md pt-1.5 pb-2 text-left transition-[transform,background-color] duration-100 enabled:active:scale-[.98] enabled:active:bg-white/5 disabled:cursor-default max-md:max-w-none motion-reduce:enabled:active:scale-100" [disabled]="!activo()" (click)="elegir.emit()"
      [attr.aria-label]="(activo() ? 'Apostar por ' : '') + opcion().nombre + ', cuota ' + cuotaTxt() + ', ' + apostado() + ' % del bote'">
      <span class="flex w-full items-center gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-full border font-display text-[13px] tracking-[0.1em]"
          [class]="lider() ? 'border-accent bg-accent-deep text-accent-text' : 'border-line-strong bg-bg-raised text-text-secondary'">{{ ini() }}</span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-body-s text-text-primary">{{ opcion().nombre }}</span>
          <span class="truncate text-body-xs text-text-secondary">{{ opcion().sexoTxt }}@if (opcion().categoria !== ' kg') { · {{ opcion().categoria }}}</span>
        </span>
        <span class="flex shrink-0 flex-col items-center rounded-sm border px-3 py-1 font-mono tabular-nums transition-colors"
          [class]="lider() && cuotaNum() > 0 ? 'border-accent bg-accent-deep text-white group-enabled:group-hover:bg-accent-deep/80' : cuotaNum() > 0 ? 'border-line-strong bg-bg-raised text-text-primary group-enabled:group-hover:border-text-muted' : 'border-line-subtle bg-bg-surface text-text-muted'">
          <span class="text-[1rem] leading-[1.375rem] font-bold">{{ cuotaTxt() }}</span>
          <span class="text-[0.6875rem] leading-[0.875rem] font-semibold whitespace-nowrap" [class]="delta() > 0 ? 'text-success' : delta() < 0 ? 'text-[#f87171]' : 'text-text-secondary'">{{ deltaTxt() }}</span>
        </span>
      </span>
      <span class="block h-1 w-full overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true">
        <span class="block h-full rounded-pill transition-[width] duration-500 motion-reduce:transition-none" [class]="lider() ? 'bg-accent' : 'bg-text-muted'" [style.width.%]="apostado()"></span>
      </span>
    </button>
  `,
})
export class OddsRow {
  readonly opcion = input.required<OpcionMercado & { sexoTxt: string; categoria: string }>();
  readonly bote = input(0);
  readonly total = input(0);
  /** La opción con más apostado del mercado. */
  readonly lider = input(false);
  /** Se puede apostar (mercado abierto y jornada en juego). */
  readonly activo = input(true);
  readonly elegir = output<void>();

  protected readonly ini = computed(() => iniciales(this.opcion().nombre));
  protected readonly cuotaNum = computed(() => {
    const o = this.opcion();
    if (o.cuota && o.cuota > 0) return o.cuota;
    return o.apostado > 0 ? this.bote() / o.apostado : 0;
  });
  protected readonly cuotaTxt = computed(() => (this.cuotaNum() > 0 ? cuota(this.cuotaNum()) : '—'));
  /** Cambio de la cuota desde la anterior que vio esta fila (SSE porra.mercado / refresco). */
  protected readonly delta = signal(0);
  private ultima = 0;
  protected readonly deltaTxt = computed(() => {
    if (this.cuotaNum() <= 0) return '';
    const d = this.delta();
    if (!d) return '= sin cambio';
    return (d > 0 ? '▲ +' : '▼ −') + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(d));
  });
  constructor() {
    effect(() => {
      const c = Math.round(this.cuotaNum() * 100) / 100;
      if (this.ultima && c && c !== this.ultima) this.delta.set(c - this.ultima);
      this.ultima = c;
    });
  }
  protected readonly apostado = computed(() => {
    const t = this.total();
    return t > 0 ? Math.min(100, Math.round((this.opcion().apostado / t) * 100)) : 0;
  });
}

/** Una tarjeta de mercado de porra (Figma «Market card»): el bote como marcador, las cuotas en vivo y el botón de apostar. */
@Component({
  selector: 'gr-market-card',
  imports: [GrButton, GrIcon, OddsRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card transition-colors hover:border-line-strong' },
  template: `
    <header class="flex flex-col gap-1.5 px-4 pt-4 pb-3">
      <span class="flex items-center justify-between gap-3">
        <span class="truncate text-mono-xs text-accent-text">{{ tipo() }}</span>
        <span class="inline-flex h-7 shrink-0 items-center rounded-pill border px-3 text-[12px] leading-none font-medium tracking-[0.04em] uppercase" [class]="chipClase()">{{ estadoTxt() }}</span>
      </span>
      <h3 class="text-display-xs">{{ mercado().titulo }}</h3>
      <p class="text-body-xs text-text-tertiary">{{ descripcion() }}</p>
    </header>
    <p class="flex items-center justify-between gap-3 border-y border-line-subtle bg-accent-deep px-4 py-3">
      <span class="text-mono-xs text-text-tertiary">Apostado</span>
      <span class="flex items-baseline gap-1.5">
        <span class="font-mono text-[26px] leading-none font-bold text-text-primary tabular-nums">{{ monedas(mercado().bote) }}</span>
        <span class="text-body-xs text-text-tertiary">monedas</span>
      </span>
    </p>
    <ul class="flex flex-1 flex-col gap-0.5 px-4 pt-2.5 pb-1.5" aria-label="Cuotas">
      @for (o of top(); track o.atletaId; let i = $index) {
        <li>
          <gr-odds-row [opcion]="o" [bote]="mercado().bote" [total]="mercado().bote" [lider]="i === 0 && o.apostado > 0" [activo]="puedeApostar()"
            (elegir)="apostar.emit({ mercado: mercado(), atletaId: o.atletaId })" />
        </li>
      } @empty {
        <li class="py-4 text-body-xs text-text-tertiary">Aún no hay atletas en este mercado</li>
      }
    </ul>
    @if (puedeApostar()) {
      <div class="px-4 pt-2 pb-4">
        <button grButton variant="primary" size="l" class="!text-label-s transition-transform duration-100 active:scale-[.98] motion-reduce:active:scale-100" [block]="true" (click)="apostar.emit({ mercado: mercado(), atletaId: '' })">Apostar en este mercado</button>
        <p class="mt-2 text-body-xs text-text-muted">Mín. {{ monedas(minimo()) }} · Máx. {{ monedas(maximoApuesta()) }} · cuota estimada, el reparto final depende del bote</p>
      </div>
    } @else if (mercado().estado === 'abierto' && !soloLectura() && !mercado().opciones.length) {
      <!-- Mercado abierto sin atletas: el aviso ya va en la lista de cuotas. -->
    } @else if (mercado().estado === 'abierto') {
      <div class="px-4 pt-2 pb-4">
        <span class="flex h-12 w-full items-center justify-center rounded-sm border border-line-subtle bg-bg-surface text-label-s text-text-muted">Jornada cerrada</span>
        <p class="mt-2 text-body-xs text-text-muted">Esta jornada solo se puede consultar</p>
      </div>
    } @else if (mercado().estado === 'cerrado') {
      <div class="px-4 pt-2 pb-4">
        <span class="flex h-12 w-full items-center justify-center rounded-sm border border-line-subtle bg-bg-surface text-label-s text-text-muted">Mercado cerrado</span>
        <p class="mt-2 text-body-xs text-text-muted">Se liquida al publicarse los resultados</p>
      </div>
    } @else {
      <div class="px-4 pt-2 pb-4">
        <p class="flex items-start gap-2 rounded-md border px-3 py-2.5 text-body-xs" [class]="mercado().devuelto ? 'border-info/30 bg-info/8 text-info' : 'border-success/30 bg-success/8 text-success'">
          <gr-icon [name]="mercado().devuelto ? 'undo' : 'circle-check'" [size]="16" class="mt-px shrink-0" /><span class="text-label-s">{{ liquidado() }}</span>
        </p>
        <p class="mt-2 text-body-xs text-text-muted">{{ subLiquidado() }}</p>
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

  protected readonly puedeApostar = computed(() => this.mercado().estado === 'abierto' && !this.soloLectura() && this.mercado().opciones.length > 0);
  protected readonly tipo = computed(() => {
    const m = this.mercado();
    return m.tipo === 'categoria' ? 'Categoría de peso' : m.tipo === 'gl' ? 'Mejor IPF GL' : 'Movimiento';
  });
  protected readonly estadoTxt = computed(() => {
    const e = this.mercado().estado;
    return e === 'abierto' ? 'Abierto' : e === 'cerrado' ? 'Cerrado' : this.mercado().devuelto ? 'Devuelto' : 'Liquidado';
  });
  protected readonly tono = computed<'success' | 'danger' | 'neutral' | 'info'>(() => {
    const m = this.mercado();
    if (m.estado === 'cerrado') return 'danger';
    if (m.estado === 'liquidado') return m.devuelto ? 'info' : 'neutral';
    return 'success';
  });
  /** Chip de estado (Figma «Chip»): abierto/liquidado verde, cerrado rojo, devuelto azul. */
  protected readonly chipClase = computed(() => {
    const t = this.tono();
    return t === 'danger' ? 'border-accent/50 bg-accent/12 text-accent-text' : t === 'info' ? 'border-info/50 bg-info/12 text-info' : 'border-success/50 bg-success/12 text-success';
  });
  protected readonly descripcion = computed(() => {
    const m = this.mercado();
    const n = m.opciones.length;
    const ap = `${m.apuestas} ${m.apuestas === 1 ? 'apuesta' : 'apuestas'}`;
    if (m.tipo === 'movimiento') return `${sexoTxt(m.sexo)} · mayor peso válido · ${ap}`;
    if (m.tipo === 'gl') return m.estado === 'abierto' ? `Se liquida al publicar las ${n} categorías · ${ap}` : `Cerró al juzgarse el 1.er intento · ${ap}`;
    return `${sexoTxt(m.sexo)} · ${n} ${n === 1 ? 'atleta' : 'atletas'} · ${ap}`;
  });
  protected readonly liquidado = computed(() => {
    const m = this.mercado();
    if (m.devuelto) return 'Nadie acertó: se devolvieron todas las apuestas';
    if (!m.ganador?.length) return 'Liquidada: el bote se repartió entre los acertantes';
    const nombres = m.opciones.filter((o) => m.ganador!.includes(o.atletaId)).map((o) => o.nombre);
    return `Ganó ${nombres.join(' y ')}`;
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

/** El boleto de apuesta (Figma «Bet slip»): un ticket con la selección, el importe, lo que cobrarías y la confirmación. */
@Component({
  selector: 'gr-boleto-apuesta',
  imports: [RouterLink, FormsModule, GrButton, GrIcon, GrSelect, AvisoJuegos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  // UX5-R1-3: entrada como sheet iOS (300 ms) con fundido del velo; sin movimiento con reduced motion
  styles: `.gr-velo{animation:gr-velo .2s ease-out both}@keyframes gr-velo{from{opacity:0}}@media (max-width:767px){.gr-sheet{animation:gr-hoja .3s cubic-bezier(.32,.72,0,1) backwards}}@media (prefers-reduced-motion:reduce){.gr-sheet{animation:gr-velo .15s ease-out backwards}}`,
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center md:items-center md:justify-end md:p-6" role="dialog" aria-modal="true" aria-labelledby="boleto-titulo">
      <button type="button" class="gr-velo absolute inset-0 bg-black/70 backdrop-blur-[2px]" aria-label="Cerrar el boleto" (click)="cerrar.emit()"></button>
      <div class="gr-sheet relative flex max-h-[94dvh] w-full flex-col overflow-y-auto rounded-t-2xl border border-line-strong bg-bg-raised shadow-card md:max-h-[calc(100dvh-48px)] md:max-w-[420px] md:rounded-2xl"
        [style.transform]="arrastre() ? 'translateY(' + arrastre() + 'px)' : null" [class.transition-transform]="!arrastrando()" [class.duration-200]="!arrastrando()">
        <!-- asa + cabecera: arrastrar hacia abajo cierra (umbral 30 % del alto o gesto rápido) -->
        <div class="touch-none md:touch-auto" (pointerdown)="tomar($event)" (pointermove)="mover($event)" (pointerup)="soltar($event)" (pointercancel)="soltar($event)">
        <span class="flex h-5 items-center justify-center md:hidden" aria-hidden="true"><span class="block h-1 w-11 rounded-pill bg-line-strong"></span></span>
        <header class="flex items-center justify-between gap-3 border-b border-accent/60 bg-accent-deep/55 px-5 py-3.5 md:py-4">
          <h2 id="boleto-titulo" class="text-display-xs">Boleto de apuesta</h2>
          <button type="button" class="-m-2 flex size-11 items-center justify-center rounded-sm text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>
        </div>
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1">
            <p class="text-mono-xs text-text-tertiary">Mercado {{ jornada() }}</p>
            <p class="text-label-m text-text-primary">{{ mercado().titulo }}</p>
          </div>
          @if (elegido(); as e) {
            <p class="flex items-center gap-3 rounded-md border border-accent/50 bg-bg-card px-3 py-2.5">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent/60 bg-accent-deep/60 font-display text-[13px] text-accent-text italic">{{ ini() }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-label-s">{{ e.nombre }}</span>
                <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
                @if (opciones().length > 1) { <button type="button" class="-my-3 inline-flex min-h-11 items-center pr-4 text-body-xs text-info underline-offset-4 hover:underline" [class.invisible]="exito()" [attr.tabindex]="exito() ? -1 : null" (click)="elegir.emit('')">Cambiar de atleta</button> }
              </span>
              <span class="shrink-0 font-mono text-[20px] font-bold tabular-nums" [class]="cuotaSel() > 0 ? 'text-accent-text' : 'text-text-muted'">{{ cuotaTxt() }}</span>
            </p>
          } @else {
            <gr-select class="w-full" tipo="campo" tam="l" aria-label="Elige el atleta" [ngModel]="atletaId()" (ngModelChange)="elegir.emit($event)">
              <option value="">Elige el atleta</option>
              @for (o of opciones(); track o.atletaId) { <option [value]="o.atletaId">{{ o.nombre }}</option> }
            </gr-select>
          }
          <hr class="border-0 border-t border-dashed border-line-strong" />
          <div class="flex flex-col gap-2">
            <label class="text-mono-xs text-text-tertiary" for="importe-apuesta">Importe</label>
            <span class="relative block">
              <input id="importe-apuesta" class="h-14 w-full rounded-md border bg-bg-field pr-24 pl-4 font-mono text-[26px] font-bold tabular-nums outline-none focus-visible:border-accent-text" type="text" inputmode="numeric" autocomplete="off" [value]="texto()" (input)="cambiar($event)"
                [class]="insuficiente() ? 'border-accent-text text-accent-text' : 'border-line-strong text-text-primary'" [attr.aria-invalid]="insuficiente() || null" aria-describedby="importe-apuesta-ayuda" />
              <span class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-mono-xs text-text-tertiary">monedas</span>
            </span>
            <span id="importe-apuesta-ayuda" class="grid grid-cols-4 gap-2">
              @for (a of atajos(); track a) {
                <button type="button" class="h-11 min-w-0 truncate rounded-pill border px-1 font-mono text-[0.8125rem] transition-[transform,color,border-color] duration-100 active:scale-95 motion-reduce:active:scale-100"
                  [class]="esAtajo(a) ? 'border-accent bg-accent-deep/55 text-accent-text' : 'border-line-strong bg-bg-card text-text-secondary hover:border-text-muted hover:text-text-primary'"
                  [attr.aria-pressed]="esAtajo(a)" (click)="atajo(a)">{{ a === 'max' ? 'Máx.' : monedas(a) }}</button>
              }
            </span>
          </div>
          <p class="flex items-center justify-between gap-3 rounded-md px-3.5 py-3" [class]="insuficiente() ? 'border border-warning/35 bg-warning/8' : 'bg-success text-black'" aria-live="polite">
            <span class="min-w-0">
              <span class="block text-label-s">{{ hecho() ? 'Si acierta cobrarías' : 'Si acierta cobras' }} (estimado)</span>
              <span class="block font-mono text-[0.8125rem]" [class]="insuficiente() ? 'text-text-secondary' : 'text-black/85'">{{ detalleCobro() }}</span>
            </span>
            <span class="shrink-0 font-mono text-[22px] font-bold tabular-nums" [class]="insuficiente() ? 'text-warning' : 'text-black'">{{ cobro() }}</span>
          </p>
          @if (error()) {
            <p class="flex items-start gap-2 rounded-md border border-accent-text/40 bg-accent-deep/30 px-3 py-2.5 text-body-xs text-accent-text" role="alert">
              <gr-icon name="circle-alert" [size]="16" class="mt-0.5 shrink-0" />{{ error() }}
            </p>
          } @else if (insuficiente()) {
            <p class="flex items-start gap-2 rounded-md border border-accent-text/40 bg-accent-deep/30 px-3 py-2.5 text-body-xs text-accent-text" role="alert">
              <gr-icon name="circle-alert" [size]="16" class="mt-0.5 shrink-0" />Saldo insuficiente: te faltan {{ monedas(importe() - saldo()) }} monedas. Baja el importe o gana monedas escribiendo en el chat.
            </p>
          }
          <gr-aviso-juegos />
          @if (exito()) {
            <p class="flex items-start gap-2 rounded-md border border-success/30 bg-success/8 px-3 py-2.5 text-body-xs text-success" role="status">
              <gr-icon name="circle-check" [size]="16" class="mt-0.5 shrink-0" /><span class="text-label-s">{{ exito() }}</span>
            </p>
            <a grButton variant="secondary" size="l" [block]="true" routerLink="/porra/mis-apuestas" iconRight="arrow-right">Ver mis apuestas</a>
          } @else {
            <button grButton variant="primary" size="l" [block]="true" [loading]="cargando()" [disabled]="!puedeApostar()" (click)="confirmar.emit({ atletaId: elegido()?.atletaId ?? '', importe: importe() })">
              {{ insuficiente() ? 'Saldo insuficiente' : !elegido() ? 'Elige un atleta' : 'Confirmar apuesta de ' + monedas(importe()) }}
            </button>
          }
          <p class="flex items-center justify-between gap-3 text-body-xs text-text-secondary">Saldo disponible <b class="font-mono text-[14px] text-text-primary tabular-nums">{{ monedas(saldo()) }}</b></p>
        </div>
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
  /** Importe ya apostado (tras confirmar): ya está en el bote, la estimación no lo vuelve a sumar. */
  readonly hecho = input(0);

  readonly cerrar = output<void>();
  readonly confirmar = output<{ atletaId: string; importe: number }>();
  /** El usuario ha elegido otro atleta del mercado. */
  readonly elegir = output<string>();

  /** Arrastre del sheet (px hacia abajo) para cerrarlo con el gesto. */
  protected readonly arrastre = signal(0);
  protected readonly arrastrando = signal(false);
  private inicio = { y: 0, t: 0 };
  protected tomar(e: PointerEvent): void {
    if (window.matchMedia('(min-width: 768px)').matches || (e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.inicio = { y: e.clientY, t: e.timeStamp };
    this.arrastrando.set(true);
  }
  protected mover(e: PointerEvent): void {
    if (this.arrastrando()) this.arrastre.set(Math.max(0, e.clientY - this.inicio.y));
  }
  protected soltar(e: PointerEvent): void {
    if (!this.arrastrando()) return;
    this.arrastrando.set(false);
    const dy = this.arrastre();
    const alto = (e.currentTarget as HTMLElement).parentElement?.offsetHeight ?? 1;
    const rapido = dy > 20 && dy / Math.max(1, e.timeStamp - this.inicio.t) > 0.5;
    this.arrastre.set(0);
    if (dy > alto * 0.3 || rapido) this.cerrar.emit();
  }

  protected readonly importe = signal(5000);
  protected readonly texto = signal('5.000');
  /** Mínimo y máximo por apuesta (de la configuración pública del backend). */
  readonly minimo = input(100);
  readonly maximoApuesta = input(50000);

  protected readonly elegido = computed(() => this.opciones().find((o) => o.atletaId === this.atletaId()) ?? null);
  /** La cuota en vivo (bote / apostado al atleta). */
  protected readonly cuotaSel = computed(() => {
    const o = this.elegido();
    if (!o) return 0;
    if (o.cuota && o.cuota > 0) return o.cuota;
    return o.apostado > 0 ? this.mercado().bote / o.apostado : 0;
  });
  /** Parimutuel: la cuota estimada contando tu propio importe en el bote y en lo apostado al atleta. */
  protected readonly cuotaEst = computed(() => {
    const o = this.elegido();
    if (!o) return 0;
    const extra = this.hecho() ? 0 : this.importe();
    const a = o.apostado + extra;
    return a > 0 ? (this.mercado().bote + extra) / a : 0;
  });
  protected readonly cuotaTxt = computed(() => (this.cuotaSel() > 0 ? cuota(this.cuotaSel()) : '—'));
  protected readonly ini = computed(() => iniciales(this.elegido()?.nombre));
  protected readonly subtitulo = computed(() => {
    const o = this.elegido();
    return o ? `${o.sexoTxt} · ${o.categoria}` : '';
  });
  protected readonly maximo = computed(() => Math.min(this.maximoApuesta(), this.saldo()));
  protected readonly atajos = computed(() => [1000, 5000, 10000, 'max' as const]);
  /** Tras confirmar, el saldo ya descuenta la apuesta: no se vuelve a validar contra él. */
  protected readonly insuficiente = computed(() => !this.hecho() && this.importe() > this.saldo());
  protected readonly cobro = computed(() => {
    const imp = this.hecho() || this.importe();
    return this.cuotaEst() > 0 && imp > 0 ? '~' + monedas(Math.floor(imp * this.cuotaEst())) : '—';
  });
  protected readonly detalleCobro = computed(() => {
    const c = this.cuotaEst();
    return c > 0 ? `cuota estimada ${cuota(c)} · el reparto final depende del bote` : 'cuota estimada: sin apuestas aún';
  });
  protected readonly puedeApostar = computed(() => !!this.elegido() && !this.insuficiente() && this.importe() >= this.minimo() && this.importe() <= this.maximoApuesta());

  protected esAtajo(a: number | 'max'): boolean {
    return (a === 'max' ? this.maximo() : a) === this.importe();
  }
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

/** El gancho de premios (Figma «Prize hook card»): el puesto, el premio y el patrocinador. */
@Component({
  selector: 'gr-premio-card',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col overflow-hidden rounded-lg border border-accent/45 bg-bg-card shadow-glow-deep' },
  template: `
    <div class="relative flex items-center gap-4 overflow-hidden bg-accent-deep/60 p-4">
      <span class="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-accent/30 blur-3xl" aria-hidden="true"></span>
      @if (premio().imagenUrl) {
        <img [src]="premio().imagenUrl" [alt]="premio().titulo" class="relative size-16 shrink-0 rounded-md object-cover" loading="lazy" />
      } @else {
        <span class="relative flex size-14 shrink-0 items-center justify-center rounded-full border-2" [class]="medalla().anillo + ' ' + medalla().fondo + ' ' + medalla().texto" aria-hidden="true">
          <gr-icon [name]="puesto() === 1 ? 'trophy' : 'award'" [size]="26" />
        </span>
      }
      <span class="relative min-w-0">
        <span class="block text-display-xs leading-none text-white">{{ puestoTxt() }}</span>
        <span class="mt-1.5 block truncate text-mono-xs text-text-secondary">Premio de la jornada</span>
      </span>
    </div>
    <div class="flex flex-1 flex-col gap-2 p-4">
      <p class="text-ui-h5 text-text-primary">{{ premio().titulo }}</p>
      @if (descripcion()) { <p class="text-body-xs text-text-secondary">{{ descripcion() }}</p> }
      @if (premio().valorTexto) { <p class="flex items-center gap-1.5 font-mono text-label-s text-accent-text"><gr-icon name="zap" [size]="14" />{{ premio().valorTexto }}</p> }
      @if (premio().patrocinador) { <p class="mt-auto flex items-center gap-1.5 pt-1 text-mono-xs text-text-tertiary"><gr-icon name="gift" [size]="14" />Patrocina · {{ premio().patrocinador }}</p> }
    </div>
  `,
})
export class PremioCard {
  readonly premio = input.required<Premio>();
  protected readonly puesto = computed(() => this.premio().puestoDesde);
  protected readonly medalla = computed(() => MEDALLA[(Math.min(3, Math.max(1, this.puesto())) as 1 | 2 | 3)]);
  /** Las descripciones de una letra (datos de prueba) no aportan: se ocultan. */
  protected readonly descripcion = computed(() => {
    const d = (this.premio().descripcion ?? '').trim();
    return d.length > 2 ? d : '';
  });
  protected readonly puestoTxt = computed(() => {
    const p = this.premio();
    const ord = (n: number) => (n === 1 ? '1.er' : n === 2 ? '2.º' : n === 3 ? '3.er' : `${n}.º`);
    if (p.puestoDesde === p.puestoHasta) return `${ord(p.puestoDesde)} puesto`;
    return `${ord(p.puestoDesde)} – ${ord(p.puestoHasta)} puesto`;
  });
}

/** Una plaza del podio (los tres primeros de la clasificación). */
export interface PlazaPodio {
  puesto: number;
  alias: string;
  valor: string;
  yo: boolean;
  /** Color del valor (p. ej. el del tramo de la nota); si no, el de la medalla. */
  valorClase?: string;
}

/** El podio de la clasificación (Figma «Leaderboard podium»): 2.º · 1.º · 3.º con los colores de medalla. */
@Component({
  selector: 'gr-podio',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="mx-auto grid max-w-[760px] grid-cols-3 items-end gap-3" aria-label="Podio">
      @for (p of orden(); track p.puesto) {
        <li class="flex min-w-0 flex-col items-center gap-1.5 sm:gap-2" [class.order-first]="p.puesto === 2" [class.order-last]="p.puesto === 3">
          @if (p.puesto === 1) { <gr-icon name="trophy" [size]="22" [class]="m(1).texto" /> }
          <span class="flex shrink-0 items-center justify-center rounded-full border-2 bg-bg-raised font-display text-text-primary shadow-[0_6px_16px_rgb(0_0_0/0.45)]"
            [class]="m(p.puesto).anillo + (p.puesto === 1 ? ' size-[72px] text-[26px]' : ' size-[60px] text-[22px]') + (p.yo ? ' ring-2 ring-accent ring-offset-2 ring-offset-bg-base' : '')">{{ ini(p.alias) }}</span>
          <span class="w-full truncate text-center text-label-s text-text-primary">{{ p.alias ? '@' + p.alias : 'Anónimo' }}@if (p.yo) { <span class="sr-only"> (tú)</span> }</span>
          <span class="font-mono font-bold tabular-nums" [class]="(p.valorClase || m(p.puesto).texto) + (p.puesto === 1 ? ' text-[16px] sm:text-[20px]' : ' text-[14px] sm:text-[17px]')">{{ p.valor }}</span>
          <span class="block w-full rounded-t-xs" aria-hidden="true" [class]="m(p.puesto).solido + (p.puesto === 1 ? ' h-[104px]' : p.puesto === 2 ? ' h-[76px]' : ' h-14')"></span>
        </li>
      }
    </ol>
  `,
})
export class Podio {
  readonly plazas = input.required<PlazaPodio[]>();
  protected readonly orden = computed(() => this.plazas().filter((p) => p.puesto >= 1 && p.puesto <= 3));
  protected m(p: number) {
    return MEDALLA[(Math.min(3, Math.max(1, p)) as 1 | 2 | 3)];
  }
  protected ini(a: string): string {
    return iniciales(a);
  }
}

/** Una fila de la clasificación (Figma «Leaderboard row»): puesto, alias, valor y el distintivo de «Tu puesto». */
@Component({
  selector: 'gr-leaderboard-row',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'clases()' },
  template: `
    <span class="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-sm border px-1.5 font-mono text-[0.9375rem] font-bold tabular-nums" [class]="medalla()">
      @if (medallaIcono()) { <gr-icon [name]="medallaIcono()!" [size]="18" [label]="fila().puesto + '.º'" /> } @else { {{ monedas(fila().puesto) }} }
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-label-m text-text-primary">{{ alias() }}</span>
      @if (nota()) { <span class="block truncate text-body-xs" [class]="yo() ? 'text-accent-text' : 'text-text-tertiary'">{{ nota() }}</span> }
    </span>
    <span class="shrink-0 text-right">
      <span class="block font-mono text-[16px] font-bold tabular-nums sm:text-[18px]" [class]="valorClase() || (yo() ? 'text-accent-text' : 'text-text-primary')">{{ valor() }}</span>
      <span class="block text-mono-xs text-text-muted">{{ valorLabel() }}</span>
    </span>
    @if (yo()) { <span class="hidden shrink-0 rounded-2xs bg-accent px-2 py-1 text-mono-xs text-white sm:inline">Tu puesto</span> }
  `,
})
export class LeaderboardRow {
  protected readonly monedas = monedas;
  readonly fila = input.required<{ puesto: number; alias: string; saldo?: number; puntos?: number; valor?: number }>();
  readonly nota = input('');
  readonly yo = input(false);
  readonly valorLabel = input('saldo porra');
  /** El valor ya formateado (p. ej. la nota media «7,92») y su color; si no, se pinta el saldo o los puntos de la fila. */
  readonly valorTxt = input('');
  readonly valorClase = input('');

  protected readonly clases = computed(
    () =>
      'flex min-h-16 min-w-0 items-center gap-3 rounded-md border px-3 py-3 sm:gap-3.5 sm:pr-4 ' +
      (this.yo() ? 'border-accent bg-accent-deep/30 shadow-[0_0_20px_rgb(196_43_62/0.22)]' : 'border-line-subtle bg-bg-card'),
  );
  protected readonly alias = computed(() => {
    const a = this.fila().alias;
    return (a ? '@' + a : 'Anónimo') + (this.yo() ? ' · tú' : '');
  });
  protected readonly valor = computed(() => {
    const f = this.fila();
    if (this.valorTxt()) return this.valorTxt();
    if (f.puntos !== undefined) return f.puntos + ' pts';
    return monedas(f.saldo ?? 0);
  });
  protected readonly medalla = computed(() => {
    const p = this.fila().puesto;
    if (this.yo()) return 'border-transparent bg-accent text-white';
    if (p >= 1 && p <= 3) {
      const m = MEDALLA[p as 1 | 2 | 3];
      return `${m.anillo} ${m.fondo} ${m.texto}`;
    }
    return 'border-line-strong bg-bg-raised text-text-secondary';
  });
  protected readonly medallaIcono = computed(() => {
    const p = this.fila().puesto;
    if (this.yo()) return null;
    if (p === 1) return 'trophy' as const;
    if (p === 2 || p === 3) return 'award' as const;
    return null;
  });
}

/**
 * La cabecera de las páginas de la porra (Figma «71 · /porra» · Contenido): migas, título y entradilla con el saldo o
 * el premio a la derecha, las vertientes (Apuestas · Pronósticos) y la barra del juego. En móvil las vertientes y las
 * pestañas son dos selectores de 48 px. Host «contents»: sus bloques se apilan con el gap de la página (28/24 px).
 */
@Component({
  selector: 'gr-porra-cabecera',
  imports: [RouterLink, GrIcon, AvisoJuegos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <nav class="text-body-xs text-text-tertiary" aria-label="Migas">
      <a routerLink="/" class="-mx-2 px-2 py-3.5 hover:text-text-primary">Inicio</a> · Juegos · @if (crumb()) { <a routerLink="/porra" class="-mx-2 px-2 py-3.5 hover:text-text-primary">Porra</a> · {{ crumb() }} } @else { Porra }
    </nav>
    <div class="flex items-start justify-between gap-8">
      <div class="flex min-w-0 flex-1 flex-col gap-2.5">
        <h1 class="text-display-s md:text-display-m">{{ titulo() }}</h1>
        @if (descripcion()) { <p class="max-w-[1064px] text-body-m text-text-secondary md:block" [class.hidden]="!descMovil()">{{ descripcion() }}</p> }
      </div>
      <div class="hidden shrink-0 flex-col items-end gap-2.5 md:flex"><ng-content select="[aside]" /></div>
    </div>

    <!-- escritorio: vertientes + barra del juego -->
    <div class="hidden gap-8 border-b border-line-subtle md:flex" role="group" aria-label="Vertiente">
      <a routerLink="/porra" class="-mb-px flex w-[216px] flex-col gap-1 border-b-2 border-accent pb-3" aria-current="page">
        <span class="text-display-xs text-text-primary">Apuestas</span>
        <span class="text-body-xs text-text-secondary">Cuotas en vivo con monedas de porra</span>
      </a>
      <span class="flex w-[216px] flex-col gap-1 pb-3" aria-disabled="true" title="Próximamente">
        <span class="text-display-xs text-text-tertiary">Pronósticos</span>
        <span class="text-body-xs text-text-muted">Elige ganadores · gratis · suma puntos</span>
      </span>
    </div>
    <div class="hidden items-center justify-between gap-4 md:flex">
      <nav class="flex gap-1 rounded-pill border border-line-subtle bg-bg-surface p-1" aria-label="Porra">
        @for (t of tabs; track t.id) {
          <a [routerLink]="t.href" class="flex h-10 items-center rounded-pill border px-[18px] text-label-s whitespace-nowrap transition-colors"
            [class]="t.id === activa() ? 'border-line-strong bg-bg-raised text-text-primary shadow-[0_2px_8px_rgb(0_0_0/0.35)]' : 'border-transparent text-text-tertiary hover:text-text-primary'"
            [attr.aria-current]="t.id === activa() ? 'page' : null">{{ t.label }}</a>
        }
      </nav>
      <gr-aviso-juegos />
    </div>

    <!-- móvil (UX5-R1-1/2): aviso corto y tab bar inferior del juego (HIG: 49 px + safe area, icono 24, label 11) -->
    <div class="flex flex-col gap-2 md:hidden">
      <p class="text-body-xs text-text-tertiary">Apuestas · cuotas en vivo <span class="ml-1 rounded-2xs border border-line-strong px-1.5 py-0.5 text-mono-xs text-text-muted">Pronósticos · pronto</span></p>
      <gr-aviso-juegos [corto]="true" />
    </div>
    <div class="h-16 md:hidden" aria-hidden="true"></div>
    <nav class="fixed inset-x-0 bottom-0 z-40 flex border-t border-line-subtle bg-bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-[10px] md:hidden" aria-label="Porra">
      @for (t of tabs; track t.id) {
        <a [routerLink]="t.href" class="flex h-[49px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-label-xs transition-transform duration-100 active:scale-95"
          [class]="t.id === activa() ? 'text-accent-text' : 'text-text-tertiary'" [attr.aria-current]="t.id === activa() ? 'page' : null">
          <gr-icon [name]="t.icono" [size]="24" /><span class="truncate">{{ t.corto }}</span>
        </a>
      }
    </nav>
  `,
})
export class PorraCabecera {
  readonly titulo = input.required<string>();
  readonly descripcion = input('');
  /** La entradilla también en móvil (Mis apuestas y Clasificación sí; Mercados no). */
  readonly descMovil = input(false);
  /** La miga tras «Porra» (vacía en /porra). */
  readonly crumb = input('');
  readonly activa = input<'mercados' | 'apuestas' | 'clasificacion'>('mercados');
  protected readonly tabs = [
    { id: 'mercados', href: '/porra', label: 'Mercados', corto: 'Mercados', icono: 'zap' },
    { id: 'apuestas', href: '/porra/mis-apuestas', label: 'Mis apuestas', corto: 'Mis apuestas', icono: 'ticket-check' },
    { id: 'clasificacion', href: '/porra/clasificacion', label: 'Clasificación', corto: 'Ranking', icono: 'trophy' },
  ] as const;
}

