import { RouterLink } from '@angular/router';
/**
 * porra/clasificacion.ts — /porra/clasificacion (Figma «71 · /porra» · Clasificación): el ranking de la jornada
 * (saldo de porra) con el puesto del usuario fijado y los premios como gancho.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { JuegosEnVivo, JuegosEstado, PorraStore } from '../../core/juegos';
import { monedas } from './formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { CoinBalance, LeaderboardRow, PorraCabecera, Podio, type PlazaPodio } from './componentes';

@Component({
  selector: 'gr-porra-clasificacion-page',
  imports: [RouterLink, Page, GrButton, GrIcon, GrSkeleton, CoinBalance, LeaderboardRow, PorraCabecera, Podio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clasificación" [juego]="true">
      <gr-porra-cabecera [titulo]="'Clasificación ' + jornadaTxt()" crumb="Clasificación" activa="clasificacion" [descMovil]="true"
        descripcion="Saldo de porra al cierre de cada apuesta. Premios en monedas al liquidar la jornada; en caso de empate gana quien llegó antes a ese saldo.">
        <section aside class="flex w-[340px] flex-col gap-2 rounded-lg border border-accent/45 bg-bg-card p-4 shadow-glow-deep" aria-label="Bote de la porra">
          <p class="flex items-center gap-2 text-mono-xs text-accent-text"><gr-icon name="trophy" [size]="14" />1.er puesto</p>
          <p class="text-ui-h5 text-text-primary">Bote de la porra {{ jornadaNombre() }}</p>
          <p class="flex items-baseline gap-1.5"><span class="font-mono text-[1.375rem] font-bold text-text-primary tabular-nums">{{ monedas(bote()) }}</span><span class="text-body-xs text-text-tertiary">monedas en juego</span></p>
          @if (premios()[0]; as p) {
            <p class="text-body-xs text-text-secondary">{{ p.titulo }}@if (p.valorTexto) { · <span class="font-mono text-accent-text">{{ p.valorTexto }}</span> }</p>
            @if (p.patrocinador) { <p class="text-mono-xs text-text-tertiary">Patrocina · {{ p.patrocinador }}</p> }
          } @else {
            <p class="text-body-xs text-text-tertiary">Todavía no hay premios publicados para esta jornada.</p>
          }
        </section>
      </gr-porra-cabecera>
      <gr-coin-balance class="self-start md:hidden" [valor]="saldo()" moneda="porra" motivo="porra" />

      <div>
        <div class="min-w-0">
          @if (store.cargandoClas()) {
            <div class="flex flex-col gap-2" aria-busy="true">
              <gr-skeleton class="mx-auto mb-4 h-56 w-full max-w-[760px] rounded-lg" />
              @for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16 rounded-md" /> }
            </div>
          } @else if (!filas().length) {
            <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
              <span class="flex size-14 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text shadow-glow-deep"><gr-icon name="trophy" [size]="24" /></span>
              <p class="text-display-xs">El podio está libre</p>
              <p class="max-w-md text-body-s text-text-tertiary">En cuanto alguien apueste, aquí verás el ranking en vivo. La primera apuesta puede ser la tuya.</p>
              <a grButton variant="primary" routerLink="/porra" iconRight="arrow-right">Ir a los mercados</a>
            </div>
          } @else {
            <p class="flex justify-between px-4 text-label-xs text-text-tertiary" aria-hidden="true"><span>Puesto</span><span>Usuario y saldo de porra</span></p>
            <gr-podio class="mt-3 mb-2" [plazas]="podio()" />
            <ol class="flex flex-col gap-2" aria-label="Clasificación desde el 4.º puesto">
              @for (f of resto(); track f.puesto) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.puesto === miPuesto()" /></li>
              }
            </ol>
            @if (hayMas()) {
              <p class="my-3 text-center font-mono text-[0.6875rem] text-text-secondary uppercase">· · · puestos {{ visibles().length + 1 }} a {{ monedas(miPuesto() - 1) }} · · ·</p>
            }
            @if (miFilaFuera(); as m) {
              <div class="mt-2">
                <gr-leaderboard-row [fila]="m" [nota]="nota(m)" [yo]="true" />
              </div>
            }
          }
          @if (premios().length) {
            <p class="mt-6 text-body-xs text-text-tertiary">{{ premiosTexto() }}</p>
          }
        </div>

      </div>
    </gr-page>
  `,
})
export class PorraClasificacionPage {
  protected readonly store = inject(PorraStore);
  private readonly vivo = inject(JuegosEnVivo);
  protected readonly estado = inject(JuegosEstado);
  protected readonly fan = inject(FanSession);

  protected readonly visibles = computed(() => this.store.clas()?.top.slice(0, 7) ?? []);
  protected readonly miPuesto = computed(() => this.store.clas()?.miPuesto ?? 0);
  protected readonly miFila = computed(() => {
    const c = this.store.clas();
    if (!c || !c.miPuesto) return null;
    const enTop = c.top.find((f) => f.puesto === c.miPuesto);
    return enTop ?? { puesto: c.miPuesto, alias: this.fan.yo()?.alias ?? '', saldo: c.miSaldo };
  });
  protected readonly hayMas = computed(() => {
    const c = this.store.clas();
    return !!c && c.miPuesto > this.visibles().length + 1;
  });
  protected readonly filas = computed(() => this.visibles());
  /** Los tres primeros, para el podio. */
  protected readonly podio = computed<PlazaPodio[]>(() =>
    this.filas()
      .filter((f) => f.puesto <= 3)
      .map((f) => ({ puesto: f.puesto, alias: f.alias, valor: monedas(f.saldo), yo: f.puesto === this.miPuesto() })),
  );
  /** Del 4.º en adelante (los visibles). */
  protected readonly resto = computed(() => this.filas().filter((f) => f.puesto > 3));
  /** Mi fila cuando no está entre las visibles (se fija abajo). */
  protected readonly miFilaFuera = computed(() => {
    const m = this.miFila();
    return m && m.puesto > this.visibles().length ? m : null;
  });
  protected readonly saldo = computed(() => this.estado.saldoPorra());
  protected readonly monedas = monedas;
  /** El bote total de la jornada (suma de los botes de sus mercados). */
  protected readonly bote = computed(() => this.store.mercados().reduce((s, m) => s + m.bote, 0));
  protected readonly jornadaNombre = computed(() => (this.store.jornada() ?? this.estado.jornada())?.nombre.replace(/\s*\(.*\)$/, '') ?? '');
  protected readonly premios = computed(() => this.store.premios().filter((p) => p.ranking === 'porra'));
  /** La línea de premios del diseño. */
  protected readonly premiosTexto = computed(() => {
    const l = this.premios();
    if (!l.length) return '';
    const lista = l.map((p) => p.valorTexto || p.titulo).join(' · ');
    return `Premios: ${lista} (monedas). El resto del bote se reparte entre los acertantes de cada mercado.`;
  });
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· Porra ' + j.nombre.replace(/\s*\(.*\)$/, '') : '· Porra';
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await this.store.cargarClasificacion();
      await applySeo(cms, seo, '/porra/clasificacion', 'Clasificación de la porra · GR Strength Cup', 'Ranking de la porra de la jornada: saldo de monedas virtuales, premios y tu puesto.');
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.vivo.conectar();
      // el ranking se actualiza en vivo (evento juegos.clasificacion)
      effect(() => {
        this.vivo.podios();
        untracked(() => void this.store.cargarClasificacion());
      });
      void this.fan.cargar().then(() => {
        void this.estado.cargarCartera();
        void this.store.cargarClasificacion();
      });
      inject(DestroyRef).onDestroy(() => this.vivo.desconectar());
    }
  }

  /**
   * La nota bajo el alias. El diseño pone una frase de estado («ha acertado 5 de 6 mercados»); el backend no la
   * da, así que solo la fila del usuario lleva su mensaje.
   */
  protected nota(f: { puesto: number; alias: string; saldo: number }): string {
    return f.puesto === this.miPuesto() ? 'Tu puesto' : '';
  }
}
