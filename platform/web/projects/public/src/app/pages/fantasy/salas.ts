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
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { applySeo } from '../content';
import { GrSelector, JuegosNav, iniciales, type OpcionSelector } from '../porra/componentes';
import { FantasyCabecera, GrAviso, badgeSala } from './componentes';
import { CrearSalaModal, PopoverAlineacion, TarjetaEstado } from './salas-ui';

type Filtro = 'todas' | 'abiertas' | 'en_juego' | 'cerradas';
const FAVORITAS = 'grcup.fantasy.salas.favoritas';
/** ST3-R6-3: salas públicas por página del lobby (el backend limita a 200). */
const PAGINA_SALAS = 10;
const TOPE_SALAS = 200;
const ABIERTA = new Set(['esperando', 'lista', 'llena']);
const CERRADA = new Set(['cerrada', 'cancelada', 'finalizada']);

const T = {
  es: {
    titulo: 'GRS Fantasy · Salas',
    miga: 'Salas',
    desc: 'Solicita unirte a una sala o crea la tuya. Mínimo 2 jugadores, máximo según los atletas inscritos.',
    sinConexion: 'Sin conexión en tiempo real',
    reconectando: 'Reconectando… las salas pueden estar desactualizadas.',
    misSolicitudes: 'Mis solicitudes',
    maximo: 'Máximo de solicitudes alcanzado',
    maximoTxt: (n: number) => `Ya tienes ${n} solicitudes pendientes. Cancela una para solicitar otra sala.`,
    enviada: (a: string) => 'Solicitud enviada a @' + a,
    pendienteMeta: (a: number, b: number) => `Pendiente · ${a} de ${b} solicitudes máximas`,
    pendienteTxt: 'Te avisamos aquí cuando responda. Caduca al terminar la competición. Si te aceptan en una sala, las demás solicitudes se cancelan.',
    cancelarSolicitud: 'Cancelar solicitud',
    aceptada: '¡Solicitud aceptada!',
    aceptadaTxt: (a: string, n: string) => `@${a} te ha aceptado en «${n}». Ya puedes alinear tus 5 atletas.`,
    irSala: 'Ir a la sala',
    rechazada: 'Solicitud rechazada',
    rechazadaTxt: (n: string) => `El anfitrión no ha aceptado tu solicitud a «${n}». No puedes volver a solicitar esta sala hoy.`,
    llena: 'La sala se llenó mientras esperabas',
    llenaTxt: (n: string, p: number) => `«${n}» alcanzó ${p}/${p} y tu solicitud se canceló automáticamente.`,
    caducada: 'Tu solicitud ha caducado',
    caducadaTxt: (n: string) => `«${n}» empezó sin que el anfitrión respondiera.`,
    palmaresHoy: 'Ver palmarés de hoy',
    buscar: 'Buscar sala por nombre',
    buscarPh: 'Buscar sala por nombre…',
    borrar: 'Borrar búsqueda',
    crear: 'Crear sala',
    estado: 'Estado',
    estadoSala: 'Estado de la sala',
    cargandoSalas: 'Cargando salas',
    errorCarga: 'No se pudo cargar el listado de salas',
    errorCargaTxt: 'Comprueba tu conexión e inténtalo de nuevo.',
    reintentar: 'Reintentar',
    sinResultados: (q: string) => 'Sin resultados para «' + q + '»',
    sinEstado: 'No hay salas con ese estado',
    sinSalas: 'Aún no hay salas publicadas hoy',
    sinResultadosTxt: 'No hay salas con ese nombre hoy. Prueba con otro nombre o crea una sala nueva.',
    sinEstadoTxt: 'Cambia el filtro para ver el resto de salas.',
    sinSalasTxt: 'Crea la primera y comparte el enlace. Necesitas al menos 2 jugadores para empezar.',
    sala: 'Sala',
    jugadores: 'Jugadores',
    estadoCol: 'Estado',
    vaGanandoCol: 'Va ganando (media)',
    anfitrion: 'Anfitrión',
    tuSala: ' · tu sala',
    quitarFav: 'Quitar de favoritas: ',
    marcarFav: 'Marcar como favorita: ',
    jugadoresMin: 'jugadores',
    pendiente: 'Solicitud pendiente',
    vaGanandoAria: (a: string, m: string) => `Va ganando @${a} con media ${m}. Ver su alineación`,
    media: 'Media',
    gano: 'ganó',
    vaGanando: 'va ganando',
    sinClasificar: 'Sin clasificar todavía',
    solicitar: 'Solicitar unirse',
    verPalmares: 'Ver palmarés',
    verSala: 'Ver sala',
    verMas: 'Ver más salas',
    mostrando: (n: number) => `Mostrando las primeras ${n} salas. Busca o filtra para encontrar otras.`,
    filtros: { todas: 'Todas', abiertas: 'Abiertas', en_juego: 'En juego', cerradas: 'Cerradas' } as Record<Filtro, string>,
    toastEnviada: (a: string, p: number, m: number) => `Solicitud enviada a @${a} · ${p} de ${m} pendientes`,
    noEnviar: 'No se pudo enviar la solicitud',
    noCancelar: 'No se pudo cancelar la solicitud',
    seoTitulo: 'Salas de GRS Fantasy · GR Strength Cup',
    seoDesc: 'Las salas de GRS Fantasy en directo: crea la tuya, invita a tus amigos o solicita unirte, y mira quién va ganando en cada una.',
  },
  en: {
    titulo: 'GRS Fantasy · Leagues',
    miga: 'Leagues',
    desc: "Ask to join a league or create your own. Minimum 2 players, maximum depending on the registered athletes.",
    sinConexion: 'No real-time connection',
    reconectando: 'Reconnecting… the leagues may be out of date.',
    misSolicitudes: 'My requests',
    maximo: 'Request limit reached',
    maximoTxt: (n: number) => `You already have ${n} pending requests. Cancel one to request another league.`,
    enviada: (a: string) => 'Request sent to @' + a,
    pendienteMeta: (a: number, b: number) => `Pending · ${a} of ${b} maximum requests`,
    pendienteTxt: "We'll let you know here when they reply. It expires when the competition ends. If you're accepted into a league, your other requests are cancelled.",
    cancelarSolicitud: 'Cancel request',
    aceptada: 'Request accepted!',
    aceptadaTxt: (a: string, n: string) => `@${a} has accepted you into “${n}”. You can now field your 5 athletes.`,
    irSala: 'Go to the league',
    rechazada: 'Request declined',
    rechazadaTxt: (n: string) => `The host hasn't accepted your request to “${n}”. You can't request this league again today.`,
    llena: 'The league filled up while you were waiting',
    llenaTxt: (n: string, p: number) => `“${n}” reached ${p}/${p} and your request was cancelled automatically.`,
    caducada: 'Your request has expired',
    caducadaTxt: (n: string) => `“${n}” started without the host replying.`,
    palmaresHoy: "See today's honours",
    buscar: 'Search leagues by name',
    buscarPh: 'Search leagues by name…',
    borrar: 'Clear search',
    crear: 'Create league',
    estado: 'Status',
    estadoSala: 'League status',
    cargandoSalas: 'Loading leagues',
    errorCarga: "The list of leagues couldn't be loaded",
    errorCargaTxt: 'Check your connection and try again.',
    reintentar: 'Try again',
    sinResultados: (q: string) => 'No results for “' + q + '”',
    sinEstado: 'No leagues with that status',
    sinSalas: 'No leagues have been published today yet',
    sinResultadosTxt: 'There are no leagues with that name today. Try another name or create a new league.',
    sinEstadoTxt: 'Change the filter to see the other leagues.',
    sinSalasTxt: 'Create the first one and share the link. You need at least 2 players to start.',
    sala: 'League',
    jugadores: 'Players',
    estadoCol: 'Status',
    vaGanandoCol: 'Leading (average)',
    anfitrion: 'Host',
    tuSala: ' · your league',
    quitarFav: 'Remove from favourites: ',
    marcarFav: 'Mark as favourite: ',
    jugadoresMin: 'players',
    pendiente: 'Request pending',
    vaGanandoAria: (a: string, m: string) => `@${a} is leading with an average of ${m}. See their line-up`,
    media: 'Average',
    gano: 'won',
    vaGanando: 'leading',
    sinClasificar: 'No ranking yet',
    solicitar: 'Ask to join',
    verPalmares: 'See honours',
    verSala: 'See league',
    verMas: 'See more leagues',
    mostrando: (n: number) => `Showing the first ${n} leagues. Search or filter to find others.`,
    filtros: { todas: 'All', abiertas: 'Open', en_juego: 'In play', cerradas: 'Closed' } as Record<Filtro, string>,
    toastEnviada: (a: string, p: number, m: number) => `Request sent to @${a} · ${p} of ${m} pending`,
    noEnviar: "The request couldn't be sent",
    noCancelar: "The request couldn't be cancelled",
    seoTitulo: 'GRS Fantasy leagues · GR Strength Cup',
    seoDesc: 'Live GRS Fantasy leagues: create your own, invite your friends or ask to join, and see who is leading in each one.',
  },
};

