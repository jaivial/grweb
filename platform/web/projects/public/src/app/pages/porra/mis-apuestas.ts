/**
 * porra/mis-apuestas.ts — /porra/mis-apuestas (Figma «71 · /porra» · Mis apuestas): el boleto de la jornada con lo que
 * sigue en juego, lo cobrado y lo perdido.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { JuegosEstado, PorraStore, type Apuesta, type Mercado, mensajeError, monedas } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AvisoJuegos, CoinBalance } from './componentes';

type Filtro = 'todas' | 'abiertas' | 'ganadas' | 'perdidas';
type EstadoApuesta = 'Abierta' | 'Ganada' | 'Perdida';

@Component({
  selector: 'gr-mis-apuestas-page',
  imports: [Page, GrAlert, GrBadge, GrButton, GrEmpty, GrSkeleton, AvisoJuegos, CoinBalance],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Mis apuestas" [suffix]="jornadaTxt()" crumb="Mis apuestas" section="Juegos"
      subtitle="Tu boleto de la jornada: lo que sigue en juego, lo cobrado y lo perdido. Se liquida al publicarse los resultados.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" />
      </div>

      @if (!fan.conSesion()) {
        <gr-empty icon="lock" title="Entra para ver tus apuestas" text="Necesitas tu cuenta de directo para ver el boleto de la jornada.">
          <button grButton variant="primary" (click)="entrar()">Entrar</button>
        </gr-empty>
      } @else if (store.cargandoApuestas()) {
        <div class="flex flex-col gap-3">
          @for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-20 rounded-lg" /> }
        </div>
      } @else if (store.errorApuestas(); as e) {
        <gr-alert tone="warning" title="No hemos podido cargar tus apuestas">{{ e }}</gr-alert>
      } @else if (!apuestas().length) {
        <gr-empty icon="ticket" title="Todavía no has apostado" text="Elige un mercado en /porra y haz tu primera apuesta con monedas virtuales.">
          <a grButton variant="primary" href="/porra">Ver los mercados</a>
        </gr-empty>
      } @else {
        <!-- Los tres resúmenes del diseño -->
        <div class="mb-6 grid gap-4 md:grid-cols-3">
          <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <p class="text-label-xs text-text-tertiary uppercase">En juego</p>
            <p class="mt-2 font-mono text-[28px] leading-none text-text-primary">{{ monedas(totales().enJuego) }}</p>
            <p class="mt-2 text-body-xs text-text-tertiary">{{ abiertas() }} {{ abiertas() === 1 ? 'apuesta abierta' : 'apuestas abiertas' }}</p>
          </div>
          <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <p class="text-label-xs text-text-tertiary uppercase">Cobrado</p>
            <p class="mt-2 font-mono text-[28px] leading-none text-success">{{ monedas(totales().cobrado) }}</p>
            <p class="mt-2 text-body-xs text-text-tertiary">{{ ganadas() }} {{ ganadas() === 1 ? 'ganada' : 'ganadas' }} · liquidadas</p>
          </div>
          <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <p class="text-label-xs text-text-tertiary uppercase">Perdido</p>
            <p class="mt-2 font-mono text-[28px] leading-none text-accent-text">−{{ monedas(totales().perdido) }}</p>
            <p class="mt-2 text-body-xs text-text-tertiary">{{ perdidas() }} sin acierto</p>
          </div>
        </div>

        <div class="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtro de apuestas">
          @for (f of filtros; track f.v) {
            <button type="button" class="h-9 rounded-pill border px-4 text-label-xs transition-colors"
              [class]="f.v === filtro() ? 'border-accent bg-accent-deep/50 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted'"
              [attr.aria-pressed]="f.v === filtro()" (click)="filtro.set(f.v)">{{ f.l }} ({{ f.n() }})</button>
          }
        </div>

        <ul class="flex flex-col gap-2">
          @for (a of visibles(); track a.id) {
            <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <span class="flex min-w-0 items-center gap-3">
                <gr-badge [tone]="tono(a)">{{ estadoApuesta(a) }}</gr-badge>
                <span class="min-w-0">
                  <span class="block truncate text-label-s text-text-primary">{{ a.mercado }}</span>
                  <span class="block truncate text-body-xs text-text-tertiary">{{ a.atleta || '—' }}</span>
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-6 sm:justify-end">
                <span class="text-right">
                  <span class="block font-mono text-label-s text-text-primary">{{ monedas(a.importe) }}</span>
                  <span class="block text-body-xs text-text-tertiary">importe apostado</span>
                </span>
                <span class="text-right">
                  @switch (estadoApuesta(a)) {
                    @case ('Ganada') {
                      <span class="block font-mono text-label-s text-success">+{{ monedas(cobro(a)) }} cobrados</span>
                      <span class="block text-body-xs text-text-tertiary">cobrado en la liquidación</span>
                    }
                    @case ('Perdida') {
                      <span class="block font-mono text-label-s text-text-tertiary">Sin acierto</span>
                      <span class="block text-body-xs text-text-tertiary">el bote se repartió entre acertantes</span>
                    }
                    @default {
                      <span class="block font-mono text-label-s text-accent-text">Si gana: ~{{ monedas(cuota(a)) }}</span>
                      <span class="block text-body-xs text-text-tertiary">se liquida al publicar resultados</span>
                    }
                  }
                </span>
              </span>
            </li>
          } @empty {
            <li><gr-empty icon="ticket" title="No hay apuestas en este filtro" text="Cambia de filtro o haz una apuesta en los mercados." /></li>
          }
        </ul>
      }

      <gr-aviso-juegos class="mt-10" />
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
    { v: 'perdidas', l: 'Perdidas', n: () => this.perdidas() },
  ];

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
      if (!mercado || mercado.estado !== 'liquidado') {
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
  protected readonly perdidas = computed(() => [...this.estados().values()].filter((e) => e === 'Perdida').length);
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const est = this.estados();
    return this.apuestas().filter((a) => {
      const e = est.get(a.id);
      return f === 'todas' || (f === 'abiertas' && e === 'Abierta') || (f === 'ganadas' && e === 'Ganada') || (f === 'perdidas' && e === 'Perdida');
    });
  });
  protected readonly totales = computed(() => {
    let enJuego = 0, cobrado = 0, perdido = 0;
    const est = this.estados();
    for (const a of this.apuestas()) {
      const e = est.get(a.id);
      if (e === 'Ganada') cobrado += this.cobro(a);
      else if (e === 'Perdida') perdido += a.importe;
      else enJuego += a.importe;
    }
    return { enJuego, cobrado, perdido };
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/porra/mis-apuestas', 'Mis apuestas · Porra · GR Strength Cup', 'Tus apuestas de porra de la jornada: lo que sigue en juego, lo cobrado y lo perdido.');
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
  protected tono(a: Apuesta): 'success' | 'danger' | 'neutral' {
    const e = this.estadoApuesta(a);
    return e === 'Ganada' ? 'success' : e === 'Perdida' ? 'danger' : 'neutral';
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
