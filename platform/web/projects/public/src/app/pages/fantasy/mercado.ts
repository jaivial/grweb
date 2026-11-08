/**
 * fantasy/mercado.ts — /fantasy/mercado (Figma «72 · /fantasy» · Mercado): el mercado de atletas con la cláusula
 * en vivo, los filtros, la plantilla de un vistazo, el feed de movimientos y el modal de clausulazo.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrEmpty, GrIcon, GrSelect, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { FantasyStore, Juegos, JuegosEnVivo, JuegosEstado, fusionaFichajes, type AtletaDetalle, type AtletaMercado, mensajeError, monedas } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AthleteSheet, ClausulazoModal, FeedRow, MarketRow } from './componentes';
import { AvisoJuegos, CoinBalance, GrupoChips } from '../porra/componentes';

type FiltroDueno = 'todos' | 'libres' | 'conDueno' | 'mios';
type FiltroSexo = 'todos' | 'F' | 'M';

@Component({
  selector: 'gr-mercado-fantasy-page',
  imports: [Page, FormsModule, GrAlert, GrEmpty, GrIcon, GrSelect, GrSkeleton, AthleteSheet, ClausulazoModal, CoinBalance, FeedRow, MarketRow, AvisoJuegos, GrupoChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Mercado" [suffix]="jornadaTxt()" crumb="Mercado" section="Juegos"
      subtitle="Libres al valor; clausulazo al dueño. Cláusula en vivo con cada veredicto.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo() ?? 0" moneda="fantasy" motivo="fantasy" />
      </div>

      @if (store.cargando()) {
        <div class="flex flex-col gap-3">
          @for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16 rounded-lg" /> }
        </div>
      } @else if (store.error(); as e) {
        <gr-alert tone="warning" title="No hemos podido cargar el mercado">{{ e }}</gr-alert>
      } @else {
        <!-- Filtros (en móvil, una fila con scroll horizontal por grupo) -->
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <gr-grupo-chips class="min-w-0 flex-1" [opciones]="filtros" [valor]="filtro()" (valorChange)="filtro.set($event)" />
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <gr-grupo-chips class="min-w-0 flex-1" [opciones]="sexos" [valor]="filtroSexo()" (valorChange)="filtroSexo.set($event)" />
            <gr-select class="self-start" tipo="filtro" tam="l" aria-label="Categoría" etiqueta="Categoría" [ngModel]="filtroCategoria()" (ngModelChange)="filtroCategoria.set($event)">
              <option value="">Todas</option>
              @for (c of categorias(); track c) { <option [value]="c">{{ c.replace('-', '−') }} kg</option> }
            </gr-select>
          </div>
        </div>
        <p class="mt-3 text-body-xs text-text-tertiary">{{ atletas().length }} atletas en juego · cláusulas actualizadas hace {{ segundos() }} s</p>

        <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            @if (!visibles().length) {
              <gr-empty icon="users" title="No hay atletas con estos filtros" text="Cambia de filtros o espera a que se generen los atletas de la jornada." />
            } @else {
              <!-- Cabecera de la tabla (escritorio) -->
              <p class="mb-2 hidden items-center gap-3 pl-12 text-mono-xs text-text-tertiary uppercase lg:flex">
                <span class="flex-1">Atleta</span>
                <span class="w-14">Tendencia</span>
                <span class="w-20 text-right">Cláusula</span>
                <span class="w-28">Dueño</span>
                <span class="w-32 text-right">Acción</span>
              </p>
              <ul class="flex flex-col gap-2">
                @for (a of visibles(); track a.atletaId) {
                  <li>
                    <gr-market-row [atleta]="a" [serie]="serie(a)" [delta]="delta(a)" [accion]="accion(a)" [restante]="restante(a)"
                      (fichar)="fichar(a)" (clausulazo)="abrirClausulazo(a)" (vender)="vender(a)" (ficha)="verFicha(a)" />
                  </li>
                }
              </ul>
            }
            <p class="mt-5 flex items-start gap-2 text-body-xs text-text-tertiary">
              <gr-icon name="info" [size]="16" class="mt-0.5 shrink-0 text-info" />
              Clausulazo: pagas la cláusula y el dinero va al dueño anterior. Máximo 3 clausulazos por usuario y jornada; sin deuda: no se puede dejar el saldo en negativo.
            </p>
            <gr-aviso-juegos class="mt-4" />
          </div>

          <!-- La columna de la derecha del diseño -->
          <aside class="hidden flex-col gap-4 lg:flex">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
              <p class="text-label-xs text-accent-text uppercase">Mi plantilla</p>
              <p class="mt-2 flex items-baseline justify-between gap-2 text-label-s">
                <span>Fichados</span>
                <span class="font-mono text-text-tertiary">{{ fichados() }}/{{ plantillaMax() }}</span>
              </p>
              <p class="mt-1 text-body-xs text-text-tertiary">{{ descripcionPlantilla() }}</p>
              <span class="mt-3 block h-1.5 w-full overflow-hidden rounded-pill bg-bg-raised">
                <span class="block h-full rounded-pill bg-accent" [style.width.%]="porcentajePlantilla()"></span>
              </span>
              <p class="mt-4 flex items-center justify-between gap-2 text-body-xs">
                <span class="text-text-tertiary">Saldo fantasy</span>
                <span class="font-mono text-accent-text">{{ saldo() !== null ? monedas(saldo()!) : '—' }}</span>
              </p>
              <p class="mt-1 flex items-center justify-between gap-2 text-body-xs">
                <span class="text-text-tertiary">Gastado en fichajes</span>
                <span class="font-mono text-text-primary">{{ gastado() !== null ? monedas(gastado()!) : '—' }}</span>
              </p>
              <p class="mt-1 flex items-center justify-between gap-2 text-body-xs">
                <span class="text-text-tertiary">Clausulazos usados</span>
                <span class="font-mono text-text-primary">{{ clausulazosUsados() !== null ? clausulazosUsados() + ' de ' + maxClausulazos() : '—' }}</span>
              </p>
            </section>

            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
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
          </aside>
        </div>

        @if (error()) {
          <gr-alert class="mt-6" tone="danger" title="No hemos podido completar la operación">{{ error() }}</gr-alert>
        }
      }
    </gr-page>

    @if (clausulazo(); as a) {
      <gr-clausulazo-modal [atleta]="a" [saldo]="saldo() ?? 0" [cargando]="enviando()" [error]="errorClausulazo()"
        [clausulazosUsados]="clausulazosUsados() ?? 0" [maxClausulazos]="maxClausulazos()" [proteccionMin]="proteccionMin()"
        (cerrar)="cerrarClausulazo()" (pagar)="pagarClausulazo()" />
    }
    @if (ficha(); as f) {
      <gr-athlete-sheet [detalle]="f" [fichajes]="fichajesDe(f.atleta?.atletaId ?? '')" (cerrar)="cerrarFicha()" />
    }
  `,
})
export class MercadoFantasyPage {
  protected readonly monedas = monedas;
  protected readonly store = inject(FantasyStore);
  protected readonly estado = inject(JuegosEstado);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly juegos = inject(Juegos);

  protected readonly filtro = signal<FiltroDueno>('todos');
  protected readonly filtroSexo = signal<FiltroSexo>('todos');
  protected readonly filtroCategoria = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly errorClausulazo = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly clausulazo = signal<AtletaMercado | null>(null);
  protected readonly ficha = signal<AtletaDetalle | null>(null);
  protected readonly ahora = signal(Date.now());

  protected readonly filtros: { v: FiltroDueno; l: string; n: () => number }[] = [
    { v: 'todos', l: 'Todos', n: () => this.atletas().length },
    { v: 'libres', l: 'Libres', n: () => this.atletas().filter((a) => a.libre).length },
    { v: 'conDueno', l: 'Con dueño', n: () => this.atletas().filter((a) => !a.libre).length },
    { v: 'mios', l: 'Míos', n: () => this.atletas().filter((a) => a.esMio).length },
  ];
  protected readonly sexos: { v: FiltroSexo; l: string }[] = [
    { v: 'todos', l: 'Ambos sexos' },
    { v: 'F', l: 'Femenino' },
    { v: 'M', l: 'Masculino' },
  ];

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
    if (!e) return 'Sin plantilla todavía';
    return `${e.atletas.length} de 8 huecos · ${e.titulares} titulares + ${e.atletas.length - e.titulares} suplentes`;
  });
  protected readonly clausulazosUsados = computed<number | null>(() => (this.equipo() ? this.equipo()!.clausulazos : null));
  protected readonly categorias = computed(() => [...new Set(this.atletas().map((a) => a.categoria))].sort());
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const s = this.filtroSexo();
    const c = this.filtroCategoria();
    return this.atletas().filter(
      (a) =>
        (f === 'todos' || (f === 'libres' && a.libre) || (f === 'conDueno' && !a.libre) || (f === 'mios' && a.esMio)) &&
        (s === 'todos' || a.sexo === s) &&
        (!c || a.categoria === c),
    );
  });
  /** El feed: los fichajes cargados del API más los que llegan por SSE. */
  protected readonly feed = computed(() => fusionaFichajes(this.store.fichajes(), this.vivo.feed()));
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· ' + j.nombre.replace(/\s*\(.*\)$/, '') : '';
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/fantasy/mercado', 'Mercado de GRS Fantasy · GR Strength Cup', 'El mercado de atletas de GRS Fantasy: cláusulas en vivo, fichajes y clausulazos.');
    });
    if (browser) {
      this.vivo.conectar();
      void this.fan.cargar().then(() => {
        void this.store.cargarEquipo();
        void this.estado.cargarCartera();
      });
      void this.store.cargarFichajes();
      const t = setInterval(() => this.ahora.set(Date.now()), 1000);
      inject(DestroyRef).onDestroy(() => {
        clearInterval(t);
        this.vivo.desconectar();
      });
    }
  }

  protected segundos(): number {
    const t = this.store.cargadoEn();
    if (!t) return 0;
    return Math.max(0, Math.round((this.ahora() - t) / 1000));
  }
  protected serie(a: AtletaMercado): number[] {
    return this.vivo.series().get(a.atletaId) ?? [a.clausula];
  }
  protected delta(a: AtletaMercado): number {
    return this.vivo.clausulas().get(a.atletaId)?.pct ?? 0;
  }
  protected accion(a: AtletaMercado): 'fichar' | 'clausulazo' | 'vender' | 'protegido' {
    if (a.esMio) return 'vender';
    if (a.libre) return 'fichar';
    const r = this.restante(a);
    if (r === null ? a.protegido : r > 0) return 'protegido';
    return 'clausulazo';
  }

  /** Los segundos que le quedan de protección (null si el backend no envía `protegidoHasta`). */
  protected restante(a: AtletaMercado): number | null {
    if (!a.protegidoHasta) return null;
    const ms = new Date(a.protegidoHasta).getTime() - this.ahora();
    return ms > 0 ? Math.round(ms / 1000) : 0;
  }
  protected nombre(atletaId: string): string {
    return this.atletas().find((a) => a.atletaId === atletaId)?.nombre ?? 'el atleta';
  }
  protected fichajesDe(atletaId: string) {
    return fusionaFichajes(this.store.fichajesAtleta().filter((f) => f.atletaId === atletaId), this.vivo.feed());
  }

  protected async verFicha(a: AtletaMercado): Promise<void> {
    await Promise.all([this.store.cargarDetalle(a.atletaId), this.store.cargarFichajes(a.atletaId)]);
    this.ficha.set(this.store.detalle());
  }
  protected cerrarFicha(): void {
    this.ficha.set(null);
  }

  protected async fichar(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy');
    this.error.set(null);
    try {
      await this.juegos.fantasyComprar(a.atletaId, this.estado.jornadaActual());
      await this.trasOperacion();
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    }
  }
  protected async vender(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy');
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
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy');
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
