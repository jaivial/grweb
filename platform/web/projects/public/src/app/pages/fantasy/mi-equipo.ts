/**
 * fantasy/mi-equipo.ts — /fantasy (Figma «72 · /fantasy» · Mi equipo): la plantilla con 5 titulares y hasta 3
 * suplentes, el valor del equipo, los puntos de la jornada y los cambios de alineación.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrAlert, GrButton, GrEmpty, GrIcon, GrKpi, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { FantasyStore, Juegos, JuegosEnVivo, JuegosEstado, fusionaFichajes, type AtletaDetalle, type AtletaMercado, mensajeError, monedas } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { AthleteCard, AthleteSheet } from './componentes';
import { AvisoJuegos } from '../porra/componentes';

@Component({
  selector: 'gr-mi-equipo-page',
  imports: [Page, GrAlert, GrButton, GrEmpty, GrIcon, GrKpi, GrSkeleton, AthleteCard, AthleteSheet, AvisoJuegos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Fantasy" accent="" [suffix]="jornadaTxt()" crumb="Mi equipo" section="Juegos"
      subtitle="Fichas con monedas virtuales, cláusulas en vivo y puntos por rendimiento. Tu plantilla: 5 titulares y hasta 3 suplentes.">
      @if (error()) {
        <gr-alert class="mt-4 mb-6" tone="danger" title="No hemos podido completar la operación">{{ error() }}</gr-alert>
      }

      @if (store.cargando()) {
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          @for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-28 rounded-lg" /> }
        </div>
      } @else {
        <!-- Los cuatro indicadores del diseño -->
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <gr-kpi label="Saldo fantasy" [value]="saldo() !== null ? monedas(saldo()!) : '—'" [caption]="jugandoCaption()" />
          <gr-kpi label="Valor del equipo" [value]="valor() !== null ? monedas(valor()!) : '—'" [caption]="plantillaCaption()" />
          <gr-kpi label="Puntos de la jornada" [value]="puntos() !== null ? (puntos()! >= 0 ? '+' + puntos() : '' + puntos()) : '—'" [caption]="puntosCaption()" />
          <gr-kpi label="Tu puesto" [value]="puesto() !== null ? puesto()! + '.º' : '—'" [caption]="puestoCaption()" />
        </div>

        @if (!fan.conSesion()) {
          <gr-empty class="mt-8" icon="lock" title="Entra para montar tu equipo" text="Necesitas tu cuenta de directo para fichar atletas y puntuar.">
            <button grButton variant="primary" (click)="entrar()">Entrar</button>
          </gr-empty>
        } @else {
          <p class="mt-6 flex items-start gap-2 text-body-xs text-text-tertiary">
            <gr-icon name="triangle-alert" [size]="16" class="mt-0.5 shrink-0 text-warning" />
            El flight en curso bloquea al atleta: nadie puede meter de titular solo a quien está levantando ahora.
          </p>

          <section class="mt-6">
            <h2 class="text-display-2xs">Alineación · 5 titulares</h2>
            @if (store.cargandoEquipo()) {
              <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                @for (i of [1, 2, 3, 4, 5]; track i) { <gr-skeleton class="h-56 rounded-lg" /> }
              </div>
            } @else {
              <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                @for (a of titulares(); track a.atletaId) {
                  <gr-athlete-card [atleta]="a" [delta]="delta(a)" [intentos]="intentos(a)" (vender)="vender(a)" (subir)="bajar(a)" (ficha)="verFicha(a)" />
                } @empty {
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-subtle bg-bg-card/40 p-6 text-center">
                      <gr-icon name="plus" [size]="20" class="text-text-muted" />
                      <p class="text-label-s text-text-secondary">Hueco libre</p>
                      <p class="text-body-xs text-text-tertiary">Fichar desde el mercado</p>
                      <a grButton variant="secondary" href="/fantasy/mercado">Fichar del mercado →</a>
                    </div>
                  }
                }
              </div>
            }
          </section>

          <section class="mt-10">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-display-2xs">Suplentes · hasta 3</h2>
              <p class="text-body-xs text-text-tertiary">No puntúan salvo que suban a titulares</p>
            </div>
            <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              @for (a of suplentes(); track a.atletaId) {
                <gr-athlete-card [atleta]="a" [delta]="delta(a)" [intentos]="'Suplente: no puntúa'" (vender)="vender(a)" (subir)="subir(a)" (ficha)="verFicha(a)" />
              }
              @for (i of huecosArray(); track i) {
                <div class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-subtle bg-bg-card/40 p-6 text-center">
                  <gr-icon name="plus" [size]="20" class="text-text-muted" />
                  <p class="text-label-s text-text-secondary">Hueco libre</p>
                  <p class="text-body-xs text-text-tertiary">Los suplentes puntúan solo si suben a titulares</p>
                  <a grButton variant="secondary" href="/fantasy/mercado">Fichar del mercado →</a>
                </div>
              }
            </div>
          </section>

          <p class="mt-8 flex items-start gap-2 rounded-md border border-line-subtle bg-bg-card px-4 py-3 text-body-xs text-text-tertiary">
            <gr-icon name="info" [size]="16" class="mt-0.5 shrink-0 text-info" />
            Vender devuelve el 100 % del valor actual al mercado. Cambios titular ↔ suplente en cualquier momento, salvo flight en curso. La cláusula arranca en 200.000 y se mueve con cada veredicto (válido +5 %, nulo −4 %, blanqueo −30 %).
          </p>
          <gr-aviso-juegos class="mt-4" />
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
  /** Los huecos libres que quedan en la plantilla (para pintar los huecos). */
  protected readonly huecosArray = computed(() => Array.from({ length: this.huecos() }, (_, i) => i));
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
