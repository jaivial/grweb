/**
 * porra/porra.ts — /porra (Figma 211:141707 «Hacer porra», 211:143732 estados y 211:163291 «En vivo»): dos pestañas
 * por query param (`?vista=en-vivo`). Sexo → nivel AEP-2 / AEP-3 → mercado (ganador de categoría de peso, mejor IPF GL,
 * sentadilla, banca, peso muerto) → categoría de peso, todo en la URL (`?sexo&grupo&prueba&peso`). El nivel decide la
 * jornada por debajo: sus mercados, su cartera y a ella van las apuestas. «Hacer porra»: los atletas del mercado con su
 * cuota en vivo, perfil rápido y, al elegir uno, importe con estimación de retorno y «Confirmar porra». «En vivo»: los
 * tres más apostados de cada mercado, con «Ver más».
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrDigitRoll, GrIcon, GrSkeleton } from '@grcup/ui';
import { map } from 'rxjs';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { I18n, LocPipe } from '../../core/i18n';
import { Juegos, JuegosEnVivo, JuegosEstado, PorraStore, cuota, mensajeError, seguirMercadosEnVivo, type Mercado, type OpcionMercado } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { CoinBalance } from './componentes';
import { ComoFunciona } from './como-funciona';
import { monedas, norm } from './formato';
import { MercadoResumen, etiquetaDeMercado } from './mercado-resumen';
import { PRUEBA_TXT, PorraNavegacion, filtrosPorra, mercadosDe, saldoNivelTxt } from './navegacion';
import { PerfilAtleta } from './perfil-atleta';
import { misPorras } from './ranking';

type Vista = 'hacer' | 'en-vivo';

const T = {
  es: {
    porra: 'Porra',
    migas: 'Migas',
    inicio: 'Inicio',
    juegos: 'Juegos',
    enVivo: 'En vivo',
    hacer: 'Hacer porra',
    hola: (n: string) => `Hola, ${n}`,
    errorCarga: 'No hemos podido cargar la porra',
    busca: 'Busca un atleta por nombre',
    nAtletas: (n: number) => `${n} atletas`,
    resuelta: 'resuelta',
    bote: 'bote',
    catCerrada: 'Mercado cerrado: ya no se puede hacer porra',
    cambiar: 'Cambiar',
    cuantas: '¿Cuántas monedas?',
    importe: 'Importe',
    menos: 'Menos monedas',
    mas: 'Más monedas',
    monedas: ' monedas',
    sinSaldo: (n: string) => `No tienes monedas suficientes: tu saldo es ${n}. Gana más escribiendo en el chat del directo.`,
    saldoTras: (n: string) => `Saldo tras la porra: ${n} monedas · puedes sumar más mientras el mercado siga abierto.`,
    recibiras: (a: string, b: string) => `Apuestas ${a} monedas, recibirías ${b} monedas`,
    estimacion: 'estimación: la cuota cambia hasta el cierre',
    enviando: 'Enviando…',
    confirmar: (n: string) => 'Confirmar porra · ' + n,
    tuPorra: 'Tu porra',
    elegir: 'Elegir',
    verPerfil: (n: string) => 'Ver perfil de ' + n,
    ninguno: (q: string) => `Ningún atleta coincide con «${q}».`,
    sinAtletasMercado: 'Todavía no hay atletas en este mercado.',
    sinMercado: (n: string) => `No hay mercados de ${n} para este grupo.`,
    sinResultados: (q: string) => `Sin resultados para «${q}»`,
    revisa: 'Revisa el nombre o busca por apellido.',
    borrar: 'Borrar búsqueda',
    porrasEnJuego: (p: string, b: string) => [p + ' porras · ', b + ' monedas en juego'] as const,
    aviso: 'Monedas de juego: nunca se compran con dinero ni se canjean por dinero.',
    todo: 'Todo',
    hecha: (n: string, a: string) => `Porra hecha: ${n} monedas a ${a}.`,
    seoTitulo: 'Porra · GRS Cup',
    seoDesc: 'Haz tu porra con monedas de juego en la GRS Cup: elige atleta en cada mercado y sigue en vivo a los más apostados.',
  },
  en: {
    porra: 'Pool',
    migas: 'Breadcrumbs',
    inicio: 'Home',
    juegos: 'Games',
    enVivo: 'Live',
    hacer: 'Make a pick',
    hola: (n: string) => `Hi, ${n}`,
    errorCarga: "We couldn't load the betting pool",
    busca: 'Search for an athlete by name',
    nAtletas: (n: number) => `${n} athletes`,
    resuelta: 'settled',
    bote: 'pot',
    catCerrada: 'Market closed: picks can no longer be made',
    cambiar: 'Change',
    cuantas: 'How many coins?',
    importe: 'Amount',
    menos: 'Fewer coins',
    mas: 'More coins',
    monedas: ' coins',
    sinSaldo: (n: string) => `You don't have enough coins: your balance is ${n}. Earn more by writing in the live stream chat.`,
    saldoTras: (n: string) => `Balance after your pick: ${n} coins · you can add more while the market stays open.`,
    recibiras: (a: string, b: string) => `You bet ${a} coins, you would get ${b} coins`,
    estimacion: 'estimate: the odds change until closing',
    enviando: 'Sending…',
    confirmar: (n: string) => 'Confirm pick · ' + n,
    tuPorra: 'Your pick',
    elegir: 'Choose',
    verPerfil: (n: string) => 'See the profile of ' + n,
    ninguno: (q: string) => `No athlete matches “${q}”.`,
    sinAtletasMercado: 'There are no athletes in this market yet.',
    sinMercado: (n: string) => `There are no ${n} markets for this group.`,
    sinResultados: (q: string) => `No results for “${q}”`,
    revisa: 'Check the name or search by surname.',
    borrar: 'Clear search',
    porrasEnJuego: (p: string, b: string) => [p + ' picks · ', b + ' coins at stake'] as const,
    aviso: 'Game coins: they are never bought with money or exchanged for money.',
    todo: 'All',
    hecha: (n: string, a: string) => `Pick made: ${n} coins on ${a}.`,
    seoTitulo: 'Betting pool · GRS Cup',
    seoDesc: 'Make your pick with game coins at the GRS Cup: choose an athlete in each market and follow the most backed ones live.',
  },
};

@Component({
  selector: 'gr-porra-page',
  imports: [LocPipe, Page, GrAlert, GrIcon, GrSkeleton, GrDigitRoll, CoinBalance, ComoFunciona, PorraNavegacion, PerfilAtleta, MercadoResumen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().porra" [juego]="true">
      <div class="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <!-- cabecera: migas, título, saldo, saludo y cómo funciona -->
        <div class="flex flex-col gap-2">
          <nav class="text-body-xs text-text-tertiary" [attr.aria-label]="t().migas">
            <a [href]="'/' | loc" class="hover:text-text-primary">{{ t().inicio }}</a> · {{ t().juegos }} · {{ t().porra }}@if (vista() === 'en-vivo') { · {{ t().enVivo }} }
          </nav>
          <div class="flex items-center justify-between gap-3">
            <h1 class="bg-[linear-gradient(180deg,#ff5a6e,#c8102e)] bg-clip-text pr-1.5 font-display text-[2rem] leading-none text-transparent uppercase italic">{{ t().porra }}</h1>
            <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" [etiqueta]="etiquetaSaldo()" [etiquetaMovil]="false" />
          </div>
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            @if (fan.cargada() && fan.yo(); as yo) {
              <p class="text-body-s text-text-secondary">{{ t().hola(yo.alias) }}</p>
            } @else {
              <span></span>
            }
            <gr-como-funciona />
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
          <!-- buscador: filtra los atletas del mercado elegido -->
          <label class="relative block">
            <span class="sr-only">{{ t().busca }}</span>
            <gr-icon name="search" [size]="18" class="pointer-events-none absolute top-3.5 left-3.5 text-text-tertiary" />
            <input type="search" class="h-12 w-full rounded-md border border-line-subtle bg-bg-field pr-4 pl-11 text-body-s text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent-text"
              [placeholder]="t().busca" autocomplete="off" [value]="q()" (input)="q.set($any($event.target).value)" />
          </label>

          <gr-porra-navegacion [mercados]="store.mercadosDeNivel(prueba())" [sexo]="sexo()" [grupo]="grupo()" [prueba]="prueba()" [peso]="pesoActivo()" [conPesos]="true" />

          @if (mercadoActivo(); as m) {
            <section class="flex flex-col" [attr.aria-label]="etiquetaMercado(m)">
              <p class="flex items-center justify-between gap-2 pb-2 font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">
                <span>{{ etiquetaMercado(m) }}</span>
                <span>{{ t().nAtletas(m.opciones.length) }} · {{ t().bote }} {{ monedas(m.bote) }}</span>
              </p>
              @if (cerradaM(m)) {
                <p class="pb-2 text-body-xs text-text-tertiary">{{ m.estado === 'liquidado' ? t().resuelta : t().catCerrada }}</p>
              }
              @for (o of atletas(); track o.atletaId) {
                @if (sel()?.mercadoId === m.id && sel()?.atletaId === o.atletaId) {
                  <div class="my-2 flex flex-col gap-3 rounded-md border border-line-strong bg-bg-raised p-3.5 motion-safe:animate-[gr-desplegar_200ms_ease-out]">
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
                            [attr.aria-pressed]="importe() === c.v" (click)="fijarImporte(c.v)">{{ c.l }}</button>
                        }
                      </div>
                      <div class="flex items-center justify-between gap-3">
                        <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong text-text-primary disabled:opacity-40" [attr.aria-label]="t().menos" [disabled]="importe() <= minimo()" (click)="paso(-1)"><gr-icon name="minus" [size]="18" /></button>
                        <label class="flex items-center gap-2">
                          <span class="sr-only">{{ t().importe }}</span>
                          <span class="size-4 rounded-full bg-warning" aria-hidden="true"></span>
                          <input id="importe-porra" type="text" inputmode="numeric" autocomplete="off" class="w-28 bg-transparent text-center font-display text-[1.75rem] leading-none text-text-primary tabular-nums italic outline-none focus-visible:border-accent-text"
                            [value]="importeTxt()" (input)="escribir($event)" />
                          <span class="sr-only">{{ t().monedas }}</span>
                        </label>
                        <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong text-text-primary disabled:opacity-40" [attr.aria-label]="t().mas" [disabled]="importe() >= maximo()" (click)="paso(1)"><gr-icon name="plus" [size]="18" /></button>
                      </div>
                      <p class="text-body-s text-text-primary" aria-live="polite">{{ t().recibiras(monedas(importe()), monedas(retorno())) }}</p>
                      <p class="text-body-xs text-text-tertiary">{{ t().estimacion }}</p>
                      @if (sinSaldo()) {
                        <p class="text-body-xs text-accent-text" role="alert">{{ t().sinSaldo(monedas(saldo())) }}</p>
                      } @else {
                        <p class="text-body-xs text-text-tertiary">{{ t().saldoTras(monedas(saldo() - importe())) }}</p>
                      }
                      @if (errorPorra(); as e) { <p class="text-body-xs text-accent-text" role="alert">{{ e }}</p> }
                      <button type="button" class="flex h-12 items-center justify-center rounded-md bg-accent-grain text-label-m text-white shadow-glow-deep transition-opacity disabled:bg-bg-field disabled:text-text-muted disabled:shadow-none"
                        [disabled]="sinSaldo() || enviando() || importe() < minimo() || cerradaM(m)" (click)="confirmar(m, o.atletaId, o.nombre)">{{ enviando() ? t().enviando : t().confirmar(monedas(importe())) }}</button>
                    }
                  </div>
                } @else {
                  <div class="flex items-center gap-2 border-b border-line-subtle py-1">
                    <button type="button" class="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 text-left pointer-fine:hover:bg-white/5 disabled:cursor-default"
                      [disabled]="cerradaM(m)" (click)="elegir(m, o.atletaId)">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-label-s text-text-primary">{{ o.nombre }}</span>
                        @if (mias().get(m.id + ':' + o.atletaId); as mio) { <span class="mt-0.5 inline-block rounded-pill border border-warning/50 px-2 py-0.5 text-[11px] leading-none text-warning">{{ t().tuPorra }} {{ monedas(mio) }}</span> }
                      </span>
                      @if (!cerradaM(m)) { <span class="inline-flex shrink-0 items-center gap-0.5 text-label-s text-accent-text">{{ t().elegir }} <gr-icon name="chevron-right" [size]="16" /></span> }
                    </button>
                    <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary" [attr.aria-label]="t().verPerfil(o.nombre)" (click)="perfil.set(o)"><gr-icon name="info" [size]="18" /></button>
                    <span class="flex w-[4.75rem] shrink-0 justify-end font-mono text-[1rem] font-bold text-text-primary">
                      <gr-digit-roll [texto]="cuotaTxt(m, o)" [valor]="cuotaNum(m, o)" />
                    </span>
                  </div>
                }
              } @empty {
                @if (q()) {
                  <p class="py-3 text-body-s text-text-tertiary">{{ t().ninguno(q()) }}</p>
                } @else {
                  <p class="py-3 text-body-s text-text-tertiary">{{ t().sinAtletasMercado }}</p>
                }
              }
            </section>
          } @else {
            <p class="py-10 text-center text-body-s text-text-tertiary" role="status">{{ t().sinMercado(nivelTxt()) }}</p>
          }
          <gr-perfil-atleta [opcion]="perfil()" [jornada]="mercadoActivo()?.jornadaId ?? ''" (cerrar)="perfil.set(null)" />
        } @else {
          <!-- En vivo: sexo → nivel → mercado, con los tres más apostados de cada mercado -->
          <gr-porra-navegacion [mercados]="store.mercadosDeNivel(prueba())" [sexo]="sexo()" [grupo]="grupo()" [prueba]="prueba()" [peso]="pesoActivo()" />

          @if (mercadosNivel().length) {
            <p class="flex items-center gap-1.5 font-mono text-[12px] text-text-secondary">@let pj = t().porrasEnJuego(monedas(resumen().porras), monedas(resumen().bote));{{ pj[0] }}<span class="size-2.5 rounded-full bg-warning" aria-hidden="true"></span>{{ pj[1] }}</p>
            @for (m of mercadosNivel(); track m.id) {
              <gr-mercado-resumen [mercado]="m" [etiqueta]="etiquetaMercado(m)" />
            }
          } @else {
            <p class="py-10 text-center text-body-s text-text-tertiary" role="status">{{ t().sinMercado(nivelTxt()) }}</p>
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

  protected readonly vista = toSignal(this.route.queryParamMap.pipe(map((p): Vista => (p.get('vista') === 'en-vivo' ? 'en-vivo' : 'hacer'))), { initialValue: 'hacer' as Vista });
  /** El estado de la navegación vive en la URL: ?sexo, ?grupo, ?prueba y ?peso (categoría). */
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly nav = computed(() => filtrosPorra(this.qp()));
  protected readonly sexo = computed(() => this.nav().sexo);
  protected readonly grupo = computed(() => this.nav().grupo);
  protected readonly prueba = computed(() => this.nav().prueba);
  protected readonly nivelTxt = computed(() => PRUEBA_TXT[this.prueba()]);
  /** «Saldo AEP-2»: el saldo es el de la jornada del nivel elegido. */
  protected readonly etiquetaSaldo = computed(() => saldoNivelTxt(this.prueba(), this.i18n.lang()));

  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly sel = signal<{ mercadoId: string; atletaId: string } | null>(null);
  protected readonly importe = signal(500);
  protected readonly importeTxt = signal('500');
  protected readonly enviando = signal(false);
  protected readonly errorPorra = signal<string | null>(null);
  protected readonly exito = signal<string | null>(null);
  /** El atleta cuyo perfil rápido (gr-sheet) está abierto. */
  protected readonly perfil = signal<OpcionMercado | null>(null);

  protected readonly saldo = computed(() => this.store.saldoDe(this.prueba()));
  protected readonly minimo = computed(() => this.estado.porraMin());
  protected readonly maximo = computed(() => Math.max(this.minimo(), this.estado.porraMax()));
  protected readonly sinSaldo = computed(() => this.fan.conSesion() && this.importe() > this.saldo());
  /** Chips de importe (Figma «¿Cuántas monedas?»): 100 · 250 · 500 · 1.000 · Todo (el saldo, hasta el máximo). */
  protected readonly chips = computed(() => [
    ...[100, 250, 500, 1000].map((v) => ({ v, l: this.monedas(v) })),
    { v: Math.max(this.minimo(), Math.min(this.saldo(), this.maximo())), l: this.t().todo },
  ]);

  private readonly ahora = signal(Date.now());
  /** La jornada del mercado está cerrada o ya pasó su hora de cierre: no se puede hacer porra en él. */
  private cerradaJornada(jornadaId?: string): boolean {
    const j = this.estado.jornadas().find((x) => x.id === jornadaId);
    return j?.estado === 'cerrada' || (!!j?.cierreAt && Date.parse(j.cierreAt) <= this.ahora());
  }

  /** Los mercados del sexo, nivel y grupo elegidos (categorías de menos a más peso). */
  protected readonly mercadosNivel = computed(() => mercadosDe(this.store.mercadosDeNivel(this.prueba()), this.sexo(), this.grupo(), this.prueba()));
  /** El mercado que se ve: la categoría de ?peso (o la primera) en el grupo de categorías; el único del grupo si no. */
  protected readonly mercadoActivo = computed<Mercado | null>(() => {
    const l = this.mercadosNivel();
    if (this.grupo() !== 'categoria') return l[0] ?? null;
    const peso = this.qp().get('peso');
    return l.find((m) => m.categoria === peso) ?? l[0] ?? null;
  });
  protected readonly pesoActivo = computed(() => this.mercadoActivo()?.categoria ?? '');
  /** Los atletas del mercado elegido, filtrados por el buscador y ordenados de la A a la Z. */
  protected readonly atletas = computed(() => {
    const m = this.mercadoActivo();
    if (!m) return [];
    const q = norm(this.q());
    return m.opciones.filter((o) => !q || norm(o.nombre).includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });
  protected readonly mias = computed(() => misPorras(this.store.apuestas()));
  protected readonly resumen = computed(() => {
    const ms = this.mercadosNivel();
    return { porras: ms.reduce((s, m) => s + m.apuestas, 0), bote: ms.reduce((s, m) => s + m.bote, 0) };
  });
  /** Lo que se cobraría si acierta el atleta elegido con el importe del boleto (parimutuel, la apuesta propia entra en el bote). */
  protected readonly retorno = computed(() => {
    const s = this.sel();
    const imp = this.importe();
    const m = s ? this.store.mercados().find((x) => x.id === s.mercadoId) : undefined;
    const o = m?.opciones.find((x) => x.atletaId === s?.atletaId);
    if (!m || !o || imp <= 0) return 0;
    return Math.floor((imp * (m.bote + imp)) / (o.apostado + imp));
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
      // ambos niveles (AEP-2 y AEP-3) en vivo: el stream sin filtro de jornada
      this.vivo.sinFiltroJornada();
      this.vivo.conectar();
      // los cambios en vivo se aplican en el cliente (como en la pestaña Porra del directo)
      seguirMercadosEnVivo((c) => this.store.aplicarCambio(c), () => void this.store.recargarMercados());
      // los botes cambian con cada porra: un refresco ligero cada 20 s
      const t = setInterval(() => {
        if (!document.hidden) void this.store.recargarMercados();
      }, 20000);
      const reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
      void this.fan.cargar().then(() => {
        void this.store.cargarCarteras();
        void this.store.cargarApuestas();
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(t);
        clearInterval(reloj);
        this.vivo.desconectar();
      });
    }
  }

  protected irA(v: Vista): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { vista: v === 'en-vivo' ? 'en-vivo' : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** «Masculino · −83 kg» en las categorías de peso; el título en los demás. */
  protected etiquetaMercado(m: Mercado): string {
    return etiquetaDeMercado(m, this.i18n.lang());
  }

  protected cerradaM(m: Mercado): boolean {
    return m.estado !== 'abierto' || this.cerradaJornada(m.jornadaId);
  }

  protected cuotaNum(m: Mercado, o: OpcionMercado): number {
    if (o.cuota && o.cuota > 0) return o.cuota;
    return o.apostado > 0 ? m.bote / o.apostado : 0;
  }

  protected cuotaTxt(m: Mercado, o: OpcionMercado): string {
    const v = this.cuotaNum(m, o);
    return v > 0 ? cuota(v, this.i18n.lang()) : '—';
  }

  protected escribir(e: Event): void {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    this.importeTxt.set(v);
    this.importe.set(v ? Number(v) : 0);
  }

  protected fijarImporte(v: number): void {
    this.importe.set(v);
    this.importeTxt.set(String(v));
  }

  protected elegir(m: Mercado, atletaId: string): void {
    if (!this.fan.conSesion()) {
      this.fan.abrirAcceso('porra');
      return;
    }
    this.fijarImporte(Math.min(Math.max(this.minimo(), 500), this.maximo()));
    this.sel.set({ mercadoId: m.id, atletaId });
    void this.store.cargarCarteras();
  }

  protected paso(dir: 1 | -1): void {
    this.fijarImporte(Math.min(this.maximo(), Math.max(this.minimo(), this.importe() + dir * 100)));
  }

  /** La apuesta va con la jornada de su mercado; el saldo que se ve es el de ese nivel. */
  protected async confirmar(m: Mercado, atletaId: string, nombre: string): Promise<void> {
    this.enviando.set(true);
    this.errorPorra.set(null);
    try {
      const importe = this.importe();
      await this.juegos.porraApostar(m.id, atletaId, importe, m.jornadaId);
      this.exito.set(this.t().hecha(this.monedas(importe), nombre));
      await Promise.all([this.store.cargarCarteras(), this.store.recargarMercados(), this.store.cargarApuestas()]);
    } catch (err) {
      this.errorPorra.set(mensajeError(err, this.i18n.lang()));
      if (codigoError(err).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    } finally {
      this.enviando.set(false);
    }
  }
}
