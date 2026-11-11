import { RouterLink } from '@angular/router';
/**
 * porra/mis-apuestas.ts — /porra/mis-apuestas (Figma «71 · /porra» · Mis apuestas): el boleto de la jornada con lo que
 * sigue en juego, lo cobrado y lo perdido.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrAlert, GrBadge, GrButton, GrIcon, type GrIconName, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { JuegosEstado, PorraStore, type Apuesta, type Mercado, mensajeError } from '../../core/juegos';
import { monedas } from './formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { CoinBalance, GrupoChips, JuegosNav } from './componentes';

type Filtro = 'todas' | 'abiertas' | 'ganadas' | 'devueltas' | 'perdidas';
type EstadoApuesta = 'Abierta' | 'Ganada' | 'Devuelta' | 'Perdida';

@Component({
  selector: 'gr-mis-apuestas-page',
  imports: [RouterLink, Page, GrAlert, GrBadge, GrButton, GrIcon, GrSkeleton, CoinBalance, GrupoChips, JuegosNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Mis apuestas" [suffix]="jornadaTxt()" crumb="Mis apuestas" section="Juegos"
      subtitle="Tu boleto de la jornada: lo que sigue en juego, lo cobrado, lo devuelto y lo perdido. Se liquida al publicarse los resultados.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" />
      </div>

      <gr-juegos-nav class="mb-6 md:mb-8" juego="porra" activa="apuestas" />

      @if (!fan.conSesion()) {
        <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
          <span class="flex size-14 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text shadow-glow-deep"><gr-icon name="lock" [size]="24" /></span>
          <p class="text-display-xs">Entra para ver tus apuestas</p>
          <p class="max-w-md text-body-s text-text-tertiary">Con tu cuenta del directo recibes 100.000 monedas por jornada para apostar en la porra.</p>
          <button grButton variant="primary" icon="user-plus" (click)="entrar()">Entrar para jugar</button>
        </div>
      } @else if (store.cargandoApuestas()) {
        <div class="flex flex-col gap-3" aria-busy="true">
          <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-28 rounded-lg" /> }</div>
          @for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-20 rounded-md" /> }
        </div>
      } @else if (store.errorApuestas(); as e) {
        <gr-alert tone="warning" title="No hemos podido cargar tus apuestas">{{ e }}</gr-alert>
      } @else if (!apuestas().length) {
        <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
          <span class="flex size-14 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text shadow-glow-deep"><gr-icon name="ticket" [size]="24" /></span>
          <p class="text-display-xs">Tu boleto está vacío</p>
          <p class="max-w-md text-body-s text-text-tertiary">Elige un mercado, pulsa una cuota y haz tu primera apuesta con monedas virtuales. Si aciertas, te llevas tu parte del bote.</p>
          <a grButton variant="primary" routerLink="/porra" iconRight="arrow-right">Ver los mercados</a>
        </div>
      } @else {
        <!-- Figma «Resumen»: en juego, cobrado, devuelto y perdido -->
        <div class="mb-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          @for (k of kpis(); track k.label) {
            <div class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5">
              <p class="text-mono-xs text-text-tertiary">{{ k.label }}</p>
              <p class="truncate font-mono text-[22px] leading-none font-bold tabular-nums md:text-[30px]" [class]="k.color">{{ k.valor }}</p>
              <p class="truncate text-body-xs text-text-tertiary">{{ k.nota }}</p>
            </div>
          }
        </div>

        <gr-grupo-chips class="mb-4" etiqueta="Filtro de apuestas" [opciones]="opcionesFiltro()" [valor]="filtro()" (valorChange)="filtro.set($event)" />

        <ul class="flex flex-col gap-2">
          @for (a of visibles(); track a.id) {
            <li class="flex min-w-0 flex-col gap-3 rounded-md border bg-bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              [class]="estadoApuesta(a) === 'Ganada' ? 'border-success/35' : 'border-line-subtle'">
              <span class="flex min-w-0 items-center gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-sm border" [class]="icono(a).cls"><gr-icon [name]="icono(a).name" [size]="18" /></span>
                <span class="min-w-0">
                  <span class="flex items-center gap-2"><span class="truncate text-label-s text-text-primary">{{ a.mercado }}</span><gr-badge class="shrink-0" [tone]="tono(a)">{{ estadoApuesta(a) }}</gr-badge></span>
                  <span class="block truncate text-body-xs text-text-tertiary">{{ a.atleta || '—' }}</span>
                </span>
              </span>
              <span class="flex shrink-0 items-end justify-between gap-6 border-t border-line-subtle pt-3 sm:justify-end sm:border-0 sm:pt-0">
                <span class="sm:text-right">
                  <span class="block font-mono text-[15px] font-bold text-text-primary tabular-nums">{{ monedas(a.importe) }}</span>
                  <span class="block text-mono-xs text-text-muted">Apostado</span>
                </span>
                <span class="min-w-[9rem] text-right">
                  @switch (estadoApuesta(a)) {
                    @case ('Ganada') {
                      <span class="block font-mono text-[15px] font-bold text-success tabular-nums">+{{ monedas(cobro(a)) }}</span>
                      <span class="block text-mono-xs text-text-muted">Cobrado</span>
                    }
                    @case ('Perdida') {
                      <span class="block font-mono text-[15px] font-bold text-text-tertiary">Sin acierto</span>
                      <span class="block text-mono-xs text-text-muted">Bote a los acertantes</span>
                    }
                    @case ('Devuelta') {
                      <span class="block font-mono text-[15px] font-bold text-info tabular-nums">+{{ monedas(a.importe) }}</span>
                      <span class="block text-mono-xs text-text-muted">Devuelto</span>
                    }
                    @default {
                      <span class="block font-mono text-[15px] font-bold text-accent-text tabular-nums">~{{ monedas(cuota(a)) }}</span>
                      <span class="block text-mono-xs text-text-muted">Si acierta</span>
                    }
                  }
                </span>
              </span>
            </li>
          } @empty {
            <li class="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
              <p class="text-label-m text-text-primary">No hay apuestas en este filtro</p>
              <p class="mt-1 text-body-s text-text-tertiary">Cambia de filtro o haz una apuesta en los mercados.</p>
            </li>
          }
        </ul>
      }
    </gr-page>
  `,
})
export class MisApuestasPage {
  protected readonly monedas = monedas;
  protected readonly store = inject(PorraStore);
  protected readonly estado = inject(JuegosEstado);
  protected readonly fan = inject(FanSession);

  protected readonly filtro = signal<Filtro>('todas');
  protected readonly filtros: { v: Filtro; l: string; n: () => number }[] = [
    { v: 'todas', l: 'Todas', n: () => this.apuestas().length },
    { v: 'abiertas', l: 'Abiertas', n: () => this.abiertas() },
    { v: 'ganadas', l: 'Ganadas', n: () => this.ganadas() },
    { v: 'devueltas', l: 'Devueltas', n: () => this.devueltas() },
    { v: 'perdidas', l: 'Perdidas', n: () => this.perdidas() },
  ];

  /** Los chips del filtro con su contador. */
  protected readonly opcionesFiltro = computed(() => this.filtros.map((f) => ({ v: f.v, l: f.l, n: f.n() })));
  /** Los cuatro indicadores del resumen (Figma «Resumen»). */
  protected readonly kpis = computed(() => {
    const t = this.totales();
    const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
    return [
      { label: 'En juego', valor: monedas(t.enJuego), color: 'text-text-primary', nota: pl(this.abiertas(), 'apuesta abierta', 'apuestas abiertas') },
      { label: 'Cobrado', valor: (t.cobrado ? '+' : '') + monedas(t.cobrado), color: 'text-success', nota: pl(this.ganadas(), 'ganada', 'ganadas') },
      { label: 'Devuelto', valor: monedas(t.devuelto), color: 'text-info', nota: pl(this.devueltas(), 'devuelta', 'devueltas') },
      { label: 'Perdido', valor: (t.perdido ? '−' : '') + monedas(t.perdido), color: 'text-accent-text', nota: pl(this.perdidas(), 'sin acierto', 'sin acierto') },
    ];
  });

  protected readonly apuestas = computed(() => this.store.apuestas());
  protected readonly saldo = computed(() => this.estado.saldoPorra());
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· ' + j.nombre.replace(/\s*\(.*\)$/, '') : '';
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
      await applySeo(cms, seo, '/porra/mis-apuestas', 'Mis apuestas · Porra · GR Strength Cup', 'Tus apuestas de porra de la jornada: lo que sigue en juego, lo cobrado, lo devuelto y lo perdido.');
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
