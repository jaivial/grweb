/**
 * porra/porra.ts — /porra (Figma 211:141707 «Hacer porra», 211:143732 estados y 211:163291 «En vivo»): dos pestañas
 * por query param (`?vista=en-vivo`). «Hacer porra»: jornada, buscador global y un acordeón por sexo + categoría de
 * peso con su buscador y sus atletas; al tocar uno, chips de monedas + stepper y «Confirmar porra · N». «En vivo»:
 * el ranking de atletas por monedas apostadas (sin agrupar por categoría), con refresco en vivo y reordenación FLIP.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrIcon, GrSkeleton } from '@grcup/ui';
import { map } from 'rxjs';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { Juegos, JuegosEnVivo, JuegosEstado, PorraStore, type Jornada, type Mercado, type Sexo, mensajeError, nombreJornadaLoc, recargaAgrupada } from '../../core/juegos';
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { CoinBalance } from './componentes';
import { monedas } from './formato';
import { RankingPorra, kg, mercadosCategoria, misPorras, rankingAtletas, sexoTxt } from './ranking';

type Vista = 'hacer' | 'en-vivo';

/** Sin tildes ni mayúsculas, para los buscadores. */
const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** El peso de la categoría como número para ordenar («-63» → 63, «84+» → 84.5). */
const peso = (c: string | undefined): number => (c ? parseFloat(c.replace('-', '')) + (c.endsWith('+') ? 0.5 : 0) : 999);
/** «Sáb 19» a partir de la fecha ISO del día. */
export function diaCorto(dia: string, locale = 'es-ES'): string {
  if (!dia) return '';
  const d = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(dia + 'T12:00:00Z')).replace('.', '');
  return d.charAt(0).toUpperCase() + d.slice(1) + ' ' + Number(dia.slice(8, 10));
}

const TOP = 10;

