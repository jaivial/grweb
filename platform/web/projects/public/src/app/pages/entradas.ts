import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrButton, GrCheckbox, GrIcon, GrRaffleNotice, GrSkeleton, type GrIconName, GrSelect, CdnPipe, LOGO, LOGO_SRCSET } from '@grcup/ui';
import { Cms, type Faq } from '../core/cms';
import { renderMarkdown } from '../core/markdown';
import { COMPETITION_SLUG, Competition, FalloApi } from '../core/competition';
import { FanSession } from '../core/fan';
import { EntradasPublic, dia, diaLargo, errorDe, hora, qrDataURL, validada, type Entradas, type MiEntrada, type Oferta, type SesionPub } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { INSCRITOS_AEP } from '../core/inscripcion-aep';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Footer, Navbar } from '../layout/layout';
import { Newsletter } from '../layout/newsletter';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { I18n, LocPipe, type Lang } from '../core/i18n';

const T = {
  es: {
    elDia: 'El día',
    est: { disponible: 'Disponible', ultimas: 'Últimas', agotada: 'Agotada', cerrada: 'Cerrada', proximamente: 'Próximamente' },
    tk: {
      sorteo: (n: number) => `Sorteo · ${n} ${n === 1 ? 'boleto pagado' : 'boletos pagados'}`,
      qrOff: 'QR desactivado', qrAlt: 'Código QR de la entrada', validada: 'Validada', puerta: 'Mostrar en puerta',
      usada: (h: string) => 'Validada' + (h ? ' a las ' + h : '') + ' · ¡que lo disfrutes!',
      anulada: 'Has liberado tu plaza. ¡Gracias por avisar!', reservada: 'Enséñalo en la puerta desde el móvil (no hace falta imprimirlo)',
      dialogo: 'Entrada para la puerta', cerrar: 'Cerrar', gratis: 'Entrada gratuita', anuladaPill: 'Anulada',
    },
    pg: {
      migas: 'Migas',
      inicio: 'Inicio',
      entradas: 'Entradas',
      srTit: 'Entradas · GRS Cup 2',
      agotadas: 'Entradas agotadas',
      h1a: 'Hasta aquí',
      h1b: 'el aforo',
      h1c: 'Vive la GRS Cup 2',
      h1d: 'en directo',
      agotTxt: 'Se han reservado todas las entradas. Apúntate a la lista de espera: si alguien anula, te avisamos por email y tienes un plazo para confirmar.',
      listaBtn: 'Apuntarme a la lista de espera',
      directo: 'Seguirlo en directo',
      reservarMi: 'Reservar mi entrada',
      comoFunc: 'Cómo funciona',
      personas: 'personas',
      yaTienen: 'ya tienen entrada',
      ejTitular: 'Tu nombre + 2 acompañantes',
      limT: 'Demasiadas visitas desde tu red',
      limX: 'Hemos recibido muchas peticiones desde tu conexión. Espera un minuto y vuelve a cargar la página.',
      errT: 'No hemos podido cargar las entradas',
      errX: 'Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.',
      elige: 'Elige sesión',
      completas: 'Todas las sesiones están completas. Elige una para apuntarte a su lista de espera.',
      nlT: 'Te avisamos de lo importante',
      nlX: 'Horarios, sorteo y próximas competiciones de GRStrength. Como mucho un email al mes.',
      cerradasT: 'Reservas cerradas',
      cerradasX: 'Ahora mismo no hay sesiones con reservas abiertas. Síguenos en Instagram para saber cuándo se abren.',
      apuntado: 'Te hemos apuntado',
      completa: 'está completa',
      esperaX: 'Apúntate a la lista de espera de esta sesión. Si alguien anula, te mandamos un enlace y tendrás un plazo para confirmar tu entrada.',
      emailPh: 'tu@email.com',
      acepto: 'He leído y acepto la',
      privacidad: 'política de privacidad',
      otra: 'Elegir otra sesión',
      reservaTu: 'Reserva tu entrada',
      tusDatos: 'Tus datos',
      nombre: 'Nombre',
      nombrePh: 'Tu nombre',
      nombreErr: 'Escribe tu nombre',
      apellidos: 'Apellidos',
      apellidosPh: 'Tus apellidos',
      apellidosErr: 'Escribe tus apellidos',
      emailPh2: 'email@ejemplo.com',
      emailErr: 'Introduce un email válido',
      tel: 'Teléfono (opcional)',
      origen: '¿Cómo nos conociste?',
      opcion: 'Elige una opción',
      cuantos: '¿Cuántos venís?',
      nov: 'Quiero recibir novedades de la GRS Cup y de otras competiciones de GRStrength.',
      opcional: '(Opcional)',
      rgpd: 'Responsable: GRStrength · Finalidad: gestionar tu entrada y, solo si lo marcas, enviarte novedades · Legitimación: tu consentimiento · Derechos: acceso, rectificación, supresión y baja escribiendo a',
      org: 'la organización',
      rgpd2: 'o desde cualquier email.',
      reservar: 'Reservar',
      persona: 'persona',
      reservarGratis: 'Reservar entrada gratis',
      sinSpam: 'Solo usamos tus datos para tu entrada. Sin spam.',
      verT: 'Qué vas a *ver*',
      sinColas: 'Sin colas',
      comoT: 'Cómo *funciona*',
      verHor: 'Ver horarios en directo',
      dudas: 'Dudas',
      faqT: 'Preguntas *frecuentes*',
      esperaSes: 'Lista de espera por sesión',
      limitado: 'Aforo limitado · 1 minuto',
      apuntarme: 'Apuntarme',
      puertas: 'Puertas',
      ultimasN: 'Últimas',
      personasL: 'Personas',
      tuMas: 'Tú + acompañantes',
      menos: 'Menos personas',
      mas: 'Más personas',
      aforo: 'Aforo',
      agotadasEspera: 'Agotadas · apúntate a la lista de espera',
      revisa: (n: number) => (n === 1 ? 'Revisa 1 campo' : 'Revisa ' + n + ' campos'),
      quedan: (n: string) => 'Quedan ' + n + ' entradas para esta sesión',
      ejL1: 'Sábado · sesión de mañana',
      ejL2: 'Puertas 8:30 · hasta las 14:00',
      hasta: 'hasta las',
      y: 'y',
      porConfirmar: 'Fecha por confirmar',
      premiosSorteo: 'premios y sorteo',
      premiosSorteoC: 'Premios y sorteo',
      porDia: 'Horario de cada día',
      aforoDias: 'Aforo por día',
      ambosDias: 'los dos días',
      eNombre: 'Nombre: escribe tu nombre.',
      eApellidos: 'Apellidos: escribe tus apellidos.',
      eEmail: 'Email: introduce un email válido.',
      eSesion: 'Elige una sesión.',
      ePriv: 'Acepta la política de privacidad para reservar.',
      eEmail2: 'Escribe un email válido.',
      ePriv2: 'Acepta la política de privacidad.',
      sesionAria: 'Sesión',
      ambos: 'Los dos días',
      ambosD: 'Una sola entrada y un QR para ambos días',
      enEspera: (s: string, e: string) => `Estás en la lista de espera de ${s}. Si se libera plaza te escribimos a ${e}.`,
      origenes: ['Instagram', 'Un amigo o familiar', 'Mi club o gimnasio', 'Un atleta', 'Cartel o flyer', 'Otro'],
      queVer: ['Sentadilla, banca y peso muerto', 'Competición AEP-2 y AEP-3', INSCRITOS_AEP + ' atletas', 'Premios y sorteo en directo', 'Sigue a tus atletas', 'Participa en la rifa de material'],
      pasos: ['Reserva en 1 minuto', 'Recibe tu QR', 'Enséñalo en la puerta'],
      seoT: 'Entradas gratis · GRS Cup 2',
      seoD: 'Reserva gratis tu entrada para la GRS Cup 2 en Almussafes: elige sesión, recibe tu QR por email y entra sin colas.',
    },
    cf: {
      tit: '¡Tienes entrada!',
      crumb: 'Confirmación',
      caducado: 'Este enlace ha caducado',
      pide: 'Pide uno nuevo en',
      mi: 'Mi entrada',
      anulada: 'Entrada anulada',
      noVale: 'Tu QR ya no vale. Si fue un error,',
      otra: 'reserva otra',
      plazas: 'mientras queden plazas.',
      spam: 'Si no la ves en 2 minutos, mira en spam.',
      cal: 'Al calendario',
      pdf: 'Descargar PDF',
      rifa: 'Rifa del campeonato',
      rifaX: 'Los boletos se compran en el recinto el día del campeonato. Aquí no se paga nada: consulta los objetos que se rifan.',
      prox: '¿Te avisamos de la próxima?',
      hecho: 'Hecho: revisa tu correo para confirmarlo.',
      vale: 'Vale, no te escribiremos.',
      noMarc: 'No marcaste novedades. Un clic y te mandamos la confirmación.',
      si: 'Sí, avisadme',
      no: 'No, gracias',
      invita: 'Invita a tu gente',
      comparte: 'Comparte tu enlace: sabremos cuántas entradas trae tu invitación.',
      wa: 'Vente a la GRS Cup 2, la entrada es gratis: ',
      copiarEnl: 'Copiar enlace',
      copiado: 'Copiado',
      copiar: 'Copiar',
      gestionar: 'Gestionar mi entrada',
      seoT: 'Tu entrada · GRS Cup 2',
      seoD: 'Tu entrada gratuita con su QR.',
      enviada: (e: string) => `Te la hemos enviado a ${e}.`,
    },
    mi: {
      tit: 'Mi entrada',
      caducado: 'Este enlace ha caducado',
      accede: 'Accede a tu entrada',
      seguridad: 'Por seguridad, los enlaces duran 30 minutos. ',
      nuevo: 'Te enviamos uno nuevo al email de tu reserva.',
      pedido: 'Si ese email tiene entradas, te llegará un enlace en unos minutos.',
      enviarme: 'Enviarme un enlace nuevo',
      siempre: 'Siempre respondemos igual exista o no la reserva (no se filtran emails).',
      cambia: '¿Cambia algo?',
      menos: 'Menos',
      mas: 'Más',
      guardar: 'Guardar cambios',
      reenviar: 'Reenviar la entrada por email',
      rifa: 'Rifa presencial: ver objetos',
      cal: 'Añadir al calendario (.ics)',
      anular: 'Anular entrada y liberar la plaza',
      anularQ: '¿Anular tu entrada?',
      volver: 'Volver',
      siAnular: 'Sí, anular',
      guardado: 'Guardado. Tu QR sirve para todas las personas de la entrada.',
      reenviada: 'Te la hemos reenviado. Llega en unos minutos.',
      seoD: 'Gestiona tu entrada: QR, personas, calendario o anulación.',
      liberaras: (n: number, s: string) => `Liberarás ${n} plaza${n > 1 ? 's' : ''} de la sesión del ${s} para la lista de espera.`,
    },
    of: {
      tit: 'Hay plaza para ti',
      crumb: 'Lista de espera',
      noVale: 'Esta oferta ya no vale',
      caducada: 'Ha caducado o ya la has usado. Si quedan plazas, puedes reservar en Entradas.',
      ver: 'Ver entradas',
      puertas: 'puertas',
      confirmando: 'Confirmando…',
      confirmar: 'Confirmar mi entrada',
      seoT: 'Plaza de la lista de espera · GRS Cup 2',
      seoD: 'Confirma la plaza que te hemos ofrecido.',
      plazas: (n: number, s: string) => `${n} plaza${n > 1 ? 's' : ''} para ${s}`,
      antes: (d: string, h: string) => `Confírmala antes del ${d} a las ${h}.`,
    },
  },
  en: {
    elDia: 'The day',
    est: { disponible: 'Available', ultimas: 'Last few', agotada: 'Sold out', cerrada: 'Closed', proximamente: 'Coming soon' },
    tk: {
      sorteo: (n: number) => `Prize draw · ${n} ${n === 1 ? 'ticket paid' : 'tickets paid'}`,
      qrOff: 'QR disabled', qrAlt: 'Ticket QR code', validada: 'Validated', puerta: 'Show at the gate',
      usada: (h: string) => 'Validated' + (h ? ' at ' + h : '') + ' · enjoy it!',
      anulada: 'You have released your place. Thanks for letting us know!', reservada: 'Show it on your phone at the gate (no need to print it)',
      dialogo: 'Ticket for the gate', cerrar: 'Close', gratis: 'Free ticket', anuladaPill: 'Cancelled',
    },
    pg: {
      migas: 'Breadcrumb',
      inicio: 'Home',
      entradas: 'Tickets',
      srTit: 'Tickets · GRS Cup 2',
      agotadas: 'Tickets sold out',
      h1a: 'We are at',
      h1b: 'full capacity',
      h1c: 'Experience GRS Cup 2',
      h1d: 'live',
      agotTxt: 'All tickets have been booked. Join the waiting list: if someone cancels, we will email you and you will have a set time to confirm.',
      listaBtn: 'Join the waiting list',
      directo: 'Follow it live',
      reservarMi: 'Book my ticket',
      comoFunc: 'How it works',
      personas: 'people',
      yaTienen: 'already have a ticket',
      ejTitular: 'Your name + 2 guests',
      limT: 'Too many visits from your network',
      limX: 'We have received too many requests from your connection. Wait a minute and reload the page.',
      errT: 'We could not load the tickets',
      errX: 'We are having a temporary problem. Please try again in a few minutes.',
      elige: 'Choose a session',
      completas: 'All sessions are full. Choose one to join its waiting list.',
      nlT: 'We will keep you posted',
      nlX: 'Schedules, prize draw and upcoming GRStrength competitions. One email a month at most.',
      cerradasT: 'Bookings closed',
      cerradasX: 'There are no sessions open for booking right now. Follow us on Instagram to find out when they open.',
      apuntado: 'You are on the list',
      completa: 'is full',
      esperaX: 'Join the waiting list for this session. If someone cancels, we will send you a link and you will have a set time to confirm your ticket.',
      emailPh: 'you@email.com',
      acepto: 'I have read and accept the',
      privacidad: 'privacy policy',
      otra: 'Choose another session',
      reservaTu: 'Book your ticket',
      tusDatos: 'Your details',
      nombre: 'First name',
      nombrePh: 'Your first name',
      nombreErr: 'Enter your first name',
      apellidos: 'Surname',
      apellidosPh: 'Your surname',
      apellidosErr: 'Enter your surname',
      emailPh2: 'email@example.com',
      emailErr: 'Enter a valid email',
      tel: 'Phone (optional)',
      origen: 'How did you hear about us?',
      opcion: 'Choose an option',
      cuantos: 'How many of you are coming?',
      nov: 'I want to receive news about GRS Cup and other GRStrength competitions.',
      opcional: '(Optional)',
      rgpd: 'Controller: GRStrength · Purpose: managing your ticket and, only if you tick it, sending you news · Legal basis: your consent · Rights: access, rectification, erasure and unsubscribing by writing to',
      org: 'the organisers',
      rgpd2: 'or from any email.',
      reservar: 'Book',
      persona: 'person',
      reservarGratis: 'Book free ticket',
      sinSpam: 'We only use your details for your ticket. No spam.',
      verT: 'What you will *see*',
      sinColas: 'No queues',
      comoT: 'How it *works*',
      verHor: 'See live schedule',
      dudas: 'Questions',
      faqT: 'Frequently asked *questions*',
      esperaSes: 'Waiting list per session',
      limitado: 'Limited capacity · 1 minute',
      apuntarme: 'Join',
      puertas: 'Doors',
      ultimasN: 'Last',
      personasL: 'People',
      tuMas: 'You + guests',
      menos: 'Fewer people',
      mas: 'More people',
      aforo: 'Capacity',
      agotadasEspera: 'Sold out · join the waiting list',
      revisa: (n: number) => (n === 1 ? 'Check 1 field' : 'Check ' + n + ' fields'),
      quedan: (n: string) => n + ' tickets left for this session',
      ejL1: 'Saturday · morning session',
      ejL2: 'Doors 8:30 · until 14:00',
      hasta: 'until',
      y: 'and',
      porConfirmar: 'Date to be confirmed',
      premiosSorteo: 'prizes and prize draw',
      premiosSorteoC: 'Prizes and prize draw',
      porDia: 'Times for each day',
      aforoDias: 'Capacity per day',
      ambosDias: 'both days',
      eNombre: 'First name: enter your first name.',
      eApellidos: 'Surname: enter your surname.',
      eEmail: 'Email: enter a valid email.',
      eSesion: 'Choose a session.',
      ePriv: 'Accept the privacy policy to book.',
      eEmail2: 'Enter a valid email.',
      ePriv2: 'Accept the privacy policy.',
      sesionAria: 'Session',
      ambos: 'Both days',
      ambosD: 'One ticket and one QR for both days',
      enEspera: (s: string, e: string) => `You are on the waiting list for ${s}. If a place frees up we will write to you at ${e}.`,
      origenes: ['Instagram', 'A friend or relative', 'My club or gym', 'An athlete', 'Poster or flyer', 'Other'],
      queVer: ['Squat, bench press and deadlift', 'AEP-2 and AEP-3 competition', INSCRITOS_AEP + ' athletes', 'Live prizes and prize draw', 'Follow your athletes', 'Enter the equipment raffle'],
      pasos: ['Book in 1 minute', 'Get your QR', 'Show it at the gate'],
      seoT: 'Free tickets · GRS Cup 2',
      seoD: 'Book your free ticket for GRS Cup 2 in Almussafes: choose a session, get your QR by email and walk in without queuing.',
    },
    cf: {
      tit: 'You have a ticket!',
      crumb: 'Confirmation',
      caducado: 'This link has expired',
      pide: 'Request a new one in',
      mi: 'My ticket',
      anulada: 'Ticket cancelled',
      noVale: 'Your QR is no longer valid. If it was a mistake,',
      otra: 'book another',
      plazas: 'while places last.',
      spam: 'If you do not see it within 2 minutes, check your spam.',
      cal: 'Add to calendar',
      pdf: 'Download PDF',
      rifa: 'Championship raffle',
      rifaX: 'Raffle tickets are bought at the venue on the day. Nothing is paid here: check out the items being raffled.',
      prox: 'Shall we let you know about the next one?',
      hecho: 'Done: check your email to confirm it.',
      vale: 'OK, we will not write to you.',
      noMarc: 'You did not opt in to news. One click and we will send you the confirmation.',
      si: 'Yes, let me know',
      no: 'No, thanks',
      invita: 'Invite your people',
      comparte: 'Share your link: we will know how many tickets your invitation brings in.',
      wa: 'Come to the GRS Cup 2, entry is free: ',
      copiarEnl: 'Copy link',
      copiado: 'Copied',
      copiar: 'Copy',
      gestionar: 'Manage my ticket',
      seoT: 'Your ticket · GRS Cup 2',
      seoD: 'Your free ticket with its QR.',
      enviada: (e: string) => `We have sent it to ${e}.`,
    },
    mi: {
      tit: 'My ticket',
      caducado: 'This link has expired',
      accede: 'Access your ticket',
      seguridad: 'For security, links last 30 minutes. ',
      nuevo: 'We will send a new one to your booking email.',
      pedido: 'If that email has tickets, you will get a link in a few minutes.',
      enviarme: 'Send me a new link',
      siempre: 'We always reply the same whether or not the booking exists (no emails are leaked).',
      cambia: 'Anything changed?',
      menos: 'Fewer',
      mas: 'More',
      guardar: 'Save changes',
      reenviar: 'Resend the ticket by email',
      rifa: 'In-person raffle: see items',
      cal: 'Add to calendar (.ics)',
      anular: 'Cancel ticket and release the place',
      anularQ: 'Cancel your ticket?',
      volver: 'Back',
      siAnular: 'Yes, cancel',
      guardado: 'Saved. Your QR is valid for everyone on the ticket.',
      reenviada: 'We have resent it. It will arrive in a few minutes.',
      seoD: 'Manage your ticket: QR, people, calendar or cancellation.',
      liberaras: (n: number, s: string) => `You will release ${n} place${n > 1 ? 's' : ''} in the ${s} session for the waiting list.`,
    },
    of: {
      tit: 'There is a place for you',
      crumb: 'Waiting list',
      noVale: 'This offer is no longer valid',
      caducada: 'It has expired or you have already used it. If places remain, you can book in Tickets.',
      ver: 'See tickets',
      puertas: 'doors',
      confirmando: 'Confirming…',
      confirmar: 'Confirm my ticket',
      seoT: 'Waiting-list place · GRS Cup 2',
      seoD: 'Confirm the place we have offered you.',
      plazas: (n: number, s: string) => `${n} place${n > 1 ? 's' : ''} for ${s}`,
      antes: (d: string, h: string) => `Confirm it before ${d} at ${h}.`,
    },
  },
};

