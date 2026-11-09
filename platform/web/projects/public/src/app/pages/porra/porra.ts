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
import { BoletoApuesta, CoinBalance, GrupoChips, JuegosNav, MarketCard, PremioCard } from './componentes';

type FiltroTipo = 'todas' | TipoMercado;
type FiltroSexo = 'todos' | 'F' | 'M';

@Component({
  selector: 'gr-porra-page',
  imports: [Page, GrAlert, GrButton, GrIcon, GrSkeleton, BoletoApuesta, CoinBalance, GrupoChips, JuegosNav, MarketCard, PremioCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Porra" [suffix]="jornadaTxt()" crumb="Porra" section="Juegos" [subtitle]="subtitulo()">
      <div pageStamps class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <gr-coin-balance [valor]="saldo()" moneda="porra" motivo="porra" />
        @if (fan.conSesion()) {
          <button type="button" class="inline-flex h-11 items-center gap-1.5 text-label-s text-accent-text underline-offset-4 hover:underline md:h-auto" [attr.aria-expanded]="verCartera()" (click)="verCartera.set(!verCartera())">
            <gr-icon name="history" [size]="15" />{{ verCartera() ? 'Ocultar cartera' : 'Cartera y movimientos' }}
          </button>
        }
      </div>

      <gr-juegos-nav class="mb-6 md:mb-8" juego="porra" activa="mercados" />

      @if (soloLectura()) {
        <gr-alert class="mb-6" tone="info" title="Jornada cerrada">
          Esta jornada ({{ jornadaNombre() }}) ya no admite apuestas: puedes consultarla, pero no jugar.
        </gr-alert>
      }

      @if (verCartera() && cartera()) {
        <section class="mb-6 rounded-lg border border-line-subtle bg-bg-card p-5" aria-label="Mi cartera">
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

      <!-- Figma «Selector · jornada» + «Gana más monedas escribiendo en el chat» -->
      <section class="mb-6 flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card/80 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div class="flex min-w-0 flex-col gap-2">
          <p class="text-mono-xs text-text-tertiary">Jornada</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Jornada">
            @for (j of jornadas(); track j.id) {
              <button type="button" class="h-11 rounded-pill border px-4 text-label-xs transition-colors md:h-9"
                [class]="j.id === jornadaActiva()?.id ? 'border-accent bg-accent-grain text-white shadow-glow-deep' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'"
                [attr.aria-pressed]="j.id === jornadaActiva()?.id" (click)="elegirJornada(j.id)">{{ etiquetaJornada(j) }}</button>
            } @empty { <gr-skeleton class="h-9 w-40 rounded-pill" /> }
          </div>
        </div>
        <div class="flex flex-col gap-2 md:items-end">
          <p class="text-mono-xs text-accent-text">Gana más monedas en el chat</p>
          <p class="flex flex-wrap gap-2 text-body-xs text-text-secondary">
            <span class="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line-subtle bg-bg-surface px-3"><gr-icon name="zap" [size]="13" class="text-accent-text" />5 mensajes <b class="font-mono text-text-primary">+100</b></span>
            <span class="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line-subtle bg-bg-surface px-3"><gr-icon name="zap" [size]="13" class="text-accent-text" />10 mensajes <b class="font-mono text-text-primary">+500</b></span>
          </p>
        </div>
      </section>

      <!-- Filtros (en móvil, una fila con scroll horizontal por grupo) -->
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <gr-grupo-chips class="min-w-0" etiqueta="Tipo de mercado" [opciones]="tipos" [valor]="filtroTipo()" (valorChange)="filtroTipo.set($event)" />
        <gr-grupo-chips class="min-w-0" etiqueta="Sexo" [opciones]="sexos" [valor]="filtroSexo()" (valorChange)="filtroSexo.set($event)" />
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
        <p class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-tertiary uppercase">
          <span class="inline-flex items-center gap-1.5"><span class="size-1.5 rounded-full bg-success"></span>{{ n('abierto') }} abiertos</span>
          <span>{{ n('cerrado') }} cerrados</span><span>{{ n('liquidado') }} liquidados</span>
        </p>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          @for (m of mercadosVisibles(); track m.id) {
            <gr-market-card [mercado]="m" [soloLectura]="soloLectura()" [minimo]="estado.porraMin()" [maximoApuesta]="estado.porraMax()" (apostar)="apostar($event)" />
          }
        </div>
        @if (filtrados().length > 6) {
          <div class="mt-6 flex justify-center">
            <button grButton variant="secondary" [iconRight]="verTodos() ? 'chevron-left' : 'chevron-right'" (click)="verTodos.set(!verTodos())">
              {{ verTodos() ? 'Ver menos mercados' : 'Ver todos los mercados (' + filtrados().length + ')' }}
            </button>
          </div>
        }
      }

      <!-- Premios de la jornada (gancho) -->
      @if (premios().length) {
        <section class="mt-14" aria-labelledby="premios-porra">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <h2 id="premios-porra" class="text-display-xs">Premios de la jornada</h2>
            <a href="/porra/clasificacion" class="inline-flex h-11 items-center gap-1 text-label-s text-accent-text hover:underline underline-offset-4 md:h-auto">Ver la clasificación<gr-icon name="chevron-right" [size]="16" /></a>
          </div>
          <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  protected readonly soloLectura = computed(() => this.jornadaActiva()?.estado === 'cerrada');
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
      void this.fan.cargar().then(() => {
        void this.estado.cargarCartera();
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(t);
        this.vivo.desconectar();
      });
    }
  }

  protected etiquetaJornada(j: { nombre: string; dia: string; estado: string }): string {
    const d = j.dia
      ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(j.dia + 'T12:00:00Z')).replace('.', '')
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