const T = {
  es: {
    porra: 'Porra',
    migas: 'Migas',
    inicio: 'Inicio',
    juegos: 'Juegos',
    enVivo: 'En vivo',
    hacer: 'Hacer porra',
    masculino: 'Masculino',
    femenino: 'Femenino',
    errorCarga: 'No hemos podido cargar la porra',
    jornada: 'Jornada',
    busca: 'Busca un atleta por nombre',
    categorias: 'Categorías',
    nCategorias: (n: number) => `${n} ${n === 1 ? 'categoría' : 'categorías'}`,
    nAtletas: (n: number) => `${n} atletas`,
    resuelta: 'resuelta',
    cerrada: 'cerrada',
    bote: 'bote',
    catCerrada: 'Categoría cerrada: ya no se puede hacer porra',
    buscarEn: 'Buscar en',
    cambiar: 'Cambiar',
    cuantas: '¿Cuántas monedas?',
    importe: 'Importe',
    menos: 'Menos monedas',
    mas: 'Más monedas',
    monedas: ' monedas',
    sinSaldo: (n: string) => `No tienes monedas suficientes: tu saldo es ${n}. Gana más escribiendo en el chat del directo.`,
    saldoTras: (n: string) => `Saldo tras la porra: ${n} monedas · puedes sumar más mientras la categoría siga abierta.`,
    enviando: 'Enviando…',
    confirmar: (n: string) => 'Confirmar porra · ' + n,
    tuPorra: 'Tu porra',
    elegir: 'Elegir',
    ninguno: (q: string) => `Ningún atleta coincide con «${q}».`,
    verLos: (n: number) => `Ver los ${n} atletas`,
    sinResultados: (q: string) => `Sin resultados para «${q}»`,
    revisa: 'Revisa el nombre o busca por apellido.',
    borrar: 'Borrar búsqueda',
    pronto: 'Las categorías de esta jornada aparecerán aquí cuando se publiquen.',
    sexo: 'Sexo',
    masApostados: 'Más apostados · todas las categorías',
    porrasEnJuego: (p: string, b: string) => [p + ' porras · ', b + ' monedas en juego'] as const,
    sinAtletas: (f: boolean) => `Todavía nadie ha apostado por ${f ? 'atletas femeninas' : 'atletas masculinos'} en esta jornada.`,
    aviso: 'Monedas de juego: nunca se compran con dinero ni se canjean por dinero.',
    todo: 'Todo',
    hecha: (n: string, a: string) => `Porra hecha: ${n} monedas a ${a}.`,
    seoTitulo: 'Porra · GRS Cup',
    seoDesc: 'Haz tu porra con monedas de juego en la GRS Cup: elige atleta en cada categoría y sigue en vivo a los más apostados.',
  },
  en: {
    porra: 'Pool',
    migas: 'Breadcrumbs',
    inicio: 'Home',
    juegos: 'Games',
    enVivo: 'Live',
    hacer: 'Make a pick',
    masculino: 'Men',
    femenino: 'Women',
    errorCarga: "We couldn't load the betting pool",
    jornada: 'Day',
    busca: 'Search for an athlete by name',
    categorias: 'Categories',
    nCategorias: (n: number) => `${n} ${n === 1 ? 'category' : 'categories'}`,
    nAtletas: (n: number) => `${n} athletes`,
    resuelta: 'settled',
    cerrada: 'closed',
    bote: 'pot',
    catCerrada: 'Category closed: picks can no longer be made',
    buscarEn: 'Search in',
    cambiar: 'Change',
    cuantas: 'How many coins?',
    importe: 'Amount',
    menos: 'Fewer coins',
    mas: 'More coins',
    monedas: ' coins',
    sinSaldo: (n: string) => `You don't have enough coins: your balance is ${n}. Earn more by writing in the live stream chat.`,
    saldoTras: (n: string) => `Balance after your pick: ${n} coins · you can add more while the category stays open.`,
    enviando: 'Sending…',
    confirmar: (n: string) => 'Confirm pick · ' + n,
    tuPorra: 'Your pick',
    elegir: 'Choose',
    ninguno: (q: string) => `No athlete matches “${q}”.`,
    verLos: (n: number) => `See all ${n} athletes`,
    sinResultados: (q: string) => `No results for “${q}”`,
    revisa: 'Check the name or search by surname.',
    borrar: 'Clear search',
    pronto: "This day's categories will appear here once they are published.",
    sexo: 'Sex',
    masApostados: 'Most backed · all categories',
    porrasEnJuego: (p: string, b: string) => [p + ' picks · ', b + ' coins at stake'] as const,
    sinAtletas: (f: boolean) => `Nobody has backed any ${f ? 'women' : 'men'} athletes on this day yet.`,
    aviso: 'Game coins: they are never bought with money or exchanged for money.',
    todo: 'All',
    hecha: (n: string, a: string) => `Pick made: ${n} coins on ${a}.`,
    seoTitulo: 'Betting pool · GRS Cup',
    seoDesc: 'Make your pick with game coins at the GRS Cup: choose an athlete in each category and follow the most backed ones live.',
  },
};