@Component({
  selector: 'gr-salas-page',
  imports: [LocPipe, Page, FormsModule, GrButton, GrIcon, CrearSalaModal, FantasyCabecera, GrAviso, GrSelector, JuegosNav, PopoverAlineacion, TarjetaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [juego]="true">
      <gr-fantasy-cabecera [titulo]="t().titulo" [migas]="[t().miga]" [descripcion]="t().desc" />
      <div class="flex flex-col gap-4 md:gap-6">
        <gr-juegos-nav juego="fantasy" activa="salas" />

        @if (vivo.caida()) {
          <gr-aviso tono="aviso" [titulo]="t().sinConexion">{{ t().reconectando }}</gr-aviso>
        }
        @if (error(); as e) {
          <gr-aviso tono="error" [titulo]="e.titulo">{{ e.texto }}</gr-aviso>
        }

        @if (misSolicitudes().length || maximo()) {
          <section id="mis-solicitudes" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" [attr.aria-label]="t().misSolicitudes">
            @if (maximo()) {
              <gr-tarjeta-estado tono="aviso" icono="circle-alert" [titulo]="t().maximo">{{ t().maximoTxt(lobby()?.solicitudesMax ?? 3) }}</gr-tarjeta-estado>
            }
            @for (s of misSolicitudes(); track s.id) {
              @switch (s.miSolicitud) {
                @case ('pendiente') {
                  <gr-tarjeta-estado icono="hourglass" [titulo]="t().enviada(s.anfitrion)" [meta]="t().pendienteMeta(lobby()?.solicitudesPendientes ?? 1, lobby()?.solicitudesMax ?? 3)">
                    {{ t().pendienteTxt }}
                    <button acciones type="button" grButton variant="outline" [block]="true" [loading]="operando() === s.id" (click)="cancelar(s)">{{ t().cancelarSolicitud }}</button>
                  </gr-tarjeta-estado>
                }
                @case ('aceptada') {
                  <gr-tarjeta-estado tono="exito" icono="circle-check" [titulo]="t().aceptada">{{ t().aceptadaTxt(s.anfitrion, s.nombre) }}
                    <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas/' + s.id | loc">{{ t().irSala }}</a>
                  </gr-tarjeta-estado>
                }
                @case ('rechazada') {
                  <gr-tarjeta-estado tono="error" icono="x" [titulo]="t().rechazada">{{ t().rechazadaTxt(s.nombre) }}</gr-tarjeta-estado>
                }
                @case ('sala_llena') {
                  <gr-tarjeta-estado tono="aviso" icono="users" [titulo]="t().llena">{{ t().llenaTxt(s.nombre, s.plazas) }}</gr-tarjeta-estado>
                }
                @case ('caducada') {
                  <gr-tarjeta-estado tono="aviso" icono="clock" [titulo]="t().caducada">{{ t().caducadaTxt(s.nombre) }}
                    <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/palmares' | loc">{{ t().palmaresHoy }}</a>
                  </gr-tarjeta-estado>
                }
              }
            }
          </section>
        }

        <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <label class="flex h-12 min-w-0 shrink-0 items-center gap-3 rounded-md border bg-bg-field px-4 focus-within:border-line-accent md:flex-1" [class.border-line-accent]="!!q()" [class.border-line-strong]="!q()">
            <gr-icon name="search" [size]="20" class="shrink-0 text-text-tertiary" />
            <span class="sr-only">{{ t().buscar }}</span>
            <input type="search" class="min-w-0 flex-1 bg-transparent text-body-m text-text-primary outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden" [placeholder]="t().buscarPh" autocomplete="off" enterkeyhint="search" inputmode="search"
              [ngModel]="q()" (ngModelChange)="buscar($event)" />
            @if (q()) { <button type="button" class="-mr-3 flex size-11 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary" [attr.aria-label]="t().borrar" (click)="buscar('')"><gr-icon name="x" [size]="20" /></button> }
          </label>
          <div class="hidden md:block"><button type="button" grButton variant="primary" (click)="abrirCrear()">{{ t().crear }}</button></div>
        </div>
        <!-- UX6-R1-2: en móvil «Crear sala» siempre a mano, en la zona del pulgar -->
        <div class="h-20 md:hidden" aria-hidden="true"></div>
        <div class="fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-bg-base/95 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[10px] md:hidden">
          <button type="button" grButton variant="primary" [block]="true" size="l" (click)="abrirCrear()">{{ t().crear }}</button>
        </div>

        <gr-selector class="md:hidden" [etiqueta]="t().estado" [opciones]="opcionesFiltro()" [valor]="filtro()" (elegir)="filtro.set($any($event))" />
        <div class="hidden flex-wrap items-center gap-2 md:flex" role="group" [attr.aria-label]="t().estadoSala">
          @for (o of opcionesFiltro(); track o.v) {
            <button type="button" class="inline-flex h-[35px] items-center rounded-pill border px-4 text-label-s text-text-primary" [class]="o.v === filtro() ? 'border-accent bg-accent' : 'border-line-subtle bg-bg-surface'" [attr.aria-pressed]="o.v === filtro()" (click)="filtro.set($any(o.v))">{{ o.l }}</button>
          }
        </div>

        @if (cargando()) {
          <div class="flex flex-col gap-3" aria-busy="true" [attr.aria-label]="t().cargandoSalas">
            @for (i of [1, 2, 3]; track i) {
              <div class="flex items-center gap-4 rounded-lg border border-line-subtle bg-bg-card p-4 motion-safe:animate-pulse">
                <span class="flex flex-1 flex-col gap-2"><span class="h-4 w-60 max-w-full rounded-xs bg-bg-raised"></span><span class="h-3 w-36 rounded-xs bg-bg-raised"></span></span>
                <span class="hidden h-2.5 w-36 rounded-xs bg-bg-raised md:block"></span><span class="hidden h-6 w-24 rounded-xs bg-bg-raised md:block"></span>
                <span class="hidden h-7 w-40 rounded-xs bg-bg-raised lg:block"></span><span class="h-10 w-28 rounded-xs bg-bg-raised"></span>
              </div>
            }
          </div>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" [titulo]="t().errorCarga">{{ t().errorCargaTxt }}</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">{{ t().reintentar }}</button>
        } @else if (!visibles().length) {
          <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-8 text-center">
            <gr-icon [name]="q() ? 'search' : 'users'" [size]="32" class="text-text-secondary" />
            <p class="text-ui-h5 text-text-primary">{{ q() ? t().sinResultados(q()) : salas().length ? t().sinEstado : t().sinSalas }}</p>
            <p class="text-body-s text-text-secondary">{{ q() ? t().sinResultadosTxt : salas().length ? t().sinEstadoTxt : t().sinSalasTxt }}</p>
            <button type="button" grButton variant="primary" (click)="abrirCrear()">{{ t().crear }}</button>
          </div>
        } @else {
          <div class="flex flex-col gap-3" [class.opacity-55]="vivo.caida()">
            <p class="hidden items-center gap-6 px-5 text-meta text-text-tertiary xl:flex" aria-hidden="true">
              <span class="min-w-0 flex-1">{{ t().sala }}</span><span class="w-40">{{ t().jugadores }}</span><span class="w-[190px]">{{ t().estadoCol }}</span><span class="w-[260px]">{{ t().vaGanandoCol }}</span><span class="w-[180px]"></span><span class="w-11"></span>
            </p>
            <ul class="flex flex-col gap-3" aria-live="polite">
              @for (s of visibles(); track s.id) {
                <li class="relative flex flex-col gap-3 rounded-lg border p-4 xl:flex-row xl:items-center xl:gap-6 xl:px-5" [class]="s.esMia ? 'border-line-accent bg-bg-raised' : 'border-line-subtle bg-bg-card'">
                  <div class="flex min-w-0 items-center gap-2 xl:flex-1">
                    <p class="flex min-w-0 flex-1 flex-col gap-1">
                      <a [href]="'/fantasy/salas/' + s.id | loc" class="truncate text-ui-h5 text-text-primary hover:underline underline-offset-4">{{ s.nombre }}</a>
                      <span class="flex items-center gap-1.5 text-body-s text-text-tertiary"><gr-icon name="user" [size]="16" class="shrink-0" /><span class="truncate">{{ t().anfitrion }} &#64;{{ s.anfitrion }}{{ s.esMia ? t().tuSala : '' }}</span></span>
                    </p>
                    <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full xl:hidden" [class]="favoritas().has(s.id) ? 'text-warning' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="favoritas().has(s.id)" [attr.aria-label]="(favoritas().has(s.id) ? t().quitarFav : t().marcarFav) + s.nombre" (click)="favorita(s)">
                      <gr-icon name="star" [size]="20" />
                    </button>
                  </div>
                  <p class="flex flex-col gap-1.5 xl:w-40">
                    <span class="flex items-center gap-2"><span class="text-mono-s text-text-primary tabular-nums">{{ s.miembros }}/{{ s.plazas }}</span><span class="text-meta text-text-tertiary">{{ t().jugadoresMin }}</span></span>
                    <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-field" aria-hidden="true"><span class="block h-full rounded-pill" [class]="s.plazas - s.miembros <= 1 && s.estado !== 'en_juego' ? 'bg-warning' : 'bg-accent'" [style.width.%]="s.plazas ? (s.miembros / s.plazas) * 100 : 0"></span></span>
                  </p>
                  <p class="flex min-h-7 flex-nowrap items-center gap-2 xl:w-[190px] xl:flex-col xl:items-start xl:gap-1">
                    <span class="inline-flex h-7 shrink-0 items-center rounded-pill border px-3 text-label-s" [class]="badge(s).clase">{{ badge(s).txt }}</span>
                    @if (s.miSolicitud === 'pendiente') { <span class="inline-flex h-6 min-w-0 items-center gap-1.5 truncate rounded-pill border border-warning bg-warning/12 px-2.5 text-label-s text-warning">{{ t().pendiente }}</span> }
                  </p>
                  <div class="relative flex min-h-[17px] items-center xl:w-[260px]">
                    @if (s.lider; as l) {
                      <button type="button" class="flex min-h-11 min-w-0 items-center gap-3 rounded-md text-left" aria-haspopup="dialog" [attr.aria-expanded]="popover() === s.id" [attr.aria-label]="t().vaGanandoAria(l.alias, n2(l.nota))"
                        (click)="alternarPopover(s.id, $event)" (mouseenter)="hover(s.id)" (mouseleave)="hover(null)">
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(l.alias) }}</span>
                        <span class="flex min-w-0 flex-col gap-0.5">
                          <span class="truncate text-label-s text-text-primary">&#64;{{ l.alias }}</span>
                          <span class="truncate text-meta text-accent-text">{{ t().media }} {{ n2(l.nota) }} · {{ cerrada(s) ? t().gano : t().vaGanando }}</span>
                        </span>
                        <gr-icon name="eye" [size]="16" class="shrink-0 text-text-tertiary" />
                      </button>
                      @if (popover() === s.id) {
                        <gr-popover-alineacion [fila]="l" [sala]="s.nombre" [final]="cerrada(s)" [verSala]="'/fantasy/salas/' + s.id | loc" (cerrar)="cerrarPopover()" />
                      }
                    } @else {
                      <span class="text-body-s text-text-tertiary">{{ t().sinClasificar }}</span>
                    }
                  </div>
                  <div class="xl:w-[180px]">
                    @switch (accion(s)) {
                      @case ('solicitar') { <button type="button" grButton variant="outline" [block]="true" [loading]="operando() === s.id" (click)="solicitar(s)">{{ t().solicitar }}</button> }
                      @case ('cancelar') { <button type="button" grButton variant="outline" [block]="true" [loading]="operando() === s.id" (click)="cancelar(s)">{{ t().cancelarSolicitud }}</button> }
                      @case ('palmares') { <a grButton variant="outline" [block]="true" [href]="'/fantasy/palmares' | loc">{{ t().verPalmares }}</a> }
                      @default { <a grButton variant="outline" [block]="true" [href]="'/fantasy/salas/' + s.id | loc">{{ t().verSala }}</a> }
                    }
                  </div>
                  <button type="button" class="hidden size-11 shrink-0 items-center justify-center rounded-full xl:flex" [class]="favoritas().has(s.id) ? 'text-warning' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="favoritas().has(s.id)" [attr.aria-label]="(favoritas().has(s.id) ? t().quitarFav : t().marcarFav) + s.nombre" (click)="favorita(s)">
                    <gr-icon name="star" [size]="20" />
                  </button>
                </li>
              }
            </ul>
          </div>
        }
        @if (!cargando() && !errorCarga() && lobby()?.hayMas) {
          @if (limite() < tope) {
            <button type="button" grButton variant="outline" class="self-center" [loading]="cargandoMas()" (click)="verMas()">{{ t().verMas }}</button>
          } @else {
            <!-- ST3-R8-3: at the 200 cap more clicks repeat the same request; ask to filter instead. -->
            <p class="self-center text-sm text-muted-foreground">{{ t().mostrando(tope) }}</p>
          }
        }
      </div>
    </gr-page>

    @if (toast(); as msg) {
      <!-- UX6-R1-6: feedback sin mover la lista -->
      <p class="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 rounded-md border border-line-accent bg-bg-deep px-4 py-3 text-body-s text-text-primary shadow-card md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px]" role="status">{{ msg }}</p>
    }
    @if (crear()) {
      <gr-crear-sala-modal [atletas]="lobby()?.atletas ?? 0" [plazasMax]="lobby()?.plazasMax ?? 0" [puedeCrear]="lobby()?.puedeCrear ?? false" [alias]="fan.yo()?.alias ?? ''"
        (cerrar)="crear.set(false)" (hecho)="creada($event)" />
    }
  `,
})
export class SalasPage {
  protected readonly n2 = nota2;
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
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
  protected readonly tope = TOPE_SALAS;
  protected readonly cargandoMas = signal(false);
  protected readonly filtro = signal<Filtro>('todas');
  protected readonly operando = signal<string | null>(null);
  protected readonly crear = signal(false);
  protected readonly popover = signal<string | null>(null);
  protected readonly favoritas = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);
  private esperaToast: ReturnType<typeof setTimeout> | undefined;
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
    // con más páginas por cargar los recuentos son mínimos: «30+» (nunca «0+»)
    const mas = this.lobby()?.hayMas;
    const n = (k: number) => `${k}${mas && k ? '+' : ''}`;
    const f = this.t().filtros;
    return [
      { v: 'todas', l: `${f.todas} · ${n(l.length)}` },
      { v: 'abiertas', l: `${f.abiertas} · ${n(l.filter((s) => ABIERTA.has(s.estado)).length)}` },
      { v: 'en_juego', l: `${f.en_juego} · ${n(l.filter((s) => s.estado === 'en_juego').length)}` },
      { v: 'cerradas', l: `${f.cerradas} · ${n(l.filter((s) => CERRADA.has(s.estado)).length)}` },
    ];
  });
  /** Las salas con una solicitud mía que tiene algo que contar (pendiente, aceptada, rechazada…). */
  protected readonly misSolicitudes = computed(() => this.salas().filter((s) => s.miSolicitud && s.miSolicitud !== 'pendiente' && s.miSolicitud !== 'cancelada' && s.miSolicitud !== 'expulsada' && !(s.miSolicitud === 'aceptada' && s.esMia)));

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      await this.fan.cargar();
      await this.cargar();
      await applySeo(cms, seo, '/fantasy/salas', this.t().seoTitulo, this.t().seoDesc);
    });
    if (this.browser) {
      try {
        this.favoritas.set(new Set(JSON.parse(localStorage.getItem(FAVORITAS) ?? '[]') as string[]));
      } catch {
        /* sin favoritas guardadas */
      }
      this.vivo.conectar();
      // la carga inicial ya espera a la sesión del fan: una sola petición
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
        clearTimeout(this.esperaToast);
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
    this.limite.update((n) => Math.min(n + PAGINA_SALAS, TOPE_SALAS));
    this.cargandoMas.set(true);
    await this.recargar();
    this.cargandoMas.set(false);
  }
  protected badge(s: SalaVista) {
    return badgeSala(s.estado === 'lista' ? 'abierta' : s.estado, s.miembros, s.plazas, this.i18n.lang());
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
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/salas'));
    this.operando.set(s.id);
    this.error.set(null);
    this.maximo.set(false);
    try {
      await this.juegos.solicitar(s.id);
      await this.recargar();
      const l = this.lobby();
      this.avisar(this.t().toastEnviada(s.anfitrion, l?.solicitudesPendientes ?? 1, l?.solicitudesMax ?? 3));
      return;
    } catch (e) {
      const c = codigoError(e);
      if (c === 'MAX_SOLICITUDES') this.maximo.set(true);
      else this.error.set({ titulo: this.t().noEnviar, texto: mensajeError(e) });
      if (c.startsWith('SESION_FAN')) this.fan.sesionPerdida();
      await this.recargar();
    } finally {
      this.operando.set(null);
    }
  }
  private avisar(t: string): void {
    this.toast.set(t);
    clearTimeout(this.esperaToast);
    this.esperaToast = setTimeout(() => this.toast.set(null), 4000);
  }
  protected async cancelar(s: SalaVista): Promise<void> {
    this.operando.set(s.id);
    this.error.set(null);
    try {
      await this.juegos.cancelarSolicitud(s.id);
      this.maximo.set(false);
    } catch (e) {
      this.error.set({ titulo: this.t().noCancelar, texto: mensajeError(e) });
    } finally {
      await this.recargar();
      this.operando.set(null);
    }
  }

  protected abrirCrear(): void {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/salas'));
    this.crear.set(true);
  }
  protected creada(salaId: string): void {
    this.crear.set(false);
    void this.router.navigate([this.i18n.path('/fantasy/salas'), salaId]);
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
