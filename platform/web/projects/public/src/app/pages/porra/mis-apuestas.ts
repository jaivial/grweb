import { RouterLink } from '@angular/router';
/**
 * porra/mis-apuestas.ts — /porra/mis-apuestas (Figma «71 · /porra» · Mis apuestas): el boleto de la jornada con lo que
 * sigue en juego, lo cobrado y lo perdido.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrAlert, GrButton, GrIcon, type GrIconName, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { JuegosEstado, PorraStore, type Apuesta, type Mercado, cuota as cuotaFmt, nombreJornadaLoc } from '../../core/juegos';
import { monedas } from './formato';
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { CoinBalance, PorraCabecera } from './componentes';

type Filtro = 'todas' | 'abiertas' | 'ganadas' | 'devueltas' | 'perdidas';
type EstadoApuesta = 'Abierta' | 'Ganada' | 'Devuelta' | 'Perdida';

const T = {
  es: {
    titulo: 'Mis apuestas',
    desc: 'Tu boleto de la jornada: lo que sigue en juego, lo cobrado y lo perdido. Se liquida al publicarse los resultados.',
    entraVer: 'Entra para ver tus apuestas',
    entraTxt: 'Con tu cuenta del directo recibes 100.000 monedas por jornada para apostar en la porra.',
    entrar: 'Entrar para jugar',
    errorCarga: 'No hemos podido cargar tus apuestas',
    vacio: 'Tu boleto está vacío',
    vacioTxt: 'Elige un mercado, pulsa una cuota y haz tu primera apuesta con monedas virtuales. Si aciertas, te llevas tu parte del bote.',
    verMercados: 'Ver los mercados',
    filtro: 'Filtro de apuestas',
    importeApostado: 'importe apostado',
    cobrados: (n: string) => `+${n} cobrados`,
    sinAcierto: 'Sin acierto',
    pierdes: 'pierdes el importe apostado',
    devueltos: (n: string) => `+${n} devueltos`,
    nadie: 'nadie acertó · bote de vuelta',
    siGana: (n: string) => `Si gana (estimado): ${n}`,
    ahora: 'ahora',
    filtroVacio: 'No hay apuestas en este filtro',
    filtroVacioTxt: 'Cambia de filtro o haz una apuesta en los mercados.',
    estados: { Abierta: 'Abierta', Ganada: 'Ganada', Devuelta: 'Devuelta', Perdida: 'Perdida' } as Record<EstadoApuesta, string>,
    filtros: { todas: 'Todas', abiertas: 'Abiertas', ganadas: 'Ganadas', devueltas: 'Devueltas', perdidas: 'Perdidas' } as Record<Filtro, string>,
    enJuego: 'En juego',
    cobrado: 'Cobrado',
    devuelto: 'Devuelto',
    perdido: 'Perdido',
    nAbiertas: (n: number) => `${n} ${n === 1 ? 'apuesta abierta' : 'apuestas abiertas'}`,
    nGanadas: (n: number) => `${n} ${n === 1 ? 'ganada' : 'ganadas'}`,
    nDevueltas: (n: number) => `${n} ${n === 1 ? 'devuelta' : 'devueltas'}`,
    nPerdidas: (n: number) => `${n} sin acierto`,
    seoTitulo: 'Mis apuestas · Porra · GR Strength Cup',
    seoDesc: 'Tus apuestas de porra de la jornada: lo que sigue en juego, lo cobrado, lo devuelto y lo perdido.',
  },
  en: {
    titulo: 'My bets',
    desc: 'Your slip for the day: what is still in play, what you have collected and what you have lost. It is settled when the results are published.',
    entraVer: 'Sign in to see your bets',
    entraTxt: 'With your live stream account you get 100,000 coins per day to bet in the pool.',
    entrar: 'Sign in to play',
    errorCarga: "We couldn't load your bets",
    vacio: 'Your slip is empty',
    vacioTxt: 'Choose a market, tap some odds and place your first bet with virtual coins. If you get it right, you take your share of the pot.',
    verMercados: 'See the markets',
    filtro: 'Bet filter',
    importeApostado: 'amount staked',
    cobrados: (n: string) => `+${n} collected`,
    sinAcierto: 'No win',
    pierdes: 'you lose the amount staked',
    devueltos: (n: string) => `+${n} refunded`,
    nadie: 'nobody got it right · pot refunded',
    siGana: (n: string) => `If it wins (estimated): ${n}`,
    ahora: 'now',
    filtroVacio: 'No bets in this filter',
    filtroVacioTxt: 'Change the filter or place a bet in the markets.',
    estados: { Abierta: 'Open', Ganada: 'Won', Devuelta: 'Refunded', Perdida: 'Lost' } as Record<EstadoApuesta, string>,
    filtros: { todas: 'All', abiertas: 'Open', ganadas: 'Won', devueltas: 'Refunded', perdidas: 'Lost' } as Record<Filtro, string>,
    enJuego: 'In play',
    cobrado: 'Collected',
    devuelto: 'Refunded',
    perdido: 'Lost',
    nAbiertas: (n: number) => `${n} open ${n === 1 ? 'bet' : 'bets'}`,
    nGanadas: (n: number) => `${n} won`,
    nDevueltas: (n: number) => `${n} refunded`,
    nPerdidas: (n: number) => `${n} lost`,
    seoTitulo: 'My bets · Pool · GR Strength Cup',
    seoDesc: 'Your betting pool bets for the day: what is still in play, collected, refunded and lost.',
  },
};

@Component({
  selector: 'gr-mis-apuestas-page',
  imports: [RouterLink, LocPipe, Page, GrAlert, GrButton, GrIcon, GrSkeleton, CoinBalance, PorraCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [juego]="true">
      <gr-porra-cabecera [titulo]="t().titulo + ' ' + jornadaTxt()" [tituloMovil]="t().titulo" [asideMovil]="true" [crumb]="t().titulo" activa="apuestas"
        [descripcion]="t().desc">
        <gr-coin-balance aside [valor]="saldo()" moneda="porra" motivo="porra" [etiquetaMovil]="false" />
      </gr-porra-cabecera>

      @if (!fan.conSesion()) {
        <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
          <span class="flex size-14 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text shadow-glow-deep"><gr-icon name="lock" [size]="24" /></span>
          <p class="text-display-xs">{{ t().entraVer }}</p>
          <p class="max-w-md text-body-s text-text-tertiary">{{ t().entraTxt }}</p>
          <button grButton variant="primary" icon="user-plus" (click)="entrar()">{{ t().entrar }}</button>
        </div>
      } @else if (store.cargandoApuestas()) {
        <div class="flex flex-col gap-3" aria-busy="true">
          <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-28 rounded-lg" /> }</div>
          @for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-20 rounded-md" /> }
        </div>
      } @else if (store.errorApuestas(); as e) {
        <gr-alert tone="warning" [title]="t().errorCarga">{{ e }}</gr-alert>
      } @else if (!apuestas().length) {
        <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
          <span class="flex size-14 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text shadow-glow-deep"><gr-icon name="ticket" [size]="24" /></span>
          <p class="text-display-xs">{{ t().vacio }}</p>
          <p class="max-w-md text-body-s text-text-tertiary">{{ t().vacioTxt }}</p>
          <a grButton variant="primary" [routerLink]="'/porra' | loc" iconRight="arrow-right">{{ t().verMercados }}</a>
        </div>
      } @else {
        <!-- Figma «Resumen»: en juego, cobrado, devuelto y perdido -->
        <!-- UX5-R1-2: en móvil una fila compacta 1×4 -->
        <div class="grid grid-cols-4 gap-1.5 md:gap-4">
          @for (k of kpis(); track k.label) {
            <div class="flex min-w-0 flex-col gap-1 rounded-md border border-line-subtle bg-bg-card px-2 py-2 md:gap-2 md:rounded-lg md:p-4">
              <p class="truncate text-mono-xs text-text-secondary">{{ k.label }}</p>
              <p class="truncate font-mono text-body-s font-bold tabular-nums md:text-[1.75rem] md:leading-[1.3]" [class]="k.color">{{ k.valor }}</p>
              <p class="hidden truncate text-body-xs text-text-secondary md:block">{{ k.nota }}</p>
            </div>
          }
        </div>

        <div class="hidden flex-wrap gap-2 md:flex" role="group" [attr.aria-label]="t().filtro">
          @for (o of opcionesFiltro(); track o.v) {
            <button type="button" class="h-11 rounded-pill border px-3 text-label-xs transition-colors pointer-fine:h-8" [attr.aria-pressed]="o.v === filtro()" (click)="filtro.set(o.v)"
              [class]="o.v === filtro() ? 'border-accent bg-accent/16 text-accent-text' : 'border-transparent bg-bg-field text-text-secondary hover:text-text-primary'">{{ o.l }} ({{ o.n }})</button>
          }
        </div>
        <label class="relative block md:hidden">
          <span class="sr-only">{{ t().filtro }}</span>
          <select class="h-12 w-full appearance-none rounded-md border border-line-strong bg-bg-field pr-12 pl-4 text-label-s text-text-primary" (change)="filtro.set($any($event.target).value)">
            @for (o of opcionesFiltro(); track o.v) { <option [value]="o.v" [selected]="o.v === filtro()">{{ o.l }} ({{ o.n }})</option> }
          </select>
          <gr-icon name="chevron-down" [size]="20" class="pointer-events-none absolute top-3.5 right-4" />
        </label>

        <ul class="flex flex-col gap-3">
          @for (a of visibles(); track a.id) {
            <li class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-md border border-line-subtle bg-bg-card px-4 py-3 md:flex md:items-center md:gap-4">
              <span class="inline-flex h-6 items-center self-start justify-self-start rounded-xs px-2.5 text-[0.75rem] font-medium tracking-[0.04em] uppercase md:self-center" [class]="tag(a)">{{ t().estados[estadoApuesta(a)] }}</span>
              <span class="row-start-1 col-start-2 text-right font-mono text-[0.8125rem] font-bold text-text-primary tabular-nums md:hidden">{{ monedas(a.importe) }}</span>
              <span class="col-span-2 flex min-w-0 flex-col gap-0.5 md:flex-1">
                <span class="truncate text-body-s text-text-primary">{{ a.mercado }}</span>
                <span class="truncate text-body-xs text-text-tertiary">{{ a.atleta || '—' }}</span>
              </span>
              <span class="hidden shrink-0 flex-col items-end md:flex">
                <span class="font-mono text-[0.8125rem] font-bold text-text-primary tabular-nums">{{ monedas(a.importe) }}</span>
                <span class="font-mono text-[0.6875rem] text-text-tertiary">{{ t().importeApostado }}</span>
              </span>
              <span class="col-span-2 flex min-w-0 flex-col md:w-[220px] md:shrink-0 md:items-end">
                @switch (estadoApuesta(a)) {
                  @case ('Ganada') { <span class="text-body-xs text-success md:text-body-s">{{ t().cobrados(monedas(cobro(a))) }}</span> }
                  @case ('Perdida') { <span class="text-body-xs text-text-tertiary md:text-body-s">{{ t().sinAcierto }}</span><span class="hidden font-mono text-[0.6875rem] text-text-tertiary md:block">{{ t().pierdes }}</span> }
                  @case ('Devuelta') { <span class="text-body-xs text-info md:text-body-s">{{ t().devueltos(monedas(a.importe)) }}</span><span class="hidden font-mono text-[0.6875rem] text-text-tertiary md:block">{{ t().nadie }}</span> }
                  @default { <span class="text-body-xs text-text-secondary md:text-body-s md:text-text-primary">{{ t().siGana(monedas(cuota(a))) }}</span><span class="hidden font-mono text-[0.6875rem] text-text-tertiary md:block">{{ t().ahora }} {{ cuotaTxt(a) }}</span> }
                }
              </span>
            </li>
          } @empty {
            <li class="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
              <p class="text-label-m text-text-primary">{{ t().filtroVacio }}</p>
              <p class="mt-1 text-body-s text-text-tertiary">{{ t().filtroVacioTxt }}</p>
            </li>
          }
        </ul>
      }
    </gr-page>
  `,
})
export class MisApuestasPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.locale());
  protected readonly store = inject(PorraStore);
  protected readonly estado = inject(JuegosEstado);
  protected readonly fan = inject(FanSession);

  protected readonly filtro = signal<Filtro>('todas');
  protected readonly filtros: { v: Filtro; n: () => number }[] = [
    { v: 'todas', n: () => this.apuestas().length },
    { v: 'abiertas', n: () => this.abiertas() },
    { v: 'ganadas', n: () => this.ganadas() },
    { v: 'devueltas', n: () => this.devueltas() },
    { v: 'perdidas', n: () => this.perdidas() },
  ];

  /** Los chips del filtro con su contador. */
  protected readonly opcionesFiltro = computed(() => this.filtros.map((f) => ({ v: f.v, l: this.t().filtros[f.v], n: f.n() })));
  /** Los cuatro indicadores del resumen (Figma «Resumen»). */
  protected readonly kpis = computed(() => {
    const t = this.totales();
    const d = this.t();
    return [
      { label: d.enJuego, valor: this.monedas(t.enJuego), color: 'text-text-primary', nota: d.nAbiertas(this.abiertas()) },
      { label: d.cobrado, valor: (t.cobrado ? '+' : '') + this.monedas(t.cobrado), color: 'text-success', nota: d.nGanadas(this.ganadas()) },
      { label: d.devuelto, valor: this.monedas(t.devuelto), color: 'text-info', nota: d.nDevueltas(this.devueltas()) },
      { label: d.perdido, valor: (t.perdido ? '−' : '') + this.monedas(t.perdido), color: 'text-accent-text', nota: d.nPerdidas(this.perdidas()) },
    ];
  });

  protected readonly apuestas = computed(() => this.store.apuestas());
  protected readonly saldo = computed(() => this.estado.saldoPorra());
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· ' + nombreJornadaLoc(j, this.i18n.locale()) : '';
  });

  /** El estado de cada apuesta, deducido del estado y el ganador de su mercado. */
  protected readonly estados = computed<Map<string, EstadoApuesta>>(() => {
    const m = new Map<string, EstadoApuesta>();
    for (const a of this.apuestas()) {
      const mercado = this.mercado(a);
      if (a.devuelto || mercado?.devuelto) {
        // El bote volvió a las apuestas (nadie acertó al ganador o el staff anuló el mercado): la apuesta recuperó
        // su importe, no está ganada ni perdida.
        m.set(a.id, 'Devuelta');
      } else if (!mercado || mercado.estado !== 'liquidado') {
        m.set(a.id, 'Abierta');
      } else if (mercado.ganador?.length && mercado.ganador.includes(a.atletaId)) {
        m.set(a.id, 'Ganada');
      } else {
        m.set(a.id, 'Perdida');
      }
    }
    return m;
  });
  protected readonly abiertas = computed(() => [...this.estados().values()].filter((e) => e === 'Abierta').length);
  protected readonly ganadas = computed(() => [...this.estados().values()].filter((e) => e === 'Ganada').length);
  protected readonly devueltas = computed(() => [...this.estados().values()].filter((e) => e === 'Devuelta').length);
  protected readonly perdidas = computed(() => [...this.estados().values()].filter((e) => e === 'Perdida').length);
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const est = this.estados();
    return this.apuestas().filter((a) => {
      const e = est.get(a.id);
      return f === 'todas' || (f === 'abiertas' && e === 'Abierta') || (f === 'ganadas' && e === 'Ganada') || (f === 'devueltas' && e === 'Devuelta') || (f === 'perdidas' && e === 'Perdida');
    });
  });
  protected readonly totales = computed(() => {
    let enJuego = 0, cobrado = 0, devuelto = 0, perdido = 0;
    const est = this.estados();
    for (const a of this.apuestas()) {
      const e = est.get(a.id);
      if (e === 'Ganada') cobrado += this.cobro(a);
      else if (e === 'Devuelta') devuelto += a.importe;
      else if (e === 'Perdida') perdido += a.importe;
      else enJuego += a.importe;
    }
    return { enJuego, cobrado, devuelto, perdido };
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/porra/mis-apuestas', this.t().seoTitulo, this.t().seoDesc);
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.fan.cargar().then(() => {
        void this.store.cargarApuestas();
        void this.estado.cargarCartera();
      });
      inject(DestroyRef).onDestroy(() => undefined);
    }
  }

  protected entrar(): void {
    this.fan.abrirAcceso('porra');
  }
  protected mercado(a: Apuesta): Mercado | undefined {
    return this.store.mercados().find((m) => m.id === a.mercadoId);
  }
  protected estadoApuesta(a: Apuesta): EstadoApuesta {
    return this.estados().get(a.id) ?? 'Abierta';
  }
  protected tono(a: Apuesta): 'success' | 'danger' | 'neutral' | 'info' | 'accent' {
    const e = this.estadoApuesta(a);
    return e === 'Ganada' ? 'success' : e === 'Perdida' ? 'neutral' : e === 'Devuelta' ? 'info' : 'accent';
  }
  /** La etiqueta de estado (Figma: abierta roja, ganada verde, devuelta azul, perdida gris). */
  protected tag(a: Apuesta): string {
    const e = this.estadoApuesta(a);
    return e === 'Ganada' ? 'bg-success/14 text-success' : e === 'Perdida' ? 'bg-bg-raised text-text-tertiary' : e === 'Devuelta' ? 'bg-info/14 text-info' : 'bg-accent/18 text-accent-text';
  }
  /** La cuota en vivo del atleta apostado. */
  protected cuotaTxt(a: Apuesta): string {
    const m = this.mercado(a);
    const o = m?.opciones.find((x) => x.atletaId === a.atletaId);
    return o && o.apostado > 0 ? cuotaFmt(o.cuota || m!.bote / o.apostado) : '—';
  }
  /** El icono de la fila según el estado de la apuesta. */
  protected icono(a: Apuesta): { name: GrIconName; cls: string } {
    const e = this.estadoApuesta(a);
    if (e === 'Ganada') return { name: 'trophy', cls: 'border-success/40 bg-success/10 text-success' };
    if (e === 'Devuelta') return { name: 'undo', cls: 'border-info/40 bg-info/10 text-info' };
    if (e === 'Perdida') return { name: 'x', cls: 'border-line-strong bg-bg-raised text-text-muted' };
    return { name: 'ticket', cls: 'border-accent/50 bg-accent-deep/45 text-accent-text' };
  }
  /** La cuota en vivo de la apuesta (bote / apostado al atleta). */
  protected cuota(a: Apuesta): number {
    const m = this.mercado(a);
    if (!m) return 0;
    const o = m.opciones.find((x) => x.atletaId === a.atletaId);
    if (!o || o.apostado <= 0) return 0;
    return (m.bote / o.apostado) * a.importe;
  }
  /** Lo cobrado: floor(bote × importe / apostado a los ganadores), el reparto parimutuel del backend. */
  protected cobro(a: Apuesta): number {
    const m = this.mercado(a);
    if (!m) return 0;
    const ganadores = m.opciones.filter((o) => m.ganador?.includes(o.atletaId));
    const apostado = ganadores.reduce((s, o) => s + o.apostado, 0);
    if (apostado <= 0) return 0;
    return Math.floor((m.bote * a.importe) / apostado);
  }
}
