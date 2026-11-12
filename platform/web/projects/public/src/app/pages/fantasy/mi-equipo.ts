import { RouterLink } from '@angular/router';
/**
 * fantasy/mi-equipo.ts — /fantasy y /fantasy/salas/:id/equipo (Figma «72 · /fantasy» · Mi equipo): mi alineación en
 * mi sala del día (exactamente 5 atletas, sin suplentes), la nota media, el valor del equipo y el saldo.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { FantasyStore, Juegos, JuegosEnVivo, JuegosEstado, type AtletaDetalle, type AtletaMercado, mensajeError, nota2 } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { HojaJugador, PistaFutsal, type AtletaPista } from './pista';
import { JuegosNav } from '../porra/componentes';
import { AvisoConexion, BarraSala, FantasyCabecera, GrAviso, SinSala, colorNota } from './componentes';

@Component({
  selector: 'gr-mi-equipo-page',
  imports: [RouterLink, Page, GrButton, GrIcon, GrSkeleton, AvisoConexion, BarraSala, FantasyCabecera, GrAviso, HojaJugador, JuegosNav, PistaFutsal, SinSala],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Fantasy · Mi equipo" [juego]="true">
      <gr-fantasy-cabecera titulo="GRS Fantasy · Mi equipo" [migas]="['Mi equipo']"
        descripcion="Tu alineación de fútbol sala: exactamente 5 atletas, sin suplentes. Cada atleta tiene una nota de 0,0 a 10,0 y tu nota es la media de los 5." />
      <gr-juegos-nav juego="fantasy" activa="equipo" />

      @if (sala(); as s) {
        <gr-barra-sala [salaId]="s.id" [nombre]="s.nombre" [estado]="s.estado" [miembros]="store.clas()?.filas.length ?? 0" [plazas]="s.plazas ?? 0" activa="equipo" />
      }
      @if (vivo.caida()) { <gr-aviso-conexion /> }
      @if (error()) {
        <gr-aviso tono="error" titulo="No hemos podido completar la operación">{{ error() }}</gr-aviso>
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
          <p class="max-w-md text-body-s text-text-tertiary">Entra con tu cuenta del directo, únete a una sala y ficha a tus 5 atletas con 1.000.000 de monedas fantasy.</p>
          <button grButton variant="primary" icon="user-plus" (click)="entrar()">Entrar para jugar</button>
        </div>
      } @else if (store.cargandoEquipo() && !equipo()) {
        <gr-skeleton class="block aspect-[358/500] rounded-2xl lg:aspect-[680/760] lg:max-w-[680px]" />
      } @else if (!sala()) {
        <gr-sin-sala />
      } @else {
        <div class="grid gap-5 lg:grid-cols-[minmax(0,680px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <!-- Móvil: marcador compacto (nota media y saldo); el resto, en «ver más» -->
          <section class="rounded-lg border border-line-subtle bg-bg-card lg:hidden" aria-label="Tu jornada">
            <div class="flex items-center gap-2 py-3 pr-2 pl-4">
              <p class="min-w-0 flex-1"><span class="block text-mono-xs text-text-tertiary">Nota media</span><span class="block font-mono text-[20px] leading-tight font-bold tabular-nums" [class]="kpis()[0].color">{{ kpis()[0].valor }}</span></p>
              <p class="min-w-0 flex-1"><span class="block text-mono-xs text-text-tertiary">Saldo</span><span class="block truncate font-mono text-[20px] leading-tight font-bold text-info tabular-nums">{{ kpis()[2].valor }}</span></p>
              <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-bg-raised text-text-secondary" [attr.aria-expanded]="verMas()" aria-controls="mas-kpis"
                [attr.aria-label]="verMas() ? 'Ver menos' : 'Ver puesto y valor del equipo'" (click)="verMas.set(!verMas())">
                <gr-icon name="chevron-down" [size]="18" class="transition-transform motion-reduce:transition-none" [class.rotate-180]="verMas()" />
              </button>
            </div>
            @if (verMas()) {
              <dl id="mas-kpis" class="grid grid-cols-2 gap-3 border-t border-line-subtle px-4 py-3">
                <div><dt class="text-mono-xs text-text-tertiary">Tu puesto</dt><dd class="font-mono text-[18px] font-bold text-accent-text">{{ kpis()[1].valor }}</dd><dd class="text-body-xs text-text-tertiary">{{ kpis()[1].nota }}</dd></div>
                <div><dt class="text-mono-xs text-text-tertiary">Valor del equipo</dt><dd class="font-mono text-[18px] font-bold text-text-primary">{{ kpis()[3].valor }}</dd><dd class="text-body-xs text-text-tertiary">{{ kpis()[3].nota }}</dd></div>
              </dl>
            }
          </section>

          <!-- Figma «Pista · fútbol sala»: los 5 atletas en rombo -->
          <section class="min-w-0" aria-labelledby="pista-titulo">
            <div class="mb-3 flex items-end justify-between gap-3">
              <h2 id="pista-titulo" class="text-display-xs">Alineación · {{ atletas().length }}/{{ plazas() }}</h2>
              <p class="hidden text-body-xs text-text-tertiary sm:block">Toca un jugador para ver su ficha</p>
            </div>
            <gr-pista-futsal [titulares]="atletas()" [mercado]="rutaMercado()" (abrir)="abrirJugador($event.atleta, $event.origen)" />
          </section>

          <aside class="flex min-w-0 flex-col gap-4 lg:pt-10">
            <section class="hidden rounded-lg border border-line-subtle bg-bg-card p-5 lg:block" aria-labelledby="jornada-titulo">
              <h2 id="jornada-titulo" class="text-display-2xs">Tu jornada {{ jornadaTxt() }}</h2>
              <dl class="mt-4 grid grid-cols-2 gap-4">
                @for (k of kpis(); track k.label) {
                  <div class="flex min-w-0 flex-col gap-1"><dt class="text-mono-xs text-text-tertiary">{{ k.label }}</dt><dd class="truncate font-mono text-[26px] leading-[1.3] font-bold tabular-nums" [class]="k.color">{{ k.valor }}</dd><dd class="truncate text-body-xs text-text-tertiary">{{ k.nota }}</dd></div>
                }
              </dl>
            </section>

            <section class="flex flex-col gap-3 rounded-lg border border-accent/45 bg-accent-deep/25 p-5">
              @if (plazasLibres() > 0) {
                <p class="text-label-m text-text-primary">Te quedan {{ plazasLibres() }} {{ plazasLibres() === 1 ? 'plaza' : 'plazas' }} y {{ monedas(saldo() ?? 0) }} monedas</p>
                <p class="text-body-s text-text-secondary">Ficha libres a su valor o paga un clausulazo al dueño.</p>
              } @else {
                <p class="text-label-m text-text-primary">Alineación completa · te quedan {{ monedas(saldo() ?? 0) }} monedas</p>
                <p class="text-body-s text-text-secondary">Vende a un atleta para liberar plaza o paga un clausulazo para cambiarlo.</p>
              }
                <a grButton variant="primary" [routerLink]="rutaMercado()" iconRight="arrow-right" class="w-full lg:w-auto lg:self-start">Ir al mercado</a>
            </section>

            <p class="text-body-xs text-text-tertiary">Toca un jugador para ver su ficha o venderlo. Las posiciones son solo visuales.</p>
          </aside>
        </div>
      }
    </gr-page>

    @if (seleccionado(); as a) {
      <gr-hoja-jugador [atleta]="a" [detalle]="detalleHoja()" [delta]="delta(a)" [serie]="serieDe(a)" [nulo]="estado.nulo()" [cargando]="operando()" [error]="error()"
        (cerrar)="cerrarJugador()" (vender)="accion(a)" />
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
  /** Mi sala del día (sin ella no hay alineación). */
  protected readonly sala = computed(() => this.equipo()?.sala ?? null);
  protected readonly saldo = computed(() => this.equipo()?.saldo ?? null);
  protected readonly atletas = computed<AtletaPista[]>(() => this.equipo()?.atletas ?? []);
  protected readonly plazas = computed(() => this.equipo()?.alineacion || this.estado.plantillaMax());
  protected readonly plazasLibres = computed(() => Math.max(0, this.plazas() - this.atletas().length));
  protected readonly rutaMercado = computed(() => (this.sala() ? `/fantasy/salas/${this.sala()!.id}/mercado` : '/fantasy/mercado'));
  protected readonly seleccionado = computed<AtletaPista | null>(() => this.atletas().find((a) => a.atletaId === this.idHoja()) ?? null);
  protected readonly detalleHoja = computed(() => {
    const id = this.idHoja();
    const cargado = this.detalleCargado();
    return id && cargado && (!cargado.atleta || cargado.atleta.atletaId === id) ? cargado : null;
  });
  /** El marcador (Figma «Marcador»): nota media, puesto, saldo y valor del equipo. */
  protected readonly kpis = computed(() => {
    const e = this.equipo();
    const c = this.store.clas();
    const puesto = c?.miPuesto ?? 0;
    return [
      { label: 'Nota media', valor: e ? nota2(e.nota) : '—', color: e ? colorNota(e.nota, e.conNota > 0) : 'text-text-tertiary', nota: e ? `${e.conNota}/${this.plazas()} con nota` : '' },
      { label: 'Tu puesto', valor: puesto > 0 ? puesto + '.º' : '—', color: 'text-accent-text', nota: c?.filas.length ? `de ${c.filas.length} ${c.filas.length === 1 ? 'jugador' : 'jugadores'}` : '' },
      { label: 'Saldo fantasy', valor: e ? monedas(e.saldo) : '—', color: 'text-info', nota: this.jugandoCaption() },
      { label: 'Valor del equipo', valor: e ? monedas(e.valor) : '—', color: 'text-text-primary', nota: e ? `${e.atletas.length} ${e.atletas.length === 1 ? 'atleta' : 'atletas'} · ${this.plazasLibres() ? 'alineación incompleta' : 'alineación completa'}` : '' },
    ];
  });
  protected readonly jornadaTxt = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? '· ' + j.nombre.replace(/\s*\(.*\)$/, '') : '';
  });
  protected readonly jugandoCaption = computed(() => {
    const j = this.store.jornada() ?? this.estado.jornada();
    return j ? 'jugando ' + j.nombre.replace(/\s*\(.*\)$/, '') : 'jugando';
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    this.store.salaPedida.set('');
    void inject(PendingTasks).run(async () => {
      await this.estado.cargar();
      await this.store.cargar();
      await applySeo(cms, seo, '/fantasy', 'GRS Fantasy · GR Strength Cup', 'Ficha atletas con monedas virtuales en la GR Strength Cup: salas entre amigos, 5 atletas por alineación, cláusulas en vivo y una nota de 0 a 10 por rendimiento.');
    });
    if (browser) {
      this.vivo.conectar();
      void this.fan.cargar().then(async () => {
        await this.store.cargarEquipo();
        void this.store.cargarClasificacion();
        void this.estado.cargarCartera();
      });
      // Las notas y los fichajes cambian en vivo: se recarga la alineación sin esqueleto.
      effect(() => {
        this.vivo.versionNotas();
        this.vivo.versionSalas();
        this.vivo.version();
        untracked(() => this.recargar());
      });
      inject(DestroyRef).onDestroy(() => {
        clearTimeout(this.temporizador);
        this.vivo.desconectar();
      });
    }
  }

  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private primera = true;
  /** Recarga con un margen de 800 ms (varios eventos seguidos = una sola petición). */
  private recargar(): void {
    if (this.primera) {
      this.primera = false;
      return;
    }
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      if (!this.fan.conSesion()) return;
      void this.store.cargarEquipo();
      void this.store.cargarClasificacion();
    }, 800);
  }

  protected entrar(): void {
    this.fan.abrirAcceso('fantasy', '/fantasy');
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
  /** Vender desde la hoja: si sale bien, la hoja se cierra; si no, el error queda arriba y la hoja abierta. */
  protected async accion(a: AtletaMercado): Promise<void> {
    if (!this.fan.conSesion()) return this.entrar();
    this.operando.set(true);
    this.error.set(null);
    try {
      await this.juegos.fantasyVender(a.atletaId, this.estado.jornadaActual());
      await this.store.cargarEquipo();
      await this.store.cargarClasificacion();
      await this.estado.cargarCartera();
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
    } finally {
      this.operando.set(false);
    }
    if (!this.error()) this.cerrarJugador();
  }
}
