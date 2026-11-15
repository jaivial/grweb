/**
 * fantasy/palmares.ts — /fantasy/palmares (Figma «81 · /fantasy/salas» · Palmarés diario): los ganadores del
 * fantasy de cada día, sala por sala, con el detalle de la alineación ganadora (nota final de cada atleta y media).
 */
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';
import { Juegos, nota1, nota2, type DiaPalmares, type FilaPalmares, type SalaPalmares } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { GrSelector, JuegosNav, MEDALLA, iniciales, type OpcionSelector } from '../porra/componentes';
import { AlineacionLista, GrAviso, colorNota } from './componentes';

/** Una sala jugada con su ganador (el primero si comparten puesto) y su puesto entre las salas del día. */
interface FilaDia {
  sala: SalaPalmares;
  ganador: FilaPalmares;
  puesto: number;
}

const T = {
  es: {
    crumb: 'Palmarés',
    section: 'Juegos',
    subtitle: 'Ganadores del fantasy de cada día, sala por sala, con su alineación y su partida.',
    cargando: 'Cargando el palmarés',
    errorCarga: 'No se pudo cargar el palmarés',
    errorCargaTxt: 'Vuelve a intentarlo en unos segundos.',
    reintentar: 'Reintentar',
    sePublica: 'El palmarés de cada día se publica al cerrar la última sesión',
    mientras: 'Mientras tanto sigue la clasificación de tu sala.',
    irSalas: 'Ir a mis salas',
    volver: 'Volver al palmarés',
    dia: 'Día',
    mejorAria: 'Mejor nota media del día',
    mejor: 'Mejor nota media',
    jugadores: (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`,
    diaCerrado: 'Día cerrado',
    nadie: 'Nadie jugó el fantasy este día',
    nadieTxt: 'No hubo salas con 2 o más jugadores.',
    crearSala: 'Crear sala',
    ganadoresPor: (n: number) => `Ganadores por sala · ${n} ${n === 1 ? 'sala jugada' : 'salas jugadas'}`,
    nJugadores: (n: number) => `${n} jugadores`,
    empate: (a: string) => 'ganadores ' + a + ' (empate)',
    ganador: (a: string) => 'ganador @' + a,
    notaMedia: 'nota media',
    verDetalle: 'Ver detalle',
    cancelada: (n: string, j: number) => `${n} · cancelada (${j} ${j === 1 ? 'jugador' : 'jugadores'}, mínimo 2) · no puntúa`,
    empates: 'Empates: gana el mayor valor de alineación, luego el saldo y por último quien llegó antes a la sala.',
    detalleAria: 'Detalle del ganador',
    ganadorDe: 'Ganador',
    mediaAlineacion: 'Media de la alineación',
    alineacion: (n: number) => `Alineación (${n} ${n === 1 ? 'atleta' : 'atletas'} · nota final)`,
    partida: 'Partida',
    valorAlineacion: 'Valor alineación',
    saldoFinal: 'Saldo final',
    jugadoresL: 'Jugadores',
    y: ' y ',
    cero: '0,0',
    seoTitulo: 'Palmarés de GRS Fantasy · GR Strength Cup',
    seoDesc: 'Los ganadores de GRS Fantasy de cada día, sala por sala, con su alineación y sus notas.',
  },
  en: {
    crumb: 'Honours',
    section: 'Games',
    subtitle: "Each day's fantasy winners, league by league, with their line-up and their game.",
    cargando: 'Loading the honours',
    errorCarga: "The honours couldn't be loaded",
    errorCargaTxt: 'Try again in a few seconds.',
    reintentar: 'Try again',
    sePublica: "Each day's honours are published when the last session closes",
    mientras: "In the meantime, follow your league's leaderboard.",
    irSalas: 'Go to my leagues',
    volver: 'Back to the honours',
    dia: 'Day',
    mejorAria: 'Best average score of the day',
    mejor: 'Best average score',
    jugadores: (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`,
    diaCerrado: 'Day closed',
    nadie: 'Nobody played fantasy on this day',
    nadieTxt: 'There were no leagues with 2 or more players.',
    crearSala: 'Create league',
    ganadoresPor: (n: number) => `Winners by league · ${n} ${n === 1 ? 'league played' : 'leagues played'}`,
    nJugadores: (n: number) => `${n} players`,
    empate: (a: string) => 'winners ' + a + ' (tie)',
    ganador: (a: string) => 'winner @' + a,
    notaMedia: 'average score',
    verDetalle: 'See details',
    cancelada: (n: string, j: number) => `${n} · cancelled (${j} ${j === 1 ? 'player' : 'players'}, minimum 2) · doesn't score`,
    empates: 'Ties: the highest line-up value wins, then the balance and finally whoever joined the league first.',
    detalleAria: "Winner's details",
    ganadorDe: 'Winner',
    mediaAlineacion: 'Line-up average',
    alineacion: (n: number) => `Line-up (${n} ${n === 1 ? 'athlete' : 'athletes'} · final score)`,
    partida: 'Game',
    valorAlineacion: 'Line-up value',
    saldoFinal: 'Final balance',
    jugadoresL: 'Players',
    y: ' and ',
    cero: '0.0',
    seoTitulo: 'GRS Fantasy honours · GR Strength Cup',
    seoDesc: "Each day's GRS Fantasy winners, league by league, with their line-up and their scores.",
  },
};

@Component({
  selector: 'gr-palmares-page',
  imports: [LocPipe, Page, GrButton, GrIcon, AlineacionLista, GrAviso, GrSelector, JuegosNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Fantasy" accent="" [suffix]="'· ' + t().crumb" [crumb]="t().crumb" [section]="t().section"
      [subtitle]="t().subtitle">
      <div class="flex flex-col gap-4 md:gap-6">
        <gr-juegos-nav juego="fantasy" activa="palmares" />

        @if (cargando()) {
          <div class="flex flex-col gap-3" aria-busy="true" [attr.aria-label]="t().cargando">
            @for (i of [1, 2]; track i) {
              <div class="flex items-center gap-4 rounded-lg border border-line-subtle bg-bg-card p-4 motion-safe:animate-pulse">
                <span class="flex flex-1 flex-col gap-2"><span class="h-4 w-60 max-w-full rounded-xs bg-bg-raised"></span><span class="h-3 w-36 rounded-xs bg-bg-raised"></span></span>
                <span class="h-6 w-24 rounded-xs bg-bg-raised"></span><span class="h-10 w-28 rounded-xs bg-bg-raised"></span>
              </div>
            }
          </div>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" [titulo]="t().errorCarga">{{ t().errorCargaTxt }}</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">{{ t().reintentar }}</button>
        } @else if (!dias().length) {
          <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-8 text-center">
            <gr-icon name="hourglass" [size]="32" class="text-text-secondary" />
            <p class="text-ui-h5 text-text-primary">{{ t().sePublica }}</p>
            <p class="text-body-s text-text-secondary">{{ t().mientras }}</p>
            <a grButton variant="primary" [href]="'/fantasy/salas' | loc">{{ t().irSalas }}</a>
          </div>
        } @else {
          <!-- Detalle a pantalla completa en móvil (Figma «Detalle ganador · Mobile») -->
          @if (detalle(); as g) {
            <button type="button" class="inline-flex min-h-11 items-center gap-2 self-start text-label-s text-text-secondary hover:text-text-primary lg:hidden" (click)="salaId.set('')"><gr-icon name="arrow-left" [size]="16" />{{ t().volver }} · {{ dia()?.nombre }}</button>
          }
          <div class="flex-col gap-4 md:gap-6" [class]="detalle() ? 'hidden lg:flex' : 'flex'">
            <gr-selector class="md:hidden" [etiqueta]="t().dia" [opciones]="opcionesDia()" [valor]="dia()?.jornadaId ?? ''" (elegir)="elegirDia($event)" />
            <div class="hidden flex-wrap gap-2 md:flex" role="group" [attr.aria-label]="t().dia">
              @for (o of opcionesDia(); track o.v) {
                <button type="button" class="inline-flex h-[35px] items-center rounded-pill border px-4 text-label-s text-text-primary" [class]="o.v === dia()?.jornadaId ? 'border-accent bg-accent' : 'border-line-subtle bg-bg-surface'" [attr.aria-pressed]="o.v === dia()?.jornadaId" (click)="elegirDia(o.v)">{{ o.l }}</button>
              }
            </div>

            @if (mejor(); as m) {
              <section class="flex flex-col gap-3 rounded-xl border border-[#d4af37] bg-bg-surface p-5 md:flex-row md:items-center md:justify-between md:gap-6 md:p-6" [attr.aria-label]="t().mejorAria">
                <p class="flex min-w-0 items-center gap-4">
                  <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#d4af37] text-display-label text-text-primary">{{ ini(m.ganador.alias) }}</span>
                  <span class="flex min-w-0 flex-col gap-1">
                    <span class="text-meta text-[#d4af37]">{{ t().mejor }} · {{ dia()?.nombre }}</span>
                    <span class="text-ui-h3 text-text-primary">&#64;{{ m.ganador.alias }} · {{ n2(m.ganador.nota) }}</span>
                    <span class="text-body-s text-text-secondary">{{ m.sala.nombre }} · {{ t().jugadores(m.sala.jugadores) }}</span>
                  </span>
                </p>
                <span class="inline-flex h-7 shrink-0 items-center self-start rounded-pill border border-text-muted/45 bg-text-muted/12 px-3 text-label-xs text-text-tertiary md:self-auto">{{ t().diaCerrado }}</span>
              </section>
            }
          </div>

          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <section class="min-w-0 flex-col gap-3 lg:flex lg:flex-1" [class]="detalle() ? 'hidden' : 'flex'" aria-labelledby="palmares-salas">
              @if (!jugadas().length) {
                <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-8 text-center">
                  <gr-icon name="trophy" [size]="32" class="text-text-secondary" />
                  <p id="palmares-salas" class="text-ui-h5 text-text-primary">{{ t().nadie }}</p>
                  <p class="text-body-s text-text-secondary">{{ t().nadieTxt }}</p>
                  <a grButton variant="primary" [href]="'/fantasy/salas' | loc">{{ t().crearSala }}</a>
                </div>
              } @else {
                <h2 id="palmares-salas" class="text-ui-h5 text-text-primary">{{ t().ganadoresPor(jugadas().length) }}</h2>
                <ol class="flex flex-col gap-3">
                  @for (f of jugadas(); track f.sala.salaId) {
                    <li class="flex flex-col gap-3 rounded-lg border px-5 py-4 sm:flex-row sm:items-center sm:gap-4" [class]="f.sala.salaId === salaId() ? 'border-line-accent bg-bg-raised' : 'border-line-subtle bg-bg-card'">
                      <p class="flex min-w-0 flex-1 items-center gap-3">
                        <span class="flex size-8 shrink-0 items-center justify-center rounded-full text-mono-s text-text-primary tabular-nums" [class]="medalla(f.puesto)">{{ f.puesto }}</span>
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(f.ganador.alias) }}</span>
                        <span class="flex min-w-0 flex-col gap-0.5">
                          <span class="truncate text-label-s text-text-primary">{{ f.sala.nombre }}</span>
                          <span class="truncate text-body-s text-text-tertiary">{{ t().nJugadores(f.sala.jugadores) }} · {{ f.sala.ganadores.length > 1 ? t().empate(aliasGanadores(f.sala)) : t().ganador(f.ganador.alias) }}</span>
                        </span>
                      </p>
                      <div class="flex items-center gap-3">
                        <p class="flex flex-1 flex-col gap-0.5 sm:flex-none"><span class="text-ui-h5 tabular-nums" [class]="color(f.ganador.nota)">{{ n2(f.ganador.nota) }}</span><span class="text-meta text-text-tertiary">{{ t().notaMedia }}</span></p>
                        <button type="button" grButton [variant]="f.sala.salaId === salaId() ? 'primary' : 'outline'" [attr.aria-pressed]="f.sala.salaId === salaId()" (click)="salaId.set(f.sala.salaId)">{{ t().verDetalle }}</button>
                      </div>
                    </li>
                  }
                </ol>
              }
              @for (c of canceladas(); track c.salaId) {
                <p class="flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3 text-body-s text-text-tertiary"><gr-icon name="circle-alert" [size]="16" class="shrink-0" />{{ t().cancelada(c.nombre, c.jugadores) }}</p>
              }
              @if (jugadas().length) {
                <p class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-4 py-3 text-body-s text-text-secondary"><gr-icon name="scale" [size]="16" class="shrink-0" />{{ t().empates }}</p>
              }
            </section>

            @if (detalle(); as g) {
              <section class="flex min-w-0 flex-col gap-4 rounded-lg border border-line-subtle bg-bg-surface p-5 lg:w-[520px] lg:shrink-0 lg:p-6" aria-live="polite" [attr.aria-label]="t().detalleAria">
                <p class="flex items-center gap-3">
                  <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#d4af37] text-display-label text-text-primary">{{ ini(g.ganador.alias) }}</span>
                  <span class="flex min-w-0 flex-col gap-0.5"><span class="text-meta text-[#d4af37]">{{ t().ganadorDe }} · {{ dia()?.nombre }}</span><span class="text-ui-h5 text-text-primary">&#64;{{ g.ganador.alias }} · {{ g.sala.nombre }}</span></span>
                </p>
                <p class="flex flex-col gap-1 rounded-md bg-bg-card p-3"><span class="text-meta text-text-tertiary">{{ t().mediaAlineacion }}</span><span class="text-mono-s text-text-primary tabular-nums">{{ formula(g.ganador) }}</span></p>
                <h3 class="text-label-s text-text-secondary">{{ t().alineacion(g.ganador.alineacion.length) }}</h3>
                <gr-alineacion-lista [atletas]="g.ganador.alineacion" [media]="g.ganador.nota" [final]="true" />
                <h3 class="text-label-s text-text-secondary">{{ t().partida }}</h3>
                <dl class="flex flex-wrap gap-2">
                  <div class="flex flex-col gap-0.5 rounded-md bg-bg-card px-3 py-2"><dt class="text-meta text-text-tertiary">{{ t().valorAlineacion }}</dt><dd class="text-mono-s text-text-primary tabular-nums">{{ monedas(g.ganador.valor) }}</dd></div>
                  <div class="flex flex-col gap-0.5 rounded-md bg-bg-card px-3 py-2"><dt class="text-meta text-text-tertiary">{{ t().saldoFinal }}</dt><dd class="text-mono-s text-text-primary tabular-nums">{{ monedas(g.ganador.saldo) }}</dd></div>
                  <div class="flex flex-col gap-0.5 rounded-md bg-bg-card px-3 py-2"><dt class="text-meta text-text-tertiary">{{ t().jugadoresL }}</dt><dd class="text-mono-s text-text-primary tabular-nums">{{ g.sala.jugadores }}</dd></div>
                </dl>
              </section>
            }
          </div>
        }
      </div>
    </gr-page>
  `,
})
export class PalmaresPage {
  protected readonly n2 = nota2;
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.locale());
  private readonly juegos = inject(Juegos);

  protected readonly dias = signal<DiaPalmares[]>([]);
  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal(false);
  /** El día elegido ('' = el más reciente) y la sala cuyo detalle se ve. */
  protected readonly diaId = signal('');
  protected readonly salaId = signal('');

  protected readonly dia = computed<DiaPalmares | null>(() => this.dias().find((d) => d.jornadaId === this.diaId()) ?? this.dias()[0] ?? null);
  protected readonly opcionesDia = computed<OpcionSelector[]>(() => this.dias().map((d) => ({ v: d.jornadaId, l: `${d.nombre.replace(/\s*\(.*\)$/, '')} · ${fecha(d.dia, this.i18n.locale())}` })));
  /** Las salas jugadas del día, de mejor a peor nota del ganador. */
  protected readonly jugadas = computed<FilaDia[]>(() =>
    (this.dia()?.salas ?? [])
      .filter((s) => s.estado === 'finalizada' && s.ganadores.length)
      .map((s) => ({ sala: s, ganador: s.ganadores[0] }))
      .sort((a, b) => b.ganador.nota - a.ganador.nota)
      .map((f, i) => ({ ...f, puesto: i + 1 })),
  );
  protected readonly canceladas = computed(() => (this.dia()?.salas ?? []).filter((s) => s.estado === 'cancelada'));
  protected readonly mejor = computed(() => this.jugadas()[0] ?? null);
  protected readonly detalle = computed(() => this.jugadas().find((f) => f.sala.salaId === this.salaId()) ?? null);

  constructor() {
    inject(Seo).set({ title: this.t().seoTitulo, description: this.t().seoDesc, path: '/fantasy/palmares' });
    void inject(PendingTasks).run(() => this.cargar());
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.dias.set((await this.juegos.palmares()).dias ?? []);
      this.errorCarga.set(false);
    } catch {
      this.errorCarga.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  protected elegirDia(id: string): void {
    this.diaId.set(id);
    this.salaId.set('');
  }
  protected ini(alias: string): string {
    return iniciales(alias);
  }
  protected color(nota: number): string {
    return colorNota(nota);
  }
  protected medalla(puesto: number): string {
    return puesto >= 1 && puesto <= 3 ? MEDALLA[puesto as 1 | 2 | 3].fondo.replace(/\/\d+$/, '') : 'bg-bg-raised';
  }
  protected aliasGanadores(s: SalaPalmares): string {
    return s.ganadores.map((g) => '@' + g.alias).join(this.t().y);
  }
  /** «(9,8 + 8,6 + 8,1 + 7,4 + 6,9) ÷ 5 = 8,16»: la media final cuenta los huecos como 0,0. */
  protected formula(g: FilaPalmares): string {
    const notas = g.alineacion.map((a) => nota1(a.nota.valor));
    while (notas.length < 5) notas.push(this.t().cero);
    return `(${notas.join(' + ')}) ÷ 5 = ${nota2(g.nota)}`;
  }
}

/** «vie 12 jun». */
function fecha(dia: string, locale = 'es-ES'): string {
  const d = new Date(dia);
  return Number.isNaN(d.getTime()) ? dia : new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');
}