const ESTADO: Record<SesionPub['estado'], { label: string; cls: string }> = {
  disponible: { label: 'Disponible', cls: 'border-success/50 bg-success/10 text-success' },
  ultimas: { label: 'Últimas', cls: 'border-accent/50 bg-accent/10 text-accent-text' },
  agotada: { label: 'Agotada', cls: 'border-line-strong text-text-tertiary' },
  cerrada: { label: 'Cerrada', cls: 'border-line-strong text-text-tertiary' },
  proximamente: { label: 'Próximamente', cls: 'border-info/40 bg-info/10 text-info' },
};

/**
 * Ticket card (Figma 02 «Ticket»: Reservada · Usada · Cancelada; used in 37 hero, 38 confirmation and «Mi entrada»):
 * charcoal card radius 20, perforation with notches, the QR. «Usada» dims the QR under the green «Validada» stamp;
 * «Cancelada» replaces it with «QR desactivado». «Con sorteo» adds the raffle tickets paid with the booking (/entradas step 4).
 */
@Component({
  selector: 'gr-ticket',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let e = est();
    @let b = e !== 'anulada' ? boletos() : [];
    <article class="relative overflow-hidden rounded-[20px] border shadow-card [overflow-wrap:anywhere]" [class]="b.length ? 'border-accent/55 bg-[linear-gradient(to_bottom_right,#4e121d,#150b0d)]' : 'border-line-strong bg-bg-card'">
      <div class="flex flex-col gap-3 px-5 pt-6 pb-4">
        <header class="flex h-8 items-center justify-between gap-3"><img [attr.srcset]="logoSrcset" sizes="84px" [src]="logo" alt="GRS Cup 2" width="84" height="32" class="h-8 w-[84px] object-contain" />
          <span class="inline-flex h-6 shrink-0 items-center rounded-pill border px-2.5 text-label-xs" [class]="pill[e].cls">{{ e === 'reservada' ? t().tk.gratis : e === 'usada' ? t().tk.validada : t().tk.anuladaPill }}</span></header>
        <p class="text-display-xs" [class.text-text-muted]="e === 'anulada'">{{ evento() }}</p>
        <ul class="flex flex-col gap-2 text-body-s text-text-secondary">
          <li class="flex items-center gap-2.5"><gr-icon name="calendar" [size]="15" class="text-accent-text" />{{ l1() }}</li>
          <li class="flex items-center gap-2.5"><gr-icon name="clock" [size]="15" class="text-accent-text" />{{ linea2() }}</li>
          @if (lugar()) { <li class="flex items-center gap-2.5"><gr-icon name="map-pin" [size]="15" class="text-accent-text" />{{ lugar() }}</li> }
          <li class="flex items-center gap-2.5"><gr-icon name="users" [size]="15" class="text-accent-text" />{{ titular() }}</li>
        </ul>
        @if (b.length) {
          <!-- Figma «Ticket / Con sorteo» -->
          <div class="flex items-center gap-2 rounded-md border border-accent/45 bg-black/25 p-3">
            <gr-icon name="ticket" [size]="16" class="shrink-0 text-accent-text" />
            <div class="flex min-w-0 flex-col gap-1">
              <p class="text-body-s font-semibold text-white">{{ t().tk.sorteo(b.length) }}</p>
              <p class="truncate text-mono-s text-text-secondary">Nº {{ b.join(' · ') }}@if (premio()) { · {{ premio() }} }</p>
            </div>
          </div>
        }
      </div>
      <!-- Figma «Perforado»: line 290 between two 24 notches cut half outside the card -->
      <div class="relative h-6" aria-hidden="true">
        <span class="absolute inset-x-[29px] top-3 border-t border-dashed border-line-strong"></span>
        <span class="absolute top-0 -left-3 size-6 rounded-full border border-line-strong bg-bg-base"></span>
        <span class="absolute top-0 -right-3 size-6 rounded-full border border-line-strong bg-bg-base"></span>
      </div>
      <div class="relative flex flex-col items-center gap-2 px-5 pt-2 pb-6 text-center">
        @if (e === 'anulada') {
          <span class="flex size-42 flex-col items-center justify-center gap-2 rounded-lg border max-[430px]:size-52 border-line-strong text-text-muted"><gr-icon name="x" [size]="32" /><span class="text-label-s">{{ t().tk.qrOff }}</span></span>
        } @else if (img()) {
          <img [src]="img()" [alt]="t().tk.qrAlt" width="208" height="208" class="size-42 rounded-sm bg-white p-2 max-[430px]:size-52 max-[430px]:p-4" [class.opacity-22]="e === 'usada'" />
        } @else { <span class="size-42 rounded-sm bg-white/10 max-[430px]:size-52"></span> }
        @if (e === 'usada') {
          <span class="absolute top-[57px] flex max-[430px]:top-[77px] translate-x-1 -rotate-8 flex-col items-center gap-1 rounded-md border-2 border-success px-5 py-2 text-success" aria-hidden="true">
            <span class="text-display-s">{{ t().tk.validada }}</span>@if (validadaEn()) { <span class="text-mono-s">{{ validadaEn() }}</span> }
          </span>
        }
        <p class="font-mono text-[17px] leading-6 font-semibold tracking-[.08em]" [class]="e === 'anulada' ? 'text-text-muted' : 'text-text-primary'">{{ codigo() }}</p>
        @if (puertaBtn() && e === 'reservada' && img()) {
          <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:bg-white/5" (click)="abrirPuerta()"><gr-icon name="maximize" [size]="16" />{{ t().tk.puerta }}</button>
        }
        <p class="text-body-xs text-text-tertiary">{{ e === 'usada' ? t().tk.usada(validadaEn().slice(-5)) : e === 'anulada' ? t().tk.anulada : t().tk.reservada }}</p>
      </div>
    </article>
    @if (puerta()) {
      <!-- UX8-R1-9: full-screen QR for the door (white, max contrast) -->
      <div class="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-white px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-black" role="dialog" aria-modal="true" [attr.aria-label]="t().tk.dialogo" (keydown.escape)="cerrarPuerta()" (keydown.tab)="$event.preventDefault()">
        <button #cerrarP type="button" class="absolute top-[max(12px,env(safe-area-inset-top))] right-3 flex size-11 items-center justify-center rounded-full bg-black/8" [attr.aria-label]="t().tk.cerrar" (click)="cerrarPuerta()"><gr-icon name="x" [size]="22" /></button>
        <img [src]="img()" [alt]="t().tk.qrAlt" class="aspect-square w-[min(82vw,60vh,420px)]" />
        <p class="font-mono text-[22px] font-semibold tracking-[.08em]">{{ codigo() }}</p>
        <p class="text-center text-body-m text-black/60">{{ titular() }}</p>
      </div>
    }
  `,
})
export class TicketCard {
  protected readonly logo = LOGO;
  protected readonly logoSrcset = LOGO_SRCSET;
  protected readonly t = inject(I18n).dict(T);
  /** «Mostrar en puerta» button (real tickets only, not the hero example). */
  readonly puertaBtn = input(false);
  protected readonly puerta = signal(false);
  private readonly cerrarP = viewChild<ElementRef<HTMLElement>>('cerrarP');
  private volverA: HTMLElement | null = null;
  protected abrirPuerta(): void {
    this.volverA = document.activeElement as HTMLElement | null;
    this.puerta.set(true);
    setTimeout(() => this.cerrarP()?.nativeElement.focus());
  }
  protected cerrarPuerta(): void {
    this.puerta.set(false);
    this.volverA?.focus();
  }
  readonly evento = input('GRS Cup 2');
  readonly linea1 = input('');
  readonly linea2 = input('');
  readonly lugar = input('');
  readonly titular = input('');
  readonly codigo = input('');
  readonly qr = input('');
  readonly estado = input<'reservada' | 'usada' | 'anulada'>('reservada');
  /** Raffle ticket numbers paid with the booking («Con sorteo») and the prize. */
  readonly boletos = input<string[]>([]);
  readonly premio = input('');
  /** «25/07 · 10:12» on the stamp of a used ticket. */
  readonly validadaEn = input('');
  protected readonly est = this.estado;
  /** «Sábado 25 jul · …» (Intl gives the weekday in lower case). */
  protected readonly l1 = computed(() => this.linea1().charAt(0).toUpperCase() + this.linea1().slice(1));
  protected readonly pill = {
    reservada: { t: 'Entrada gratuita', cls: 'border-success/40 bg-success/12 text-success' },
    usada: { t: 'Validada', cls: 'border-text-tertiary/40 bg-text-tertiary/12 text-text-tertiary' },
    anulada: { t: 'Anulada', cls: 'border-accent/40 bg-accent/12 text-accent-text' },
  };
  protected readonly img = signal('');
  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const v = this.qr();
      if (v && browser) void qrDataURL(v, 640).then((u) => this.img.set(u));
    });
  }
}

/** Ticket line 1 without repeating the weekday (UX8-R1-7): «sáb 19 dic · Tarde». */
const diaCorto = (iso: string, loc: string, mes: boolean) =>
  new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', ...(mes ? { month: 'short' } : {}), timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace(/[,.]/g, '').replace(/^\p{L}/u, (c) => c.toUpperCase());
/** Ticket line 1; with a second day: «Sáb 19 y Dom 20 dic» (BIZ-163). A name that only repeats the day («Sábado 19») adds nothing (BIZ-209). */
const lineaTicket = (inicio: string, nombre: string, loc = 'es-ES', inicio2?: string) => {
  if (inicio2) return diaCorto(inicio, loc, false) + (loc.startsWith('en') ? ' and ' : ' y ') + diaCorto(inicio2, loc, true);
  const resto = nombre.replace(/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*/i, '').trim();
  return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(inicio)).replace(/[,.]/g, '') +
    (/^\d*$/.test(resto) ? '' : ' · ' + resto.replace(/^\p{L}/u, (c) => c.toUpperCase()));
};
/** Ticket line 2: «Puertas 08:30 · hasta las 14:00»; two days: «Puertas 08:30 los dos días» or «Puertas sáb 08:30 · dom 09:00» (BIZ-209). */
const lineaPuertas = (pg: { puertas: string; hasta: string; ambosDias: string }, loc: string, s: Pick<SesionPub, 'inicio' | 'puertas' | 'fin'>, s2?: Pick<SesionPub, 'inicio' | 'puertas'>) => {
  if (!s2) return pg.puertas + ' ' + hora(s.puertas) + ' · ' + pg.hasta + ' ' + hora(s.fin);
  if (hora(s.puertas) === hora(s2.puertas)) return pg.puertas + ' ' + hora(s.puertas) + ' ' + pg.ambosDias;
  const wd = (iso: string) => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace('.', '');
  return pg.puertas + ' ' + wd(s.inicio) + ' ' + hora(s.puertas) + ' · ' + wd(s2.inicio) + ' ' + hora(s2.puertas);
};

const titular = (m: { nombre: string; apellidos: string; personas: number }, lang = 'es') =>
  `${m.nombre} ${m.apellidos}`.trim() + (m.personas > 1 ? (lang === 'en' ? ` + ${m.personas - 1} guest${m.personas > 2 ? 's' : ''}` : ` + ${m.personas - 1} acompañante${m.personas > 2 ? 's' : ''}`) : '');

// ============================================================ /entradas ===

const eur = { es: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }), en: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }) };
/** «2 €», «2,50 €» (cents in). */
const euros = (c: number, lang: Lang = 'es') => eur[lang].format(c / 100).replace(lang === 'es' ? ',00' : '.00', '');
/** Booking draft kept across the magic-link login. */
const BORRADOR = 'gr.entradas.borrador';
const CAMPO = 'h-12 w-full rounded-sm border bg-bg-field px-3.5 text-body-m text-text-primary placeholder:text-text-muted focus:border-accent-text focus:outline-none';

/**
 * /entradas (Figma page 37): full-bleed hero with the example ticket and the session capacity; «Qué vas a ver», «Cómo
 * funciona», the day hour by hour (from the published schedule) and the FAQ on the left; the booking form (sticky) on
 * the right — on phones the form comes right after the hero and a bottom bar brings it back. Step 4 adds raffle tickets
 * while the raffle is on sale: the ticket is reserved first (free) and then the payment opens. States: errors, sending,
 * sold-out session (waiting list) and everything sold out.
 */
@Component({
  selector: 'gr-entradas-page',
  imports: [CdnPipe, LocPipe, GrSelect, RouterLink, NgTemplateOutlet, Navbar, Footer, FormsModule, GrAlert, GrButton, GrCheckbox, GrIcon, GrSkeleton, GrCabecera, TicketCard, Newsletter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <gr-navbar />
    <main class="relative overflow-x-clip">
      <!-- Figma «Hero campaña»: the crowd photo, a dark veil and the red glow; 920 px on desktop -->
      <!-- UX8-R1-13: only the background layers are clipped; the text reflows at 200 % text size -->
      <section class="relative flex lg:min-h-[920px] lg:items-center">
        <div class="absolute inset-0 overflow-hidden" aria-hidden="true">
        <img [src]="'/img/home/org-publico-l.webp' | cdn" [attr.srcset]="('/img/home/org-publico-s.webp' | cdn) + ' 640w, ' + ('/img/home/org-publico-l.webp' | cdn) + ' 1300w'" sizes="100vw" alt="Público en la grada de la GRS Cup" class="absolute inset-0 size-full object-cover brightness-75 grayscale" fetchpriority="high" />
        <div class="absolute inset-0 bg-[linear-gradient(180deg,rgb(14_12_13/0.72),rgb(14_12_13/0.8)_60%,var(--color-bg-base))]" aria-hidden="true"></div>
        <div class="pointer-events-none absolute -top-40 -right-40 size-[780px] rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.3),transparent)]" aria-hidden="true"></div>
        </div>
        <div class="relative mx-auto grid w-full max-w-[1200px] items-center gap-10 px-5 pt-[104px] pb-12 md:px-8 md:pt-40 md:pb-20 lg:grid-cols-[minmax(0,700px)_350px] lg:justify-between lg:pt-24 lg:pb-16 xl:px-0">
          <div class="flex min-w-0 flex-col items-start gap-4 [overflow-wrap:anywhere] md:gap-5">
            <!-- Figma «Cabecera de página»: breadcrumbs + title; the eyebrow stays for SEO only -->
            <nav class="flex flex-wrap items-center gap-1.5 text-body-s text-text-tertiary" [attr.aria-label]="t().pg.migas">
              <a [routerLink]="'/' | loc" class="-mx-2 -my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-2 hover:text-text-primary">{{ t().pg.inicio }}</a>
              <gr-icon name="chevron-right" [size]="14" /><span class="text-text-secondary">{{ t().pg.entradas }}</span>
            </nav>
            <p class="sr-only">{{ t().pg.srTit }}</p>
            @if (todasAgotadas()) { <p class="inline-flex min-h-7 items-center rounded-full border border-line-strong bg-white/5 px-3 text-label-xs text-text-secondary uppercase">{{ t().pg.agotadas }}</p> }
            <h1 class="text-display-m hyphens-auto [filter:drop-shadow(0_2px_20px_rgb(0_0_0/0.8))] max-md:text-[clamp(2.25rem,9vw,4.5rem)] md:text-display-hero" [lang]="i18n.lang()">
              @if (todasAgotadas()) { {{ t().pg.h1a }} <span class="whitespace-nowrap bg-[linear-gradient(90deg,#C42B3E,#8E2530)] bg-clip-text text-transparent">{{ t().pg.h1b }}</span> } @else { {{ t().pg.h1c }} <span class="whitespace-nowrap bg-[linear-gradient(90deg,#C42B3E,#8E2530)] bg-clip-text text-transparent">{{ t().pg.h1d }}</span> }
            </h1>
            @if (todasAgotadas()) {
              <p class="max-w-[640px] text-body-m text-text-secondary md:text-body-l">{{ t().pg.agotTxt }}</p>
            }
            <ul class="flex flex-col gap-2 text-body-s text-text-secondary md:flex-row md:flex-wrap md:gap-x-6">
              <li class="flex items-center gap-2"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ fechas() }}</li>
              <li class="flex items-center gap-2"><gr-icon name="map-pin" [size]="16" class="text-accent-text" />{{ comp.data()?.sede?.nombre || 'Almussafes' }}</li>
              @if (diasEvento().length > 1) {
                <!-- BIZ-209: each day on its own card (date, doors, prizes) so both dates read at a glance -->
                <li class="w-full md:basis-full"><ul class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3" [attr.aria-label]="t().pg.porDia">
                  @for (x of diasEvento(); track x.dia) {
                    <li class="flex min-w-0 flex-col gap-1 rounded-md border border-line-subtle bg-bg-card/80 px-3 py-2.5 sm:min-w-[184px]">
                      <span class="flex items-center gap-2 text-label-m text-text-primary"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ x.dia }}</span>
                      @if (x.puertas) { <span class="flex items-center gap-2"><gr-icon name="clock" [size]="14" class="shrink-0 text-text-tertiary" />{{ t().pg.puertas }} {{ x.puertas }}</span> }
                      @if (x.premios) { <span class="flex items-center gap-2"><gr-icon name="trophy" [size]="14" class="shrink-0 text-text-tertiary" />{{ t().pg.premiosSorteoC }} {{ x.premios }}</span> }
                    </li>
                  }
                </ul></li>
              } @else if (puertas()) { <li class="flex items-center gap-2 md:basis-full"><gr-icon name="clock" [size]="16" class="text-accent-text" />{{ puertas() }}</li> }
            </ul>
            <div class="mt-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              @if (todasAgotadas()) {
                <a grButton variant="primary" size="l" routerLink="." fragment="reservar">{{ t().pg.listaBtn }}</a>
                <a grButton variant="outline" size="l" [routerLink]="'/en-directo' | loc" iconRight="arrow-right">{{ t().pg.directo }}</a>
              } @else {
                <a grButton variant="primary" size="l" routerLink="." fragment="reservar">{{ t().pg.reservarMi }}</a>
                <a grButton variant="secondary" size="l" routerLink="." fragment="como-funciona" iconRight="arrow-right">{{ t().pg.comoFunc }}</a>
              }
            </div>
            @if (d?.personas) {
              <!-- same social proof as the home «Entradas» section -->
              <div class="flex items-center gap-3">
                <span class="text-body-s"><b class="font-semibold">{{ n(d!.personas) }} {{ t().pg.personas }}</b> {{ t().pg.yaTienen }}</span>
              </div>
            }
            @if ((d?.sesiones?.length ?? 0) > 1) { <div class="w-full lg:hidden"><ng-container [ngTemplateOutlet]="aforoDias" /></div> }
          </div>
          <!-- Figma «Ticket» (rotated 4°) and «Aforo meter»: desktop only -->
          <div class="hidden flex-col gap-5 lg:flex">
            <gr-ticket class="rotate-[4deg]" [linea1]="ejemplo().l1" [linea2]="ejemplo().l2" [lugar]="comp.data()?.sede?.nombre ?? ''" [titular]="t().pg.ejTitular" codigo="" qr="E:ejemplo" />
            @if ((d?.sesiones?.length ?? 0) > 1) { <ng-container [ngTemplateOutlet]="aforoDias" /> }
            @else if (sesHero(); as s) { <ng-container [ngTemplateOutlet]="aforo" [ngTemplateOutletContext]="{ $implicit: s }" /> }
          </div>
        </div>
      </section>

      <div class="relative mx-auto mt-12 grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-16 px-5 pb-18 md:mt-20 md:px-8 md:pb-24 lg:grid-cols-[minmax(0,616px)_minmax(0,520px)] lg:justify-between lg:gap-10 xl:px-0">
        <!-- the form: right column (sticky) on desktop, right after the hero on phones -->
        <aside id="reservar" #reservarEl class="scroll-mt-24 md:mx-auto md:w-full md:max-w-[560px] lg:col-start-2 lg:row-start-1 lg:max-w-none">
          <div class="lg:sticky lg:top-28">
            @if (d === undefined) { <gr-skeleton class="h-[640px] rounded-2xl" /> }
            @else if (d === null && fallo.limitado()) { <gr-alert tone="warning" [title]="t().pg.limT">{{ t().pg.limX }}</gr-alert> }
            @else if (d === null) { <gr-alert tone="warning" [title]="t().pg.errT">{{ t().pg.errX }}</gr-alert> }
            @else if (todasAgotadas() && !sesSel()) {
              <!-- Figma «Todo agotado»: no form; the waiting list is per session -->
              <section class="flex flex-col gap-4 rounded-2xl border border-line-strong bg-bg-card p-5 md:p-7">
                <h2 class="text-display-xs md:text-display-s">{{ t().pg.elige }}</h2>
                <p class="text-body-s text-text-secondary">{{ t().pg.completas }}</p>
                <ng-container [ngTemplateOutlet]="sesiones" />
              </section>
              <gr-newsletter class="mt-4 block" [titulo]="t().pg.nlT" [texto]="t().pg.nlX" origen="/entradas" [compacta]="true" />
            } @else if (!abiertas().length && !todasAgotadas()) {
              <section class="rounded-2xl border border-line-strong bg-bg-card p-6 text-center">
                <h2 class="text-display-xs">{{ t().pg.cerradasT }}</h2>
                <p class="mt-2 text-body-s text-text-secondary">{{ t().pg.cerradasX }}</p>
              </section>
            } @else if (enviado(); as e) {
              <section class="flex flex-col items-center gap-3 rounded-2xl border border-success/40 bg-success/8 p-6 text-center" role="status"><gr-icon name="mail" [size]="26" class="text-success" /><h2 class="text-ui-h4">{{ t().pg.apuntado }}</h2><p class="text-body-s text-text-secondary">{{ e }}</p></section>
            } @else if (sesSel()?.estado === 'agotada' && sesSel()?.listaEspera) {
              <!-- Figma «Sesión agotada · lista de espera» -->
              <section class="flex flex-col gap-4">
                <h2 class="text-display-xs md:text-display-s">{{ t().pg.elige }}</h2>
                <ng-container [ngTemplateOutlet]="sesiones" />
                <ng-container [ngTemplateOutlet]="aforo" [ngTemplateOutletContext]="{ $implicit: sesSel()! }" />
                <div class="flex flex-col gap-4 rounded-2xl border border-warning/60 bg-bg-card p-5 md:p-6">
                  <h3 class="flex items-center gap-3 text-ui-h4"><span class="flex size-10 items-center justify-center rounded-md bg-warning/12 text-warning"><gr-icon name="bell" [size]="20" /></span>{{ sesSel()!.nombre }} {{ t().pg.completa }}</h3>
                  <p class="text-body-s text-text-secondary">{{ t().pg.esperaX }}</p>
                  <label class="relative block"><span class="sr-only">Email</span><gr-icon name="mail" [size]="16" class="absolute top-1/2 left-3.5 -translate-y-1/2 text-text-tertiary" />
                    <input type="email" autocomplete="email" class="pl-10" [class]="campo(false)" [placeholder]="t().pg.emailPh" [(ngModel)]="f.email" name="we" /></label>
                  <ng-container [ngTemplateOutlet]="personas" />
                  <gr-checkbox name="wp" [(checked)]="f.privacidad">{{ t().pg.acepto }} <a [routerLink]="'/privacidad' | loc" class="text-accent-text underline">{{ t().pg.privacidad }}</a> *</gr-checkbox>
                  @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                  <button grButton variant="primary" size="l" type="button" class="w-full" [loading]="enviando()" (click)="apuntarme()">{{ t().pg.listaBtn }}</button>
                  @if (abiertas().length) { <button type="button" class="h-11 text-label-s text-text-tertiary hover:text-text-primary" (click)="elegir(abiertas()[0])">{{ t().pg.otra }}</button> }
                </div>
              </section>
            } @else {
              <!-- a card from tablet up; on phones the form sits on the page (Figma 37 mobile) -->
              <form method="post" class="flex flex-col gap-6 md:rounded-2xl md:border md:border-line-strong md:bg-bg-card md:p-7" (submit)="$event.preventDefault(); reservar()" novalidate>
                <h2 class="text-display-xs md:text-display-s">{{ t().pg.reservaTu }}</h2>
                @if (errores().length) {
                  <div class="flex scroll-mt-24 flex-col gap-1.5 rounded-md border border-accent/60 bg-accent/8 p-4" role="alert" tabindex="-1" #resumenErr>
                    <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />{{ t().pg.revisa(errores().length) }}</p>
                    @for (e of errores(); track e) { <p class="pl-[26px] text-body-s text-text-secondary">{{ e }}</p> }
                  </div>
                }
                <fieldset class="flex flex-col gap-4">
                  <legend class="mb-4 flex items-center gap-2.5 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent/20 text-label-xs text-accent-text">1</span>{{ t().pg.tusDatos }}</legend>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="flex flex-col gap-1.5 text-label-s">{{ t().pg.nombre }} *<input [class]="campo(err('nombre'))" [(ngModel)]="f.nombre" name="nombre" autocomplete="given-name" [placeholder]="t().pg.nombrePh" [attr.aria-invalid]="err('nombre')" [attr.aria-describedby]="err('nombre') ? 'err-nombre' : null" />
                      @if (err('nombre')) { <span id="err-nombre" class="flex items-center gap-1.5 text-body-s font-normal text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ t().pg.nombreErr }}</span> }</label>
                    <label class="flex flex-col gap-1.5 text-label-s">{{ t().pg.apellidos }} *<input [class]="campo(err('apellidos'))" [(ngModel)]="f.apellidos" name="apellidos" autocomplete="family-name" [placeholder]="t().pg.apellidosPh" [attr.aria-invalid]="err('apellidos')" [attr.aria-describedby]="err('apellidos') ? 'err-apellidos' : null" />
                      @if (err('apellidos')) { <span id="err-apellidos" class="flex items-center gap-1.5 text-body-s font-normal text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ t().pg.apellidosErr }}</span> }</label>
                  </div>
                  <label class="flex flex-col gap-1.5 text-label-s">Email *<input type="email" [class]="campo(err('email'))" [(ngModel)]="f.email" name="email" autocomplete="email" [placeholder]="t().pg.emailPh2" [attr.aria-invalid]="err('email')" [attr.aria-describedby]="err('email') ? 'err-email' : null" />
                    @if (err('email')) { <span id="err-email" class="flex items-center gap-1.5 text-body-s font-normal text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ t().pg.emailErr }}</span> }</label>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="flex flex-col gap-1.5 text-label-s">{{ t().pg.tel }}
                      <span class="flex h-12 items-center overflow-hidden rounded-sm border border-line-strong bg-bg-field focus-within:border-accent-text"><span class="flex h-full items-center border-r border-line-subtle px-3 text-body-m font-normal text-text-secondary">+34</span>
                        <input type="tel" inputmode="tel" class="h-full min-w-0 flex-1 bg-transparent px-3 text-body-m font-normal placeholder:text-text-muted focus:outline-none" [(ngModel)]="f.telefono" name="tel" autocomplete="tel-national" placeholder="600 000 000" /></span></label>
                    <div class="flex flex-col gap-1.5 text-label-s"><label for="e-origen">{{ t().pg.origen }}</label><gr-select id="e-origen" tam="l" class="font-normal" [(ngModel)]="f.origen" name="origen"><option value="">{{ t().pg.opcion }}</option>@for (o of origenes; track o; let i = $index) { <option [value]="o">{{ t().pg.origenes[i] }}</option> }</gr-select></div>
                  </div>
                </fieldset>
                <fieldset class="flex flex-col gap-3">
                  <legend class="mb-3 flex w-full items-center gap-2.5 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent/20 text-label-xs text-accent-text">2</span>{{ t().pg.elige }}<span class="ml-auto text-body-xs font-normal text-text-tertiary">{{ diaSesiones() }}</span></legend>
                  <ng-container [ngTemplateOutlet]="sesiones" />
                </fieldset>
                <fieldset class="flex flex-col gap-3">
                  <legend class="mb-3 flex items-center gap-2.5 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent/20 text-label-xs text-accent-text">3</span>{{ t().pg.cuantos }}</legend>
                  <ng-container [ngTemplateOutlet]="personas" />
                </fieldset>
                <div class="flex flex-col gap-3 text-body-s">
                  <gr-checkbox name="priv" [(checked)]="f.privacidad" [invalid]="!!err('privacidad')"><span [class.text-accent-text]="err('privacidad')">{{ t().pg.acepto }} <a [routerLink]="'/privacidad' | loc" class="text-accent-text underline">{{ t().pg.privacidad }}</a> *</span></gr-checkbox>
                  <gr-checkbox name="nov" [(checked)]="f.novedades">{{ t().pg.nov }} <span class="text-text-tertiary">{{ t().pg.opcional }}</span></gr-checkbox>
                  <p class="rounded-md bg-white/4 p-3 text-body-xs text-text-tertiary">{{ t().pg.rgpd }} {{ comp.data()?.evento?.emailContacto || t().pg.org }} {{ t().pg.rgpd2 }}</p>
                </div>
                <!-- UX8-R1-3: sticky CTA (phones) while the real submit button is off screen -->
                <div class="sticky bottom-0 z-10 -mx-5 border-t border-line-subtle bg-bg-base/95 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[10px] transition-opacity duration-200 ease-[cubic-bezier(.2,.8,.2,1)] md:hidden" [class.opacity-0]="enviarVisible()" [class.pointer-events-none]="enviarVisible()" [attr.inert]="enviarVisible() || null">
                  <button grButton variant="primary" size="l" type="submit" class="w-full" [disabled]="!hidratado()" [loading]="enviando()">{{ t().pg.reservar }} · {{ f.personas }} {{ f.personas === 1 ? t().pg.persona : t().pg.personas }}@if (sesSel(); as s) { · {{ s.nombre }} }</button>
                </div>
                <button #enviarBtn grButton variant="primary" size="l" type="submit" class="w-full" [disabled]="!hidratado()" [loading]="enviando()">{{ t().pg.reservarGratis }}</button>
                <p class="flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />{{ t().pg.sinSpam }}</p>
              </form>
            }
          </div>
        </aside>

        <div class="flex flex-col gap-16 md:gap-20 lg:col-start-1 lg:row-start-1">
          <section class="flex flex-col gap-5 md:gap-7">
            <p class="sr-only">{{ t().elDia }}</p>
            <gr-cabecera [titulo]="t().pg.verT" [centro]="false" tam="m" />
            <ul class="grid grid-cols-2 gap-3 md:gap-4">
              @for (x of queVer; track x.t) {
                <li class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5"><span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text md:size-11"><gr-icon [name]="x.i" [size]="20" /></span>
                  <span class="text-label-m">{{ t().pg.queVer[$index] }}</span></li>
              }
            </ul>
          </section>
          <section id="como-funciona" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().pg.sinColas" [titulo]="t().pg.comoT" [centro]="false" tam="m" />
            <ol class="flex flex-col gap-3">
              @for (x of pasos; track x; let i = $index) {
                <li class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-4 py-3.5"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-label-s text-accent-text">{{ i + 1 }}</span>
                  <span class="text-label-m">{{ t().pg.pasos[i] }}</span></li>
              }
            </ol>
            <a grButton variant="outline" [routerLink]="'/horarios' | loc" iconRight="arrow-right" class="w-full sm:w-auto sm:self-start">{{ t().pg.verHor }}</a>
          </section>
          @if (faq().length) {
            <section class="flex flex-col gap-5 md:gap-7">
              <gr-cabecera [eyebrow]="t().pg.dudas" [titulo]="t().pg.faqT" [centro]="false" tam="m" />
              <div class="flex flex-col gap-3">
                @for (f of faq(); track f.pregunta; let first = $first) {
                  <details class="group rounded-lg border border-line-subtle bg-bg-card open:border-accent/60" [open]="first">
                    <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-ui-h5 md:text-ui-h4">{{ f.pregunta }}
                      <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-text-secondary group-open:bg-accent/20 group-open:text-accent-text"><gr-icon name="plus" [size]="14" class="transition-transform group-open:rotate-45" /></span></summary>
                    <div class="prose-gr px-5 pb-5 text-body-m text-text-secondary" [innerHTML]="md(f.respuesta)"></div>
                  </details>
                }
              </div>
            </section>
          }
        </div>
      </div>
    </main>
    <gr-footer />
    @if (barra()) {
      <!-- Figma «Bottom CTA bar» (mobile): back to the form -->
      <div class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line-subtle bg-bg-base/95 px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[20px] md:hidden">
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-s">{{ todasAgotadas() ? t().pg.agotadas : t().tk.gratis }}</span><span class="text-body-xs text-text-tertiary">{{ todasAgotadas() ? t().pg.esperaSes : t().pg.limitado }}</span></span>
        <a routerLink="." fragment="reservar" class="flex h-12 items-center justify-center rounded-sm bg-accent-grain px-6 text-label-m text-white">{{ todasAgotadas() ? t().pg.apuntarme : t().pg.reservar }}</a>
      </div>
    }

    <ng-template #sesiones>
      <div class="flex flex-col gap-3" role="radiogroup" [attr.aria-label]="t().pg.sesionAria">
        @for (s of d!.sesiones; track s.id) {
          <button type="button" role="radio" [attr.aria-checked]="sesion() === s.id" [disabled]="s.estado === 'cerrada' || s.estado === 'proximamente'" (click)="elegir(s)"
            class="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50"
            [class]="sesion() === s.id ? 'border-accent bg-accent/10' : err('sesion') ? 'border-accent-text/60' : 'border-line-subtle hover:border-line-strong'">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" [class]="sesion() === s.id ? 'border-accent' : 'border-line-strong'">@if (sesion() === s.id) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
            <span class="min-w-0 flex-1" [class.text-text-tertiary]="s.estado === 'agotada' && sesion() !== s.id"><span class="block text-label-m first-letter:uppercase">{{ s.nombre }}</span><span class="block text-body-xs text-text-tertiary">{{ t().pg.puertas }} {{ hora(s.puertas) }}{{ s.detalle ? ' · ' + s.detalle : '' }}</span></span>
            <span class="inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-label-xs uppercase" [class]="estado[s.estado].cls">{{ s.estado === 'ultimas' ? t().pg.ultimasN + ' ' + s.libres : t().est[s.estado] }}</span>
          </button>
        }
        @if (ambos(); as a) {
          <button type="button" role="radio" [attr.aria-checked]="sesion() === AMBOS" (click)="elegir(a)"
            class="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors"
            [class]="sesion() === AMBOS ? 'border-accent bg-accent/10' : err('sesion') ? 'border-accent-text/60' : 'border-line-subtle hover:border-line-strong'">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" [class]="sesion() === AMBOS ? 'border-accent' : 'border-line-strong'">@if (sesion() === AMBOS) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
            <span class="min-w-0 flex-1"><span class="block text-label-m first-letter:uppercase">{{ t().pg.ambos }}</span><span class="block text-body-xs text-text-tertiary">{{ a.nombre }} · {{ t().pg.ambosD }}</span></span>
            <span class="inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-label-xs uppercase" [class]="estado[a.estado].cls">{{ a.estado === 'ultimas' ? t().pg.ultimasN + ' ' + a.libres : t().est[a.estado] }}</span>
          </button>
        }
      </div>
    </ng-template>
    <ng-template #personas>
      <div class="flex items-center justify-between rounded-lg border border-line-subtle px-4 py-3">
        <span class="flex flex-col"><span class="text-label-m">{{ t().pg.personasL }}</span><span class="text-body-xs text-text-tertiary">{{ t().pg.tuMas }}</span></span>
        <span class="flex items-center gap-3">
          <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong disabled:opacity-40" [attr.aria-label]="t().pg.menos" [disabled]="f.personas <= 1" (click)="f.personas = max(1, f.personas - 1)"><gr-icon name="minus" [size]="16" /></button>
          <span class="w-6 text-center text-ui-h4" aria-live="polite">{{ f.personas }}</span>
          <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong disabled:opacity-40" [attr.aria-label]="t().pg.mas" [disabled]="f.personas >= maxPersonas()" (click)="f.personas = min(maxPersonas(), f.personas + 1)"><gr-icon name="plus" [size]="16" /></button>
        </span>
      </div>
    </ng-template>
    <ng-template #aforo let-s>
      <div class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card/90 p-4">
        <p class="flex items-center justify-between gap-3 text-label-s"><span class="flex items-center gap-2"><gr-icon name="users" [size]="16" class="text-accent-text" />{{ t().pg.aforo }} · {{ s.nombre }}</span><span class="font-mono text-mono-s text-text-secondary">{{ n(s.ocupadas) }} / {{ n(s.aforo) }}</span></p>
        <div class="h-1.5 rounded-full bg-white/10"><div class="h-full rounded-full" [class]="s.estado === 'agotada' ? 'bg-text-tertiary' : 'bg-accent'" [style.width.%]="min(100, s.ocupadas * 100 / s.aforo)"></div></div>
        <p class="flex items-center gap-1.5 text-body-s text-text-secondary">@if (!s.libres) { <gr-icon name="bell" [size]="14" class="text-text-tertiary" /> }{{ s.libres ? t().pg.quedan(n(s.libres)) : t().pg.agotadasEspera }}</p>
      </div>
    </ng-template>
    <ng-template #aforoDias>
      <!-- BIZ-209: one capacity bar per date -->
      <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card/90 p-4" [attr.aria-label]="t().pg.aforoDias">
        <p class="flex items-center gap-2 text-label-s"><gr-icon name="users" [size]="16" class="text-accent-text" />{{ t().pg.aforoDias }}</p>
        @for (s of d!.sesiones; track s.id) {
          <div class="flex flex-col gap-1.5">
            <p class="flex items-center justify-between gap-3"><span class="text-label-s">{{ linea(s.inicio, s.nombre, i18n.locale()) }}</span><span class="font-mono text-mono-s text-text-secondary">{{ n(s.ocupadas) }} / {{ n(s.aforo) }}</span></p>
            <div class="h-1.5 rounded-full bg-white/10" role="progressbar" [attr.aria-valuenow]="s.ocupadas" aria-valuemin="0" [attr.aria-valuemax]="s.aforo" [attr.aria-label]="t().pg.aforo + ' · ' + linea(s.inicio, s.nombre, i18n.locale())"><div class="h-full rounded-full" [class]="s.estado === 'agotada' ? 'bg-text-tertiary' : 'bg-accent'" [style.width.%]="min(100, s.ocupadas * 100 / s.aforo)"></div></div>
            <p class="flex items-center gap-1.5 text-body-xs text-text-tertiary">@if (!s.libres) { <gr-icon name="bell" [size]="12" /> }{{ s.libres ? t().pg.quedan(n(s.libres)) : t().pg.agotadasEspera }}</p>
          </div>
        }
      </section>
    </ng-template>
  `,
})
export class EntradasPage {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  private readonly api = inject(EntradasPublic);
  private readonly fan = inject(FanSession);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly comp = inject(Competition);
  protected readonly fallo = inject(FalloApi);
  private readonly reservarEl = viewChild<ElementRef<HTMLElement>>('reservarEl');
  private readonly enviarBtn = viewChild('enviarBtn', { read: ElementRef<HTMLElement> });
  protected readonly enviarVisible = signal(true);
  protected readonly hora = hora;
  protected readonly linea = lineaTicket;
  protected readonly estado = ESTADO;
  protected readonly euros = (c: number) => euros(c, this.i18n.lang());
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  protected readonly origenes = ['Instagram', 'Un amigo o familiar', 'Mi club o gimnasio', 'Un atleta', 'Cartel o flyer', 'Otro'];
  protected readonly queVer: { i: GrIconName; t: string }[] = [
    { i: 'maximize', t: 'Sentadilla, banca y peso muerto' },
    { i: 'award', t: 'Competición AEP-2 y AEP-3' },
    { i: 'users', t: INSCRITOS_AEP + ' atletas' },
    { i: 'trophy', t: 'Premios y sorteo en directo' },
    { i: 'radio', t: 'Sigue a tus atletas' },
    { i: 'ticket', t: 'Participa en la rifa de material' },
  ];
  protected readonly pasos = ['Reserva en 1 minuto', 'Recibe tu QR', 'Enséñalo en la puerta'];
  protected readonly data = signal<Entradas | null | undefined>(undefined);
  protected readonly faq = signal<Faq[]>([]);
  private readonly horarios = signal<Horarios | null>(null);
  protected readonly sesion = signal('');
  protected readonly AMBOS = 'ambos';
  protected readonly enviando = signal(false);
  protected readonly errores = signal<string[]>([]);
  protected readonly campos = signal<string[]>([]);
  protected readonly error = signal('');
  protected readonly enviado = signal('');
  private readonly formVisible = signal(true);
  private readonly bajoHero = signal(false);
  protected f = { nombre: '', apellidos: '', email: '', telefono: '', origen: '', personas: 1, privacidad: false, novedades: false};
  protected readonly sesSel = computed(() => (this.sesion() === this.AMBOS ? this.ambos() ?? undefined : this.data()?.sesiones.find((s) => s.id === this.sesion())));
  protected readonly abiertas = computed(() => (this.data()?.sesiones ?? []).filter((s) => s.estado === 'disponible' || s.estado === 'ultimas'));
  /** BIZ-163: two open sessions on different days → a «both days» option (one ticket, counts for both capacities). */
  private readonly par = computed(() => {
    const a = this.abiertas();
    return a.length === 2 && dia(a[0].inicio) !== dia(a[1].inicio) ? a : null;
  });
  protected readonly ambos = computed<SesionPub | null>(() => {
    const p = this.par();
    if (!p) return null;
    const [a, b] = p;
    return { ...a, id: this.AMBOS, nombre: lineaTicket(a.inicio, '', this.i18n.locale(), b.inicio), detalle: '', fin: b.fin, libres: Math.min(a.libres, b.libres), maxPorReserva: Math.min(a.maxPorReserva, b.maxPorReserva),
      estado: a.estado === 'ultimas' || b.estado === 'ultimas' ? 'ultimas' : 'disponible', listaEspera: false, enEspera: 0 };
  });
  protected readonly todasAgotadas = computed(() => { const l = this.data()?.sesiones ?? []; return l.length > 0 && !this.abiertas().length && l.some((s) => s.estado === 'agotada'); });
  protected readonly sesHero = computed(() => this.sesSel() ?? this.abiertas()[0] ?? this.data()?.sesiones[0]);
  protected readonly ejemplo = computed(() => {
    const x = this.sesHero();
    return x ? { l1: lineaTicket(x.inicio, x.nombre, this.i18n.locale(), x.id === this.AMBOS ? this.par()?.[1].inicio : undefined), l2: lineaPuertas(this.t().pg, this.i18n.locale(), x, x.id === this.AMBOS ? this.par()?.[1] : undefined) } : { l1: this.t().pg.ejL1, l2: this.t().pg.ejL2 };
  });
  protected readonly maxPersonas = computed(() => Math.min(this.sesSel()?.maxPorReserva ?? 6, Math.max(1, this.sesSel()?.estado === 'agotada' ? 6 : (this.sesSel()?.libres ?? 6))));
  protected readonly ciudad = computed(() => this.comp.data()?.sede?.ciudad || 'Almussafes');
  protected readonly fechas = computed(() => {
    const c = this.comp.data();
    // UX8-R1-7: with sessions, only the days that have tickets (the hero must not promise a day without them)
    const dias = [...new Set((this.data()?.sesiones ?? []).map((s) => diaLargo(s.inicio, this.i18n.locale())))];
    // «sábado 19 y domingo 20 de diciembre»: the month once when both days share it (Figma hero, one line on phones)
    const mes = (d: string) => d.match(/ de .+$/)?.[0] ?? '';
    if (dias.length === 2 && mes(dias[0]) && mes(dias[0]) === mes(dias[1])) dias[0] = dias[0].slice(0, -mes(dias[0]).length);
    const y = ' ' + this.t().pg.y + ' ', loc = this.i18n.locale();
    const t = dias.length ? dias.join(y) : c?.fechaInicio ? diaLargo(c.fechaInicio + 'T12:00:00Z', loc) + (c.fechaFin && c.fechaFin !== c.fechaInicio ? y + diaLargo(c.fechaFin + 'T12:00:00Z', loc) : '') : this.t().pg.porConfirmar;
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  /** «Puertas 8:30 · premios y sorteo dom 17:00» from the published schedule (BO → Horarios: doors and the trophy agenda item). */
  protected readonly puertas = computed(() => {
    const dias = this.horarios()?.dias ?? [];
    const dd = dias[0];
    const p = dd?.puertas ?? (this.data()?.sesiones[0] ? hora(this.data()!.sesiones[0].puertas) : '');
    // the prizes can be on another day of a multi-day event: search every day and name it when it is not the first
    const i = dias.findIndex((x) => x.agenda.some((a) => a.icono === 'trophy'));
    const premios = i < 0 ? '' : (i > 0 ? new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'short', timeZone: 'Europe/Madrid' }).format(new Date(dias[i].fecha + 'T12:00:00Z')).replace('.', '') + ' ' : '')
      + dias[i].agenda.find((a) => a.icono === 'trophy')!.hora.replace(/^0/, '');
    return [p && this.t().pg.puertas + ' ' + p.replace(/^0/, ''), premios && this.t().pg.premiosSorteo + ' ' + premios].filter(Boolean).join(' · ');
  });
  protected readonly diaSesiones = computed(() => { const s = this.data()?.sesiones[0]; return s ? dia(s.inicio, this.i18n.locale()).replace(/^\w/, (c) => c.toUpperCase()) : ''; });
  /** BIZ-209: one entry per day with tickets — doors and prizes from the published schedule, else the session's doors. */
  protected readonly diasEvento = computed(() => {
    const loc = this.i18n.locale();
    const ymd = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
    const out = new Map<string, { dia: string; puertas: string; premios: string }>();
    for (const s of this.data()?.sesiones ?? []) {
      const k = ymd(s.inicio);
      if (out.has(k)) continue;
      const h = this.horarios()?.dias.find((x) => x.fecha === k);
      out.set(k, { dia: diaCorto(s.inicio, loc, true), puertas: (h?.puertas ?? hora(s.puertas)).replace(/^0/, ''), premios: h?.agenda.find((a) => a.icono === 'trophy')?.hora.replace(/^0/, '') ?? '' });
    }
    return [...out.values()];
  });
  /** SSR markup: submitting is blocked until Angular takes over (no native submit with personal data). */
  protected readonly hidratado = signal(false);
  /** Mobile bottom bar: below the hero, while the form is off screen. */
  protected readonly barra = computed(() => this.bajoHero() && !this.formVisible() && !!this.data());

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      const opt = <T,>(p: Promise<T>) => p.catch(() => null);
      const [d, faq, h] = await Promise.all([this.api.sesiones(), cms.faq(), opt(firstValueFrom(this.http.get<Horarios>(`/api/competiciones/${COMPETITION_SLUG}/horarios?resumen=true`))),  this.comp.load()]);
      this.data.set(d);
      this.horarios.set(h?.publicado ? h : null);
      const l = faq ?? [];
      this.faq.set((l.some((x) => /entrada/i.test(x.categoria)) ? l.filter((x) => /entrada/i.test(x.categoria)) : l).slice(0, 5));
      const s = d?.sesiones.find((x) => x.estado === 'disponible' || x.estado === 'ultimas');
      if (s) this.sesion.set(s.id);
      await applySeo(cms, seo, '/entradas', this.t().pg.seoT, this.t().pg.seoD);
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect((onCleanup) => {
        const b = this.enviarBtn()?.nativeElement as HTMLElement | undefined;
        if (!b) return this.enviarVisible.set(true);
        const o = new IntersectionObserver(([e]) => this.enviarVisible.set(e.isIntersecting));
        o.observe(b);
        onCleanup(() => o.disconnect());
      });
      const destroy = inject(DestroyRef);
      const cd = inject(ChangeDetectorRef);
      afterNextRender(() => {
        this.hidratado.set(true);
        const b = sessionStorage.getItem(BORRADOR);
        if (b) { sessionStorage.removeItem(BORRADOR); try { Object.assign(this.f, JSON.parse(b)); } catch { /* ignore a broken draft */ } }
        void this.fan.cargar().then((y) => { if (y?.email && !this.f.email) this.f.email = y.email; cd.markForCheck(); });
        const el = this.reservarEl()?.nativeElement;
        const io = new IntersectionObserver(([e]) => this.formVisible.set(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
        if (el) io.observe(el);
        const onScroll = () => this.bajoHero.set(window.scrollY > 560);
        window.addEventListener('scroll', onScroll, { passive: true });
        // live capacity (arch 37): the public stream announces every change of a session
        const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
        es.addEventListener('aforo.actualizado', () => void this.api.sesiones().then((x) => { if (x) this.data.set(x); }));
        destroy.onDestroy(() => { io.disconnect(); window.removeEventListener('scroll', onScroll); es.close(); });
      });
    }
  }
  protected n(v: number): string {
    return v.toLocaleString(this.i18n.locale());
  }
  /** FAQ answers are markdown (Angular sanitizes the HTML). */
  protected md(v: string): string {
    return renderMarkdown(v, this.i18n.lang()).html;
  }
  protected err(c: string): boolean {
    return this.campos().includes(c);
  }
  protected campo(mal: boolean): string {
    return CAMPO + (mal ? ' border-accent-text' : ' border-line-strong');
  }
  protected elegir(s: SesionPub): void {
    this.sesion.set(s.id);
    this.error.set('');
    this.f.personas = Math.min(this.f.personas, s.maxPorReserva);
  }
  private validar(): boolean {
    const e: string[] = [];
    const c: string[] = [];
    if (!this.f.nombre.trim()) { e.push(this.t().pg.eNombre); c.push('nombre'); }
    if (!this.f.apellidos.trim()) { e.push(this.t().pg.eApellidos); c.push('apellidos'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim())) { e.push(this.t().pg.eEmail); c.push('email'); }
    if (!this.sesion()) { e.push(this.t().pg.eSesion); c.push('sesion'); }
    if (!this.f.privacidad) { e.push(this.t().pg.ePriv); c.push('privacidad'); }
    this.errores.set(e);
    this.campos.set(c);
    if (e.length) setTimeout(() => {
      const a = this.reservarEl()?.nativeElement.querySelector<HTMLElement>('[role=alert]');
      if (!a) return;
      a.focus({ preventScroll: true });
      a.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    return e.length === 0;
  }
  protected async reservar(): Promise<void> {
    if (!this.validar()) return;
    // D-MIEMBROS: booking needs a fan session; the access modal brings the person back here.
    if (!(await this.fan.cargar())) {
      // keep what was typed: the email link reloads the page
      sessionStorage.setItem(BORRADOR, JSON.stringify(this.f));
      return this.fan.abrirAcceso('entradas', this.i18n.path('/entradas'), this.f.email.trim());
    }
    this.enviando.set(true);
    const qp = this.route.snapshot.queryParamMap;
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'ref']) { const v = qp.get(k); if (v) utm[k] = v.slice(0, 60); }
    const tel = this.f.telefono.trim();
    const telefono = tel ? (tel.startsWith('+') ? tel : '+34 ' + tel) : undefined;
    let token = '';
    try {
      const p = this.sesion() === this.AMBOS ? this.par() : null;
      const r = await this.api.reservar({ sesionId: p ? p[0].id : this.sesion(), sesion2Id: p?.[1].id, nombre: this.f.nombre.trim(), apellidos: this.f.apellidos.trim(), email: this.f.email.trim(), telefono,
        personas: this.f.personas, origen: this.f.origen || undefined, utm, aceptaPrivacidad: true, novedades: this.f.novedades });
      token = r.token;
    } catch (e) {
      const x = errorDe(e, undefined, this.i18n.lang());
      if (x.code === 'AGOTADA') this.data.set(await this.api.sesiones());
      this.errores.set([x.detail]);
      this.enviando.set(false);
      return;
    }
    void this.router.navigate([this.i18n.path('/entradas/confirmacion')], { queryParams: { t: token } });
  }
  protected async apuntarme(): Promise<void> {
    this.error.set('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim())) return this.error.set(this.t().pg.eEmail2);
    if (!this.f.privacidad) return this.error.set(this.t().pg.ePriv2);
    // D-MIEMBROS: booking needs a fan session; the access modal brings the person back here.
    if (!(await this.fan.cargar())) return this.fan.abrirAcceso('entradas', this.i18n.path('/entradas'));
    this.enviando.set(true);
    try {
      await this.api.espera({ sesionId: this.sesion(), email: this.f.email.trim(), nombre: `${this.f.nombre} ${this.f.apellidos}`.trim() || undefined, personas: this.f.personas, aceptaPrivacidad: true });
      this.enviado.set(this.t().pg.enEspera(this.sesSel()?.nombre ?? '', this.f.email.trim()));
    } catch (e) {
      this.error.set(errorDe(e, undefined, this.i18n.lang()).detail);
    } finally {
      this.enviando.set(false);
    }
  }
}

// ======================================================= confirmación ===

/** /entradas/confirmacion (Figma 38): «¡Tienes entrada!», QR, calendar, raffle notice (in person only), news and «Invita a tu gente». */
@Component({
  selector: 'gr-entrada-confirmacion',
  imports: [RouterLink, LocPipe, Page, GrButton, GrIcon, GrSkeleton, GrRaffleNotice, TicketCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().cf.tit" [crumb]="t().cf.crumb" [hideTitle]="true" [cabecera]="false">
      @let m = mia();
      @if (m === undefined) { <gr-skeleton class="mx-auto block h-[560px] max-w-[350px] rounded-xl" /> }
      @else if (m === null) {
        <section class="mx-auto flex max-w-[350px] flex-col items-center gap-3 pt-3 text-center">
          <span class="flex size-16 items-center justify-center rounded-full border border-line-strong bg-white/5 text-text-secondary"><gr-icon name="lock" [size]="26" /></span>
          <h1 class="text-display-xs">{{ t().cf.caducado }}</h1>
          <p class="text-body-m text-text-secondary">{{ t().cf.pide }} <a [routerLink]="'/mi-entrada' | loc" class="text-accent-text underline">{{ t().cf.mi }}</a>.</p>
        </section>
      } @else {
        <div class="mx-auto flex max-w-[350px] flex-col gap-6 md:max-w-[480px] xl:grid xl:max-w-none xl:grid-cols-[542px_563px] xl:items-start xl:justify-center xl:gap-4">
          <div class="flex flex-col gap-6 xl:items-center">
            @if (m.estado === 'anulada') {
              <div class="flex flex-col items-center gap-3 text-center">
                <span class="flex size-16 items-center justify-center rounded-full border border-line-strong bg-white/5 text-text-secondary"><gr-icon name="x" [size]="24" /></span>
                <h1 class="text-display-s">{{ t().cf.anulada }}</h1>
                <p class="text-body-m text-text-secondary">{{ t().cf.noVale }} <a [routerLink]="'/entradas' | loc" class="text-accent-text underline">{{ t().cf.otra }}</a> {{ t().cf.plazas }}</p>
              </div>
            } @else {
            <div class="flex flex-col items-center gap-3 text-center">
              <span class="flex size-16 items-center justify-center rounded-full border border-success/50 bg-success/12 text-success"><gr-icon name="check" [size]="24" /></span>
              <h1 class="text-display-s">{{ t().cf.tit }}</h1>
              <p class="text-body-m text-text-secondary">{{ t().cf.enviada(m.email) }} {{ t().cf.spam }}</p>
            </div>
            }
            <gr-ticket class="w-full xl:w-[342px]" [linea1]="linea(m.sesion.inicio, m.sesion.nombre, i18n.locale(), m.sesion2?.inicio)" [puertaBtn]="true" [linea2]="lineaP(t().pg, i18n.locale(), m.sesion, m.sesion2)" [lugar]="m.lugar" [titular]="tit(m, i18n.lang())" [codigo]="m.codigo" [qr]="m.qr" [estado]="m.estado" />
            @if (m.estado !== 'anulada') {
            <div class="grid w-full grid-cols-2 gap-2 xl:w-[342px]">
              <a [href]="ics()" class="flex h-12 items-center justify-center gap-2 rounded-md border border-line-strong text-label-s transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="calendar" [size]="16" />{{ t().cf.cal }}</a>
              <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-md border border-line-strong text-label-s transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent" (click)="imprimir()"><gr-icon name="download" [size]="16" />{{ t().cf.pdf }}</button>
            </div>
            }
          </div>
          <div class="flex flex-col gap-6 xl:pt-10">
            <section class="flex flex-col gap-3"><h2 class="text-ui-h5">{{ t().cf.rifa }}</h2>
              <gr-raffle-notice [href]="'/rifa' | loc">{{ t().cf.rifaX }}</gr-raffle-notice></section>
            <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
              <div class="flex gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-text"><gr-icon name="mail" [size]="18" /></span>
                <div><h2 class="text-label-m">{{ t().cf.prox }}</h2><p class="mt-1 text-body-xs text-text-tertiary">{{ nov() === 'si' ? t().cf.hecho : nov() === 'no' ? t().cf.vale : t().cf.noMarc }}</p></div></div>
              @if (!nov()) {
                <div class="flex gap-2"><button grButton variant="primary" size="m" type="button" [loading]="novEnviando()" [disabled]="novEnviando()" (click)="avisame(true)">{{ t().cf.si }}</button>
                  <button grButton variant="outline" size="m" type="button" [disabled]="novEnviando()" (click)="avisame(false)">{{ t().cf.no }}</button></div>
              }
            </section>
            @if (m.estado !== 'anulada') {
            <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-label-m">{{ t().cf.invita }}</h2><p class="text-body-xs text-text-tertiary">{{ t().cf.comparte }}</p>
              <div class="flex items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3"><gr-icon name="link" [size]="16" class="text-text-tertiary" /><span class="min-w-0 flex-1 py-3 text-body-s [overflow-wrap:anywhere]">{{ corto(m.compartir) }}</span><button type="button" class="-mr-3 inline-flex min-h-11 shrink-0 items-center px-3 text-label-s text-accent-text hover:underline" (click)="copiar(m.compartir)"><span aria-live="polite">{{ copiado() ? t().cf.copiado : t().cf.copiar }}</span></button></div>
              <div class="flex flex-wrap gap-2 text-label-s">
                <a [href]="'https://twitter.com/intent/tweet?url=' + enc(m.compartir)" target="_blank" rel="noopener" [class]="chip"><gr-icon name="share" [size]="16" />X</a>
                <a [href]="'https://www.facebook.com/sharer/sharer.php?u=' + enc(m.compartir)" target="_blank" rel="noopener" [class]="chip"><gr-icon name="share" [size]="16" />Facebook</a>
                <a [href]="'https://wa.me/?text=' + enc(t().cf.wa + m.compartir)" target="_blank" rel="noopener" [class]="chip"><gr-icon name="share" [size]="16" />WhatsApp</a>
                <button type="button" [class]="chip" (click)="copiar(m.compartir)"><gr-icon name="external-link" [size]="16" />{{ t().cf.copiarEnl }}</button>
              </div>
            </section>
            <a grButton variant="outline" size="l" [href]="i18n.path('/mi-entrada') + '?t=' + token" iconRight="arrow-right" class="w-full xl:hidden">{{ t().cf.gestionar }}</a>
            }
          </div>
        </div>
      }
    </gr-page>
  `,
})
export class ConfirmacionPage {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  private readonly api = inject(EntradasPublic);
  protected readonly dia = dia;
  protected readonly tit = titular;
  protected readonly linea = lineaTicket;
  protected readonly lineaP = lineaPuertas;
  protected readonly chip = 'flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent';
  protected readonly mia = signal<MiEntrada | null | undefined>(undefined);
  protected readonly copiado = signal(false);
  protected readonly nov = signal<'' | 'si' | 'no'>('');
  protected readonly novEnviando = signal(false);
  protected readonly token: string;
  protected readonly ics = computed(() => this.api.ics(this.token));
  constructor() {
    inject(Seo).set({ title: this.t().cf.seoT, description: this.t().cf.seoD, path: '/entradas/confirmacion', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.mia(this.token).then((m) => { this.mia.set(m); this.nov.set(m.novedades); }, () => this.mia.set(null));
  }
  protected corto(u: string): string {
    return u.replace(/^https?:\/\//, '');
  }
  protected async avisame(acepta: boolean): Promise<void> {
    this.novEnviando.set(true);
    try {
      this.nov.set((await this.api.avisame(this.token, acepta)).novedades);
    } catch {
      this.nov.set('');
    } finally {
      this.novEnviando.set(false);
    }
  }
  protected enc(v: string): string {
    return encodeURIComponent(v);
  }
  protected imprimir(): void {
    window.print();
  }
  protected async copiar(v: string): Promise<void> {
    await navigator.clipboard?.writeText(v);
    this.copiado.set(true);
  }
}


// ============================================================ oferta ===

/** /entradas/oferta (waiting-list offer email): confirm the offered places before they pass to the next person. */
@Component({
  selector: 'gr-entrada-oferta',
  imports: [RouterLink, LocPipe, Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="tr().of.tit" [crumb]="tr().of.crumb">
      <div class="mx-auto max-w-md">
        @let o = oferta();
        @if (o === undefined) { <gr-skeleton class="h-64 rounded-xl" /> }
        @else if (o === null || o.estado !== 'oferta') {
          <section class="rounded-xl border border-line-subtle bg-bg-card p-6 text-center"><h2 class="text-display-2xs">{{ tr().of.noVale }}</h2><p class="mt-2 text-body-s text-text-secondary">{{ error() || tr().of.caducada }}</p><a [routerLink]="'/entradas' | loc" class="mt-4 inline-flex h-11 items-center rounded-sm bg-accent-grain px-5 text-label-s text-white">{{ tr().of.ver }}</a></section>
        } @else {
          <section class="rounded-xl border border-accent/50 bg-bg-card p-6 text-center">
            <gr-icon name="ticket" [size]="28" class="text-accent-text" />
            <h2 class="mt-2 text-ui-h3">{{ tr().of.plazas(o.personas, o.sesion.nombre) }}</h2>
            <p class="mt-1 text-body-s text-text-secondary">{{ dia(o.sesion.inicio, i18n.locale()) }} · {{ tr().of.puertas }} {{ hora(o.sesion.puertas) }}</p>
            <p class="mt-3 text-body-s text-warning">{{ tr().of.antes(dia(o.expira, i18n.locale()), hora(o.expira)) }}</p>
            <button type="button" class="mt-4 h-12 w-full rounded-sm bg-accent-grain text-label-m text-white disabled:opacity-60" [disabled]="enviando()" (click)="aceptar()">{{ enviando() ? tr().of.confirmando : tr().of.confirmar }}</button>
            @if (error()) { <p class="mt-2 text-body-s text-accent-text" role="alert">{{ error() }}</p> }
          </section>
        }
      </div>
    </gr-page>
  `,
})
export class OfertaPage {
  protected readonly i18n = inject(I18n);
  protected readonly tr = this.i18n.dict(T);
  private readonly api = inject(EntradasPublic);
  private readonly router = inject(Router);
  protected readonly hora = hora;
  protected readonly dia = dia;
  protected readonly oferta = signal<Oferta | null | undefined>(undefined);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  private readonly t: string;
  constructor() {
    inject(Seo).set({ title: this.tr().of.seoT, description: this.tr().of.seoD, path: '/entradas/oferta', robots: 'noindex' });
    this.t = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.oferta(this.t).then((o) => this.oferta.set(o), () => this.oferta.set(null));
  }
  protected async aceptar(): Promise<void> {
    this.enviando.set(true);
    try {
      const r = await this.api.aceptar(this.t);
      void this.router.navigate([this.i18n.path('/entradas/confirmacion')], { queryParams: { t: r.token } });
    } catch (e) {
      this.error.set(errorDe(e, undefined, this.i18n.lang()).detail);
      this.oferta.set(null);
    } finally {
      this.enviando.set(false);
    }
  }
}

// ========================================================== mi entrada ===

/** /mi-entrada (Figma 38): the ticket by magic link — change people, resend, calendar, cancel; expired link → new one. */
@Component({
  selector: 'gr-mi-entrada',
  imports: [RouterLink, LocPipe, Page, FormsModule, GrButton, GrIcon, GrSkeleton, TicketCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.gr-sheet { animation: gr-sheet-in 280ms cubic-bezier(.32,.72,0,1); }
    @keyframes gr-sheet-in { from { transform: translateY(100%); } }
    @media (min-width: 40rem) { @keyframes gr-sheet-in { from { opacity: 0; transform: scale(.96); } } }`,
  template: `
    <gr-page [title]="t().mi.tit" [crumb]="t().mi.tit" [migasMovil]="false" [subtitle]="mia()?.email ?? ''" [cabecera]="mia() !== null">
      <div class="mx-auto flex max-w-[350px] flex-col gap-6 max-md:-mt-[27px] md:max-w-[480px]">
        @let m = mia();
        @if (m === undefined) { <gr-skeleton class="h-[560px] rounded-xl" /> }
        @else if (m === null) {
          <section class="flex flex-col items-center gap-4 pt-3 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-line-strong bg-white/5 text-text-secondary"><gr-icon name="lock" [size]="26" /></span>
            <h2 class="text-display-xs">{{ token ? t().mi.caducado : t().mi.accede }}</h2>
            <p class="text-body-m text-text-secondary">{{ token ? t().mi.seguridad : '' }}{{ t().mi.nuevo }}</p>
            @if (pedido()) { <p class="w-full rounded-md border border-success/40 bg-success/10 p-3 text-body-s text-success" role="status">{{ t().mi.pedido }}</p> }
            @else {
              <label class="flex h-12 w-full items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3 focus-within:border-accent"><gr-icon name="mail" [size]="16" class="text-text-tertiary" />
                <input type="email" class="h-full min-w-0 flex-1 bg-transparent text-body-m outline-none" [placeholder]="t().pg.emailPh" [(ngModel)]="email" aria-label="Email" autocomplete="email" (keydown.enter)="pedir()" /></label>
              <button grButton variant="primary" size="l" type="button" class="w-full" (click)="pedir()">{{ t().mi.enviarme }}</button>
              <p class="text-body-xs text-text-tertiary">{{ t().mi.siempre }}</p>
            }
          </section>
        } @else {
          <gr-ticket [linea1]="linea(m.sesion.inicio, m.sesion.nombre, i18n.locale(), m.sesion2?.inicio)" [puertaBtn]="true" [linea2]="lineaP(t().pg, i18n.locale(), m.sesion, m.sesion2)" [lugar]="m.lugar" [titular]="tit(m, i18n.lang())" [codigo]="m.codigo" [qr]="m.estado === 'anulada' ? '' : m.qr" [estado]="m.estado" [validadaEn]="validada(m.validadaAt, i18n.locale())" />
          @if (m.puedeCambiar) {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-ui-h5">{{ t().mi.cambia }}</h2>
              <div class="mt-4 flex items-center justify-between rounded-md border border-line-subtle bg-white/[0.02] p-4"><span class="text-label-m">{{ t().pg.personasL }}<span class="block text-body-xs text-text-tertiary">{{ t().pg.tuMas }}</span></span>
                <span class="flex items-center gap-3"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-white/5 hover:bg-white/10 disabled:opacity-40" [disabled]="personas() <= 1" [attr.aria-label]="t().mi.menos" (click)="personas.set(max(1, personas() - 1))">−</button><span class="w-8 text-center text-ui-h4" aria-live="polite">{{ personas() }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-white/5 hover:bg-white/10 disabled:opacity-40" [disabled]="personas() >= m.maxPersonas" [attr.aria-label]="t().mi.mas" (click)="personas.set(min(m.maxPersonas, personas() + 1))">+</button></span></div>
              <button type="button" class="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-white/5 text-label-s hover:bg-white/10 disabled:opacity-50" [disabled]="personas() === m.personas || ocupado()" (click)="guardar()">{{ t().mi.guardar }} <gr-icon name="arrow-right" [size]="14" /></button>
            </section>
          }
          @if (msg()) { <p class="rounded-md border border-success/40 bg-success/10 p-3 text-body-s text-success" role="status">{{ msg() }}</p> }
          @if (m.estado !== 'anulada') {
            <ul class="flex flex-col">
              <li><button type="button" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m hover:text-white disabled:opacity-50" [disabled]="reenviando()" (click)="reenviar()"><gr-icon name="send" [size]="18" /><span class="flex-1">{{ t().mi.reenviar }}</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></button></li>
              <li><a [routerLink]="'/rifa' | loc" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m hover:text-white"><gr-icon name="ticket" [size]="18" /><span class="flex-1">{{ t().mi.rifa }}</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></a></li>
              <li><a [href]="ics()" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m hover:text-white"><gr-icon name="calendar" [size]="18" /><span class="flex-1">{{ t().mi.cal }}</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></a></li>
              @if (m.puedeCambiar) { <li><button type="button" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m text-accent-text" (click)="abrirAnular($event)"><gr-icon name="x" [size]="18" /><span class="flex-1">{{ t().mi.anular }}</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></button></li> }
            </ul>
          }
        }
      </div>
    </gr-page>
    @if (anularOpen() && mia(); as m) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:px-4" (click)="cerrarAnular()" (keydown.escape)="cerrarAnular()" (keydown.tab)="atrapar($event)">
        <div #sheet class="gr-sheet w-full rounded-t-2xl border border-b-0 border-line-strong bg-bg-raised px-6 pt-2 pb-[max(24px,env(safe-area-inset-bottom))] shadow-card sm:max-w-[400px] sm:rounded-xl sm:border-b sm:p-7" role="alertdialog" aria-modal="true" aria-labelledby="anular-t" aria-describedby="anular-d" (click)="$event.stopPropagation()">
          <span class="mx-auto mb-3 block h-[5px] w-9 rounded-full bg-white/25 sm:hidden" aria-hidden="true"></span>
          <div class="flex items-start justify-between gap-3"><h2 id="anular-t" class="text-ui-h3">{{ t().mi.anularQ }}</h2><button type="button" class="-mt-1.5 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" [attr.aria-label]="t().tk.cerrar" (click)="cerrarAnular()"><gr-icon name="x" [size]="18" /></button></div>
          <p id="anular-d" class="mt-3 text-body-m text-text-secondary">{{ t().mi.liberaras(m.personas, sesionLarga(m.sesion.nombre)) }}</p>
          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-2"><button #volverBtn grButton variant="outline" size="l" type="button" class="w-full sm:w-auto" (click)="cerrarAnular()">{{ t().mi.volver }}</button>
            <button grButton variant="primary" size="l" type="button" class="w-full sm:w-auto" (click)="anular()">{{ t().mi.siAnular }}</button></div>
        </div>
      </div>
    }
  `,
})
export class MiEntradaPage {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  private readonly api = inject(EntradasPublic);
  protected readonly validada = validada;
  protected readonly dia = dia;
  protected readonly tit = titular;
  protected readonly linea = lineaTicket;
  protected readonly lineaP = lineaPuertas;
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  /** «Sábado mañana» → «sábado por la mañana». */
  protected sesionLarga(n: string): string {
    return n.toLowerCase().replace(/ (mañana|tarde|noche)$/, ' por la $1');
  }
  protected readonly mia = signal<MiEntrada | null | undefined>(undefined);
  protected readonly personas = signal(1);
  protected readonly ocupado = signal(false);
  protected readonly msg = signal('');
  protected readonly anularOpen = signal(false);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private readonly volverBtn = viewChild('volverBtn', { read: ElementRef<HTMLElement> });
  private origen: HTMLElement | null = null;
  protected abrirAnular(ev: Event): void {
    this.origen = ev.currentTarget as HTMLElement;
    this.anularOpen.set(true);
    setTimeout(() => (this.volverBtn()?.nativeElement as HTMLElement | undefined)?.focus());
  }
  protected cerrarAnular(): void {
    this.anularOpen.set(false);
    this.origen?.focus();
  }
  /** Focus trap: Tab cycles inside the sheet. */
  protected atrapar(ev: Event): void {
    const f = this.sheet()?.nativeElement.querySelectorAll<HTMLElement>('button');
    if (!f?.length) return;
    const k = ev as KeyboardEvent, a = f[0], z = f[f.length - 1];
    if (k.shiftKey && document.activeElement === a) { k.preventDefault(); z.focus(); }
    else if (!k.shiftKey && document.activeElement === z) { k.preventDefault(); a.focus(); }
  }
  protected readonly pedido = signal(false);
  protected readonly reenviando = signal(false);
  protected readonly token: string;
  protected readonly ics = computed(() => this.api.ics(this.token));
  protected email = '';
  constructor() {
    inject(Seo).set({ title: this.t().mi.tit + ' · GRS Cup 2', description: this.t().mi.seoD, path: '/mi-entrada', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    if (!this.token) {
      this.mia.set(null);
      return;
    }
    void this.api.mia(this.token).then((m) => this.set(m), () => this.mia.set(null));
  }
  private set(m: MiEntrada): void {
    this.mia.set(m);
    this.personas.set(m.personas);
  }
  protected async guardar(): Promise<void> {
    this.ocupado.set(true);
    try {
      this.set(await this.api.personas(this.token, this.personas()));
      this.msg.set(this.t().mi.guardado);
    } catch (e) {
      this.msg.set(errorDe(e, undefined, this.i18n.lang()).detail);
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async reenviar(): Promise<void> {
    if (this.reenviando()) return;
    this.reenviando.set(true);
    try {
      await this.api.reenviar(this.token);
      this.msg.set(this.t().mi.reenviada);
    } catch (e) {
      this.msg.set(errorDe(e, undefined, this.i18n.lang()).detail);
    }
    setTimeout(() => this.reenviando.set(false), 30_000); // cooldown: one email per 30 s
  }
  protected async anular(): Promise<void> {
    this.anularOpen.set(false);
    try {
      this.set(await this.api.anular(this.token));
      this.msg.set('');
    } catch (e) {
      this.msg.set(errorDe(e, undefined, this.i18n.lang()).detail);
    }
  }
  protected async pedir(): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) return;
    await this.api.enlace(this.email.trim()).catch(() => undefined);
    this.pedido.set(true);
  }
}
