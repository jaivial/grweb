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
import { CoinBalance, JuegosNav, LeaderboardRow, Podio, PremioCard, type PlazaPodio } from './componentes';

@Component({
  selector: 'gr-porra-clasificacion-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton, CoinBalance, JuegosNav, LeaderboardRow, Podio, PremioCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clasificación" [suffix]="jornadaTxt()" crumb="Clasificación" section="Juegos"
      subtitle="Saldo de porra al cierre de cada apuesta. Premios en monedas al liquidar la jornada; en caso de empate gana quien llegó antes a ese saldo.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" />
      </div>

      <gr-juegos-nav class="mb-6 md:mb-8" juego="porra" activa="clasificacion" />

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
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
              <a grButton variant="primary" href="/porra" iconRight="arrow-right">Ir a los mercados</a>
            </div>
          } @else {
            <gr-podio class="mb-6" [plazas]="podio()" />
            <ol class="flex flex-col gap-2" aria-label="Clasificación desde el 4.º puesto">
              @for (f of resto(); track f.puesto) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.puesto === miPuesto()" /></li>
              }
            </ol>
            @if (hayMas()) {
              <p class="my-3 text-center font-mono text-[11px] text-text-tertiary uppercase">· · · puestos {{ visibles().length + 1 }} a {{ topTotal() }} · · ·</p>
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

        @if (premios().length) {
          <aside class="flex flex-col gap-4">
            <p class="text-mono-xs text-accent-text">Lo que te llevas</p>
            @for (p of premios().slice(0, 3); track p.id) { <gr-premio-card [premio]="p" /> }
          </aside>
        }
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
    return !!c && c.miPuesto > this.visibles().length && c.miPuesto > 0;
  });
  protected readonly topTotal = computed(() => this.store.clas()?.top.length ?? 0);
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
    return f.puesto === this.miPuesto() ? 'Tu puesto en la porra de esta jornada' : '';
  }
}
