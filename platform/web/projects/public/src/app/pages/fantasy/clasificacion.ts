/**
 * fantasy/clasificacion.ts — /fantasy/clasificacion (Figma «72 · /fantasy» · Clasificación): el ranking por puntos
 * con el puesto del usuario fijado, el premio como gancho y el feed de movimientos del mercado.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, untracked } from '@angular/core';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { FantasyStore, JuegosEnVivo, JuegosEstado, fusionaFichajes, type FilaFantasy } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { FeedRow } from './componentes';
import { CoinBalance, JuegosNav, LeaderboardRow, Podio, PremioCard, type PlazaPodio } from '../porra/componentes';

@Component({
  selector: 'gr-fantasy-clasificacion-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton, CoinBalance, FeedRow, JuegosNav, LeaderboardRow, Podio, PremioCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clasificación" [suffix]="jornadaTxt()" crumb="Clasificación" section="Juegos"
      subtitle="Suma de puntos de la jornada. Ganadores = top N con premio. Desempate: valor de la plantilla, después saldo y después quién llegó antes.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo()" moneda="fantasy" motivo="fantasy" />
      </div>

      <gr-juegos-nav class="mb-6 md:mb-8" juego="fantasy" activa="clasificacion" />

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="min-w-0">
          @if (store.cargandoClas()) {
            <div class="flex flex-col gap-2" aria-busy="true">
              <gr-skeleton class="mx-auto mb-4 h-56 w-full max-w-[760px] rounded-lg" />
              @for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16 rounded-md" /> }
            </div>
          } @else if (!filas().length) {
            <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
              <span class="flex size-14 items-center justify-center rounded-full border border-info/50 bg-info/12 text-info"><gr-icon name="trophy" [size]="24" /></span>
              <p class="text-display-xs">El podio está libre</p>
              <p class="max-w-md text-body-s text-text-tertiary">En cuanto se juegue la jornada, aquí verás el ranking por puntos. Monta tu equipo antes de que empiece.</p>
              <a grButton variant="primary" href="/fantasy/mercado" iconRight="arrow-right">Ir al mercado</a>
            </div>
          } @else {
            <gr-podio class="mb-6" [plazas]="podio()" />
            <ol class="flex flex-col gap-2" aria-label="Clasificación desde el 4.º puesto">
              @for (f of resto(); track f.puesto) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.puesto === miPuesto()" valorLabel="puntos fantasy" /></li>
              }
            </ol>
            @if (hayMas()) {
              <p class="my-3 text-center font-mono text-[11px] text-text-tertiary uppercase">· · · puestos {{ filas().length + 1 }} a {{ topTotal() }} · · ·</p>
            }
            @if (miFilaFuera(); as m) {
              <div class="mt-2">
                <gr-leaderboard-row [fila]="m" [nota]="nota(m)" [yo]="true" valorLabel="puntos fantasy" />
              </div>
            }
          }

          <section class="mt-10" aria-labelledby="feed-clas">
            <p id="feed-clas" class="flex items-center gap-2 text-mono-xs text-accent-text"><span class="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true"></span>Últimos movimientos del mercado</p>
            @if (feed().length) {
              <ul class="mt-3 grid gap-2 md:grid-cols-2" aria-live="polite">
                @for (m of feed().slice(0, 6); track m.fecha + m.atletaId) {
                  <li class="min-w-0"><gr-feed-row [mov]="m" [nombreAtleta]="nombre(m.atletaId)" /></li>
                }
              </ul>
              <a href="/fantasy/mercado" class="mt-3 inline-flex h-11 items-center gap-1 text-label-s text-accent-text hover:underline underline-offset-4 md:h-auto">Ir al mercado<gr-icon name="chevron-right" [size]="16" /></a>
            } @else {
              <p class="mt-2 text-body-xs text-text-tertiary">Todavía no hay movimientos en el mercado.</p>
            }
          </section>
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
    return enTop ?? { puesto: c.miPuesto, alias: this.fan.yo()?.alias ?? '', puntos: c.miPuntos, valor: 0, saldo: 0 };
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
      .map((f) => ({ puesto: f.puesto, alias: f.alias, valor: f.puntos + ' pts', yo: f.puesto === this.miPuesto() })),
  );
  /** Del 4.º en adelante (los visibles). */
  protected readonly resto = computed(() => this.filas().filter((f) => f.puesto > 3));
  /** Mi fila cuando no está entre las visibles (se fija abajo). */
  protected readonly miFilaFuera = computed(() => {
    const m = this.miFila();
    return m && m.puesto > this.visibles().length ? m : null;
  });
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
    return `Plantilla ${monedas(f.valor)} · saldo ${monedas(f.saldo)}`;
  }
}
