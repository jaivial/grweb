/**
 * fantasy/clasificacion.ts — /fantasy/clasificacion (Figma «72 · /fantasy» · Clasificación): el ranking por puntos
 * con el puesto del usuario fijado, el premio como gancho y el feed de movimientos del mercado.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, untracked } from '@angular/core';
import { GrEmpty, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { FantasyStore, JuegosEnVivo, JuegosEstado, fusionaFichajes, type FilaFantasy } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { FeedRow } from './componentes';
import { CoinBalance, LeaderboardRow, PremioCard } from '../porra/componentes';

@Component({
  selector: 'gr-fantasy-clasificacion-page',
  imports: [Page, GrEmpty, GrSkeleton, CoinBalance, FeedRow, LeaderboardRow, PremioCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clasificación" [suffix]="jornadaTxt()" crumb="Clasificación" section="Juegos"
      subtitle="Suma de puntos de la jornada. Ganadores = top N con premio. Desempate: valor de la plantilla, después saldo y después quién llegó antes.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo()" moneda="fantasy" motivo="fantasy" />
      </div>

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          @if (store.cargandoClas()) {
            <div class="flex flex-col gap-2">
              @for (i of [1, 2, 3, 4, 5]; track i) { <gr-skeleton class="h-16 rounded-lg" /> }
            </div>
          } @else if (!filas().length) {
            <gr-empty icon="trophy" title="Todavía no hay clasificación" text="En cuanto se juegue la jornada, aquí verás el ranking por puntos." />
          } @else {
            <p class="mb-3 text-label-xs text-text-tertiary uppercase">Puesto</p>
            <ul class="flex flex-col gap-2">
              @for (f of filas(); track f.puesto) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.puesto === miPuesto()" valorLabel="puntos fantasy" /></li>
              }
            </ul>
            @if (hayMas()) {
              <p class="my-3 text-center text-body-xs text-text-tertiary">· · · puestos {{ filas().length + 1 }} a {{ topTotal() }} · · ·</p>
              @if (miFila(); as m) {
                <ul class="flex flex-col gap-2">
                  <li><gr-leaderboard-row [fila]="m" [nota]="nota(m)" [yo]="true" valorLabel="puntos fantasy" /></li>
                </ul>
              }
            }
          }

          <section class="mt-8">
            <p class="text-label-xs text-accent-text uppercase">Últimos movimientos del mercado</p>
            @if (feed().length) {
              <ul class="mt-3 flex flex-col gap-2">
                @for (m of feed(); track m.fecha + m.atletaId) {
                  <li><gr-feed-row [mov]="m" [nombreAtleta]="nombre(m.atletaId)" /></li>
                }
              </ul>
            } @else {
              <p class="mt-2 text-body-xs text-text-tertiary">Todavía no hay movimientos en el mercado.</p>
            }
          </section>
        </div>

        @if (premios().length) {
          <aside class="lg:justify-self-end">
            <gr-premio-card [premio]="premios()[0]" />
          </aside>
        }
      </div>
    </gr-page>
  `,
})
export class FantasyClasificacionPage {
  protected readonly store = inject(FantasyStore);
  protected readonly estado = inject(JuegosEstado);
  private readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);

  protected readonly visibles = computed(() => this.store.clas()?.top.slice(0, 6) ?? []);
  protected readonly miPuesto = computed(() => this.store.clas()?.miPuesto ?? 0);
  protected readonly miFila = computed<FilaFantasy | null>(() => {
    const c = this.store.clas();
    if (!c || !c.miPuesto) return null;
    const enTop = c.top.find((f) => f.puesto === c.miPuesto);
    return enTop ?? { puesto: c.miPuesto, fanId: '', alias: this.fan.yo()?.alias ?? '', puntos: c.miPuntos, valor: 0, saldo: 0 };
  });
  protected readonly hayMas = computed(() => {
    const c = this.store.clas();
    return !!c && c.miPuesto > this.visibles().length && c.miPuesto > 0;
  });
  protected readonly topTotal = computed(() => this.store.clas()?.top.length ?? 0);
  protected readonly filas = computed(() => this.visibles());
  protected readonly saldo = computed(() => this.estado.saldoFantasy());
  protected readonly premios = computed(() => this.estado.premios().filter((p) => p.ranking === 'fantasy'));
  /** El feed: los fichajes cargados del API más los que llegan por SSE. */
  protected readonly feed = computed(() => fusionaFichajes(this.store.fichajes(), this.vivo.feed()));
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· Fantasy ' + j.nombre.replace(/\s*\(.*\)$/, '') : '· Fantasy';
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await this.store.cargarClasificacion();
      await applySeo(cms, seo, '/fantasy/clasificacion', 'Clasificación de GRS Fantasy · GR Strength Cup', 'Ranking de fantasy por puntos: valor de la plantilla, saldo y feed de movimientos del mercado.');
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
      void this.store.cargarFichajes();
      inject(DestroyRef).onDestroy(() => this.vivo.desconectar());
    }
  }

  protected nombre(atletaId: string): string {
    return this.store.atletas().find((a) => a.atletaId === atletaId)?.nombre ?? 'el atleta';
  }
  protected nota(f: FilaFantasy): string {
    if (f.puesto === this.miPuesto()) return 'Tu puesto en fantasy';
    return `Valor de plantilla: ${f.valor.toLocaleString('es-ES')} · saldo ${f.saldo.toLocaleString('es-ES')}`;
  }
}