@Component({
  selector: 'gr-porra-page',
  imports: [LocPipe, Page, GrAlert, GrIcon, GrSkeleton, CoinBalance, RankingPorra],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().porra" [juego]="true">
      <div class="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <!-- cabecera: migas, título y saldo -->
        <div class="flex flex-col gap-2">
          <nav class="text-body-xs text-text-tertiary" [attr.aria-label]="t().migas">
            <a [href]="'/' | loc" class="hover:text-text-primary">{{ t().inicio }}</a> · {{ t().juegos }} · {{ t().porra }}@if (vista() === 'en-vivo') { · {{ t().enVivo }} }
          </nav>
          <div class="flex items-center justify-between gap-3">
            <h1 class="bg-[linear-gradient(180deg,#ff5a6e,#c8102e)] bg-clip-text pr-1.5 font-display text-[2rem] leading-none text-transparent uppercase italic">{{ t().porra }}</h1>
            <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" [etiquetaMovil]="false" />
          </div>
        </div>

        <!-- pestañas Hacer porra / En vivo -->
        <div class="flex border-b border-line-subtle" role="tablist" [attr.aria-label]="t().porra">
          @for (p of pestanas(); track p.v) {
            <button type="button" role="tab" class="-mb-px h-11 flex-1 border-b-2 text-label-s transition-colors motion-reduce:transition-none"
              [class]="vista() === p.v ? 'border-accent text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'"
              [attr.aria-selected]="vista() === p.v" (click)="irA(p.v)">{{ p.l }}</button>
          }
        </div>

        @if (store.cargando()) {
          <div class="flex flex-col gap-3" aria-busy="true">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16 rounded-md" /> }</div>
        } @else if (store.error(); as e) {
          <gr-alert tone="warning" [title]="t().errorCarga">{{ e }}</gr-alert>
        } @else if (vista() === 'hacer') {
          <!-- jornada -->
          @if (jornadas().length) {
            <div class="flex flex-col gap-2">
              <p class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().jornada }}</p>
              <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t().jornada">
                @for (j of jornadas(); track j.id) {
                  <button type="button" class="flex min-h-11 flex-col items-start justify-center rounded-md border px-3 py-1.5 text-left transition-colors"
                    [class]="j.id === jornadaActiva()?.id ? 'border-accent bg-accent/16' : 'border-line-subtle bg-bg-field hover:border-line-strong'"
                    [attr.aria-pressed]="j.id === jornadaActiva()?.id" (click)="elegirJornada(j.id)">
                    <span class="text-label-s text-text-primary">{{ diaCorto(j.dia, i18n.locale()) || j.nombre }}</span>
                    <span class="text-[11px] leading-[1.3] text-text-tertiary">{{ nombreJornada(j) }}</span>
                  </button>
                }
              </div>
            </div>
          }

          <!-- buscador global -->
          <label class="relative block">
            <span class="sr-only">{{ t().busca }}</span>
            <gr-icon name="search" [size]="18" class="pointer-events-none absolute top-3.5 left-3.5 text-text-tertiary" />
            <input type="search" class="h-12 w-full rounded-md border border-line-subtle bg-bg-field pr-4 pl-11 text-body-s text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent-text"
              [placeholder]="t().busca" autocomplete="off" [value]="q()" (input)="q.set($any($event.target).value)" />
          </label>

          <div class="flex flex-col">
            <p class="flex items-center justify-between gap-2 pb-2 font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">
              <span>{{ t().categorias }}@if (jornadaActiva(); as j) { · {{ diaCorto(j.dia, i18n.locale()) }} }</span><span>{{ t().nCategorias(categorias().length) }}</span>
            </p>
            @for (m of categoriasVisibles(); track m.id) {
              @let cerrada = cerradaM(m);
              @let abierta = !cerrada && (abiertas().has(m.id) || !!q());
              <section class="border-b border-line-subtle">
                <button type="button" class="flex min-h-16 w-full items-center gap-3 py-3 text-left" [attr.aria-expanded]="cerrada ? null : abierta" [attr.aria-disabled]="cerrada || null"
                  [attr.aria-controls]="'cat-' + m.id" (click)="alternar(m)">
                  <span class="min-w-0 flex-1">
                    <span class="block text-label-m" [class]="cerrada ? 'text-text-tertiary' : 'text-text-primary'">{{ etiqueta(m) }}</span>
                    <span class="block text-body-xs text-text-tertiary">{{ t().nAtletas(m.opciones.length) }} · {{ cerrada ? (m.estado === 'liquidado' ? t().resuelta : t().cerrada) : t().bote + ' ' + monedas(m.bote) }}</span>
                  </span>
                  @if (miImporteMercado(m.id); as t) { <span class="inline-flex shrink-0 items-center gap-1 font-mono text-[12px] text-warning"><span class="size-2 rounded-full bg-warning" aria-hidden="true"></span>{{ monedas(t) }}</span> }
                  @if (cerrada) { <gr-icon name="lock" [size]="16" class="shrink-0 text-text-tertiary" /><span class="sr-only">{{ t().catCerrada }}</span> }
                  @else { <gr-icon name="chevron-down" [size]="18" class="shrink-0 text-text-secondary transition-transform duration-[240ms] motion-reduce:transition-none" [class.rotate-180]="abierta" /> }
                </button>
                @if (abierta) {
                  <div [id]="'cat-' + m.id" class="flex flex-col gap-1 pb-4 motion-safe:animate-[gr-desplegar_240ms_ease-out]">
                    @if (!q()) {
                      <label class="relative mb-1 block">
                        <span class="sr-only">{{ t().buscarEn }} {{ etiqueta(m) }}</span>
                        <gr-icon name="search" [size]="16" class="pointer-events-none absolute top-3 left-3 text-text-tertiary" />
                        <input type="search" class="h-10 w-full rounded-md border border-line-subtle bg-bg-field pr-3 pl-9 text-body-s text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent-text"
                          [placeholder]="t().buscarEn + ' ' + kg(m.categoria)" autocomplete="off" [value]="qCat()[m.id] ?? ''" (input)="buscarEn(m.id, $any($event.target).value)" />
                      </label>
                    }
                    @let lista = atletas(m);
                    @for (o of lista; track o.atletaId) {
                      @if (sel()?.mercadoId === m.id && sel()?.atletaId === o.atletaId) {
                        <div class="my-1 flex flex-col gap-3 rounded-md border border-line-strong bg-bg-raised p-3.5 motion-safe:animate-[gr-desplegar_200ms_ease-out]">
                          <p class="flex items-center gap-2.5">
                            <gr-icon name="circle-check" [size]="18" class="shrink-0 text-accent-text" />
                            <span class="min-w-0 flex-1 truncate text-label-m text-text-primary">{{ o.nombre }}</span>
                            <button type="button" class="-my-2 min-h-11 px-1 text-label-s text-text-secondary hover:text-text-primary" (click)="sel.set(null)">{{ t().cambiar }}</button>
                          </p>
                          @if (exito(); as ok) {
                            <p class="flex items-center gap-2 rounded-sm bg-success/10 px-3 py-2.5 text-body-s text-success" role="status"><gr-icon name="circle-check" [size]="16" class="shrink-0" />{{ ok }}</p>
                          } @else {
                            <p class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().cuantas }}</p>
                            <div class="grid grid-cols-5 gap-1.5" role="group" [attr.aria-label]="t().importe">
                              @for (c of chips(); track c.l) {
                                <button type="button" class="h-11 rounded-pill border font-mono text-[12px] transition-colors"
                                  [class]="importe() === c.v ? 'border-accent bg-accent text-white' : 'border-line-subtle bg-bg-field text-text-secondary hover:text-text-primary'"
                                  [attr.aria-pressed]="importe() === c.v" (click)="importe.set(c.v)">{{ c.l }}</button>
                              }
                            </div>
                            <div class="flex items-center justify-between gap-3">
                              <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong text-text-primary disabled:opacity-40" [attr.aria-label]="t().menos" [disabled]="importe() <= minimo()" (click)="paso(-1)"><gr-icon name="minus" [size]="18" /></button>
                              <p class="flex items-center gap-2 font-display text-[1.75rem] leading-none text-text-primary tabular-nums italic" aria-live="polite"><span class="size-4 rounded-full bg-warning" aria-hidden="true"></span>{{ monedas(importe()) }}<span class="sr-only">{{ t().monedas }}</span></p>
                              <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong text-text-primary disabled:opacity-40" [attr.aria-label]="t().mas" [disabled]="importe() >= maximo()" (click)="paso(1)"><gr-icon name="plus" [size]="18" /></button>
                            </div>
                            @if (sinSaldo()) {
                              <p class="text-body-xs text-accent-text" role="alert">{{ t().sinSaldo(monedas(saldo())) }}</p>
                            } @else {
                              <p class="text-body-xs text-text-tertiary">{{ t().saldoTras(monedas(saldo() - importe())) }}</p>
                            }
                            @if (errorPorra(); as e) { <p class="text-body-xs text-accent-text" role="alert">{{ e }}</p> }
                            <button type="button" class="flex h-12 items-center justify-center rounded-md bg-accent-grain text-label-m text-white shadow-glow-deep transition-opacity disabled:bg-bg-field disabled:text-text-muted disabled:shadow-none"
                              [disabled]="sinSaldo() || enviando() || importe() < minimo()" (click)="confirmar(m, o.atletaId, o.nombre)">{{ enviando() ? t().enviando : t().confirmar(monedas(importe())) }}</button>
                          }
                        </div>
                      } @else {
                        <button type="button" class="flex min-h-12 items-center gap-3 rounded-sm bg-[#89797914] px-2 py-1.5 text-left pointer-fine:hover:bg-[#8979793d]" (click)="elegir(m, o.atletaId)">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-label-s text-text-primary">{{ o.nombre }}</span>
                            @if (q()) { <span class="block text-[11px] leading-[1.3] text-text-tertiary">{{ etiqueta(m) }}</span> }
                          </span>
                          @if (mias().get(m.id + ':' + o.atletaId); as mio) { <span class="shrink-0 rounded-pill border border-warning/50 px-2 py-0.5 text-[11px] leading-none text-warning">{{ t().tuPorra }} {{ monedas(mio) }}</span> }
                          <span class="inline-flex shrink-0 items-center gap-0.5 text-label-s text-accent-text">{{ t().elegir }} <gr-icon name="chevron-right" [size]="16" /></span>
                        </button>
                      }
                    } @empty {
                      <p class="py-3 text-body-s text-text-tertiary">{{ t().ninguno(qCat()[m.id] ?? '') }}</p>
                    }
                  </div>
                }
              </section>
            } @empty {
              @if (q()) {
                <div class="flex flex-col items-center gap-2 py-10 text-center">
                  <gr-icon name="search" [size]="24" class="text-text-tertiary" />
                  <p class="text-label-m text-text-primary">{{ t().sinResultados(q()) }}</p>
                  <p class="text-body-xs text-text-tertiary">{{ t().revisa }}</p>
                  <button type="button" class="min-h-11 px-3 text-label-s text-accent-text" (click)="q.set('')">{{ t().borrar }}</button>
                </div>
              } @else {
                <p class="py-10 text-center text-body-s text-text-tertiary">{{ t().pronto }}</p>
              }
            }
          </div>
        } @else {
          <!-- En vivo -->
          <div class="flex rounded-pill border border-line-subtle bg-bg-surface p-1" role="group" [attr.aria-label]="t().sexo">
            @for (s of sexosVivo(); track s.v) {
              <button type="button" class="h-10 flex-1 rounded-pill border text-label-s transition-colors"
                [class]="sexo() === s.v ? 'border-line-strong bg-bg-raised text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'"
                [attr.aria-pressed]="sexo() === s.v" (click)="sexo.set(s.v)">{{ s.l }}</button>
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <p class="flex items-center justify-between gap-2 font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">
              <span>{{ t().masApostados }}</span>@if (jornadaActiva(); as j) { <span>{{ diaCorto(j.dia, i18n.locale()) }}</span> }
            </p>
            <p class="flex items-center gap-1.5 font-mono text-[12px] text-text-secondary">@let pj = t().porrasEnJuego(monedas(resumen().porras), monedas(resumen().bote));{{ pj[0] }}<span class="size-2.5 rounded-full bg-warning" aria-hidden="true"></span>{{ pj[1] }}</p>
          </div>
          @if (ranking().length) {
            <gr-ranking-porra [filas]="verRanking() ? ranking() : ranking().slice(0, top)" aria-live="polite" />
            @if (ranking().length > top && !verRanking()) {
              <button type="button" class="mx-auto -mt-2 min-h-11 px-3 text-label-s text-accent-text" (click)="verRanking.set(true)">{{ t().verLos(ranking().length) }}</button>
            }
          } @else {
            <p class="py-10 text-center text-body-s text-text-tertiary">{{ t().sinAtletas(sexo() === 'F') }}</p>
          }
        }

        <p class="flex items-start gap-2 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="14" class="mt-0.5 shrink-0" />{{ t().aviso }}</p>
      </div>
    </gr-page>
  `,
})
export class PorraPage {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.locale());
  protected readonly kg = kg;
  protected readonly diaCorto = diaCorto;
  protected readonly top = TOP;
  protected readonly store = inject(PorraStore);
  protected readonly estado = inject(JuegosEstado);
  private readonly juegos = inject(Juegos);
  private readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pestanas = computed<{ v: Vista; l: string }[]>(() => [
    { v: 'hacer', l: this.t().hacer },
    { v: 'en-vivo', l: this.t().enVivo },
  ]);
  protected readonly sexosVivo = computed<{ v: Sexo; l: string }[]>(() => [
    { v: 'M', l: this.t().masculino },
    { v: 'F', l: this.t().femenino },
  ]);

  protected readonly vista = toSignal(this.route.queryParamMap.pipe(map((p): Vista => (p.get('vista') === 'en-vivo' ? 'en-vivo' : 'hacer'))), { initialValue: 'hacer' as Vista });
  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly qCat = signal<Record<string, string>>({});
  protected readonly abiertas = signal<Set<string>>(new Set());
  protected readonly sel = signal<{ mercadoId: string; atletaId: string } | null>(null);
  protected readonly importe = signal(500);
  protected readonly enviando = signal(false);
  protected readonly errorPorra = signal<string | null>(null);
  protected readonly exito = signal<string | null>(null);
  protected readonly sexo = signal<Sexo>(this.route.snapshot.queryParamMap.get('sexo') === 'M' ? 'M' : 'F');
  protected readonly verRanking = signal(false);

  /** Chips de jornada en orden cronológico (Sáb 19 · Dom 20); el store las guarda de la más reciente a la más antigua. */
  protected readonly jornadas = computed(() => [...this.estado.jornadas()].sort((a, b) => a.dia.localeCompare(b.dia)));
  protected readonly jornadaActiva = computed(() => this.store.jornada() ?? this.estado.jornada());
  protected readonly saldo = computed(() => this.estado.saldoPorra());
  protected readonly minimo = computed(() => this.estado.porraMin());
  protected readonly maximo = computed(() => Math.max(this.minimo(), this.estado.porraMax()));
  protected readonly sinSaldo = computed(() => this.fan.conSesion() && this.importe() > this.saldo());
  /** Chips de importe (Figma «¿Cuántas monedas?»): 100 · 250 · 500 · 1.000 · Todo (el saldo, hasta el máximo). */
  protected readonly chips = computed(() => [
    ...[100, 250, 500, 1000].map((v) => ({ v, l: this.monedas(v) })),
    { v: Math.max(this.minimo(), Math.min(this.saldo(), this.maximo())), l: this.t().todo },
  ]);

  private readonly ahora = signal(Date.now());
  /** La jornada está cerrada o ya pasó la hora de cierre: no se puede hacer porra en ninguna categoría. */
  private readonly soloLectura = computed(() => {
    const j = this.jornadaActiva();
    return j?.estado === 'cerrada' || (!!j?.cierreAt && Date.parse(j.cierreAt) <= this.ahora());
  });

  /** Los mercados por categoría, de femenino a masculino y de menos a más peso. */
  protected readonly categorias = computed(() =>
    mercadosCategoria(this.store.mercados()).sort((a, b) => (a.sexo === b.sexo ? peso(a.categoria) - peso(b.categoria) : a.sexo === 'F' ? -1 : 1)),
  );
  /** Con búsqueda global, solo las categorías con algún atleta que coincide. */
  protected readonly categoriasVisibles = computed(() => {
    const q = norm(this.q());
    return q ? this.categorias().filter((m) => m.opciones.some((o) => norm(o.nombre).includes(q))) : this.categorias();
  });
  protected readonly mias = computed(() => misPorras(this.store.apuestas()));
  protected readonly ranking = computed(() => rankingAtletas(this.store.mercados(), this.sexo(), this.mias()));
  protected readonly resumen = computed(() => {
    const ms = mercadosCategoria(this.store.mercados()).filter((m) => m.sexo === this.sexo());
    return { porras: ms.reduce((s, m) => s + m.apuestas, 0), bote: ms.reduce((s, m) => s + m.bote, 0) };
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));

    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/porra', this.t().seoTitulo, this.t().seoDesc);
    });

    // al cambiar de atleta se limpian los mensajes del anterior
    effect(() => {
      this.sel();
      untracked(() => {
        this.errorPorra.set(null);
        this.exito.set(null);
      });
    });

    if (browser) {
      this.vivo.conectar();
      // los cambios en vivo se aplican en el cliente; solo se recarga (como mucho 1 vez cada 5 s) si llega un
      // mercado desconocido o liquidado
      let visto = 0;
      let recarga: ReturnType<typeof setTimeout> | null = null;
      effect(() => {
        const cambios = [...this.vivo.mercados().values()].filter((c) => c.seq > visto);
        untracked(() => {
          let falta = false;
          for (const c of cambios.sort((a, b) => a.seq - b.seq)) {
            visto = c.seq;
            if (!this.store.aplicarCambio(c)) falta = true;
          }
          if (falta && !recarga) {
            recarga = setTimeout(() => {
              recarga = null;
              void this.store.recargarMercados();
            }, 5000);
          }
        });
      });
      // los botes cambian con cada porra: un refresco ligero cada 20 s
      // altas, cambios y bajas de atletas (fantasy.atletas) cambian las opciones: recarga agrupada al momento
      const porAtletas = recargaAgrupada(() => void this.store.recargarMercados());
      let version = this.vivo.version();
      effect(() => {
        const v = this.vivo.version();
        if (v !== version) {
          version = v;
          untracked(() => porAtletas.pedir());
        }
      });
      const t = setInterval(() => {
        if (!document.hidden) void this.store.recargarMercados();
      }, 20000);
      const reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
      void this.fan.cargar().then(() => {
        void this.estado.cargarCartera();
        void this.store.cargarApuestas();
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(t);
        clearInterval(reloj);
        if (recarga) clearTimeout(recarga);
        porAtletas.cancelar();
        this.vivo.desconectar();
      });
    }
  }

  protected irA(v: Vista): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { vista: v === 'en-vivo' ? 'en-vivo' : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected nombreJornada(j: Jornada): string {
    return nombreJornadaLoc(j, this.i18n.locale());
  }

  protected etiqueta(m: Mercado): string {
    return sexoTxt(m.sexo, this.i18n.lang()) + ' · ' + kg(m.categoria);
  }

  protected cerradaM(m: Mercado): boolean {
    return m.estado !== 'abierto' || this.soloLectura();
  }

  /** Lo que llevo apostado en un mercado (0 = nada). */
  protected miImporteMercado(id: string): number {
    let t = 0;
    for (const [k, v] of this.mias()) if (k.startsWith(id + ':')) t += v;
    return t;
  }

  /** Los atletas del acordeón filtrados por su buscador (o por el global), de la A a la Z. */
  protected atletas(m: Mercado) {
    const q = norm(this.q() || this.qCat()[m.id] || '');
    return m.opciones.filter((o) => !q || norm(o.nombre).includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  protected alternar(m: Mercado): void {
    if (this.cerradaM(m) || this.q()) return;
    const s = new Set(this.abiertas());
    if (s.has(m.id)) s.delete(m.id);
    else s.add(m.id);
    this.abiertas.set(s);
  }

  protected buscarEn(id: string, v: string): void {
    this.qCat.set({ ...this.qCat(), [id]: v });
  }

  protected elegir(m: Mercado, atletaId: string): void {
    if (!this.fan.conSesion()) {
      this.fan.abrirAcceso('porra');
      return;
    }
    this.importe.set(Math.min(Math.max(this.minimo(), 500), this.maximo()));
    this.sel.set({ mercadoId: m.id, atletaId });
    void this.estado.cargarCartera();
  }

  protected paso(dir: 1 | -1): void {
    const v = this.importe() + dir * 100;
    this.importe.set(Math.min(this.maximo(), Math.max(this.minimo(), v)));
  }

  protected elegirJornada(id: string): void {
    this.estado.elegir(id);
    this.sel.set(null);
    void this.estado.cargarCartera();
    void this.store.cargar();
    void this.store.cargarApuestas();
  }

  protected async confirmar(m: Mercado, atletaId: string, nombre: string): Promise<void> {
    this.enviando.set(true);
    this.errorPorra.set(null);
    try {
      const importe = this.importe();
      await this.juegos.porraApostar(m.id, atletaId, importe, this.estado.jornadaActual());
      this.exito.set(this.t().hecha(this.monedas(importe), nombre));
      await Promise.all([this.estado.cargarCartera(), this.store.recargarMercados(), this.store.cargarApuestas()]);
    } catch (err) {
      this.errorPorra.set(mensajeError(err, this.i18n.lang()));
      if (codigoError(err).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    } finally {
      this.enviando.set(false);
    }
  }
}
