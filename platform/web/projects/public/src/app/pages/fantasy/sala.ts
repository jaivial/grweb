/**
 * fantasy/sala.ts — /fantasy/salas/:id (Figma «81 · /fantasy/salas» · Sala, anfitrión e invitado): los jugadores de
 * la sala con su nota media, las solicitudes de unión (el anfitrión acepta o rechaza), el enlace de invitación
 * (entra directo), las acciones del anfitrión y el mercado de la sala. Todo se actualiza en tiempo real.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession, codigoError } from '../../core/fan';
import { Juegos, JuegosEnVivo, mensajeError, nota2, recargaAgrupada, type FilaSala, type SalaDetalle } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { JuegosNav, MEDALLA, iniciales } from '../porra/componentes';
import { AvisoConexion, BarraSala, FantasyCabecera, GrAviso, colorNota } from './componentes';
import { CrearSalaModal, PopoverAlineacion, TarjetaEstado, type SalaEditable } from './salas-ui';

const T = {
  es: {
    sala: 'Sala', salas: 'Salas',
    noExiste: 'Esta sala no existe o ya no está activa', noExisteTxt: 'Puede que el anfitrión la haya cerrado o que el enlace no sea correcto.',
    verAbiertas: 'Ver salas abiertas', errorCarga: 'No se pudo cargar la sala', errorCargaTxt: 'Comprueba tu conexión e inténtalo de nuevo.', reintentar: 'Reintentar',
    errorOp: 'No hemos podido completar la operación', jugadores: 'Jugadores', jugadoresMin: 'jugadores', tu: ' · tú', anfitrion: 'Anfitrión', eresAnf: 'Eres el anfitrión', dia: ' · día ',
    conNota: (n: number) => 'Alineación ' + n + '/5 con nota', completa: 'Alineación completa 5/5', alineacion: (n: number) => 'Alineación ' + n + '/5',
    notaMedia: 'nota media', monedas: 'monedas', verAlineacion: (a: string) => 'Ver la alineación de @' + a, expulsar: 'Expulsar',
    libreSolicitar: 'Plaza libre · solicitar unirse', libreCompartir: 'Plaza libre · compartir enlace', libre: 'Plaza libre',
    pendiente: 'Solicitud pendiente', unete: 'Únete a esta sala', decide: 'El anfitrión decide quién entra. Te avisamos aquí cuando responda.', aprueba: 'El anfitrión aprueba tu solicitud. Puedes tener hasta 3 pendientes.',
    cancelar: 'Cancelar solicitud', solicitar: 'Solicitar unirse', pendienteCancelar: 'Solicitud pendiente · Cancelar',
    solicitudes: 'Solicitudes de unión', pend1: 'pendiente', pendN: 'pendientes', solicitud: 'Solicitud', aceptar: 'Aceptar', rechazar: 'Rechazar',
    invita: 'Invita a tus amigos', llenaEnlace: 'Sala llena: el enlace no admite a nadie más.', quienAbra: 'Quien abra el enlace entra directo, sin aprobación, si hay plaza y el día no ha empezado. Sin cuenta: se registra y vuelve aquí.',
    copiado: 'Copiado', copiar: 'Copiar', correo: 'Correo', qrAlt: 'Código QR del enlace de invitación a la sala', regenerar: 'Regenerar enlace (invalida el anterior)',
    acciones: 'Acciones del anfitrión', editar: 'Editar sala', otraVezCerrar: 'Pulsa otra vez para cerrar la sala', cerrar: 'Cerrar sala',
    cerrarTxt: 'Cerrar sala rechaza las solicitudes, expulsa a todos y libera sus atletas. No se puede si el día ya empezó.',
    participacion: 'Tu participación', irAlineacion: 'Ir a mi alineación', verMercado: 'Ver mercado de la sala', noSalir: 'No puedes salir una vez iniciado el día: tu nota cuenta en el palmarés.',
    otraVezSalir: 'Pulsa otra vez para salir', salir: 'Salir de la sala', salirAnf: 'Si sales, el anfitrión pasa al jugador más antiguo; si eres el único, la sala se cierra.', salirHasta: 'Podrás salir hasta que empiece el día.',
    mercado: 'Mercado de la sala', libres: (l: number, t: number) => l + ' de ' + t + ' atletas libres', dueno: 'Cada atleta tiene un solo dueño por sala. Alineación de exactamente 5 atletas', plazas: 'plazas',
    nueva: 'Nueva solicitud de', quiere: 'Quiere unirse a tu sala · ahora', ver: 'Ver',
    esperando: (m: number) => `Esperando mínimo 2 jugadores (${m}/2)`, esperandoTxt: 'Con 1 jugador no se puede jugar. Si al empezar la primera sesión del día sigue así, la sala se cancela sin coste y no cuenta en el palmarés.',
    listaTit: (m: number, p: number) => `Lista para jugar · ${m}/${p}`,
    listaTxt: (m: number, pend: number, libres: number) => `Hay ${m} jugadores (mín. 2)${pend ? ` y ${pend} ${pend === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} para ${libres} ${libres === 1 ? 'plaza' : 'plazas'}` : ''}. La sala empieza sola con la primera sesión del día.`,
    llenaTit: (m: number, p: number) => `Sala llena (${m}/${p})`, llenaTxt: 'No caben más jugadores: el enlace no admite solicitudes y las pendientes se han cancelado.',
    vas1: (n: string) => ` Vas 1.º con media ${n}.`, vasN: (p: number, n: string, d: string) => ` Vas ${p}.º con media ${n}, a ${d} del líder.`,
    enJuego: 'En juego', enJuegoTxt: 'La sala está cerrada a nuevos jugadores.',
    cancelada: 'Sala cancelada', canceladaTxt: 'No llegó al mínimo de 2 jugadores al empezar el día: no puntúa ni cuenta en el palmarés.',
    cerrada: 'Sala cerrada', cerradaTxt: 'El anfitrión cerró la sala antes de empezar.', finalizada: 'Sala finalizada', finalizadaTxt: 'El día ha terminado: la clasificación final está en el palmarés.',
    solLlenaEnlace: 'La sala está llena: el enlace ya no admite a nadie más.', plazasLibres: (l: number) => l + ' ' + (l === 1 ? 'plaza libre' : 'plazas libres'),
    solPrivada: 'Tu sala no sale en el lobby: comparte el enlace y entran directo, sin solicitud.', solLlena: 'La sala está llena: solo puedes rechazar. Las solicitudes pendientes se cancelan solas.',
    solVacia: 'Aquí verás a quien solicite unirse desde el lobby.', solAceptar: 'Al aceptar, las demás solicitudes quedan en espera; con la sala llena se cancelan.',
    mensaje: (n: string, e: string) => `Únete a mi sala «${n}» de GRS Fantasy: ${e}`, asunto: 'Te invito a mi sala de GRS Fantasy',
    seoTit: (n: string) => `${n} · Salas de GRS Fantasy`, seoDesc: (n: string) => `La sala «${n}» de GRS Fantasy: jugadores, clasificación en directo y mercado.`,
    ahora: 'ahora', hace: (x: string) => 'hace ' + x, noCopiar: 'No se pudo copiar el enlace: selecciónalo y cópialo a mano.',
  },
  en: {
    sala: 'Room', salas: 'Rooms',
    noExiste: 'This room doesn\'t exist or is no longer active', noExisteTxt: 'The host may have closed it or the link may be wrong.',
    verAbiertas: 'See open rooms', errorCarga: 'Couldn\'t load the room', errorCargaTxt: 'Check your connection and try again.', reintentar: 'Try again',
    errorOp: 'We couldn\'t complete the action', jugadores: 'Players', jugadoresMin: 'players', tu: ' · you', anfitrion: 'Host', eresAnf: 'You\'re the host', dia: ' · day ',
    conNota: (n: number) => 'Line-up ' + n + '/5 scored', completa: 'Line-up complete 5/5', alineacion: (n: number) => 'Line-up ' + n + '/5',
    notaMedia: 'average score', monedas: 'coins', verAlineacion: (a: string) => 'View @' + a + '\'s line-up', expulsar: 'Remove',
    libreSolicitar: 'Free spot · request to join', libreCompartir: 'Free spot · share link', libre: 'Free spot',
    pendiente: 'Request pending', unete: 'Join this room', decide: 'The host decides who gets in. We\'ll let you know here when they reply.', aprueba: 'The host approves your request. You can have up to 3 pending.',
    cancelar: 'Cancel request', solicitar: 'Request to join', pendienteCancelar: 'Request pending · Cancel',
    solicitudes: 'Join requests', pend1: 'pending', pendN: 'pending', solicitud: 'Request', aceptar: 'Accept', rechazar: 'Decline',
    invita: 'Invite your friends', llenaEnlace: 'Room full: the link doesn\'t let anyone else in.', quienAbra: 'Anyone who opens the link joins straight away, no approval needed, if there\'s a spot and the day hasn\'t started. No account? They sign up and come back here.',
    copiado: 'Copied', copiar: 'Copy', correo: 'Email', qrAlt: 'QR code for the room invite link', regenerar: 'Regenerate link (invalidates the old one)',
    acciones: 'Host actions', editar: 'Edit room', otraVezCerrar: 'Tap again to close the room', cerrar: 'Close room',
    cerrarTxt: 'Closing the room declines the requests, removes everyone and frees their athletes. Not possible once the day has started.',
    participacion: 'Your participation', irAlineacion: 'Go to my line-up', verMercado: 'View the room market', noSalir: 'You can\'t leave once the day has started: your score counts towards the honours list.',
    otraVezSalir: 'Tap again to leave', salir: 'Leave the room', salirAnf: 'If you leave, the oldest player becomes host; if you\'re the only one, the room closes.', salirHasta: 'You can leave until the day starts.',
    mercado: 'Room market', libres: (l: number, t: number) => l + ' of ' + t + ' athletes free', dueno: 'Each athlete has only one owner per room. Line-up of exactly 5 athletes', plazas: 'spots',
    nueva: 'New request from', quiere: 'Wants to join your room · now', ver: 'View',
    esperando: (m: number) => `Waiting for at least 2 players (${m}/2)`, esperandoTxt: 'You can\'t play with 1 player. If it\'s still like this when the day\'s first session starts, the room is cancelled at no cost and doesn\'t count towards the honours list.',
    listaTit: (m: number, p: number) => `Ready to play · ${m}/${p}`,
    listaTxt: (m: number, pend: number, libres: number) => `There are ${m} players (min. 2)${pend ? ` and ${pend} pending ${pend === 1 ? 'request' : 'requests'} for ${libres} ${libres === 1 ? 'spot' : 'spots'}` : ''}. The room starts automatically with the day\'s first session.`,
    llenaTit: (m: number, p: number) => `Room full (${m}/${p})`, llenaTxt: 'No more players fit: the link doesn\'t accept requests and pending ones have been cancelled.',
    vas1: (n: string) => ` You\'re 1st with an average of ${n}.`, vasN: (p: number, n: string, d: string) => ` You\'re #${p} with an average of ${n}, ${d} behind the leader.`,
    enJuego: 'In play', enJuegoTxt: 'The room is closed to new players.',
    cancelada: 'Room cancelled', canceladaTxt: 'It didn\'t reach the minimum of 2 players when the day started: it doesn\'t score or count towards the honours list.',
    cerrada: 'Room closed', cerradaTxt: 'The host closed the room before it started.', finalizada: 'Room finished', finalizadaTxt: 'The day is over: the final standings are in the honours list.',
    solLlenaEnlace: 'The room is full: the link no longer lets anyone in.', plazasLibres: (l: number) => l + ' ' + (l === 1 ? 'free spot' : 'free spots'),
    solPrivada: 'Your room isn\'t listed in the lobby: share the link and people join straight away, no request needed.', solLlena: 'The room is full: you can only decline. Pending requests are cancelled automatically.',
    solVacia: 'Anyone who requests to join from the lobby will appear here.', solAceptar: 'When you accept, the other requests stay on hold; once the room is full they are cancelled.',
    mensaje: (n: string, e: string) => `Join my room «${n}» on GRS Fantasy: ${e}`, asunto: 'Join my GRS Fantasy room',
    seoTit: (n: string) => `${n} · GRS Fantasy rooms`, seoDesc: (n: string) => `The «${n}» GRS Fantasy room: players, live standings and market.`,
    ahora: 'now', hace: (x: string) => x + ' ago', noCopiar: 'Couldn\'t copy the link: select it and copy it manually.',
  },
};

@Component({
  selector: 'gr-sala-page',
  imports: [LocPipe, Page, GrButton, GrIcon, GrSkeleton, AvisoConexion, BarraSala, CrearSalaModal, FantasyCabecera, GrAviso, JuegosNav, PopoverAlineacion, TarjetaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="sala()?.nombre ?? t().sala" [juego]="true">
      <gr-fantasy-cabecera [titulo]="sala()?.nombre ?? t().sala" [migas]="[t().salas, sala()?.nombre ?? t().sala]" [descripcion]="subtitulo()" [reservar]="true" />
      <div class="flex flex-col gap-4 md:gap-6">
        <!-- UX6-R1-7: dentro de la sala, en móvil basta la barra de sala y las migas -->
        <div class="hidden md:block"><gr-juegos-nav juego="fantasy" activa="salas" /></div>

        @if (cargando()) {
          <div class="flex flex-col gap-3" aria-busy="true">
            <gr-skeleton class="h-[76px] rounded-lg" />
            @for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-[66px] rounded-lg" /> }
          </div>
        } @else if (noExiste()) {
          <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="circle-alert" [titulo]="t().noExiste">{{ t().noExisteTxt }}
            <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().verAbiertas }}</a>
          </gr-tarjeta-estado>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" [titulo]="t().errorCarga">{{ t().errorCargaTxt }}</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">{{ t().reintentar }}</button>
        } @else if (detalle(); as d) {
          <gr-barra-sala [salaId]="d.sala.id" [nombre]="d.sala.nombre" [estado]="d.sala.estado === 'lista' ? 'abierta' : d.sala.estado" [miembros]="d.sala.miembros" [plazas]="d.sala.plazas" activa="resumen" />

          @if (vivo.caida()) { <gr-aviso-conexion /> }
          @if (error(); as e) { <gr-aviso tono="error" [titulo]="t().errorOp">{{ e }}</gr-aviso> }
          @if (aviso(); as a) { <gr-aviso [tono]="a.tono" [titulo]="a.titulo">{{ a.texto }}</gr-aviso> }

          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <section class="flex min-w-0 flex-col gap-3 lg:flex-1" aria-labelledby="sala-jugadores">
              <h2 id="sala-jugadores" class="text-ui-h5 text-text-primary">{{ t().jugadores }} · {{ d.sala.miembros }}/{{ d.sala.plazas }}</h2>
              <ul class="flex flex-col gap-3">
                @for (f of d.filas; track f.miembroId) {
                  <li class="relative flex flex-wrap items-center gap-3 rounded-lg border bg-bg-card px-4 py-3" [class]="f.esYo ? 'border-line-accent' : 'border-line-subtle'">
                    @if (d.empezada) {
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-full text-mono-s text-text-primary tabular-nums" [class]="medalla(f.puesto)">{{ f.puesto }}</span>
                    }
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(f.alias) }}</span>
                    <p class="flex min-w-0 flex-1 flex-col gap-1">
                      <span class="flex flex-wrap items-center gap-2">
                        <span class="truncate text-label-s text-text-primary">&#64;{{ f.alias }}{{ f.esYo ? t().tu : '' }}</span>
                        @if (f.esAnfitrion) { <span class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border border-warning bg-warning/12 px-2.5 text-label-xs text-warning">{{ t().anfitrion }}</span> }
                      </span>
                      <span class="text-body-s text-text-tertiary">{{ d.empezada ? t().conNota(f.conNota) : f.alineacion.length >= 5 ? t().completa : t().alineacion(f.alineacion.length) }}</span>
                    </p>
                    @if (d.empezada) {
                      <p class="flex shrink-0 flex-col gap-0.5 text-right"><span class="text-mono-s tabular-nums" [class]="color(f)">{{ n2(f.nota) }}</span><span class="text-meta text-text-tertiary">{{ t().notaMedia }}</span></p>
                    } @else {
                      <p class="flex shrink-0 flex-col gap-0.5 text-right"><span class="text-mono-s text-accent-text tabular-nums">{{ monedas(f.saldo) }}</span><span class="text-meta text-text-tertiary">{{ t().monedas }}</span></p>
                    }
                    <button type="button" class="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary" aria-haspopup="dialog" [attr.aria-expanded]="popover() === f.miembroId" [attr.aria-label]="t().verAlineacion(f.alias)" (click)="alternarPopover(f.miembroId, $event)">
                      <gr-icon name="eye" [size]="16" />
                    </button>
                    @if (puedeExpulsar(f)) {
                      <button type="button" class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-crimson px-3 text-label-xs text-crimson disabled:opacity-40 md:h-[30px]" [disabled]="operando() === f.miembroId" (click)="expulsar(f)">
                        <gr-icon name="x" [size]="16" />{{ t().expulsar }}
                      </button>
                    }
                    @if (popover() === f.miembroId) {
                      <gr-popover-alineacion [fila]="f" [sala]="d.sala.nombre" [final]="d.sala.estado === 'finalizada'" (cerrar)="cerrarPopover()" />
                    }
                  </li>
                }
                @if (!d.empezada && d.sala.miembros < d.sala.plazas && abierta()) {
                  <li>
                    @if (puedeSolicitar()) {
                      <button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-[14px] border border-dashed border-line-strong px-4 py-3 text-left text-body-s text-text-secondary hover:text-text-primary disabled:opacity-40" [disabled]="operando() === 'solicitar'" (click)="solicitar()"><gr-icon name="plus" [size]="16" class="shrink-0" />{{ t().libreSolicitar }}</button>
                    } @else if (d.codigo) {
                      <button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-[14px] border border-dashed border-line-strong px-4 py-3 text-left text-body-s text-text-secondary hover:text-text-primary" (click)="compartir()"><gr-icon name="share" [size]="16" class="shrink-0" />{{ t().libreCompartir }}</button>
                    } @else {
                      <p class="flex items-center gap-3 rounded-[14px] border border-dashed border-line-strong px-4 py-3 text-body-s text-text-tertiary"><gr-icon name="plus" [size]="16" class="shrink-0" />{{ t().libre }}</p>
                    }
                  </li>
                }
              </ul>
            </section>

            <aside class="flex min-w-0 flex-col gap-4 lg:w-[420px] lg:shrink-0">
              @if (accionUnirse(); as a) {
                <!-- UX6-R1-1: no miembro: solicitar o cancelar; en móvil, barra fija en la zona del pulgar -->
                <section class="flex flex-col gap-3 rounded-lg border border-line-accent bg-bg-surface p-5" aria-labelledby="sala-unirse">
                  <h2 id="sala-unirse" class="text-ui-h5 text-text-primary">{{ a === 'cancelar' ? t().pendiente : t().unete }}</h2>
                  <p class="text-body-s text-text-secondary">{{ a === 'cancelar' ? t().decide : t().aprueba }}</p>
                  <div class="hidden md:block"><button type="button" grButton [variant]="a === 'cancelar' ? 'outline' : 'primary'" [block]="true" [loading]="operando() === 'solicitar'" (click)="a === 'cancelar' ? cancelarSolicitud() : solicitar()">{{ a === 'cancelar' ? t().cancelar : t().solicitar + ' · ' + d.sala.miembros + '/' + d.sala.plazas }}</button></div>
                </section>
                <div class="h-20 md:hidden" aria-hidden="true"></div>
                <div class="fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-bg-base/95 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[10px] md:hidden">
                  <button type="button" grButton [variant]="a === 'cancelar' ? 'outline' : 'primary'" [block]="true" size="l" [loading]="operando() === 'solicitar'" (click)="a === 'cancelar' ? cancelarSolicitud() : solicitar()">{{ a === 'cancelar' ? t().pendienteCancelar : t().solicitar + ' · ' + d.sala.miembros + '/' + d.sala.plazas }}</button>
                </div>
              }
              @if (esAnfitrion() && !d.empezada && abierta()) {
                <section id="solicitudes" class="flex flex-col gap-3 rounded-lg border border-line-accent bg-bg-surface p-5" aria-labelledby="sala-solicitudes">
                  <div class="flex items-center gap-2">
                    <h2 id="sala-solicitudes" class="min-w-0 flex-1 text-ui-h5 text-text-primary">{{ t().solicitudes }}</h2>
                    @if (d.solicitudes.length) { <span class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border border-warning bg-warning/12 px-2.5 text-label-xs text-warning">{{ d.solicitudes.length }} {{ d.solicitudes.length === 1 ? t().pend1 : t().pendN }}</span> }
                  </div>
                  <p class="text-body-s text-text-tertiary">{{ textoSolicitudes() }}</p>
                  <ul class="flex flex-col gap-3 empty:hidden" aria-live="polite">
                    @for (s of d.solicitudes; track s.id) {
                      <li class="flex flex-col gap-3 rounded-md bg-bg-card p-3">
                        <p class="flex items-center gap-3">
                          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(s.alias) }}</span>
                          <span class="flex min-w-0 flex-col gap-0.5"><span class="truncate text-label-s text-text-primary">&#64;{{ s.alias }}</span><span class="text-body-s text-text-tertiary">{{ t().solicitud }} {{ hace(s.createdAt) }}</span></span>
                        </p>
                        <div class="grid grid-cols-2 gap-2">
                          <button type="button" grButton variant="primary" [block]="true" [loading]="operando() === s.id" [disabled]="llena()" (click)="responder(s.id, true)">{{ t().aceptar }}</button>
                          <button type="button" grButton variant="outline" [block]="true" [disabled]="operando() === s.id" (click)="responder(s.id, false)">{{ t().rechazar }}</button>
                        </div>
                      </li>
                    }
                  </ul>
                </section>
              }

              @if (d.codigo && !d.empezada && abierta()) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-invitacion">
                  <h2 id="sala-invitacion" class="text-ui-h5 text-text-primary">{{ t().invita }}</h2>
                  <p class="text-body-s text-text-tertiary">{{ llena() ? t().llenaEnlace : t().quienAbra }}</p>
                  <p class="flex min-h-12 items-center gap-2 rounded-md border border-line-strong bg-bg-field py-1.5 pr-2 pl-4">
                    <span class="min-w-0 flex-1 text-mono-s break-all text-text-secondary">{{ enlaceTxt() }}</span>
                    <button type="button" class="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm bg-accent px-3 text-label-xs text-text-primary md:h-7" (click)="copiar()"><gr-icon [name]="copiado() ? 'check' : 'copy'" [size]="16" />{{ copiado() ? t().copiado : t().copiar }}</button>
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <a class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" [href]="whatsapp()" target="_blank" rel="noopener"><gr-icon name="share" [size]="16" />WhatsApp</a>
                    <button type="button" class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" (click)="compartir()"><gr-icon name="instagram" [size]="16" />Instagram</button>
                    <a class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" [href]="correo()"><gr-icon name="mail" [size]="16" />{{ t().correo }}</a>
                    <button type="button" class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" [attr.aria-expanded]="!!qr()" (click)="alternarQr()"><gr-icon name="qr" [size]="16" />QR</button>
                  </div>
                  @if (qr(); as q) { <img [src]="q" width="180" height="180" class="self-start rounded-md" [alt]="t().qrAlt" /> }
                  @if (esAnfitrion()) {
                    <button type="button" class="inline-flex min-h-11 items-center gap-2 self-start text-body-s text-text-tertiary hover:text-text-primary md:min-h-0" [disabled]="operando() === 'enlace'" (click)="regenerar()"><gr-icon name="shuffle" [size]="16" />{{ t().regenerar }}</button>
                  }
                </section>
              }

              @if (esAnfitrion() && !d.empezada && abierta()) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-acciones">
                  <h2 id="sala-acciones" class="text-ui-h5 text-text-primary">{{ t().acciones }}</h2>
                  <button type="button" grButton variant="outline" [block]="true" (click)="editando.set(true)">{{ t().editar }}</button>
                  <button type="button" class="flex h-11 w-full items-center justify-center rounded-md border border-crimson px-5 text-label-s text-crimson disabled:opacity-40" [disabled]="operando() === 'cerrar'" (click)="cerrarSala()">{{ confirmarCierre() ? t().otraVezCerrar : t().cerrar }}</button>
                  <p class="text-body-s text-text-tertiary">{{ t().cerrarTxt }}</p>
                </section>
              }

              @if (d.sala.esMia) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-participacion">
                  <h2 id="sala-participacion" class="text-ui-h5 text-text-primary">{{ t().participacion }}</h2>
                  <a grButton variant="primary" [block]="true" [href]="'/fantasy/salas/' + d.sala.id + '/equipo' | loc">{{ t().irAlineacion }}</a>
                  <a grButton variant="outline" [block]="true" [href]="'/fantasy/salas/' + d.sala.id + '/mercado' | loc">{{ t().verMercado }}</a>
                  @if (d.empezada) {
                    <p class="text-body-s text-text-tertiary">{{ t().noSalir }}</p>
                  } @else if (abierta()) {
                    <button type="button" grButton variant="outline" [block]="true" [disabled]="operando() === 'salir'" (click)="salir()">{{ confirmarSalida() ? t().otraVezSalir : t().salir }}</button>
                    <p class="text-body-s text-text-tertiary">{{ esAnfitrion() ? t().salirAnf : t().salirHasta }}</p>
                  }
                </section>
              }

              <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-mercado">
                <h2 id="sala-mercado" class="text-ui-h5 text-text-primary">{{ t().mercado }}</h2>
                @if (mercado(); as m) {
                  <p class="text-mono-s text-accent-text tabular-nums">{{ t().libres(m.libres, m.total) }}</p>
                  <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-field" aria-hidden="true"><span class="block h-full rounded-pill bg-warning" [style.width.%]="m.total ? (m.libres / m.total) * 100 : 0"></span></span>
                }
                <p class="text-body-s text-text-tertiary">{{ t().dueno }}{{ mercado()?.total ? ': ' + mercado()!.total + ' ÷ 5 = ' + d.plazasMax + ' ' + t().plazas : '' }}.</p>
              </section>
            </aside>
          </div>
        }
      </div>
    </gr-page>

    @if (toast(); as ts) {
      <div class="fixed inset-x-4 top-20 z-40 flex items-center gap-3 rounded-md border border-line-accent bg-bg-deep px-4 py-3 shadow-card md:inset-x-auto md:top-24 md:right-6 md:w-[380px]" role="status" aria-live="polite">
        <gr-icon name="bell" [size]="20" class="shrink-0 text-text-secondary" />
        <p class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="truncate text-label-s text-text-primary">{{ t().nueva }} &#64;{{ ts }}</span><span class="text-body-s text-text-tertiary">{{ t().quiere }}</span></p>
        <a href="#solicitudes" class="flex min-h-11 shrink-0 items-center text-label-s text-accent-text hover:underline" (click)="toast.set(null)">{{ t().ver }}</a>
      </div>
    }
    @if (editando() && editable(); as e) {
      <gr-crear-sala-modal [editar]="e" [atletas]="mercado()?.total ?? 0" [plazasMax]="detalle()?.plazasMax ?? e.plazas" [alias]="detalle()?.sala?.anfitrion ?? ''" (cerrar)="editando.set(false)" (hecho)="editada()" />
    }
  `,
})
export class SalaPage {
  protected readonly n2 = nota2;
  protected readonly monedas = monedas;
  private readonly juegos = inject(Juegos);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(Seo);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly id = this.ruta.snapshot.paramMap.get('id') ?? '';

  protected readonly detalle = signal<SalaDetalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly errorCarga = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly operando = signal<string | null>(null);
  protected readonly popover = signal<string | null>(null);
  protected readonly mercado = signal<{ libres: number; total: number } | null>(null);
  protected readonly copiado = signal(false);
  protected readonly qr = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly editando = signal(false);
  protected readonly confirmarCierre = signal(false);
  protected readonly confirmarSalida = signal(false);
  protected readonly ahora = signal(Date.now());
  /** Ya juega en otra sala hoy (el lobby lo dice): no se le ofrece solicitar. */
  protected readonly otraSala = signal(false);
  private origenPopover: HTMLElement | null = null;
  /** ST3-R1-3: 800 ms de margen y como mucho una recarga cada 3 s. */
  private readonly agrupada = recargaAgrupada(() => void this.recargar());
  private esperaToast: ReturnType<typeof setTimeout> | undefined;

  protected readonly sala = computed(() => this.detalle()?.sala ?? null);
  protected readonly esAnfitrion = computed(() => this.detalle()?.filas.some((f) => f.esYo && f.esAnfitrion) ?? false);
  protected readonly abierta = computed(() => ['esperando', 'lista', 'llena'].includes(this.sala()?.estado ?? ''));
  /** UX6-R1-1: lo que puede hacer quien no es miembro (sala pública, abierta y sin empezar). */
  protected readonly accionUnirse = computed<'solicitar' | 'cancelar' | null>(() => {
    const d = this.detalle();
    if (!d || d.sala.esMia || d.empezada || !d.sala.publica || this.otraSala()) return null;
    if (d.sala.miSolicitud === 'pendiente') return 'cancelar';
    const ok = (d.sala.estado === 'esperando' || d.sala.estado === 'lista') && d.sala.miSolicitud !== 'rechazada' && d.sala.miSolicitud !== 'expulsada';
    return ok ? 'solicitar' : null;
  });
  protected readonly puedeSolicitar = computed(() => this.accionUnirse() === 'solicitar');
  protected readonly llena = computed(() => (this.sala()?.miembros ?? 0) >= (this.sala()?.plazas ?? 0));
  protected readonly subtitulo = computed(() => {
    const d = this.detalle();
    if (!d) return '\u00a0'; // UX6-R1-9: reserva la línea mientras carga
    const t = this.t();
    const dia = d.jornada?.dia ? t.dia + new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short' }).format(new Date(d.jornada.dia)) : '';
    return `${this.esAnfitrion() ? t.eresAnf : t.anfitrion + ' @' + d.sala.anfitrion}${dia} · ${d.sala.miembros}/${d.sala.plazas} ${t.jugadoresMin}`;
  });
  protected readonly editable = computed<SalaEditable | null>(() => {
    const s = this.sala();
    return s ? { id: s.id, nombre: s.nombre, plazas: s.plazas, publica: s.publica, miembros: s.miembros } : null;
  });
  /** El aviso de estado de la sala (Figma «Aviso · …»). */
  protected readonly aviso = computed<{ tono: 'neutro' | 'exito' | 'aviso'; titulo: string; texto: string } | null>(() => {
    const d = this.detalle();
    if (!d) return null;
    const s = d.sala;
    const pend = d.solicitudes.length;
    const libres = s.plazas - s.miembros;
    const t = this.t();
    switch (s.estado) {
      case 'esperando':
        return { tono: 'aviso', titulo: t.esperando(s.miembros), texto: t.esperandoTxt };
      case 'lista':
        return { tono: 'exito', titulo: t.listaTit(s.miembros, s.plazas), texto: t.listaTxt(s.miembros, pend, libres) };
      case 'llena':
        return { tono: 'aviso', titulo: t.llenaTit(s.miembros, s.plazas), texto: t.llenaTxt };
      case 'en_juego': {
        const yo = d.filas.find((f) => f.esYo);
        const lider = d.filas[0];
        const mio = yo ? (yo.puesto === 1 ? t.vas1(nota2(yo.nota)) : t.vasN(yo.puesto, nota2(yo.nota), nota2(Math.max(0, (lider?.nota ?? 0) - yo.nota)))) : '';
        return { tono: 'neutro', titulo: t.enJuego, texto: t.enJuegoTxt + mio };
      }
      case 'cancelada':
        return { tono: 'neutro', titulo: t.cancelada, texto: t.canceladaTxt };
      case 'cerrada':
        return { tono: 'neutro', titulo: t.cerrada, texto: t.cerradaTxt };
      default:
        return { tono: 'neutro', titulo: t.finalizada, texto: t.finalizadaTxt };
    }
  });
  protected readonly textoSolicitudes = computed(() => {
    const s = this.sala();
    if (!s) return '';
    const libres = s.plazas - s.miembros;
    const t = this.t();
    // «solo enlace»: no se lista en el lobby ni admite solicitudes; se entra directo con el enlace
    if (!s.publica) return libres <= 0 ? t.solLlenaEnlace : `${t.plazasLibres(libres)}. ${t.solPrivada}`;
    if (libres <= 0) return t.solLlena;
    if (!this.detalle()?.solicitudes.length) return `${t.plazasLibres(libres)}. ${t.solVacia}`;
    return `${t.plazasLibres(libres)}. ${t.solAceptar}`;
  });
  protected readonly enlace = computed(() => (this.browser ? location.origin : '') + this.i18n.path('/fantasy/unirse/') + (this.detalle()?.codigo ?? ''));
  protected readonly enlaceTxt = computed(() => this.enlace().replace(/^https?:\/\//, ''));
  private readonly mensaje = computed(() => this.t().mensaje(this.sala()?.nombre ?? '', this.enlace()));
  protected readonly whatsapp = computed(() => 'https://wa.me/?text=' + encodeURIComponent(this.mensaje()));
  protected readonly correo = computed(() => `mailto:?subject=${encodeURIComponent(this.t().asunto)}&body=${encodeURIComponent(this.mensaje())}`);

  constructor() {
    void inject(PendingTasks).run(() => this.cargar());
    if (this.browser) {
      this.vivo.conectar();
      // el stream sigue esta sala y su jornada (ST3-R1-4)
      this.vivo.verSala(this.id);
      effect(() => {
        const j = this.detalle()?.jornada?.id;
        if (j) untracked(() => this.vivo.enfocar(j));
      });
      void this.fan.cargar().then((f) => f && this.recargar());
      const reloj = setInterval(() => this.ahora.set(Date.now()), 30000);
      // Miembros, solicitudes, notas y fichajes cambian en vivo: se recarga la sala agrupando los eventos seguidos.
      let primera = true;
      effect(() => {
        this.vivo.versionSalas();
        this.vivo.versionNotas();
        this.vivo.version();
        untracked(() => {
          if (primera) return void (primera = false);
          this.agrupada.pedir();
        });
      });
      // Aviso en vivo al anfitrión cuando llega una solicitud nueva a esta sala.
      effect(() => {
        const ev = this.vivo.solicitud();
        untracked(() => {
          if (!ev || ev.salaId !== this.id || ev.tipo !== 'pendiente' || !this.esAnfitrion()) return;
          this.toast.set(ev.alias);
          clearTimeout(this.esperaToast);
          this.esperaToast = setTimeout(() => this.toast.set(null), 8000);
        });
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(reloj);
        this.agrupada.cancelar();
        this.vivo.verSala('');
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
  private async recargar(): Promise<void> {
    try {
      const d = await this.juegos.sala(this.id);
      this.detalle.set(d);
      this.noExiste.set(false);
      this.errorCarga.set(false);
      this.seo.set({ title: this.t().seoTit(d.sala.nombre), description: this.t().seoDesc(d.sala.nombre), path: '/fantasy/salas/' + this.id });
      if (!d.sala.esMia && !d.empezada && this.fan.conSesion())
        void this.juegos
          .salas(undefined, d.jornada?.id, 1)
          .then((l) => this.otraSala.set(!!l.miSala && l.miSala !== this.id))
          .catch(() => undefined);
      void this.juegos
        .fantasyMercado(d.jornada?.id, this.id)
        .then((m) => this.mercado.set({ libres: m.atletas.filter((a) => a.libre).length, total: m.atletas.length }))
        .catch(() => undefined);
    } catch (e) {
      if (codigoError(e) === 'HTTP_404' || /NOT_FOUND|NO_ENCONTRAD/.test(codigoError(e))) this.noExiste.set(true);
      else if (!this.detalle()) this.errorCarga.set(true);
    }
  }

  protected ini(alias: string): string {
    return iniciales(alias);
  }
  protected color(f: FilaSala): string {
    return colorNota(f.nota, f.conNota > 0);
  }
  protected medalla(puesto: number): string {
    return puesto >= 1 && puesto <= 3 ? MEDALLA[puesto as 1 | 2 | 3].fondo.replace(/\/\d+$/, '') : 'bg-bg-raised';
  }
  protected puedeExpulsar(f: FilaSala): boolean {
    return this.esAnfitrion() && !f.esYo && !this.detalle()?.empezada && this.abierta();
  }
  /** «hace 2 min» (se refresca cada 30 s). */
  protected hace(iso: string): string {
    const min = Math.max(0, Math.round((this.ahora() - new Date(iso).getTime()) / 60000));
    if (min < 1) return this.t().ahora;
    return min < 60 ? this.t().hace(min + ' min') : this.t().hace(Math.floor(min / 60) + ' h');
  }

  private async operar(clave: string, f: () => Promise<unknown>): Promise<boolean> {
    this.operando.set(clave);
    this.error.set(null);
    try {
      await f();
      return true;
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
      return false;
    } finally {
      await this.recargar();
      this.operando.set(null);
    }
  }
  protected responder(solicitudId: string, aceptar: boolean): void {
    void this.operar(solicitudId, () => this.juegos.responderSolicitud(this.id, solicitudId, aceptar));
  }
  protected solicitar(): void {
    if (!this.fan.conSesion()) return this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/salas/' + this.id));
    void this.operar('solicitar', () => this.juegos.solicitar(this.id));
  }
  protected cancelarSolicitud(): void {
    void this.operar('solicitar', () => this.juegos.cancelarSolicitud(this.id));
  }
  protected expulsar(f: FilaSala): void {
    void this.operar(f.miembroId, () => this.juegos.expulsar(this.id, f.miembroId));
  }
  protected regenerar(): void {
    this.qr.set(null);
    void this.operar('enlace', () => this.juegos.editarSala(this.id, { regenerarEnlace: true }));
  }
  /** Cerrar y salir piden un segundo toque (son irreversibles). */
  protected async cerrarSala(): Promise<void> {
    if (!this.confirmarCierre()) return this.confirmarCierre.set(true);
    this.confirmarCierre.set(false);
    if (await this.operar('cerrar', () => this.juegos.cerrarSala(this.id))) void this.router.navigateByUrl(this.i18n.path('/fantasy/salas'));
  }
  protected async salir(): Promise<void> {
    if (!this.confirmarSalida()) return this.confirmarSalida.set(true);
    this.confirmarSalida.set(false);
    if (await this.operar('salir', () => this.juegos.salirSala(this.id))) void this.router.navigateByUrl(this.i18n.path('/fantasy/salas'));
  }
  protected editada(): void {
    this.editando.set(false);
    void this.recargar();
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.error.set(this.t().noCopiar);
    }
  }
  /** Instagram no tiene enlace de compartir: se abre la hoja de compartir del sistema o, si no hay, se copia el enlace. */
  protected async compartir(): Promise<void> {
    if (navigator.share) await navigator.share({ title: 'GRS Fantasy', text: this.mensaje() }).catch(() => undefined);
    else await this.copiar();
  }
  protected alternarQr(): void {
    if (this.qr()) return this.qr.set(null);
    void import('qrcode').then(async (m) => this.qr.set(await (m.default ?? m).toDataURL(this.enlace(), { margin: 1, width: 360 })));
  }

  protected alternarPopover(id: string, e: Event): void {
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
