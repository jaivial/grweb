import { RouterLink } from '@angular/router';
/**
 * fantasy/mercado.ts — /fantasy/mercado y /fantasy/salas/:id/mercado (Figma «72 · /fantasy» · Mercado): el mercado
 * de atletas de la sala con la cláusula en vivo, los filtros, la alineación de un vistazo, el feed de movimientos,
 * el modal de clausulazo y el cierre de clausulazos al empezar la última sesión del día.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSelect, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { FantasyStore, Juegos, JuegosEnVivo, JuegosEstado, fusionaFichajes, horaTxt, recargaAgrupada, type AtletaDetalle, type AtletaMercado, mensajeError } from '../../core/juegos';
import { monedas, norm } from '../porra/formato';
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AthleteSheet, AvisoConexion, BarraSala, ClausulazoModal, FantasyCabecera, FeedRow, GrAviso, MarketRow, SinSala } from './componentes';
import { CoinBalance, GrupoChips, JuegosNav } from '../porra/componentes';

type FiltroDueno = 'todos' | 'libres' | 'conDueno' | 'mios';
type FiltroSexo = 'todos' | 'F' | 'M';

const T = {
  es: {
    titulo: 'Mercado',
    desc: 'Libres al valor; clausulazo al dueño. Cláusula en vivo con cada veredicto.',
    cerradosDesde: (h: string) => 'Clausulazos cerrados desde las ' + h,
    cerradosTxt: 'Empezó la última sesión de la competición. Sigues pudiendo fichar y vender hasta que termine.',
    seCierran: (h: string) => 'Los clausulazos se cierran a las ' + h,
    quedan: (f: string) => `Quedan ${f}. Después podrás seguir fichando atletas libres.`,
    cerrados: 'Clausulazos cerrados',
    sinHorario: 'Todavía no hay horario publicado: los clausulazos se abren cuando se publique.',
    errorCarga: 'No hemos podido cargar el mercado',
    dueno: 'Dueño',
    sexo: 'Sexo',
    categoria: 'Categoría',
    todas: 'Todas',
    enJuego: (n: number) => `${n} atletas en juego`,
    errorOp: 'No hemos podido completar la operación',
    fichajeOk: 'Fichaje completado',
    miAlineacion: 'Mi alineación',
    clausulazos: 'clausulazos',
    nadieFiltros: 'Nadie con estos filtros',
    abreJornada: 'El mercado abre con la jornada',
    cambiaFiltros: 'Cambia los filtros para ver más atletas.',
    seCargan: 'Los atletas se cargan cuando se genera la jornada. Vuelve en unos minutos.',
    quitarFiltros: 'Quitar filtros',
    busca: 'Busca un atleta por nombre',
    sinResultados: (q: string) => `Ningún atleta coincide con «${q}»`,
    revisa: 'Revisa el nombre, busca por apellido o cambia los filtros.',
    atleta: 'Atleta',
    tendencia: 'Tendencia',
    clausula: 'Cláusula',
    accion: 'Acción',
    verMasAtletas: (n: number) => `Ver ${n} atletas más`,
    deTotal: (a: number, b: number) => `${a} de ${b}`,
    reglaClausulazo: (n: number) => `Clausulazo: pagas la cláusula y el dinero va al dueño anterior. Máximo ${n} clausulazos por usuario en todo el evento; sin deuda: no se puede dejar el saldo en negativo.`,
    saldoFantasy: 'Saldo fantasy',
    valorAlineacion: 'Valor de la alineación',
    usados: 'Clausulazos usados',
    ultimos: 'Últimos movimientos',
    verMenos: 'Ver menos',
    verMasMov: 'Ver más movimientos',
    sinMov: 'Todavía no hay movimientos: el primer fichaje de la jornada puede ser el tuyo.',
    hoy: 'hoy',
    filtros: { todos: 'Todos', libres: 'Libres', conDueno: 'Con dueño', mios: 'Míos' } as Record<FiltroDueno, string>,
    ambos: 'Ambos sexos',
    femenino: 'Femenino',
    masculino: 'Masculino',
    sinAlineacion: 'Sin alineación todavía',
    deAtletas: (a: number, b: number) => `${a} de ${b} atletas · sin suplentes`,
    completa: 'Completa',
    sinSaldo: 'Sin saldo',
    elAtleta: 'el atleta',
    tu: '@tú',
    libre: 'libre',
    yaEsta: (n: string) => `${n} ya está en tu alineación.`,
    seoTitulo: 'Mercado de GRS Fantasy · GR Strength Cup',
    seoDesc: 'El mercado de atletas de GRS Fantasy: cláusulas en vivo, fichajes y clausulazos.',
  },
  en: {
    titulo: 'Market',
    desc: 'Free athletes at their value; buy-out to the owner. Live release clause with every decision.',
    cerradosDesde: (h: string) => 'Buy-outs closed since ' + h,
    cerradosTxt: 'The last session of the competition has begun. You can still sign and sell until it ends.',
    seCierran: (h: string) => 'Buy-outs close at ' + h,
    quedan: (f: string) => `${f} left. After that you can keep signing free athletes.`,
    cerrados: 'Buy-outs closed',
    sinHorario: 'No schedule has been published yet: buy-outs open once it is.',
    errorCarga: "We couldn't load the market",
    dueno: 'Owner',
    sexo: 'Sex',
    categoria: 'Category',
    todas: 'All',
    enJuego: (n: number) => `${n} athletes in play`,
    errorOp: "We couldn't complete the operation",
    fichajeOk: 'Signing completed',
    miAlineacion: 'My line-up',
    clausulazos: 'buy-outs',
    nadieFiltros: 'Nobody matches these filters',
    abreJornada: 'The market opens with the day',
    cambiaFiltros: 'Change the filters to see more athletes.',
    seCargan: 'Athletes are loaded when the day is generated. Come back in a few minutes.',
    quitarFiltros: 'Clear filters',
    busca: 'Search for an athlete by name',
    sinResultados: (q: string) => `No athlete matches “${q}”`,
    revisa: 'Check the name, search by surname or change the filters.',
    atleta: 'Athlete',
    tendencia: 'Trend',
    clausula: 'Release clause',
    accion: 'Action',
    verMasAtletas: (n: number) => `See ${n} more athletes`,
    deTotal: (a: number, b: number) => `${a} of ${b}`,
    reglaClausulazo: (n: number) => `Buy-out: you pay the release clause and the money goes to the previous owner. Up to ${n} buy-outs per user for the whole event; no debt: your balance can never go negative.`,
    saldoFantasy: 'Fantasy balance',
    valorAlineacion: 'Line-up value',
    usados: 'Buy-outs used',
    ultimos: 'Latest moves',
    verMenos: 'See less',
    verMasMov: 'See more moves',
    sinMov: "There are no moves yet: the day's first signing could be yours.",
    hoy: 'today',
    filtros: { todos: 'All', libres: 'Free', conDueno: 'Owned', mios: 'Mine' } as Record<FiltroDueno, string>,
    ambos: 'Both sexes',
    femenino: 'Women',
    masculino: 'Men',
    sinAlineacion: 'No line-up yet',
    deAtletas: (a: number, b: number) => `${a} of ${b} athletes · no substitutes`,
    completa: 'Full',
    sinSaldo: 'No balance',
    elAtleta: 'the athlete',
    tu: '@you',
    libre: 'free',
    yaEsta: (n: string) => `${n} is now in your line-up.`,
    seoTitulo: 'GRS Fantasy market · GR Strength Cup',
    seoDesc: 'The GRS Fantasy athlete market: live release clauses, signings and buy-outs.',
  },
};

@Component({
  selector: 'gr-mercado-fantasy-page',
  imports: [RouterLink, LocPipe, Page, FormsModule, GrButton, GrIcon, GrSelect, GrSkeleton, AthleteSheet, AvisoConexion, BarraSala, ClausulazoModal, CoinBalance, FantasyCabecera, FeedRow, GrAviso, MarketRow, GrupoChips, JuegosNav, SinSala],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [juego]="true">
      <gr-fantasy-cabecera [titulo]="t().titulo" [migas]="[t().titulo]" [descripcion]="t().desc">
        <gr-coin-balance class="shrink-0 self-start lg:self-center" [valor]="saldo() ?? 0" moneda="fantasy" motivo="fantasy" />
      </gr-fantasy-cabecera>

      <gr-juegos-nav juego="fantasy" activa="mercado" [pestanas]="!store.sala()" />
      @if (store.sala(); as s) {
        <gr-barra-sala [salaId]="s.id" [nombre]="s.nombre" [estado]="s.estado" [miembros]="s.miembros ?? 0" [plazas]="s.plazas ?? 0" activa="mercado" />
      }
      @if (vivo.caida()) { <gr-aviso-conexion /> }
      @if (cierre(); as c) {
        @if (cerrado()) {
          <gr-aviso tono="aviso" [titulo]="t().cerradosDesde(c)">{{ t().cerradosTxt }}</gr-aviso>
        } @else if (faltaTxt(); as f) {
          <gr-aviso [titulo]="t().seCierran(c)">{{ t().quedan(f) }}</gr-aviso>
        }
      } @else if (cerrado()) {
        <gr-aviso tono="aviso" [titulo]="t().cerrados">{{ t().sinHorario }}</gr-aviso>
      }

      @if (store.cargando()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5]; track i) { <gr-skeleton class="h-[74px] rounded-md" /> }
        </div>
      } @else if (store.error(); as e) {
        <gr-aviso tono="error" [titulo]="t().errorCarga">{{ e }}</gr-aviso>
      } @else if (sinSala()) {
        <gr-sin-sala />
      } @else {
        <!-- Filtros (chips que se ajustan en varias líneas, también en móvil) -->
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <gr-grupo-chips class="min-w-0" [etiqueta]="t().dueno" [envuelve]="true" [opciones]="opcionesFiltro()" [valor]="filtro()" (valorChange)="filtro.set($event); limite.set(PAGINA)" />
          <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <gr-grupo-chips class="min-w-0" [etiqueta]="t().sexo" [envuelve]="true" [opciones]="sexos()" [valor]="filtroSexo()" (valorChange)="filtroSexo.set($event); limite.set(PAGINA)" />
            <gr-select class="self-start" tipo="filtro" tam="l" [attr.aria-label]="t().categoria" [etiqueta]="t().categoria" [ngModel]="filtroCategoria()" (ngModelChange)="filtroCategoria.set($event); limite.set(PAGINA)">
              <option value="">{{ t().todas }}</option>
              @for (c of categorias(); track c) { <option [value]="c">{{ c.replace('-', '−') }} kg</option> }
            </gr-select>
          </div>
        </div>
        <label class="relative mt-3 block">
          <span class="sr-only">{{ t().busca }}</span>
          <gr-icon name="search" [size]="18" class="pointer-events-none absolute top-3.5 left-3.5 text-text-tertiary" />
          <input type="search" class="h-12 w-full rounded-md border border-line-subtle bg-bg-field pr-4 pl-11 text-body-s text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent-text"
            [placeholder]="t().busca" autocomplete="off" [value]="q()" (input)="q.set($any($event.target).value); limite.set(PAGINA)" />
        </label>
        <p class="mt-3 font-mono text-[12px] font-medium text-text-tertiary">{{ t().enJuego(atletas().length) }}</p>

        @if (error()) {
          <gr-aviso class="mt-4" tono="error" [titulo]="t().errorOp">{{ error() }}</gr-aviso>
        } @else if (hecho(); as h) {
          <gr-aviso class="mt-4" tono="exito" [titulo]="t().fichajeOk">{{ h }}</gr-aviso>
        }

        <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div class="min-w-0">
            <!-- Mi plantilla de un vistazo (móvil y tablet; en escritorio va en la columna) -->
            @if (equipo()) {
              <a [routerLink]="'/fantasy' | loc" class="mb-4 flex items-center gap-3 rounded-md border border-info/30 bg-info/5 px-4 py-3 lg:hidden">
                <span class="min-w-0 flex-1">
                  <span class="block text-meta text-info">{{ t().miAlineacion }} · {{ fichados() }}/{{ plantillaMax() }}</span>
                  <span class="mt-1.5 block h-1.5 overflow-hidden rounded-pill bg-bg-raised"><span class="block h-full rounded-pill bg-info" [style.width.%]="porcentajePlantilla()"></span></span>
                </span>
                <span class="shrink-0 text-right"><span class="block font-mono text-label-s text-text-primary">{{ clausulazosUsados() }}/{{ maxClausulazos() }}</span><span class="block text-meta text-text-tertiary">{{ t().clausulazos }}</span></span>
                <gr-icon name="chevron-right" [size]="18" class="shrink-0 text-text-tertiary" />
              </a>
            }
            @if (!visibles().length) {
              <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
                <span class="flex size-14 items-center justify-center rounded-full border border-info/50 bg-info/12 text-info"><gr-icon name="users" [size]="24" /></span>
                @if (atletas().length && q().trim()) {
                  <p class="text-display-xs">{{ t().sinResultados(q().trim()) }}</p>
                  <p class="max-w-md text-body-s text-text-tertiary">{{ t().revisa }}</p>
                } @else {
                  <p class="text-display-xs">{{ atletas().length ? t().nadieFiltros : t().abreJornada }}</p>
                  <p class="max-w-md text-body-s text-text-tertiary">{{ atletas().length ? t().cambiaFiltros : t().seCargan }}</p>
                }
                @if (atletas().length) { <button grButton variant="secondary" (click)="quitarFiltros()">{{ t().quitarFiltros }}</button> }
              </div>
            } @else {
              <!-- Cabecera de la tabla (escritorio) -->
              <p class="mb-2 hidden items-center gap-4 pr-3 pl-[70px] text-meta text-text-tertiary lg:flex" aria-hidden="true">
                <span class="flex-1">{{ t().atleta }}</span>
                <span class="w-[72px]">{{ t().tendencia }}</span>
                <span class="w-24 text-right">{{ t().clausula }}</span>
                <span class="w-28">{{ t().dueno }}</span>
                <span class="w-32 text-right">{{ t().accion }}</span>
              </p>
              <ul class="flex flex-col gap-2">
                @for (a of pagina(); track a.atletaId) {
                  <li>
                    <gr-market-row [atleta]="a" [serie]="serie(a)" [delta]="delta(a)" [accion]="accion(a)" [restante]="restante(a)" [cierre]="cierre()" [bloqueo]="bloqueoFichar(a)"
                      (fichar)="fichar(a)" (clausulazo)="abrirClausulazo(a)" (vender)="vender(a)" (ficha)="verFicha(a)" />
                  </li>
                }
              </ul>
              @if (visibles().length > pagina().length) {
                <div class="mt-4 flex flex-col items-center gap-2">
                  <button grButton variant="secondary" iconRight="chevron-down" (click)="limite.set(limite() + PAGINA)">{{ t().verMasAtletas(Math.min(PAGINA, visibles().length - pagina().length)) }}</button>
                  <p class="font-mono text-[13px] text-text-tertiary uppercase">{{ t().deTotal(pagina().length, visibles().length) }}</p>
                </div>
              }
            }
            <p class="mt-5 flex items-start gap-2 text-body-s text-text-tertiary">
              <gr-icon name="zap" [size]="15" class="mt-px shrink-0 text-accent-text" />
              {{ t().reglaClausulazo(maxClausulazos()) }}
            </p>
          </div>

          <!-- La columna de la derecha del diseño -->
          <aside class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
            <section class="hidden rounded-lg border border-line-subtle bg-bg-card p-4 lg:block">
              <p class="flex items-center justify-between gap-2"><span class="text-meta text-info">{{ t().miAlineacion }}</span><span class="font-mono text-label-s text-text-primary">{{ fichados() }}/{{ plantillaMax() }}</span></p>
              <p class="mt-1 text-body-s text-text-tertiary">{{ descripcionPlantilla() }}</p>
              <span class="mt-3 block h-1.5 w-full overflow-hidden rounded-pill bg-bg-raised">
                <span class="block h-full rounded-pill bg-info" [style.width.%]="porcentajePlantilla()"></span>
              </span>
              <dl class="mt-4 flex flex-col gap-1.5 text-body-s">
                <div class="flex items-center justify-between gap-2"><dt class="text-text-tertiary">{{ t().saldoFantasy }}</dt><dd class="font-mono font-bold text-info tabular-nums">{{ saldo() !== null ? monedas(saldo()!) : '—' }}</dd></div>
                <div class="flex items-center justify-between gap-2"><dt class="text-text-tertiary">{{ t().valorAlineacion }}</dt><dd class="font-mono text-text-primary tabular-nums">{{ gastado() !== null ? monedas(gastado()!) : '—' }}</dd></div>
                <div class="flex items-center justify-between gap-2"><dt class="text-text-tertiary">{{ t().usados }}</dt><dd class="font-mono text-text-primary">{{ clausulazosUsados() !== null ? t().deTotal(clausulazosUsados()!, maxClausulazos()) : '—' }}</dd></div>
              </dl>
            </section>

            <section class="rounded-lg border border-line-subtle bg-bg-card p-4" aria-labelledby="feed-mercado">
              <p id="feed-mercado" class="text-meta text-accent-text">{{ t().ultimos }}</p>
              @if (feed().length) {
                <ul class="mt-3 flex flex-col gap-2" aria-live="polite">
                  @for (m of feed().slice(0, verFeed() ? 20 : 6); track m.fecha + m.atletaId) {
                    <li><gr-feed-row [mov]="m" [nombreAtleta]="nombre(m.atletaId)" /></li>
                  }
                </ul>
                @if (feed().length > 6) {
                  <button type="button" class="mt-2 h-11 w-full text-label-s text-accent-text hover:underline underline-offset-4 md:h-9" (click)="verFeed.set(!verFeed())">{{ verFeed() ? t().verMenos : t().verMasMov }}</button>
                }
              } @else {
                <p class="mt-2 text-body-s text-text-tertiary">{{ t().sinMov }}</p>
              }
            </section>
          </aside>
        </div>
      }
    </gr-page>

    @if (clausulazo(); as a) {
      <gr-clausulazo-modal [atleta]="a" [saldo]="saldo() ?? 0" [cargando]="enviando()" [error]="errorClausulazo()"
        [clausulazosUsados]="clausulazosUsados() ?? 0" [maxClausulazos]="maxClausulazos()" [proteccionMin]="proteccionMin()" [sala]="store.sala()?.nombre ?? ''" [cerrado]="cerrado() ? (cierre() || t().hoy) : ''"
        (cerrar)="cerrarClausulazo()" (pagar)="pagarClausulazo()" />
    }
    @if (ficha(); as f) {
      <gr-athlete-sheet [detalle]="f" [fichajes]="fichajesDe(f.atleta?.atletaId ?? '')" [enVivo]="vivo.nota()" [nulo]="estado.nulo()" [duenoTxt]="duenoDe(f.atleta?.atletaId ?? '')" (cerrar)="cerrarFicha()" />
    }
  `,
})
export class MercadoFantasyPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.locale());
  protected readonly store = inject(FantasyStore);
  protected readonly estado = inject(JuegosEstado);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly juegos = inject(Juegos);
  private readonly ruta = inject(ActivatedRoute);

  /** El último fichaje hecho desde esta pantalla (aviso «Fichaje completado»). */
  protected readonly hecho = signal<string | null>(null);
  protected readonly filtro = signal<FiltroDueno>('todos');
  protected readonly filtroSexo = signal<FiltroSexo>('todos');
  protected readonly filtroCategoria = signal('');
  /** El buscador por nombre (sin tildes ni mayúsculas, como el de /porra). */
  protected readonly q = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly errorClausulazo = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly clausulazo = signal<AtletaMercado | null>(null);
  protected readonly ficha = signal<AtletaDetalle | null>(null);
  protected readonly ahora = signal(Date.now());
  /** El mercado se pinta por páginas de 20 (presentación: la lista completa ya está cargada). */
  protected readonly PAGINA = 20;
  protected readonly Math = Math;
  protected readonly limite = signal(this.PAGINA);
  protected readonly verFeed = signal(false);

  protected readonly filtros: { v: FiltroDueno; n: () => number }[] = [
    { v: 'todos', n: () => this.atletas().length },
    { v: 'libres', n: () => this.atletas().filter((a) => a.libre).length },
    { v: 'conDueno', n: () => this.atletas().filter((a) => !a.libre).length },
    { v: 'mios', n: () => this.atletas().filter((a) => a.esMio).length },
  ];
  protected readonly sexos = computed<{ v: FiltroSexo; l: string }[]>(() => [
    { v: 'todos', l: this.t().ambos },
    { v: 'F', l: this.t().femenino },
    { v: 'M', l: this.t().masculino },
  ]);

  protected readonly atletas = computed(() => this.store.atletas());
  protected readonly equipo = computed(() => this.store.equipo());
  /** Sin sesión no hay cartera: los saldos se muestran como «—». */
  protected readonly saldo = computed<number | null>(() => (this.equipo() ? this.equipo()!.saldo : null));
  protected readonly gastado = computed<number | null>(() => (this.equipo() ? this.equipo()!.valor : null));
  protected readonly fichados = computed(() => this.equipo()?.atletas.length ?? 0);
  protected readonly porcentajePlantilla = computed(() => Math.min(100, (this.fichados() / this.plantillaMax()) * 100));
  /** Los límites, de la configuración pública del backend (con los del contrato como respaldo). */
  protected readonly plantillaMax = computed(() => this.estado.plantillaMax());
  protected readonly maxClausulazos = computed(() => this.estado.maxClausulazos());
  protected readonly proteccionMin = computed(() => this.estado.proteccionMin());
  protected readonly descripcionPlantilla = computed(() => {
    const e = this.equipo();
    if (!e) return this.t().sinAlineacion;
    return this.t().deAtletas(e.atletas.length, this.plantillaMax());
  });
  protected readonly clausulazosUsados = computed<number | null>(() => (this.equipo() ? this.equipo()!.clausulazos : null));
  protected readonly categorias = computed(() => [...new Set(this.atletas().map((a) => a.categoria).filter(Boolean))].sort());
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const s = this.filtroSexo();
    const c = this.filtroCategoria();
    const q = norm(this.q());
    return this.atletas().filter(
      (a) =>
        (f === 'todos' || (f === 'libres' && a.libre) || (f === 'conDueno' && !a.libre) || (f === 'mios' && a.esMio)) &&
        (s === 'todos' || a.sexo === s) &&
        (!c || a.categoria === c) &&
        (!q || norm(a.nombre).includes(q)),
    );
  });
  protected readonly pagina = computed(() => this.visibles().slice(0, this.limite()));
  protected readonly opcionesFiltro = computed(() => this.filtros.map((f) => ({ v: f.v, l: this.t().filtros[f.v], n: f.n() })));
  /** El feed: los fichajes cargados del API más los que llegan por SSE. */
  protected readonly feed = computed(() => fusionaFichajes(this.store.fichajes(), this.vivo.feed(), this.store.sala()?.id));
  /** Sin sala (ni propia ni pedida) no hay mercado en el que fichar. */
  protected readonly sinSala = computed(() => !this.store.sala());
  /** El botón «Fichar» se deshabilita con la alineación completa o sin saldo para su cláusula. */
  protected bloqueoFichar(a: AtletaMercado): string {
    const e = this.equipo();
    if (!e) return '';
    if (e.atletas.length >= this.plantillaMax()) return this.t().completa;
    return e.saldo < a.clausula ? this.t().sinSaldo : '';
  }
  /** Los clausulazos se cierran al empezar la última sesión del día (o si no hay horario): la hora y si ya pasó. */
  protected readonly cierre = computed(() => horaTxt(this.store.clausulazo()?.cierre));
  protected readonly cerrado = computed(() => {
    const c = this.store.clausulazo();
    if (!c) return false;
    return !c.abierto || (!!c.cierre && new Date(c.cierre).getTime() <= this.ahora());
  });
  /** «1 h 12 min» hasta el cierre; solo se avisa en la última hora y media. */
  protected readonly faltaTxt = computed(() => {
    const c = this.store.clausulazo()?.cierre;
    if (!c) return '';
    const min = Math.ceil((new Date(c).getTime() - this.ahora()) / 60000);
    if (min <= 0 || min > 90) return '';
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    this.store.salaPedida.set(this.ruta.snapshot.paramMap.get('id') ?? '');
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/fantasy/mercado', this.t().seoTitulo, this.t().seoDesc);
    });
    if (browser) {
      this.vivo.conectar();
      void this.fan.cargar().then(async () => {
        void this.estado.cargarCartera();
        await this.store.cargarEquipo();
        // con sesión el mercado depende de mi sala: se vuelve a pedir ya identificado
        await this.store.recargar();
        void this.store.cargarFichajes();
      });
      // Notas, fichajes y salas cambian en vivo: se recarga sin esqueleto (un margen agrupa los eventos seguidos).
      let primera = true;
      const agrupada = recargaAgrupada(() => void this.store.recargar());
      effect(() => {
        this.vivo.versionNotas();
        this.vivo.versionSalas();
        this.vivo.version();
        untracked(() => {
          if (primera) return void (primera = false);
          agrupada.pedir();
        });
      });
      inject(DestroyRef).onDestroy(() => agrupada.cancelar());
      const t = setInterval(() => this.ahora.set(Date.now()), 1000);
      inject(DestroyRef).onDestroy(() => {
        clearInterval(t);
        this.vivo.desconectar();
      });
    }
  }

  protected quitarFiltros(): void {
    this.filtro.set('todos');
    this.filtroSexo.set('todos');
    this.filtroCategoria.set('');
    this.q.set('');
    this.limite.set(this.PAGINA);
  }
  protected serie(a: AtletaMercado): number[] {
    return this.vivo.series().get(a.atletaId) ?? [a.clausula];
  }
  protected delta(a: AtletaMercado): number {
    return this.vivo.clausulas().get(a.atletaId)?.pct ?? 0;
  }
  protected accion(a: AtletaMercado): 'fichar' | 'clausulazo' | 'vender' | 'protegido' | 'cerrado' {
    if (a.esMio) return 'vender';
    if (a.libre) return 'fichar';
    const r = this.restante(a);
    if (r === null ? a.protegido : r > 0) return 'protegido';
    return this.cerrado() ? 'cerrado' : 'clausulazo';
  }

  /** Los segundos que le quedan de protección (null si el backend no envía `protegidoHasta`). */
  protected restante(a: AtletaMercado): number | null {
    if (!a.protegidoHasta) return null;
    const ms = new Date(a.protegidoHasta).getTime() - this.ahora();
    return ms > 0 ? Math.round(ms / 1000) : 0;
  }
  protected nombre(atletaId: string): string {
    return this.atletas().find((a) => a.atletaId === atletaId)?.nombre ?? this.t().elAtleta;
  }
  protected fichajesDe(atletaId: string) {
    return fusionaFichajes(this.store.fichajesAtleta().filter((f) => f.atletaId === atletaId), this.vivo.feed().filter((f) => f.atletaId === atletaId), this.store.sala()?.id);
  }
  /** El dueño en esta sala (la ficha del atleta no lo trae). */
  protected duenoDe(atletaId: string): string {
    const a = this.atletas().find((x) => x.atletaId === atletaId);
    return !a ? '' : a.esMio ? this.t().tu : a.duenoAlias ? '@' + a.duenoAlias : this.t().libre;
  }

  protected async verFicha(a: AtletaMercado): Promise<void> {
    await Promise.all([this.store.cargarDetalle(a.atletaId), this.store.cargarFichajes(a.atletaId)]);
    this.ficha.set(this.store.detalle());
  }
  protected cerrarFicha(): void {
    this.ficha.set(null);
  }

  protected async fichar(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/mercado'));
    this.error.set(null);
    this.hecho.set(null);
    try {
      await this.juegos.fantasyComprar(a.atletaId, this.estado.jornadaActual());
      await this.trasOperacion();
      this.hecho.set(this.t().yaEsta(a.nombre));
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    }
  }
  protected async vender(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/mercado'));
    this.error.set(null);
    try {
      await this.juegos.fantasyVender(a.atletaId, this.estado.jornadaActual());
      await this.trasOperacion();
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    }
  }
  protected abrirClausulazo(a: AtletaMercado): void {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/mercado'));
    this.errorClausulazo.set(null);
    this.clausulazo.set(a);
  }
  protected cerrarClausulazo(): void {
    this.clausulazo.set(null);
    this.errorClausulazo.set(null);
  }
  protected async pagarClausulazo(): Promise<void> {
    const a = this.clausulazo();
    if (!a) return;
    this.enviando.set(true);
    this.errorClausulazo.set(null);
    try {
      await this.juegos.fantasyClausulazo(a.atletaId, this.estado.jornadaActual());
      this.cerrarClausulazo();
      await this.trasOperacion();
    } catch (e) {
      this.errorClausulazo.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    } finally {
      this.enviando.set(false);
    }
  }
  private async trasOperacion(): Promise<void> {
    await this.store.cargarEquipo();
    await this.store.cargar();
    await this.estado.cargarCartera();
  }
}
