import { RouterLink } from '@angular/router';
/**
 * fantasy/clasificacion.ts — /fantasy/clasificacion y /fantasy/salas/:id/clasificacion (Figma «72 · /fantasy» ·
 * Clasificación): el ranking de la sala por nota media de la alineación, con el puesto del usuario fijado, el premio
 * como gancho y el feed de movimientos del mercado.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { FantasyStore, JuegosEnVivo, JuegosEstado, fusionaFichajes, nota2, type FilaSala } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AvisoConexion, BarraSala, FantasyCabecera, FeedRow, SinSala, colorNota } from './componentes';
import { CoinBalance, JuegosNav, LeaderboardRow, Podio, PremioCard, type PlazaPodio } from '../porra/componentes';

@Component({
  selector: 'gr-fantasy-clasificacion-page',
  imports: [RouterLink, Page, GrButton, GrIcon, GrSkeleton, AvisoConexion, BarraSala, CoinBalance, FantasyCabecera, FeedRow, JuegosNav, LeaderboardRow, Podio, PremioCard, SinSala],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clasificación" [juego]="true">
      <gr-fantasy-cabecera [titulo]="'Clasificación ' + jornadaTxt()" [migas]="['Clasificación']" descripcion="Media de las 5 notas de tu alineación. Ganadores = top N con premio. Desempate: valor de la alineación → saldo → llegada.">
        @if (premios()[0]; as p) {
          <gr-premio-card class="w-full shrink-0 lg:w-[340px]" [premio]="p" />
        } @else {
          <gr-coin-balance class="shrink-0 self-start lg:self-center" [valor]="saldo()" moneda="fantasy" motivo="fantasy" />
        }
      </gr-fantasy-cabecera>

      <gr-juegos-nav juego="fantasy" activa="clasificacion" />
      @if (store.sala(); as s) {
        <gr-barra-sala [salaId]="s.id" [nombre]="s.nombre" [estado]="s.estado" [miembros]="s.miembros ?? 0" [plazas]="s.plazas ?? 0" activa="clasificacion" />
      }
      @if (vivo.caida()) { <gr-aviso-conexion /> }

      <div>
        <div class="min-w-0">
          @if (store.cargandoClas() && !store.clas()) {
            <div class="flex flex-col gap-2" aria-busy="true">
              <gr-skeleton class="mx-auto mb-4 h-56 w-full max-w-[760px] rounded-lg" />
              @for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16 rounded-md" /> }
            </div>
          } @else if (!store.sala()) {
            <gr-sin-sala />
          } @else if (!filas().length) {
            <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
              <span class="flex size-14 items-center justify-center rounded-full border border-info/50 bg-info/12 text-info"><gr-icon name="trophy" [size]="24" /></span>
              <p class="text-display-xs">El podio está libre</p>
              <p class="max-w-md text-body-s text-text-tertiary">En cuanto se juegue la jornada, aquí verás el ranking de la sala por nota media. Monta tu equipo antes de que empiece.</p>
              <a grButton variant="primary" routerLink="/fantasy/mercado" iconRight="arrow-right">Ir al mercado</a>
            </div>
          } @else {
            <gr-podio class="mb-6" [plazas]="podio()" />
            <ol class="flex flex-col gap-2" aria-label="Clasificación desde el 4.º puesto">
              @for (f of resto(); track f.miembroId) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.esYo" valorLabel="nota media" [valorTxt]="n2(f.nota)" [valorClase]="color(f)" /></li>
              }
            </ol>
          }

          <section class="mt-10" aria-labelledby="feed-clas">
            <h2 id="feed-clas" class="text-ui-h5 uppercase">Últimos movimientos del mercado</h2>
            @if (feed().length) {
              <ul class="mt-3 grid gap-2 md:grid-cols-2" aria-live="polite">
                @for (m of feed().slice(0, 6); track m.fecha + m.atletaId) {
                  <li class="min-w-0"><gr-feed-row [mov]="m" [nombreAtleta]="nombre(m.atletaId)" /></li>
                }
              </ul>
              <a routerLink="/fantasy/mercado" class="mt-3 inline-flex h-11 items-center gap-1 text-label-s text-accent-text hover:underline underline-offset-4 md:h-auto">Ir al mercado<gr-icon name="chevron-right" [size]="16" /></a>
            } @else {
              <p class="mt-2 text-body-xs text-text-tertiary">Todavía no hay movimientos en el mercado.</p>
            }
          </section>
        </div>

      </div>
    </gr-page>
  `,
})
export class FantasyClasificacionPage {
  protected readonly n2 = nota2;
  protected readonly store = inject(FantasyStore);
  protected readonly estado = inject(JuegosEstado);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly ruta = inject(ActivatedRoute);

  /** Las salas son de hasta 10 jugadores: se pinta la clasificación entera. */
  protected readonly filas = computed(() => this.store.clas()?.filas ?? []);
  /** Los tres primeros, para el podio (la nota media con el color de su tramo). */
  protected readonly podio = computed<PlazaPodio[]>(() =>
    this.filas()
      .filter((f) => f.puesto <= 3)
      .slice(0, 3)
      .map((f) => ({ puesto: f.puesto, alias: f.alias, valor: nota2(f.nota), yo: f.esYo, valorClase: this.color(f) })),
  );
  /** Del 4.º en adelante (y quien comparta podio más allá de los tres primeros). */
  protected readonly resto = computed(() => {
    const enPodio = new Set(this.filas().filter((f) => f.puesto <= 3).slice(0, 3).map((f) => f.miembroId));
    return this.filas().filter((f) => !enPodio.has(f.miembroId));
  });
  protected readonly saldo = computed(() => this.estado.saldoFantasy());
  protected readonly premios = computed(() => this.estado.premios().filter((p) => p.ranking === 'fantasy'));
  /** El feed: los fichajes de la sala cargados del API más los que llegan por SSE. */
  protected readonly feed = computed(() => fusionaFichajes(this.store.fichajes(), this.vivo.feed(), this.store.sala()?.id));
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· Fantasy ' + j.nombre.replace(/\s*\(.*\)$/, '') : '· Fantasy';
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    this.store.salaPedida.set(this.ruta.snapshot.paramMap.get('id') ?? '');
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await this.store.cargarClasificacion();
      await applySeo(cms, seo, '/fantasy/clasificacion', 'Clasificación de GRS Fantasy · GR Strength Cup', 'Ranking de fantasy por sala: nota media de la alineación, valor, saldo y feed de movimientos del mercado.');
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.vivo.conectar();
      // el ranking se actualiza en vivo (notas, fichajes y la clasificación emitida), agrupando los eventos seguidos
      let primera = true;
      let espera: ReturnType<typeof setTimeout> | undefined;
      effect(() => {
        this.vivo.podios();
        this.vivo.versionNotas();
        this.vivo.version();
        untracked(() => {
          if (primera) return void (primera = false);
          clearTimeout(espera);
          espera = setTimeout(() => void this.store.cargarClasificacion(), 800);
        });
      });
      void this.fan.cargar().then(async () => {
        void this.estado.cargarCartera();
        await this.store.recargar();
        await this.store.cargarClasificacion();
        void this.store.cargarFichajes();
      });
      inject(DestroyRef).onDestroy(() => {
        clearTimeout(espera);
        this.vivo.desconectar();
      });
    }
  }

  protected nombre(atletaId: string): string {
    return this.store.atletas().find((a) => a.atletaId === atletaId)?.nombre ?? 'el atleta';
  }
  protected color(f: FilaSala): string {
    return colorNota(f.nota, f.conNota > 0);
  }
  protected nota(f: FilaSala): string {
    const provisional = f.conNota < 5 ? ` · ${f.conNota}/5 con nota` : '';
    return `Alineación ${monedas(f.valor)} · saldo ${monedas(f.saldo)}${provisional}`;
  }
}
