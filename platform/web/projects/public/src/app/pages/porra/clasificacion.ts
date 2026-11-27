import { ActivatedRoute, RouterLink } from '@angular/router';
/**
 * porra/clasificacion.ts — /porra/clasificacion (Figma «71 · /porra» · Clasificación): el ranking del nivel elegido
 * (AEP-2 / AEP-3, saldo de porra de su jornada) con el puesto del usuario fijado y los premios como gancho.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession } from '../../core/fan';
import { JuegosEnVivo, JuegosEstado, PorraStore } from '../../core/juegos';
import { monedas } from './formato';
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { CoinBalance, LeaderboardRow, PorraCabecera, Podio, type PlazaPodio } from './componentes';
import { PRUEBA_TXT, PorraNivel, pruebaDeUrl, saldoNivelTxt } from './navegacion';

const T = {
  es: {
    titulo: 'Clasificación',
    desc: 'Saldo de porra al cierre de cada apuesta. Premios en monedas al liquidar la jornada; en caso de empate gana quien llegó antes a ese saldo.',
    bote: 'Bote de la porra',
    primero: '1.er puesto',
    enJuego: 'monedas en juego',
    patrocina: 'Patrocina',
    sinPremios: 'Todavía no hay premios publicados para esta jornada.',
    podioLibre: 'El podio está libre',
    podioLibreTxt: 'En cuanto alguien apueste, aquí verás el ranking en vivo. La primera apuesta puede ser la tuya.',
    irMercados: 'Ir a los mercados',
    puesto: 'Puesto',
    usuarioSaldo: 'Usuario y saldo de porra',
    desde4: 'Clasificación desde el 4.º puesto',
    puestos: (a: number, b: string) => `· · · puestos ${a} a ${b} · · ·`,
    premios: (l: string) => `Premios: ${l} (monedas). El resto del bote se reparte entre los acertantes de cada mercado.`,
    seoTitulo: 'Clasificación de la porra · GR Strength Cup',
    seoDesc: 'Ranking de la porra de la jornada: saldo de monedas virtuales, premios y tu puesto.',
    tuPuesto: 'Tu puesto',
  },
  en: {
    titulo: 'Leaderboard',
    desc: 'Pool balance at the close of each bet. Prizes in coins when the day is settled; in a tie, whoever reached that balance first wins.',
    bote: 'Betting pool jackpot',
    primero: '1st place',
    enJuego: 'coins at stake',
    patrocina: 'Sponsored by',
    sinPremios: 'No prizes have been published for this day yet.',
    podioLibre: 'The podium is up for grabs',
    podioLibreTxt: 'As soon as someone bets, you will see the live ranking here. The first bet could be yours.',
    irMercados: 'Go to the markets',
    puesto: 'Place',
    usuarioSaldo: 'User and pool balance',
    desde4: 'Leaderboard from 4th place',
    puestos: (a: number, b: string) => `· · · places ${a} to ${b} · · ·`,
    premios: (l: string) => `Prizes: ${l} (coins). The rest of the pot is shared among the winners of each market.`,
    seoTitulo: 'Betting pool leaderboard · GR Strength Cup',
    seoDesc: "The day's betting pool ranking: virtual coin balance, prizes and your place.",
    tuPuesto: 'Your place',
  },
};

@Component({
  selector: 'gr-porra-clasificacion-page',
  imports: [RouterLink, LocPipe, Page, GrButton, GrIcon, GrSkeleton, CoinBalance, LeaderboardRow, PorraCabecera, Podio, PorraNivel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [juego]="true">
      <gr-porra-cabecera [titulo]="t().titulo + ' · ' + nivelTxt()" [crumb]="t().titulo" activa="clasificacion" [descMovil]="true"
        [descripcion]="t().desc">
        <section aside class="flex w-[340px] flex-col gap-2 rounded-lg border border-accent/45 bg-bg-card p-4 shadow-glow-deep" [attr.aria-label]="t().bote">
          <p class="flex items-center gap-2 text-mono-xs text-accent-text"><gr-icon name="trophy" [size]="14" />{{ t().primero }}</p>
          <p class="text-ui-h5 text-text-primary">{{ t().bote }} {{ nivelTxt() }}</p>
          <p class="flex items-baseline gap-1.5"><span class="font-mono text-[1.375rem] font-bold text-text-primary tabular-nums">{{ monedas(bote()) }}</span><span class="text-body-xs text-text-tertiary">{{ t().enJuego }}</span></p>
          @if (premios()[0]; as p) {
            <p class="text-body-xs text-text-secondary">{{ p.titulo }}@if (p.valorTexto) { · <span class="font-mono text-accent-text">{{ p.valorTexto }}</span> }</p>
            @if (p.patrocinador) { <p class="text-mono-xs text-text-tertiary">{{ t().patrocina }} · {{ p.patrocinador }}</p> }
          } @else {
            <p class="text-body-xs text-text-tertiary">{{ t().sinPremios }}</p>
          }
        </section>
      </gr-porra-cabecera>
      <gr-porra-nivel [prueba]="prueba()" ruta="/porra/clasificacion" />
      <gr-coin-balance class="self-start md:hidden" [valor]="saldo()" moneda="porra" motivo="porra" [etiqueta]="etiquetaSaldo()" />

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
              <p class="text-display-xs">{{ t().podioLibre }}</p>
              <p class="max-w-md text-body-s text-text-tertiary">{{ t().podioLibreTxt }}</p>
              <a grButton variant="primary" [routerLink]="'/porra' | loc" iconRight="arrow-right">{{ t().irMercados }}</a>
            </div>
          } @else {
            <p class="flex justify-between px-4 text-label-xs text-text-tertiary" aria-hidden="true"><span>{{ t().puesto }}</span><span>{{ t().usuarioSaldo }}</span></p>
            <gr-podio class="mt-3 mb-2" [plazas]="podio()" />
            <ol class="flex flex-col gap-2" [attr.aria-label]="t().desde4">
              @for (f of resto(); track f.puesto) {
                <li><gr-leaderboard-row [fila]="f" [nota]="nota(f)" [yo]="f.puesto === miPuesto()" /></li>
              }
            </ol>
            @if (hayMas()) {
              <p class="my-3 text-center font-mono text-[0.6875rem] text-text-secondary uppercase">{{ t().puestos(visibles().length + 1, monedas(miPuesto() - 1)) }}</p>
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
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  private readonly route = inject(ActivatedRoute);
  /** El nivel elegido en ?prueba (AEP-2 por defecto): su jornada da la clasificación, el bote y el saldo. */
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly prueba = computed(() => pruebaDeUrl(this.qp().get('prueba')));
  protected readonly nivelTxt = computed(() => PRUEBA_TXT[this.prueba()]);

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
      .map((f) => ({ puesto: f.puesto, alias: f.alias, valor: this.monedas(f.saldo), yo: f.puesto === this.miPuesto() })),
  );
  /** Del 4.º en adelante (los visibles). */
  protected readonly resto = computed(() => this.filas().filter((f) => f.puesto > 3));
  /** Mi fila cuando no está entre las visibles (se fija abajo). */
  protected readonly miFilaFuera = computed(() => {
    const m = this.miFila();
    return m && m.puesto > this.visibles().length ? m : null;
  });
  protected readonly saldo = computed(() => this.store.saldoDe(this.prueba()));
  protected readonly etiquetaSaldo = computed(() => saldoNivelTxt(this.prueba(), this.i18n.lang()));
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.locale());
  /** El bote total del nivel (suma de los botes de sus mercados). */
  protected readonly bote = computed(() => this.store.mercadosDeNivel(this.prueba()).reduce((s, m) => s + m.bote, 0));
  protected readonly premios = computed(() => this.store.premios().filter((p) => p.ranking === 'porra'));
  /** La línea de premios del diseño. */
  protected readonly premiosTexto = computed(() => {
    const l = this.premios();
    if (!l.length) return '';
    const lista = l.map((p) => p.valorTexto || p.titulo).join(' · ');
    return this.t().premios(lista);
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await this.store.cargarClasificacion(this.prueba());
      await applySeo(cms, seo, '/porra/clasificacion', this.t().seoTitulo, this.t().seoDesc);
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.vivo.conectar();
      // el ranking se actualiza en vivo (evento juegos.clasificacion) y al cambiar de nivel AEP
      effect(() => {
        const p = this.prueba();
        this.vivo.podios();
        untracked(() => void this.store.cargarClasificacion(p));
      });
      void this.fan.cargar().then(() => {
        void this.store.cargarCarteras();
        void this.store.cargarClasificacion(this.prueba());
      });
      inject(DestroyRef).onDestroy(() => this.vivo.desconectar());
    }
  }

  /**
   * La nota bajo el alias. El diseño pone una frase de estado («ha acertado 5 de 6 mercados»); el backend no la
   * da, así que solo la fila del usuario lleva su mensaje.
   */
  protected nota(f: { puesto: number; alias: string; saldo: number }): string {
    return f.puesto === this.miPuesto() ? this.t().tuPuesto : '';
  }
}
