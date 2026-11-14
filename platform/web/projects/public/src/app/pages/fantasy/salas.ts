/**
 * fantasy/salas.ts — /fantasy/salas (Figma «81 · /fantasy/salas» · Lobby): las salas del día en tiempo real, con
 * buscador por nombre, filtro por estado, favoritas, quién va ganando (con su alineación en un popover), solicitar
 * unirse (el anfitrión aprueba) y crear sala.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon } from '@grcup/ui';
import { Cms } from '../../core/cms';
import { FanSession, codigoError } from '../../core/fan';
import { Juegos, JuegosEnVivo, JuegosEstado, mensajeError, nota2, recargaAgrupada, type Lobby, type SalaVista } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { GrSelector, JuegosNav, iniciales, type OpcionSelector } from '../porra/componentes';
import { FantasyCabecera, GrAviso, badgeSala } from './componentes';
import { CrearSalaModal, PopoverAlineacion, TarjetaEstado } from './salas-ui';

type Filtro = 'todas' | 'abiertas' | 'en_juego' | 'cerradas';
const FAVORITAS = 'grcup.fantasy.salas.favoritas';
/** ST3-R6-3: salas públicas por página del lobby (el backend limita a 200). */
const PAGINA_SALAS = 30;
const ABIERTA = new Set(['esperando', 'lista', 'llena']);
const CERRADA = new Set(['cerrada', 'cancelada', 'finalizada']);

