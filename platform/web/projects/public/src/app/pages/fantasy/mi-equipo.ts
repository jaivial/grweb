/**
 * fantasy/mi-equipo.ts — /fantasy (Figma «72 · /fantasy» · Mi equipo): la plantilla con 5 titulares y hasta 3
 * suplentes, el valor del equipo, los puntos de la jornada y los cambios de alineación.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { FantasyStore, Juegos, JuegosEnVivo, JuegosEstado, fusionaFichajes, type AtletaDetalle, type AtletaMercado, mensajeError, monedas } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AthleteCard, AthleteSheet } from './componentes';
import { CoinBalance, JuegosNav } from '../porra/componentes';

@Component({
  selector: 'gr-mi-equipo-page',
  imports: [Page, GrAlert, GrButton, GrIcon, GrSkeleton, AthleteCard, AthleteSheet, CoinBalance, JuegosNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Fantasy" accent="" [suffix]="jornadaTxt()" crumb="Mi equipo" section="Juegos"
      subtitle="Fichas con monedas virtuales, cláusulas en vivo y puntos por rendimiento. Tu plantilla: 5 titulares y hasta 3 suplentes.">
      <div pageStamps class="flex flex-wrap items-center gap-3">
        <gr-coin-balance [valor]="saldo() ?? 0" moneda="fantasy" motivo="fantasy" />
      </div>

      <gr-juegos-nav class="mb-6 md:mb-8" juego="fantasy" activa="equipo" />

      @if (error()) {
        <gr-alert class="mb-6" tone="danger" title="No hemos podido completar la operación">{{ error() }}</gr-alert>
      }

      @if (store.cargando()) {
        <div class="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-busy="true">
          @for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-24 rounded-lg" /> }
        </div>
      } @else {
        <!-- Marcador: los cuatro indicadores del diseño -->
        <dl class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          @for (k of kpis(); track k.label) {
            <div class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5">
              <dt class="text-mono-xs text-text-tertiary">{{ k.label }}</dt>
              <dd class="truncate font-mono text-[22px] leading-none font-bold tabular-nums md:text-[30px]" [class]="k.color">{{ k.valor }}</dd>
              <dd class="truncate text-body-xs text-text-tertiary">{{ k.nota }}</dd>
            </div>
          }
        </dl>

        @if (!fan.conSesion()) {
          <div class="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
            <span class="flex size-14 items-center justify-center rounded-full border border-info/50 bg-info/12 text-info"><gr-icon name="users" [size]="24" /></span>
            <p class="text-display-xs">Monta tu equipo</p>
            <p class="max-w-md text-body-s text-text-tertiary">Entra con tu cuenta del directo: 1.000.000 de monedas fantasy por jornada para fichar a 5 titulares y puntuar lo que levantan.</p>
            <button grButton variant="primary" icon="user-plus" (click)="entrar()">Entrar para jugar</button>
          </div>
        } @else {
          <!-- Figma «Pizarra»: la alineación como un tablero con la plataforma dibujada -->
          <section class="relative isolate mt-6 overflow-hidden rounded-2xl border border-line-strong bg-bg-surface px-3 py-5 sm:px-5 md:mt-8 md:p-8" aria-labelledby="pizarra-titulo">
            <span class="pointer-events-none absolute -top-48 left-1/2 -z-10 h-80 w-[min(1000px,140%)] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" aria-hidden="true"></span>
            <span class="pointer-events-none absolute inset-2 -z-10 rounded-[14px] border border-dashed border-line-strong/70 md:inset-3.5 md:rounded-[20px]" aria-hidden="true"></span>
            <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="pizarra-titulo" class="text-display-xs">Alineación · {{ titulares().length }}/5 titulares</h2>
              <p class="flex items-center gap-2 text-body-xs text-text-tertiary">
                <gr-icon name="lock" [size]="14" class="shrink-0 text-warning" />El flight en curso bloquea al atleta
              </p>
            </header>
            @if (store.cargandoEquipo()) {
              <div class="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5" aria-busy="true">
                @for (i of [1, 2, 3, 4, 5]; track i) { <gr-skeleton class="h-72 rounded-lg" /> }
              </div>
            } @else {
              <div class="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
                @for (a of titulares(); track a.atletaId) {
                  <gr-athlete-card [atleta]="a" [delta]="delta(a)" [intentos]="intentos(a)" (vender)="vender(a)" (subir)="bajar(a)" (ficha)="verFicha(a)" />
                }
                @for (i of huecosTitulares(); track i) {
                  <a href="/fantasy/mercado" class="group flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-line-strong bg-bg-card/35 p-4 text-center transition-colors hover:border-accent/60 hover:bg-accent-deep/15">
                    <span class="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-text-muted transition-colors group-hover:border-accent/60 group-hover:text-accent-text"><gr-icon name="plus" [size]="22" /></span>
                    <span class="text-label-s text-text-secondary">Titular {{ titulares().length + i + 1 }}</span>
                    <span class="text-body-xs text-text-tertiary">Ficha en el mercado</span>
                  </a>
                }
              </div>
            }

            <div class="mt-6 border-t border-dashed border-line-strong pt-5 md:mt-8 md:pt-6">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-display-2xs text-text-secondary">Banquillo · hasta 3</h2>
                <p class="text-body-xs text-text-tertiary">No puntúan salvo que suban a titulares</p>
              </div>
              <div class="mt-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
                @for (a of suplentes(); track a.atletaId) {
                  <gr-athlete-card [atleta]="a" [delta]="delta(a)" [intentos]="'—'" (vender)="vender(a)" (subir)="subir(a)" (ficha)="verFicha(a)" />
                }
                @for (i of huecosBanquillo(); track i) {
                  <a href="/fantasy/mercado" class="group flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-line-subtle bg-bg-card/25 p-4 text-center transition-colors hover:border-line-strong">
                    <span class="flex size-11 items-center justify-center rounded-full border border-dashed border-line-strong text-text-muted group-hover:text-text-secondary"><gr-icon name="plus" [size]="18" /></span>
                    <span class="text-body-xs text-text-tertiary">Hueco libre</span>
                  </a>
                }
              </div>
            </div>
            @if (plazasLibres() > 0) {
              <div class="mt-6 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-4">
                <p class="text-body-s text-text-secondary">Te quedan <b class="font-mono text-text-primary">{{ plazasLibres() }}</b> {{ plazasLibres() === 1 ? 'plaza' : 'plazas' }} y <b class="font-mono text-info">{{ monedas(saldo() ?? 0) }}</b> monedas</p>
                <a grButton variant="primary" href="/fantasy/mercado" iconRight="arrow-right">Ir al mercado</a>
              </div>
            }
          </section>

          <p class="mt-6 flex items-start gap-2 text-body-xs text-text-tertiary">
            <gr-icon name="info" [size]="15" class="mt-px shrink-0 text-info" />
            Vender devuelve el 100 % del valor actual al mercado. Cambios titular ↔ suplente en cualquier momento, salvo flight en curso. La cláusula arranca en 200.000 y se mueve con cada veredicto (válido +5 %, nulo −4 %, blanqueo −30 %).
          </p>
        }
      }
    </gr-page>

    @if (ficha(); as f) {
      <gr-athlete-sheet [detalle]="f" [fichajes]="fichajesDe(f.atleta?.atletaId ?? '')" (cerrar)="cerrarFicha()" />
    }
  `,
})
export class MiEquipoPage {
  protected readonly monedas = monedas;
  protected readonly store = inject(FantasyStore);
  protected readonly estado = inject(JuegosEstado);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly juegos = inject(Juegos);

  protected readonly error = signal<string | null>(null);
  protected readonly ficha = signal<AtletaDetalle | null>(null);

  protected readonly equipo = computed(() => this.store.equipo());
  protected readonly saldo = computed(() => this.equipo()?.saldo ?? null);
  protected readonly valor = computed(() => this.equipo()?.valor ?? null);
  /** Sin sesión no hay datos propios: los KPI muestran «—». */
  protected readonly puntos = computed<number | null>(() => (this.fan.conSesion() ? (this.store.clas()?.miPuntos ?? null) : null));
  protected readonly puesto = computed<number | null>(() => {
    if (!this.fan.conSesion()) return null;
    const p = this.store.clas()?.miPuesto ?? 0;
    return p > 0 ? p : null;
  });
  protected readonly titulares = computed(() => (this.equipo()?.atletas ?? []).filter((a) => a.titular));
  protected readonly suplentes = computed(() => (this.equipo()?.atletas ?? []).filter((a) => !a.titular));
  protected readonly huecos = computed(() => Math.max(0, 8 - (this.equipo()?.atletas.length ?? 0)));
  /** Los huecos de titular y de banquillo que quedan (para pintar las siluetas de la pizarra). */
  protected readonly huecosTitulares = computed(() => Array.from({ length: Math.max(0, 5 - this.titulares().length) }, (_, i) => i));
  protected readonly huecosBanquillo = computed(() => Array.from({ length: Math.max(0, 3 - this.suplentes().length) }, (_, i) => i));
  protected readonly plazasLibres = computed(() => this.huecos());
  /** El marcador (Figma «KPIs»): saldo, valor, puntos y puesto. */
  protected readonly kpis = computed(() => [
    { label: 'Saldo fantasy', valor: this.saldo() !== null ? monedas(this.saldo()!) : '—', color: 'text-info', nota: this.jugandoCaption() },
    { label: 'Valor del equipo', valor: this.valor() !== null ? monedas(this.valor()!) : '—', color: 'text-text-primary', nota: this.plantillaCaption() },
    { label: 'Puntos de la jornada', valor: this.puntos() !== null ? (this.puntos()! >= 0 ? '+' + this.puntos() : '' + this.puntos()) : '—', color: 'text-success', nota: this.puntosCaption() },
    { label: 'Tu puesto', valor: this.puesto() !== null ? this.puesto()! + '.º' : '—', color: 'text-accent-text', nota: this.puestoCaption() },
  ]);
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· ' + j.nombre.replace(/\s*\(.*\)$/, '') : '';
  });
  protected readonly jugandoCaption = computed(() => {
    if (!this.fan.conSesion()) return 'Entra para ver tu saldo';
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? 'jugando ' + j.nombre.replace(/\s*\(.*\)$/, '') : 'jugando';
  });
  protected readonly plantillaCaption = computed(() => {
    const e = this.equipo();
    if (!e) return this.fan.conSesion() ? 'Sin plantilla' : 'Entra para montar tu equipo';
    return `${e.titulares} titulares · ${e.atletas.length - e.titulares} suplente${e.atletas.length - e.titulares === 1 ? '' : 's'}`;
  });
  protected readonly puntosCaption = computed(() => {
    const c = this.store.clas();
    if (!this.fan.conSesion()) return 'Entra para ver tus puntos';
    if (!c || !c.miPuesto) return 'Suma de puntos de la jornada';
    return `Subes al ${c.miPuesto}.º`;
  });
  protected readonly puestoCaption = computed(() => {
    const c = this.store.clas();
    if (!this.fan.conSesion()) return 'Entra para ver tu puesto';
    if (!c) return 'Desempate: plantilla';
    return `Desempate: plantilla · ${c.top.length} jugadores`;
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await this.store.cargarClasificacion();
      await applySeo(cms, seo, '/fantasy', 'GRS Fantasy · GR Strength Cup', 'Ficha atletas con monedas virtuales en la GR Strength Cup: 5 titulares, hasta 3 suplentes, cláusulas en vivo y puntos por rendimiento.');
    });
    if (browser) {
      this.vivo.conectar();
      void this.fan.cargar().then(async () => {
        await this.store.cargarEquipo();
        await this.store.cargarDetalles(this.titulares().map((t) => t.atletaId));
        void this.store.cargarClasificacion();
        void this.estado.cargarCartera();
      });
      inject(DestroyRef).onDestroy(() => this.vivo.desconectar());
    }
  }

  protected entrar(): void {
    this.fan.abrirAcceso('fantasy');
  }
  protected delta(a: AtletaMercado): number {
    return this.vivo.clausulas().get(a.atletaId)?.pct ?? 0;
  }
  protected intentos(a: AtletaMercado): string {
    const d = this.store.detalles().get(a.atletaId);
    if (!d) return '—';
    const total = d.puntos.reduce((s, p) => s + p.puntos, 0);
    return `${total >= 0 ? '+' : ''}${total} pts`;
  }
  /** El historial de fichajes del atleta: los del API más los que llegan por SSE. */
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

  /** Sube un suplente a titular: el último titular pasa al banquillo. */
  protected async subir(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy');
    const actuales = this.titulares().map((t) => t.atletaId);
    const nuevos = actuales.length >= 5 ? [...actuales.slice(0, 4), a.atletaId] : [...actuales, a.atletaId];
    await this.alinear(nuevos);
  }

  /** Baja un titular al banquillo. */
  protected async bajar(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy');
    const nuevos = this.titulares().filter((t) => t.atletaId !== a.atletaId).map((t) => t.atletaId);
    await this.alinear(nuevos);
  }

  private async alinear(titulares: string[]): Promise<void> {
    this.error.set(null);
    try {
      await this.juegos.fantasyAlineacion(titulares, this.estado.jornadaActual());
      await this.trasOperacion();
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    }
  }

  private async trasOperacion(): Promise<void> {
    await this.store.cargarEquipo();
    await this.store.cargar();
    await this.store.cargarClasificacion();
    await this.estado.cargarCartera();
    await this.store.cargarDetalles(this.titulares().map((t) => t.atletaId));
  }
}
