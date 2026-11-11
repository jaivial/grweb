import { RouterLink } from '@angular/router';
/**
 * fantasy/mi-equipo.ts — /fantasy (Figma «72 · /fantasy» · Mi equipo): la plantilla con 5 titulares y hasta 3
 * suplentes, el valor del equipo, los puntos de la jornada y los cambios de alineación.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { FantasyStore, Juegos, JuegosEnVivo, JuegosEstado, type AtletaDetalle, type AtletaMercado, mensajeError } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { HojaJugador, JugadorPista, PistaFutsal, type AtletaPista } from './pista';
import { JuegosNav } from '../porra/componentes';

@Component({
  selector: 'gr-mi-equipo-page',
  imports: [RouterLink, Page, GrAlert, GrButton, GrIcon, GrSkeleton, HojaJugador, JugadorPista, JuegosNav, PistaFutsal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Fantasy" accent="" [suffix]="jornadaTxt()" crumb="Mi equipo" section="Juegos"
      subtitle="Tu alineación de fútbol sala: 5 titulares en la pista y hasta 3 en el banquillo. Puntúan los titulares en el momento del veredicto.">
      <gr-juegos-nav class="mb-6 md:mb-8" juego="fantasy" activa="equipo" />

      @if (error()) {
        <gr-alert class="mb-6" tone="danger" title="No hemos podido completar la operación">{{ error() }}</gr-alert>
      }

      @if (store.cargando()) {
        <div class="grid gap-6 lg:grid-cols-[minmax(0,680px)_minmax(0,1fr)]" aria-busy="true">
          <gr-skeleton class="aspect-[358/500] rounded-2xl lg:aspect-[680/760]" />
          <gr-skeleton class="hidden h-64 rounded-lg lg:block" />
        </div>
      } @else if (!fan.conSesion()) {
        <div class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-bg-card/40 px-6 py-14 text-center">
          <span class="flex size-14 items-center justify-center rounded-full border border-info/50 bg-info/12 text-info"><gr-icon name="users" [size]="24" /></span>
          <p class="text-display-xs">Monta tu equipo</p>
          <p class="max-w-md text-body-s text-text-tertiary">Entra con tu cuenta del directo: 1.000.000 de monedas fantasy por jornada para fichar a 5 titulares y puntuar lo que levantan.</p>
          <button grButton variant="primary" icon="user-plus" (click)="entrar()">Entrar para jugar</button>
        </div>
      } @else {
        <div class="grid gap-5 lg:grid-cols-[minmax(0,680px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <!-- Móvil: marcador compacto (puntos y saldo); el resto, en «ver más» -->
          <section class="rounded-lg border border-line-subtle bg-bg-card lg:hidden" aria-label="Tu jornada">
            <div class="flex items-center gap-2 py-3 pr-2 pl-4">
              <p class="min-w-0 flex-1"><span class="block text-mono-xs text-text-tertiary">Puntos</span><span class="block font-mono text-[20px] leading-tight font-bold text-success tabular-nums">{{ kpis()[2].valor }}</span></p>
              <p class="min-w-0 flex-1"><span class="block text-mono-xs text-text-tertiary">Saldo</span><span class="block truncate font-mono text-[20px] leading-tight font-bold text-info tabular-nums">{{ kpis()[0].valor }}</span></p>
              <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-bg-raised text-text-secondary" [attr.aria-expanded]="verMas()" aria-controls="mas-kpis"
                [attr.aria-label]="verMas() ? 'Ver menos' : 'Ver puesto y valor del equipo'" (click)="verMas.set(!verMas())">
                <gr-icon name="chevron-down" [size]="18" class="transition-transform motion-reduce:transition-none" [class.rotate-180]="verMas()" />
              </button>
            </div>
            @if (verMas()) {
              <dl id="mas-kpis" class="grid grid-cols-2 gap-3 border-t border-line-subtle px-4 py-3">
                <div><dt class="text-mono-xs text-text-tertiary">Tu puesto</dt><dd class="font-mono text-[18px] font-bold text-accent-text">{{ kpis()[3].valor }}</dd><dd class="text-body-xs text-text-tertiary">{{ kpis()[3].nota }}</dd></div>
                <div><dt class="text-mono-xs text-text-tertiary">Valor del equipo</dt><dd class="font-mono text-[18px] font-bold text-text-primary">{{ kpis()[1].valor }}</dd><dd class="text-body-xs text-text-tertiary">{{ kpis()[1].nota }}</dd></div>
              </dl>
            }
          </section>

          <!-- Figma «Pista · fútbol sala»: los 5 titulares en rombo -->
          <section class="min-w-0" aria-labelledby="pista-titulo">
            <div class="mb-3 flex items-end justify-between gap-3">
              <h2 id="pista-titulo" class="text-display-xs">Alineación · {{ titulares().length }}/5</h2>
              <p class="hidden text-body-xs text-text-tertiary sm:block">Toca un jugador para ver su ficha</p>
            </div>
            @if (store.cargandoEquipo() && !equipo()) {
              <gr-skeleton class="block aspect-[358/500] rounded-2xl lg:aspect-[680/760]" />
            } @else {
              <gr-pista-futsal [titulares]="titulares()" [puntosDe]="puntosDe" (abrir)="abrirJugador($event.atleta, $event.origen)" />
            }
          </section>

          <aside class="flex min-w-0 flex-col gap-4 lg:pt-[42px]">
            <section class="hidden rounded-lg border border-line-subtle bg-bg-card p-5 lg:block" aria-labelledby="jornada-titulo">
              <h2 id="jornada-titulo" class="text-display-2xs">Tu jornada {{ jornadaTxt() }}</h2>
              <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
                @for (k of kpisEscritorio(); track k.label) {
                  <div class="min-w-0"><dt class="text-mono-xs text-text-tertiary">{{ k.label }}</dt><dd class="truncate font-mono text-[26px] leading-tight font-bold tabular-nums" [class]="k.color">{{ k.valor }}</dd><dd class="truncate text-body-xs text-text-tertiary">{{ k.nota }}</dd></div>
                }
              </dl>
            </section>

            <section class="rounded-lg border border-line-subtle bg-bg-card p-4 lg:p-5" aria-labelledby="banquillo-titulo">
              <div class="flex items-center justify-between gap-2">
                <h2 id="banquillo-titulo" class="text-display-2xs">Banquillo · {{ suplentes().length }}/3</h2>
                <p class="text-body-xs text-text-tertiary">No puntúan salvo que suban</p>
              </div>
              <ul class="mt-4 grid grid-cols-3 justify-items-center gap-2">
                @for (a of suplentes(); track a.atletaId) {
                  <li><gr-jugador-pista [atleta]="a" tamano="m" (abrir)="abrirJugador(a, $event)" /></li>
                }
                @for (i of huecosBanquillo(); track i) {
                  <li>
                    <a routerLink="/fantasy/mercado" class="group flex w-[6.5rem] flex-col items-center gap-2.5 rounded-lg p-1 lg:w-[7.5rem]" aria-label="Hueco libre del banquillo: fichar en el mercado">
                      <span class="flex size-16 items-center justify-center rounded-full border-[1.5px] border-dashed border-line-strong text-text-tertiary transition-colors group-hover:border-text-muted group-hover:text-text-primary"><gr-icon name="plus" [size]="22" /></span>
                      <span class="text-[12px] font-semibold text-text-tertiary">Fichar</span>
                    </a>
                  </li>
                }
              </ul>
            </section>

            @if (plazasLibres() > 0) {
              <section class="flex flex-col gap-3 rounded-lg border border-accent/45 bg-accent-deep/25 p-4 lg:p-5">
                <p class="text-label-m text-text-primary">Te quedan {{ plazasLibres() }} {{ plazasLibres() === 1 ? 'plaza' : 'plazas' }} y {{ monedas(saldo() ?? 0) }} monedas</p>
                <p class="hidden text-body-s text-text-secondary lg:block">Ficha libres a su valor o paga un clausulazo al dueño.</p>
                <a grButton variant="primary" routerLink="/fantasy/mercado" iconRight="arrow-right" class="w-full lg:w-auto lg:self-start">Ir al mercado</a>
              </section>
            }

            <p class="flex items-start gap-2 text-body-xs text-text-tertiary">
              <gr-icon name="info" [size]="15" class="mt-px shrink-0 text-info" />
              Las posiciones son solo visuales. Vender devuelve el 100 % del valor actual; la cláusula se mueve con cada veredicto (válido +5 %, nulo −4 %, blanqueo −30 %).
            </p>
          </aside>
        </div>
      }
    </gr-page>

    @if (seleccionado(); as a) {
      <gr-hoja-jugador [atleta]="a" [detalle]="detalleHoja()" [delta]="delta(a)" [serie]="serieDe(a)" [saleAlBanquillo]="saleAlBanquillo()" [cargando]="operando()" [error]="error()"
        (cerrar)="cerrarJugador()" (vender)="accion('vender', a)" (banquillo)="accion('bajar', a)" (subir)="accion('subir', a)" />
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
  /** El atleta de la hoja inferior (por id: si se vende, la hoja se cierra sola). */
  protected readonly idHoja = signal<string | null>(null);
  protected readonly detalleCargado = signal<AtletaDetalle | null>(null);
  protected readonly operando = signal(false);
  protected readonly verMas = signal(false);
  /** El elemento que abrió la hoja, para devolverle el foco al cerrar. */
  private origenHoja: HTMLElement | null = null;

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
  protected readonly seleccionado = computed<AtletaPista | null>(() => (this.equipo()?.atletas ?? []).find((a) => a.atletaId === this.idHoja()) ?? null);
  protected readonly detalleHoja = computed(() => {
    const id = this.idHoja();
    if (!id) return null;
    const cargado = this.detalleCargado();
    return cargado && (!cargado.atleta || cargado.atleta.atletaId === id) ? cargado : (this.store.detalles().get(id) ?? null);
  });
  /** Con los 5 titulares, «Subir a titular» manda al banquillo al último (la lógica de subir()). */
  protected readonly saleAlBanquillo = computed(() => (this.titulares().length >= 5 ? this.titulares()[4].nombre : ''));
  /** Los KPI del lateral en escritorio: puntos y puesto arriba, saldo y valor abajo. */
  protected readonly kpisEscritorio = computed(() => {
    const k = this.kpis();
    return [k[2], k[3], k[0], k[1]];
  });
  /** Los puntos de la jornada de un titular (null mientras no se ha cargado su ficha). */
  protected readonly puntosDe = (a: AtletaPista): number | null => {
    const d = this.store.detalles().get(a.atletaId);
    return d ? d.puntos.reduce((s, p) => s + p.puntos, 0) : null;
  };
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
  /** La serie de la cláusula para la minigráfica: lo que llega en vivo o, si no, el historial de la ficha. */
  protected serieDe(a: AtletaMercado): number[] {
    const vivo = this.vivo.series().get(a.atletaId);
    if (vivo && vivo.length > 1) return vivo;
    const h = this.detalleHoja()?.clausulas ?? [];
    return [...h].reverse().map((c) => c.clausula);
  }

  protected abrirJugador(a: AtletaMercado, origen?: Event): void {
    this.origenHoja = (origen?.currentTarget as HTMLElement | null) ?? null;
    this.error.set(null);
    this.detalleCargado.set(null);
    this.idHoja.set(a.atletaId);
    void this.store.cargarDetalle(a.atletaId).then(() => {
      if (this.idHoja() === a.atletaId) this.detalleCargado.set(this.store.detalle());
    });
  }
  protected cerrarJugador(): void {
    this.idHoja.set(null);
    const o = this.origenHoja;
    this.origenHoja = null;
    if (o?.isConnected) o.focus();
  }
  /** Las acciones de la hoja: si salen bien, la hoja se cierra; si no, el error queda arriba y la hoja abierta. */
  protected async accion(tipo: 'vender' | 'bajar' | 'subir', a: AtletaMercado): Promise<void> {
    this.operando.set(true);
    try {
      if (tipo === 'vender') await this.vender(a);
      else if (tipo === 'bajar') await this.bajar(a);
      else await this.subir(a);
    } finally {
      this.operando.set(false);
    }
    if (!this.error()) this.cerrarJugador();
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