@Component({
  selector: 'gr-salas-page',
  imports: [Page, FormsModule, GrButton, GrIcon, CrearSalaModal, FantasyCabecera, GrAviso, GrSelector, JuegosNav, PopoverAlineacion, TarjetaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Fantasy · Salas" [juego]="true">
      <gr-fantasy-cabecera titulo="GRS Fantasy · Salas" [migas]="['Salas']" descripcion="Solicita unirte a una sala o crea la tuya. Mínimo 2 jugadores, máximo según atletas del día." />
      <div class="flex flex-col gap-4 md:gap-6">
        <gr-juegos-nav juego="fantasy" activa="salas" />

        @if (vivo.caida()) {
          <gr-aviso tono="aviso" titulo="Sin conexión en tiempo real">Reconectando… las salas pueden estar desactualizadas.</gr-aviso>
        }
        @if (lobby(); as l) {
          @if (l.puedeCrear) {
            <gr-aviso [titulo]="'Hoy hay ' + l.atletas + ' atletas · máx. ' + l.plazasMax + ' jugadores por sala'">{{ l.atletas }} ÷ 5 = {{ l.plazasMax }} plazas (cada jugador alinea 5 atletas; tope 10, mínimo 2). El anfitrión decide quién entra.</gr-aviso>
          }
        }
        @if (error(); as e) {
          <gr-aviso tono="error" [titulo]="e.titulo">{{ e.texto }}</gr-aviso>
        }

        @if (misSolicitudes().length || maximo()) {
          <section id="mis-solicitudes" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Mis solicitudes">
            @if (maximo()) {
              <gr-tarjeta-estado tono="aviso" icono="circle-alert" titulo="Máximo de solicitudes alcanzado">Ya tienes {{ lobby()?.solicitudesMax ?? 3 }} solicitudes pendientes. Cancela una para solicitar otra sala.</gr-tarjeta-estado>
            }
            @for (s of misSolicitudes(); track s.id) {
              @switch (s.miSolicitud) {
                @case ('pendiente') {
                  <gr-tarjeta-estado icono="hourglass" [titulo]="'Solicitud enviada a @' + s.anfitrion" [meta]="'Pendiente · ' + (lobby()?.solicitudesPendientes ?? 1) + ' de ' + (lobby()?.solicitudesMax ?? 3) + ' solicitudes máximas'">
                    Te avisamos aquí cuando responda. Caduca al empezar el día. Si te aceptan en una sala, las demás solicitudes se cancelan.
                    <button acciones type="button" grButton variant="outline" [block]="true" [loading]="operando() === s.id" (click)="cancelar(s)">Cancelar solicitud</button>
                  </gr-tarjeta-estado>
                }
                @case ('aceptada') {
                  <gr-tarjeta-estado tono="exito" icono="circle-check" titulo="¡Solicitud aceptada!">&#64;{{ s.anfitrion }} te ha aceptado en «{{ s.nombre }}». Ya puedes alinear tus 5 atletas.
                    <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas/' + s.id">Ir a la sala</a>
                  </gr-tarjeta-estado>
                }
                @case ('rechazada') {
                  <gr-tarjeta-estado tono="error" icono="x" titulo="Solicitud rechazada">El anfitrión no ha aceptado tu solicitud a «{{ s.nombre }}». No puedes volver a solicitar esta sala hoy.</gr-tarjeta-estado>
                }
                @case ('sala_llena') {
                  <gr-tarjeta-estado tono="aviso" icono="users" titulo="La sala se llenó mientras esperabas">«{{ s.nombre }}» alcanzó {{ s.plazas }}/{{ s.plazas }} y tu solicitud se canceló automáticamente.</gr-tarjeta-estado>
                }
                @case ('caducada') {
                  <gr-tarjeta-estado tono="aviso" icono="clock" titulo="Tu solicitud ha caducado">«{{ s.nombre }}» empezó sin que el anfitrión respondiera.
                    <a acciones grButton variant="primary" [block]="true" href="/fantasy/palmares">Ver palmarés de hoy</a>
                  </gr-tarjeta-estado>
                }
              }
            }
          </section>
        }

        <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <label class="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-md border bg-bg-field px-4 focus-within:border-line-accent" [class]="q() ? 'border-line-accent' : 'border-line-strong'">
            <gr-icon name="search" [size]="20" class="shrink-0 text-text-muted" />
            <span class="sr-only">Buscar sala por nombre</span>
            <input type="search" class="min-w-0 flex-1 bg-transparent text-body-m text-text-primary outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden" placeholder="Buscar sala por nombre…" autocomplete="off"
              [ngModel]="q()" (ngModelChange)="buscar($event)" />
            @if (q()) { <button type="button" class="-mr-3 flex size-11 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary" aria-label="Borrar búsqueda" (click)="buscar('')"><gr-icon name="x" [size]="20" /></button> }
          </label>
          <button type="button" grButton variant="primary" class="w-full md:w-auto" (click)="abrirCrear()">Crear sala</button>
        </div>

        <gr-selector class="md:hidden" etiqueta="Estado" [opciones]="opcionesFiltro()" [valor]="filtro()" (elegir)="filtro.set($any($event))" />
        <div class="hidden flex-wrap items-center gap-2 md:flex" role="group" aria-label="Estado de la sala">
          @for (o of opcionesFiltro(); track o.v) {
            <button type="button" class="inline-flex h-[35px] items-center rounded-pill border px-4 text-label-s text-text-primary" [class]="o.v === filtro() ? 'border-accent bg-accent' : 'border-line-subtle bg-bg-surface'" [attr.aria-pressed]="o.v === filtro()" (click)="filtro.set($any(o.v))">{{ o.l }}</button>
          }
        </div>

        @if (cargando()) {
          <div class="flex flex-col gap-3" aria-busy="true" aria-label="Cargando salas">
            @for (i of [1, 2, 3]; track i) {
              <div class="flex items-center gap-4 rounded-lg border border-line-subtle bg-bg-card p-4 motion-safe:animate-pulse">
                <span class="flex flex-1 flex-col gap-2"><span class="h-4 w-60 max-w-full rounded-xs bg-bg-raised"></span><span class="h-3 w-36 rounded-xs bg-bg-raised"></span></span>
                <span class="hidden h-2.5 w-36 rounded-xs bg-bg-raised md:block"></span><span class="hidden h-6 w-24 rounded-xs bg-bg-raised md:block"></span>
                <span class="hidden h-7 w-40 rounded-xs bg-bg-raised lg:block"></span><span class="h-10 w-28 rounded-xs bg-bg-raised"></span>
              </div>
            }
          </div>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" titulo="No se pudo cargar el listado de salas">Comprueba tu conexión e inténtalo de nuevo.</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">Reintentar</button>
        } @else if (!visibles().length) {
          <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-8 text-center">
            <gr-icon [name]="q() ? 'search' : 'users'" [size]="32" class="text-text-secondary" />
            <p class="text-ui-h5 text-text-primary">{{ q() ? 'Sin resultados para «' + q() + '»' : salas().length ? 'No hay salas con ese estado' : 'Aún no hay salas publicadas hoy' }}</p>
            <p class="text-body-s text-text-secondary">{{ q() ? 'No hay salas con ese nombre hoy. Prueba con otro nombre o crea una sala nueva.' : salas().length ? 'Cambia el filtro para ver el resto de salas.' : 'Crea la primera y comparte el enlace. Necesitas al menos 2 jugadores para empezar.' }}</p>
            <button type="button" grButton variant="primary" (click)="abrirCrear()">Crear sala</button>
          </div>
        } @else {
          <div class="flex flex-col gap-3" [class.opacity-55]="vivo.caida()">
            <p class="hidden items-center gap-6 px-5 text-mono-xs text-text-muted xl:flex" aria-hidden="true">
              <span class="min-w-0 flex-1">Sala</span><span class="w-40">Jugadores</span><span class="w-[190px]">Estado</span><span class="w-[260px]">Va ganando (media)</span><span class="w-[180px]"></span><span class="w-11"></span>
            </p>
            <ul class="flex flex-col gap-3" aria-live="polite">
              @for (s of visibles(); track s.id) {
                <li class="relative flex flex-col gap-3 rounded-lg border p-4 xl:flex-row xl:items-center xl:gap-6 xl:px-5" [class]="s.esMia ? 'border-line-accent bg-bg-raised' : 'border-line-subtle bg-bg-card'">
                  <div class="flex min-w-0 items-center gap-2 xl:flex-1">
                    <p class="flex min-w-0 flex-1 flex-col gap-1">
                      <a [href]="'/fantasy/salas/' + s.id" class="truncate text-ui-h5 text-text-primary hover:underline underline-offset-4">{{ s.nombre }}</a>
                      <span class="flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="user" [size]="16" class="shrink-0" /><span class="truncate">Anfitrión &#64;{{ s.anfitrion }}{{ s.esMia ? ' · tu sala' : '' }}</span></span>
                    </p>
                    <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full xl:hidden" [class]="favoritas().has(s.id) ? 'text-warning' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="favoritas().has(s.id)" [attr.aria-label]="(favoritas().has(s.id) ? 'Quitar de favoritas: ' : 'Marcar como favorita: ') + s.nombre" (click)="favorita(s)">
                      <gr-icon name="star" [size]="20" />
                    </button>
                  </div>
                  <p class="flex flex-col gap-1.5 xl:w-40">
                    <span class="flex items-center gap-2"><span class="text-mono-s text-text-primary tabular-nums">{{ s.miembros }}/{{ s.plazas }}</span><span class="text-mono-xs text-text-muted">jugadores</span></span>
                    <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-field" aria-hidden="true"><span class="block h-full rounded-pill" [class]="s.plazas - s.miembros <= 1 && s.estado !== 'en_juego' ? 'bg-warning' : 'bg-accent'" [style.width.%]="s.plazas ? (s.miembros / s.plazas) * 100 : 0"></span></span>
                  </p>
                  <p class="flex flex-wrap items-center gap-2 xl:w-[190px] xl:flex-col xl:items-start xl:gap-1">
                    <span class="inline-flex h-7 items-center rounded-pill border px-3 text-label-xs" [class]="badge(s).clase">{{ badge(s).txt }}</span>
                    @if (s.miSolicitud === 'pendiente') { <span class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border border-warning bg-warning/12 px-2.5 text-label-xs text-warning">Solicitud pendiente</span> }
                  </p>
                  <div class="relative flex min-h-[17px] items-center xl:w-[260px]">
                    @if (s.lider; as l) {
                      <button type="button" class="flex min-h-11 min-w-0 items-center gap-3 rounded-md text-left" aria-haspopup="dialog" [attr.aria-expanded]="popover() === s.id" [attr.aria-label]="'Va ganando @' + l.alias + ' con media ' + n2(l.nota) + '. Ver su alineación'"
                        (click)="alternarPopover(s.id, $event)" (mouseenter)="hover(s.id)" (mouseleave)="hover(null)">
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(l.alias) }}</span>
                        <span class="flex min-w-0 flex-col gap-0.5">
                          <span class="truncate text-label-s text-text-primary">&#64;{{ l.alias }}</span>
                          <span class="truncate text-mono-xs text-accent-text">Media {{ n2(l.nota) }} · {{ cerrada(s) ? 'ganó' : 'va ganando' }}</span>
                        </span>
                        <gr-icon name="eye" [size]="16" class="shrink-0 text-text-tertiary" />
                      </button>
                      @if (popover() === s.id) {
                        <gr-popover-alineacion [fila]="l" [sala]="s.nombre" [final]="cerrada(s)" [verSala]="'/fantasy/salas/' + s.id" (cerrar)="cerrarPopover()" />
                      }
                    } @else {
                      <span class="text-body-xs text-text-muted">Sin clasificar todavía</span>
                    }
                  </div>
                  <div class="xl:w-[180px]">
                    @switch (accion(s)) {
                      @case ('solicitar') { <button type="button" grButton variant="primary" [block]="true" [loading]="operando() === s.id" (click)="solicitar(s)">Solicitar unirse</button> }
                      @case ('cancelar') { <button type="button" grButton variant="outline" [block]="true" [loading]="operando() === s.id" (click)="cancelar(s)">Cancelar solicitud</button> }
                      @case ('palmares') { <a grButton variant="outline" [block]="true" href="/fantasy/palmares">Ver palmarés</a> }
                      @default { <a grButton variant="outline" [block]="true" [href]="'/fantasy/salas/' + s.id">Ver sala</a> }
                    }
                  </div>
                  <button type="button" class="hidden size-11 shrink-0 items-center justify-center rounded-full xl:flex" [class]="favoritas().has(s.id) ? 'text-warning' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="favoritas().has(s.id)" [attr.aria-label]="(favoritas().has(s.id) ? 'Quitar de favoritas: ' : 'Marcar como favorita: ') + s.nombre" (click)="favorita(s)">
                    <gr-icon name="star" [size]="20" />
                  </button>
                </li>
              }
            </ul>
          </div>
        }
        @if (!cargando() && !errorCarga() && lobby()?.hayMas) {
          <button type="button" grButton variant="outline" class="self-center" [loading]="cargandoMas()" (click)="verMas()">Ver más salas</button>
        }
      </div>
    </gr-page>

    @if (crear()) {
      <gr-crear-sala-modal [atletas]="lobby()?.atletas ?? 0" [plazasMax]="lobby()?.plazasMax ?? 0" [puedeCrear]="lobby()?.puedeCrear ?? false" [alias]="fan.yo()?.alias ?? ''"
        (cerrar)="crear.set(false)" (hecho)="creada($event)" />
    }
  `,
})
export class SalasPage {
  protected readonly n2 = nota2;
  private readonly juegos = inject(Juegos);
  private readonly estado = inject(JuegosEstado);
  private readonly router = inject(Router);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly lobby = signal<Lobby | null>(null);
  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal(false);
  protected readonly error = signal<{ titulo: string; texto: string } | null>(null);
  protected readonly maximo = signal(false);
  protected readonly q = signal('');
  /** ST3-R6-3: salas públicas pedidas; «Ver más salas» suma otra página. */
  protected readonly limite = signal(PAGINA_SALAS);
  protected readonly cargandoMas = signal(false);
  protected readonly filtro = signal<Filtro>('todas');
  protected readonly operando = signal<string | null>(null);
  protected readonly crear = signal(false);
  protected readonly popover = signal<string | null>(null);
  protected readonly favoritas = signal<Set<string>>(new Set());
  private origenPopover: HTMLElement | null = null;
  private esperaHover: ReturnType<typeof setTimeout> | undefined;
  private esperaBusqueda: ReturnType<typeof setTimeout> | undefined;
  /** ST3-R1-3: 800 ms de margen y como mucho una recarga cada 3 s. */
  private readonly agrupada = recargaAgrupada(() => void this.recargar());

  protected readonly salas = computed(() => this.lobby()?.salas ?? []);
  /** Las favoritas y mi sala van primero; dentro, el orden del servidor. */
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const fav = this.favoritas();
    const peso = (s: SalaVista) => (s.esMia ? 0 : fav.has(s.id) ? 1 : 2);
    return this.salas()
      .filter((s) => f === 'todas' || (f === 'abiertas' && ABIERTA.has(s.estado)) || (f === 'en_juego' && s.estado === 'en_juego') || (f === 'cerradas' && CERRADA.has(s.estado)))
      .map((s, i) => ({ s, i }))
      .sort((a, b) => peso(a.s) - peso(b.s) || a.i - b.i)
      .map((x) => x.s);
  });
  protected readonly opcionesFiltro = computed<OpcionSelector[]>(() => {
    const l = this.salas();
    // con más páginas por cargar los recuentos son mínimos: «30+»
    const mas = this.lobby()?.hayMas ? '+' : '';
    return [
      { v: 'todas', l: `Todas · ${l.length}${mas}` },
      { v: 'abiertas', l: `Abiertas · ${l.filter((s) => ABIERTA.has(s.estado)).length}${mas}` },
      { v: 'en_juego', l: `En juego · ${l.filter((s) => s.estado === 'en_juego').length}${mas}` },
      { v: 'cerradas', l: `Cerradas · ${l.filter((s) => CERRADA.has(s.estado)).length}${mas}` },
    ];
  });
  /** Las salas con una solicitud mía que tiene algo que contar (pendiente, aceptada, rechazada…). */
  protected readonly misSolicitudes = computed(() => this.salas().filter((s) => s.miSolicitud && s.miSolicitud !== 'cancelada' && s.miSolicitud !== 'expulsada' && !(s.miSolicitud === 'aceptada' && s.esMia)));

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.cargar();
      await applySeo(cms, seo, '/fantasy/salas', 'Salas de GRS Fantasy · GR Strength Cup', 'Las salas de GRS Fantasy en directo: crea la tuya, invita a tus amigos o solicita unirte, y mira quién va ganando en cada una.');
    });
    if (this.browser) {
      try {
        this.favoritas.set(new Set(JSON.parse(localStorage.getItem(FAVORITAS) ?? '[]') as string[]));
      } catch {
        /* sin favoritas guardadas */
      }
      this.vivo.conectar();
      void this.fan.cargar().then((f) => f && this.recargar());
      // Salas, solicitudes, notas y fichajes cambian en vivo: se recarga el lobby agrupando los eventos seguidos.
      let primera = true;
      effect(() => {
        const l = this.lobby();
        if (l?.jornada) untracked(() => this.vivo.enfocar(l.jornada!.id, l.miSala ?? ''));
      });
      effect(() => {
        this.vivo.versionSalas();
        this.vivo.versionNotas();
        this.vivo.version();
        untracked(() => {
          if (primera) return void (primera = false);
          this.agrupada.pedir();
        });
      });
      inject(DestroyRef).onDestroy(() => {
        this.agrupada.cancelar();
        clearTimeout(this.esperaHover);
        clearTimeout(this.esperaBusqueda);
        this.vivo.desconectar();
      });
    }
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    await this.recargar();
    this.cargando.set(false);
  }
  /** Recarga sin esqueleto. Sin jornada activa (404) el lobby queda vacío, no en error. */
  private async recargar(): Promise<void> {
    try {
      this.lobby.set(await this.juegos.salas(this.q().trim() || undefined, this.estado.jornadaActual(), this.limite()));
      this.errorCarga.set(false);
    } catch (e) {
      if (codigoError(e) === 'HTTP_404' || /NOT_FOUND|SIN_JORNADA/.test(codigoError(e))) this.lobby.set({ salas: [], atletas: 0, plazasMax: 0, puedeCrear: false, empezada: false, solicitudesMax: 3, solicitudesPendientes: 0 });
      else if (!this.lobby()) this.errorCarga.set(true);
    }
  }

  protected buscar(q: string): void {
    this.q.set(q);
    this.limite.set(PAGINA_SALAS);
    clearTimeout(this.esperaBusqueda);
    this.esperaBusqueda = setTimeout(() => void this.recargar(), 300);
  }
  protected async verMas(): Promise<void> {
    this.limite.update((n) => Math.min(n + PAGINA_SALAS, 200));
    this.cargandoMas.set(true);
    await this.recargar();
    this.cargandoMas.set(false);
  }
  protected badge(s: SalaVista) {
    return badgeSala(s.estado === 'lista' ? 'abierta' : s.estado, s.miembros, s.plazas);
  }
  protected cerrada(s: SalaVista): boolean {
    return CERRADA.has(s.estado);
  }
  protected ini(alias: string): string {
    return iniciales(alias);
  }
  protected accion(s: SalaVista): 'solicitar' | 'cancelar' | 'ver' | 'palmares' {
    if (s.esMia) return 'ver';
    if (this.cerrada(s)) return s.estado === 'finalizada' ? 'palmares' : 'ver';
    if (s.miSolicitud === 'pendiente') return 'cancelar';
    const abierta = s.estado === 'esperando' || s.estado === 'lista';
    return abierta && !this.lobby()?.miSala && !this.lobby()?.empezada && s.miSolicitud !== 'rechazada' && s.miSolicitud !== 'expulsada' ? 'solicitar' : 'ver';
  }

  protected async solicitar(s: SalaVista): Promise<void> {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', '/fantasy/salas');
    this.operando.set(s.id);
    this.error.set(null);
    this.maximo.set(false);
    try {
      await this.juegos.solicitar(s.id);
      await this.recargar();
    } catch (e) {
      const c = codigoError(e);
      if (c === 'MAX_SOLICITUDES') this.maximo.set(true);
      else this.error.set({ titulo: 'No se pudo enviar la solicitud', texto: mensajeError(e) });
      if (c.startsWith('SESION_FAN')) this.fan.sesionPerdida();
      await this.recargar();
    } finally {
      this.operando.set(null);
    }
  }
  protected async cancelar(s: SalaVista): Promise<void> {
    this.operando.set(s.id);
    this.error.set(null);
    try {
      await this.juegos.cancelarSolicitud(s.id);
      this.maximo.set(false);
    } catch (e) {
      this.error.set({ titulo: 'No se pudo cancelar la solicitud', texto: mensajeError(e) });
    } finally {
      await this.recargar();
      this.operando.set(null);
    }
  }

  protected abrirCrear(): void {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', '/fantasy/salas');
    this.crear.set(true);
  }
  protected creada(salaId: string): void {
    this.crear.set(false);
    void this.router.navigate(['/fantasy/salas', salaId]);
  }

  protected favorita(s: SalaVista): void {
    const copia = new Set(this.favoritas());
    if (!copia.delete(s.id)) copia.add(s.id);
    this.favoritas.set(copia);
    try {
      localStorage.setItem(FAVORITAS, JSON.stringify([...copia]));
    } catch {
      /* almacenamiento no disponible: la favorita dura lo que la página */
    }
  }

  /** El popover se abre al pulsar (ratón, teclado o táctil) o tras 200 ms con el puntero encima; con el foco no se abre solo, para no robarlo al tabular. */
  protected hover(id: string | null): void {
    clearTimeout(this.esperaHover);
    if (!id || this.popover() || !this.browser || !matchMedia('(hover: hover) and (min-width: 768px)').matches) return;
    this.esperaHover = setTimeout(() => this.popover.set(id), 200);
  }
  protected alternarPopover(id: string, e: Event): void {
    clearTimeout(this.esperaHover);
    this.origenPopover = e.currentTarget as HTMLElement;
    this.popover.set(this.popover() === id ? null : id);
  }
  protected cerrarPopover(): void {
    this.popover.set(null);
    const o = this.origenPopover;
    this.origenPopover = null;
    if (o?.isConnected) o.focus({ preventScroll: true });
  }
}
