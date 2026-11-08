/**
 * porra/clasificacion.ts — /porra/clasificacion (Figma «71 · /porra» · Clasificación): el ranking de la jornada
 * (saldo de porra) con el puesto del usuario fijado y los premios como gancho.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { GrEmpty, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { JuegosEnVivo, JuegosEstado, PorraStore, monedas } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AvisoJuegos, CoinBalance, LeaderboardRow, PremioCard } from './componentes';

@Component({
  selector: 'gr-porra-clasificacion-page',
  imports: [Page, GrEmpty, GrSkeleton, AvisoJuegos, CoinBalance, LeaderboardRow, PremioCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clasificación" [suffix]="jornadaTxt()" crumb="Clasificación" section="Juegos"
      subtitle="Saldo de porra al cierre de cada apuesta. Premios en monedas al liquidar la jornada; en caso de empate gana quien llegó antes a ese saldo.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" />
      </div>

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          @if (store.cargandoClas()) {
            <div class="flex flex-col gap-2">
              @for (i of [1, 2, 3, 4, 5]; track i) { <gr-skeleton class="h-16 rounded-lg" /> }
            </div>
          } @else if (!filas().length) {
            <gr-empty icon="trophy" title="Todavía no hay clasificación" text="En cuanto se abra la jornada y alguien juegue, aquí verás el ranking en vivo." />
          } @else {
            <p class="mb-3 text-label-xs text-text-tertiary uppercase">Puesto</p>
            <ul class="flex flex-col gap-2">
              @for (f of filas(); track f.puesto) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.puesto === miPuesto()" /></li>
              }
            </ul>
            @if (hayMas()) {
              <p class="my-3 text-center text-body-xs text-text-tertiary">· · · puestos {{ visibles().length + 1 }} a {{ topTotal() }} · · ·</p>
              @if (miFila(); as m) {
                <ul class="flex flex-col gap-2">
                  <li><gr-leaderboard-row [fila]="m" [nota]="nota(m)" [yo]="true" /></li>
                </ul>
              }
            }
          }
          @if (premios().length) {
            <p class="mt-6 text-body-xs text-text-tertiary">{{ premiosTexto() }}</p>
          }
        </div>

        @if (premios().length) {
          <aside class="lg:justify-self-end">
            <gr-premio-card [premio]="premios()[0]" />
          </aside>
        }
      </div>

      <gr-aviso-juegos class="mt-10" />
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
    return enTop ?? { puesto: c.miPuesto, fanId: '', alias: this.fan.yo()?.alias ?? '', saldo: c.miSaldo };
  });
  protected readonly hayMas = computed(() => {
    const c = this.store.clas();
    return !!c && c.miPuesto > this.visibles().length && c.miPuesto > 0;
  });
  protected readonly topTotal = computed(() => this.store.clas()?.top.length ?? 0);
  protected readonly filas = computed(() => this.visibles());
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
