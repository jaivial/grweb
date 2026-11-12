/**
 * porra/porra.ts — /porra (Figma «71 · /porra» · Mercados): los mercados de la jornada con su bote y sus cuotas
 * en vivo, el boleto de apuesta, el selector de jornada y los premios como gancho.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { Juegos, JuegosEnVivo, JuegosEstado, PorraStore, TIPO_MERCADO, type Mercado, type TipoMercado, mensajeError } from '../../core/juegos';
import { monedas } from './formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { BoletoApuesta, CoinBalance, MarketCard, PorraCabecera, PremioCard } from './componentes';

type FiltroTipo = 'todas' | TipoMercado;
type FiltroSexo = 'todos' | 'F' | 'M';

@Component({
  selector: 'gr-porra-page',
  imports: [Page, GrAlert, GrButton, GrIcon, GrSkeleton, BoletoApuesta, CoinBalance, MarketCard, PorraCabecera, PremioCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Porra" [juego]="true">
      <gr-porra-cabecera [titulo]="'Porra ' + jornadaTxt()" activa="mercados"
        descripcion="Apuesta con monedas virtuales a la ganadora de cada categoría, al mejor IPF GL por sexo y a cada movimiento. La cuota se mueve en vivo con cada intento que registra la mesa (OpenLifter) y queda fijada en el momento de apostar.">
        <ng-container aside>
          <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" />
          @if (fan.conSesion()) {
            <button type="button" class="font-mono text-[13px] text-info underline-offset-4 hover:underline" [attr.aria-expanded]="verCartera()" (click)="verCartera.set(!verCartera())">{{ verCartera() ? 'Ocultar cartera' : 'Ver cartera y movimientos' }} →</button>
          }
        </ng-container>
      </gr-porra-cabecera>
      <gr-coin-balance class="self-start md:hidden" [valor]="saldo()" moneda="porra" motivo="porra" />

      @if (apuestasCerradas()) {
        <gr-alert tone="info" title="Apuestas cerradas">
          La hora de cierre de esta jornada ({{ jornadaNombre() }}) ya ha pasado: puedes consultar los mercados, pero no apostar.
        </gr-alert>
      } @else if (soloLectura()) {
        <gr-alert tone="info" title="Jornada cerrada">
          Esta jornada ({{ jornadaNombre() }}) ya no admite apuestas: puedes consultarla, pero no jugar.
        </gr-alert>
      }

      @if (verCartera() && cartera()) {
        <section class="rounded-lg border border-line-subtle bg-bg-card p-5" aria-label="Mi cartera">
          <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
            <p class="flex items-baseline gap-2"><span class="text-mono-xs text-text-tertiary">Porra</span><span class="font-mono text-[20px] font-bold text-accent-text tabular-nums">{{ monedas(cartera()!.porra) }}</span></p>
            <p class="flex items-baseline gap-2"><span class="text-mono-xs text-text-tertiary">Fantasy</span><span class="font-mono text-[20px] font-bold text-info tabular-nums">{{ monedas(cartera()!.fantasy) }}</span></p>
          </div>
          @if (cartera()!.movimientos.length) {
            <ul class="mt-4 flex flex-col divide-y divide-line-subtle border-t border-line-subtle">
              @for (m of cartera()!.movimientos; track m.createdAt + m.motivo) {
                <li class="flex items-center justify-between gap-3 py-2.5 text-body-xs">
                  <span class="min-w-0 truncate text-text-secondary">{{ m.motivo }}</span>
                  <span class="shrink-0 font-mono tabular-nums" [class]="m.importe >= 0 ? 'text-success' : 'text-accent-text'">{{ m.importe >= 0 ? '+' : '' }}{{ monedas(m.importe) }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="mt-3 text-body-xs text-text-tertiary">Todavía no hay movimientos en la cartera.</p>
          }
        </section>
      }

      <!-- Figma «Cómo ganar monedas» + «Selector · jornada» (en móvil el selector va debajo, como un desplegable) -->
      <section class="flex flex-col gap-2.5 rounded-lg border border-line-subtle bg-bg-card p-3 md:flex-row md:items-center md:justify-between md:gap-6 md:p-4">
        <div class="flex min-w-0 flex-col gap-2.5 md:gap-2">
          <p class="text-[12px] leading-[1.2] font-medium tracking-[0.04em] text-accent-text uppercase"><span class="md:hidden">Gana más monedas en el chat</span><span class="hidden md:inline">Gana más monedas escribiendo en el chat</span></p>
          <p class="flex items-center gap-2 text-body-s text-text-primary"><gr-icon name="zap" [size]="14" class="shrink-0 text-accent-text" /><span>5 mensajes<span class="hidden md:inline"> en el chat</span>: +{{ hito5() }}</span></p>
          <p class="flex flex-wrap items-center gap-x-2 text-body-s text-text-primary"><gr-icon name="zap" [size]="14" class="shrink-0 text-accent-text" /><span>10 mensajes: +{{ hito10() }} (se suma<span class="hidden md:inline"> al de 5</span>)</span><span class="hidden font-mono text-[12px] font-medium text-text-muted md:inline">máx. 100 hitos por jornada</span></p>
        </div>
        <div class="hidden w-[320px] shrink-0 flex-col items-end gap-2 md:flex">
          <div class="flex w-full gap-1 rounded-md border border-line-subtle bg-bg-field p-1" role="group" aria-label="Jornada">
            @for (j of jornadas(); track j.id) {
              <button type="button" class="h-11 min-w-0 flex-1 truncate rounded-xs px-2 text-label-s transition-colors"
                [class]="j.id === jornadaActiva()?.id ? 'bg-accent-grain text-white shadow-glow-deep' : 'text-text-tertiary hover:text-text-primary'"
                [attr.aria-pressed]="j.id === jornadaActiva()?.id" (click)="elegirJornada(j.id)">{{ etiquetaJornada(j) }}</button>
            } @empty { <gr-skeleton class="h-11 w-full rounded-xs" /> }
          </div>
          @if (jornadaNombre()) { <p class="text-body-xs text-text-muted">El histórico de {{ jornadaNombre() }} se guarda al cerrar</p> }
        </div>
      </section>

      <!-- móvil: jornada y filtro como desplegables (Figma «Selector · jornada» / «Selector · filtro») -->
      <label class="relative block md:hidden">
        <span class="sr-only">Jornada</span>
        <select class="h-12 w-full appearance-none rounded-md border border-line-strong bg-bg-field pr-12 pl-4 text-label-s text-text-primary" (change)="elegirJornada($any($event.target).value)">
          @for (j of jornadas(); track j.id) { <option [value]="j.id" [selected]="j.id === jornadaActiva()?.id">{{ etiquetaJornada(j) }}</option> }
        </select>
        <gr-icon name="chevron-down" [size]="20" class="pointer-events-none absolute top-3.5 right-4" />
      </label>
      <label class="relative block md:hidden">
        <span class="sr-only">Tipo de mercado</span>
        <select class="h-12 w-full appearance-none rounded-md border border-line-strong bg-bg-field pr-12 pl-4 text-label-s text-text-primary" (change)="filtroMovil($any($event.target).value)">
          @for (o of tipos; track o.v) { <option [value]="'t:' + o.v" [selected]="o.v === filtroTipo() && filtroSexo() === 'todos'">{{ o.l }}</option> }
          @for (o of sexos.slice(1); track o.v) { <option [value]="'s:' + o.v" [selected]="o.v === filtroSexo()">{{ o.l }}</option> }
        </select>
        <gr-icon name="chevron-down" [size]="20" class="pointer-events-none absolute top-3.5 right-4" />
      </label>

      <!-- escritorio: chips de tipo · sexo · recuento en una fila -->
      <div class="hidden flex-wrap items-center gap-2 md:flex">
        <div class="flex gap-2" role="group" aria-label="Tipo de mercado">
          @for (o of tipos; track o.v) {
            <button type="button" class="h-8 rounded-pill border px-3 text-label-xs transition-colors" [class]="chip(o.v === filtroTipo())" [attr.aria-pressed]="o.v === filtroTipo()" (click)="filtroTipo.set(o.v)">{{ o.l }}</button>
          }
        </div>
        <span class="size-3 shrink-0" aria-hidden="true"></span>
        <div class="flex gap-2" role="group" aria-label="Sexo">
          @for (o of sexos; track o.v) {
            <button type="button" class="h-8 rounded-pill border px-3 text-label-xs transition-colors" [class]="chip(o.v === filtroSexo())" [attr.aria-pressed]="o.v === filtroSexo()" (click)="filtroSexo.set(o.v)">{{ o.l }}</button>
          }
        </div>
        <span class="size-3 shrink-0" aria-hidden="true"></span>
        @if (!store.cargando() && !store.error()) {
          <p class="font-mono text-[12px] font-medium text-text-tertiary">{{ n('abierto') }} abiertos · {{ n('cerrado') }} cerrados · {{ n('liquidado') }} liquidados</p>
        }
      </div>

      @if (store.cargando()) {
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          @for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-[480px] rounded-lg" /> }
        </div>
      } @else if (store.error(); as e) {
        <gr-alert tone="warning" title="No hemos podido cargar los mercados">{{ e }}</gr-alert>
      } @else if (!mercadosVisibles().length) {
        <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
          <span class="flex size-14 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text shadow-glow-deep"><gr-icon name="trophy" [size]="24" /></span>
          <p class="text-display-xs">{{ todosMercados().length ? 'Ningún mercado con estos filtros' : 'Los mercados abren con la jornada' }}</p>
          <p class="max-w-md text-body-s text-text-tertiary">{{ todosMercados().length ? 'Prueba con otro tipo o con ambos sexos.' : 'Se generan cuando empieza la competición. Vuelve en unos minutos: tienes 100.000 monedas esperando.' }}</p>
          @if (todosMercados().length) { <button grButton variant="secondary" (click)="filtroTipo.set('todas'); filtroSexo.set('todos')">Quitar filtros</button> }
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          @for (m of mercadosVisibles(); track m.id) {
            <gr-market-card [mercado]="m" [soloLectura]="soloLectura()" [minimo]="estado.porraMin()" [maximoApuesta]="estado.porraMax()" (apostar)="apostar($event)" />
          }
        </div>
        @if (filtrados().length > 6) {
          <button type="button" class="-my-2 self-start py-2 text-label-s text-text-primary underline-offset-4 hover:underline" (click)="verTodos.set(!verTodos())">
            {{ verTodos() ? 'Ver menos mercados ←' : 'Ver todos los mercados (' + filtrados().length + ') →' }}
          </button>
        }
      }

      <!-- Premios de la jornada (gancho) -->
      @if (premios().length) {
        <section class="flex flex-col gap-3 md:gap-4" aria-labelledby="premios-porra">
          <div class="flex flex-col gap-4">
            <h2 id="premios-porra" class="text-[18px] leading-[1.3] font-semibold text-text-primary uppercase md:font-display md:text-[12px] md:font-normal md:leading-[1.25]">Premios de la jornada</h2>
            <p class="hidden text-body-xs text-text-tertiary md:block">Los premios se abonan en monedas al liquidar la jornada. Gestionados en el backoffice, anunciados aquí y en directo.</p>
          </div>
          <div class="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-[repeat(3,372px)]">
            @for (p of premios(); track p.id) { <gr-premio-card [premio]="p" /> }
          </div>
        </section>
      }
    </gr-page>

    @if (boleto(); as b) {
      <gr-boleto-apuesta [mercado]="b.mercado" [opciones]="opciones(b.mercado)" [atletaId]="b.atletaId" [saldo]="saldo()" [jornada]="jornadaTxt()"
        [minimo]="estado.porraMin()" [maximoApuesta]="estado.porraMax()" [cargando]="enviando()" [error]="errorBoleto()" [exito]="exitoBoleto()"
        (cerrar)="cerrarBoleto()" (elegir)="elegirAtleta($event)" (confirmar)="confirmar($event)" />
    }
  `,
})
export class PorraPage {
  protected readonly monedas = monedas;
  protected readonly store = inject(PorraStore);
  protected readonly estado = inject(JuegosEstado);
  private readonly juegos = inject(Juegos);
  private readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);

  protected readonly filtroTipo = signal<FiltroTipo>('todas');
  protected readonly filtroSexo = signal<FiltroSexo>('todos');
  protected readonly verTodos = signal(false);
  protected readonly verCartera = signal(false);
  protected readonly boleto = signal<{ mercado: Mercado; atletaId: string } | null>(null);
  protected readonly enviando = signal(false);
  protected readonly errorBoleto = signal<string | null>(null);
  protected readonly exitoBoleto = signal<string | null>(null);

  protected readonly tipos: { v: FiltroTipo; l: string }[] = [
    { v: 'todas', l: 'Todas' },
    { v: 'categoria', l: TIPO_MERCADO.categoria },
    { v: 'gl', l: TIPO_MERCADO.gl },
    { v: 'movimiento', l: TIPO_MERCADO.movimiento },
  ];
  protected readonly sexos: { v: FiltroSexo; l: string }[] = [
    { v: 'todos', l: 'Ambos sexos' },
    { v: 'F', l: 'Femenino' },
    { v: 'M', l: 'Masculino' },
  ];

  protected readonly jornadas = this.estado.jornadas;
  protected readonly jornadaActiva = computed(() => this.store.jornada() ?? this.estado.jornada());
  protected readonly cartera = this.estado.cartera;
  protected readonly saldo = computed(() => this.estado.saldoPorra());
  protected readonly premios = computed(() => this.store.premios().filter((p) => p.ranking === 'porra'));
  protected readonly subtitulo = computed(() =>
    'Apuesta con monedas virtuales a la ganadora de cada categoría, al mejor IPF GL por sexo y a cada movimiento. Bote parimutuel: todo el bote se reparte entre quien acierte.',
  );
  protected readonly jornadaNombre = computed(() => {
    const j = this.jornadaActiva();
    return j ? j.nombre.replace(/\s*\(.*\)$/, '') : '';
  });
  protected readonly jornadaTxt = computed(() => (this.jornadaNombre() ? '· ' + this.jornadaNombre() : ''));

  protected readonly todosMercados = computed(() => this.store.mercados());
  /** Los mercados que pasan los filtros (tipo y sexo). */
  protected readonly filtrados = computed(() => {
    const t = this.filtroTipo();
    const s = this.filtroSexo();
    return this.todosMercados().filter((m) => (t === 'todas' || m.tipo === t) && (s === 'todos' || m.sexo === s));
  });
  protected readonly mercadosVisibles = computed(() => (this.verTodos() ? this.filtrados() : this.filtrados().slice(0, 6)));
  /** Con la jornada cerrada los mercados solo se consultan. */
  private readonly ahora = signal(Date.now());
  /** La hora de cierre de las apuestas ya pasó. */
  protected readonly apuestasCerradas = computed(() => {
    const c = this.jornadaActiva()?.cierreAt;
    return !!c && Date.parse(c) <= this.ahora();
  });
  protected readonly soloLectura = computed(() => this.jornadaActiva()?.estado === 'cerrada' || this.apuestasCerradas());
  protected readonly hito5 = computed(() => monedas(this.estado.config()?.hito5Porra ?? 100));
  protected readonly hito10 = computed(() => monedas(this.estado.config()?.hito10Porra ?? 500));
  /** Chip de filtro (Figma «Filtro»): activo rojo translúcido con borde; inactivo sobre campo. */
  protected chip(on: boolean): string {
    return on ? 'border-accent bg-accent/16 text-accent-text' : 'border-transparent bg-bg-field text-text-secondary hover:text-text-primary';
  }
  /** El desplegable móvil combina tipo («t:…») y sexo («s:…»). */
  protected filtroMovil(v: string): void {
    if (v.startsWith('s:')) {
      this.filtroTipo.set('todas');
      this.filtroSexo.set(v.slice(2) as FiltroSexo);
    } else {
      this.filtroTipo.set(v.slice(2) as FiltroTipo);
      this.filtroSexo.set('todos');
    }
  }
  /** Cuántos mercados filtrados hay en un estado (abierto · cerrado · liquidado). */
  protected n(estado: string): number {
    return this.filtrados().filter((m) => m.estado === estado).length;
  }

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));

    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/porra', 'Porra · GR Strength Cup', 'Apuesta con monedas virtuales en la GR Strength Cup: bote parimutuel, cuotas en vivo y premios por jornada.');
    });

    if (browser) {
      this.vivo.conectar();
      // cuando un mercado cambia en vivo, recargamos los mercados (cuotas y bote)
      effect(() => {
        this.vivo.mercados();
        untracked(() => void this.store.recargarMercados());
      });
      // las cuotas cambian con cada apuesta: un refresco ligero cada 20 s
      const t = setInterval(() => {
        if (!document.hidden) void this.store.recargarMercados();
      }, 20000);
      const reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
      void this.fan.cargar().then(() => {
        void this.estado.cargarCartera();
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(t);
        clearInterval(reloj);
        this.vivo.desconectar();
      });
    }
  }

  protected etiquetaJornada(j: { nombre: string; dia: string; estado: string }): string {
    const d = j.dia
      ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(new Date(j.dia + 'T12:00:00Z')).replace('.', '') + ' ' + Number(j.dia.slice(8, 10))
      : '';
    return d ? `${j.nombre.replace(/\s*\(.*\)$/, '')} · ${d}` : j.nombre;
  }

  protected elegirJornada(id: string): void {
    this.estado.elegir(id);
    this.estado.cargarCartera();
    void this.store.cargar();
    void this.store.cargarApuestas();
    void this.store.cargarClasificacion();
  }

  protected opciones(m: Mercado) {
    return m.opciones.map((o) => ({ ...o, sexoTxt: m.sexo === 'F' ? 'Femenino' : 'Masculino', categoria: (m.categoria ?? '').replace('-', '−') + ' kg' }));
  }

  protected apostar(e: { mercado: Mercado; atletaId: string }): void {
    if (!this.fan.conSesion()) {
      this.fan.abrirAcceso('porra');
      return;
    }
    this.errorBoleto.set(null);
    this.exitoBoleto.set(null);
    this.boleto.set({ mercado: e.mercado, atletaId: e.atletaId || e.mercado.opciones[0]?.atletaId || '' });
    void this.estado.cargarCartera();
  }
  protected cerrarBoleto(): void {
    this.boleto.set(null);
    this.errorBoleto.set(null);
    this.exitoBoleto.set(null);
  }
  protected elegirAtleta(id: string): void {
    const b = this.boleto();
    if (!b) return;
    this.boleto.set({ ...b, atletaId: id });
  }
  protected async confirmar(e: { atletaId: string; importe: number }): Promise<void> {
    const b = this.boleto();
    if (!b) return;
    this.enviando.set(true);
    this.errorBoleto.set(null);
    this.exitoBoleto.set(null);
    try {
      await this.juegos.porraApostar(b.mercado.id, e.atletaId, e.importe, this.estado.jornadaActual());
      const nombre = b.mercado.opciones.find((o) => o.atletaId === e.atletaId)?.nombre ?? '';
      this.exitoBoleto.set(`Apuesta registrada: ${monedas(e.importe)} a ${nombre}`);
      await this.estado.cargarCartera();
      await this.store.recargarMercados();
    } catch (err) {
      this.errorBoleto.set(mensajeError(err));
      if (codigoError(err).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    } finally {
      this.enviando.set(false);
    }
  }
}
