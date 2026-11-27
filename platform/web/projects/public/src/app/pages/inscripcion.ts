import { errorEn, textoError } from '../core/errores';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { mascaraFecha } from './fecha-mascara';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, PLATFORM_ID, PendingTasks, afterNextRender, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton, GrSelect, GrTelefono, esConReanudacion, sinTimeout, telefonoValido } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { CATEGORIAS_IPF, cat } from '../core/atletas';
import { COMPETITION_SLUG, Competition, type CompeticionPublica } from '../core/competition';
import { FanSession, codigoError } from '../core/fan';
import { I18n, LocPipe, idiomaActual } from '../core/i18n';
import { Seo } from '../core/seo';
import { instagramOf } from '../layout/layout';
import { Page } from '../layout/page';
import { GrInscripcionesCerradas } from '../core/inscripcion-aep';

interface ConfigPub { modo: 'externa' | 'propia'; estado: 'abierta' | 'proximamente' | 'cerrada' | 'completa'; cuota: number; plazas: number; ocupadas: number; abre?: string; cierra?: string; reserva: boolean; cupones: boolean; referidos: boolean; referidoTexto?: string; pasarela: 'stripe' | 'simulado' | 'ninguna'; pruebas: boolean }
interface Descuento { codigo: string; valido: boolean; importe: number; texto: string; motivo?: string; invitadoPor?: string }
interface Precio { cuota: number; cupon?: Descuento; referido?: Descuento; total: number }
interface Estado { id: string; estado: 'pendiente_pago' | 'pagada' | 'gratuita' | 'reserva' | 'cancelada' | 'fallida'; total: number; email: string; tarjeta?: string; referencia?: string; codigoReferido?: string; checkoutUrl?: string; categoria: string; division?: string; invitaTexto?: string }

/** Form kept while the person signs in from the modal (the email link may open in another tab). */
const BORRADOR = 'gr-inscripcion-borrador';

const base = `/api/competiciones/${COMPETITION_SLUG}/inscripcion`;
const T = {
  es: {
    inscribete: "¡Inscríbete a la",
    inscripcion: "Inscripción",
    subGratis: "Rellena tus datos y confirma tu plaza en un minuto. Te confirmamos por email.",
    subPago: "Rellena tus datos y paga tu plaza en un minuto. Te confirmamos por email.",
    noCargar: "No hemos podido cargar la inscripción. Es un problema temporal: vuelve a intentarlo en unos minutos.",
    proximamente: "Próximamente",
    siguenos: "Síguenos en Instagram",
    insAep: "Inscripciones AEP",
    insAepTxt: "La inscripción al campeonato se realiza en la web oficial de la Asociación Española de Powerlifting.",
    irAep: "Ir a la inscripción oficial AEP",
    sinUrlAep: "Todavía no se ha publicado la URL de las inscripciones de la AEP. Próximamente…",
    insCompletas: "Inscripciones completas",
    insCerradas: "Inscripciones cerradas",
    plazasCompletas: "Plazas completas",
    insCerrada: "Inscripción cerrada",
    verInscritos: "Ver atletas inscritos",
    darAlta: "Dar de alta tu atleta",
    verAtletas: "Ver atletas",
    listaEspera: "Lista de espera en la AEP",
    yaInscrito: "¿Ya estás inscrito/a?",
    areaAtleta: "Área de atleta",
    animar: "¿Vienes a animar?",
    reservar: "Reservar entrada",
    noCompletado: "El pago no se ha completado y no se ha cobrado nada.",
    sigueReservada: " Tu plaza sigue reservada unos minutos.",
    reintentarPago: "Reintentar el pago",
    cerrarAviso: "Cerrar aviso",
    noCobrar: "Todavía no podemos cobrar la inscripción online. Solo se aceptan códigos que la dejan gratis.",
    sexo: "Sexo",
    eligeSexo: "Elige primero el sexo",
    selCat: "Seleccionar categoría",
    fmtFecha: "dd/mm/aaaa",
    formato: "Formato dd/mm/aaaa.",
    independiente: "Déjalo vacío si eres independiente.",
    descuentos: "Descuentos",
    codDesc: "Código de descuento",
    quitar: "Quitar",
    aplicar: "Aplicar",
    invitado: "¿Te ha invitado alguien?",
    codRef: "Código de referido",
    cupon: "Cupón",
    codigo: "Código",
    heLeidoAcepto: "He leído y acepto los ",
    terminos: "términos de inscripción",
    yEl: " y el ",
    reglamento: "reglamento",
    heLeido: "He leído la ",
    politica: "política de privacidad",
    fotoWeb: "Acepto que se publique mi foto en la web (opcional, se puede retirar)",
    apuntarme: "Apuntarme a la reserva",
    confirmar: "Confirmar inscripción",
    pagar: "Pagar ",
    seguroStripe: "Pago seguro con Stripe",
    seguro: "Pago seguro",
    pruebas: " · ahora en modo pruebas, no se cobra nada",
    mujer: "Mujer",
    hombre: "Hombre",
    fecha: "Fecha",
    porConfirmar: "Por confirmar",
    sede: "Sede",
    plazas: "Plazas",
    terminosResumen: "Términos y privacidad: acéptalos para continuar",
    seoT: "Inscripción · GR Strength Cup",
    seoAep: "La inscripción en la GR Strength Cup la gestiona la AEP. Da de alta tu atleta para que tu ficha se publique.",
    noComprobar: "No se pudo comprobar el código.",
    msgLicencia: "Solo letras sin tilde y números: de 3 a 20, sin contar guiones, puntos ni espacios",
    msgTel: "Escribe el número de teléfono completo",
    aceptaTerminos: "Acepta los términos, el reglamento y la política de privacidad",
    revisaCodigos: "Revisa los códigos de descuento (o quítalos) antes de continuar.",
    noCompletar: "No se pudo completar la inscripción. Inténtalo en unos minutos.",
    confirmando: "Confirmando el pago…",
    noCierres: "No cierres esta página. Tardamos unos segundos en recibir la confirmación del banco.",
    noComprobarPago: "No pudimos comprobar el pago, reintentando…",
    noEncontrada: "No encontramos esta inscripción",
    siPagado: "Si has pagado, te llegará un email de confirmación. Si no, vuelve a ",
    inscribirte: "inscribirte",
    inscrito: "¡Estás inscrito!",
    sinPago: "Inscripción confirmada sin pago.",
    invita: "Invita y recupera parte de tu cuota",
    invitaTxt: "Tus amigos tienen descuento con tu código y te devolvemos una parte de lo que pagaste por cada uno.",
    copiado: "Copiado",
    copiar: "Copiar",
    compartirCod: "Compartir mi código",
    enlaceCopiado: "Enlace copiado",
    irArea: "Ir a mi área de atleta",
    enReserva: "Estás en la reserva",
    volverInicio: "Volver al inicio",
    esperando: "Seguimos esperando la confirmación",
    comprobar: "Comprobar de nuevo",
    pagoNo: "Pago no completado",
    cambiarDatos: "Cambiar los datos",
    pago: "Pago",
    referencia: "Referencia",
    seoEstado: "Confirmación de tu inscripción.",
    shareTxt: "Inscríbete con mi código y tienes descuento",
    caducado: "Este pago ha caducado",
    caducadoTxt: "Vuelve a la web y empieza de nuevo la inscripción.",
    volverIns: "Volver a la inscripción",
    completado: "Pago completado",
    yaHecho: "Este pago ya está hecho; no se cobrará otra vez.",
    verEstado: "Ver el estado de mi inscripción",
    pagarTarjeta: "Pagar con tarjeta",
    datosTarjeta: "Datos de la tarjeta",
    nombreTarjeta: "Nombre en la tarjeta",
    tarjetasPrueba: "Tarjetas de prueba",
    autenticar: "Autenticar",
    fallar: "Fallar autenticación",
    seoPago: "Pago (modo pruebas) · GR Strength Cup",
    seoPagoD: "Pasarela de pago en modo pruebas.",
    noPago: "No se pudo completar el pago.",
    abreEl: (n: string, f: string) => `La inscripción a la ${n} abre el ${f}. Síguenos en Instagram para no perdértelo.`,
    noAbiertas: (n: string) => `Las inscripciones a la ${n} todavía no están abiertas. Síguenos en Instagram para mantenerte informado.`,
    completasAep: (n: string) => `La inscripción de la ${n} se gestiona a través de la AEP y ya no quedan plazas. Si alguien se da de baja, la federación avisa por orden de la lista de espera.`,
    completasPropia: (n: string) => `Ya no quedan plazas para la ${n}. Si se libera alguna, lo anunciaremos en Instagram.`,
    cerradaTxt: (n: string, c: string) => `La inscripción de la ${n} está cerrada. Si tienes una duda sobre tu inscripción, escríbenos${c ? ' a ' + c : ''}.`,
    entraArea: (propia: boolean) => `Entra en tu área de atleta con el email ${propia ? 'de tu inscripción' : 'de la AEP'}: completa tu perfil, revisa tu flight y deja tus alturas de rack.`,
    animarTxt: (sorteo: boolean) => `La entrada es gratuita con reserva. Te llega un QR por email${sorteo ? ' y puedes sumarte al sorteo' : ''}.`,
    revisaCampos: (n: number) => `Revisa ${n === 1 ? 'un campo' : n + ' campos'} antes de enviar`,
    cubiertas: (n: number) => `Las ${n} plazas están cubiertas. Puedes apuntarte a la lista de reserva: no se cobra nada hasta que haya plaza, y entonces te enviamos el enlace de pago.`,
    cuponAplicado: (x: string) => `Cupón aplicado: ${x} sobre la cuota`,
    teInvito: (p: string, x: string) => `Te ha invitado ${p}: ${x}`,
    siAmigo: (x: string) => `Si un amigo ya inscrito te pasó su código, tienes ${x}.`,
    seoPropia: (e: string, n: number) => `Inscríbete en la GR Strength Cup: ${e}, ${n} plazas.`,
    pagoDe: (e: string) => 'Pago de ' + e + ' confirmado.',
    enviadoA: (e: string) => `Te lo hemos enviado a ${e}.`,
    reservaTxt: (e: string) => `No se ha cobrado nada. Si queda una plaza libre, te escribiremos a ${e} con el enlace de pago.`,
    bancoTarda: (e: string) => `El banco está tardando más de lo normal. No vuelvas a pagar: te llegará un email a ${e} en cuanto se confirme.`,
    campos: <Campo[]>[
      { k: 'nombre', label: 'Nombre', req: true, ac: 'given-name', ph: 'Tu nombre', error: 'El nombre es obligatorio', corto: 'es obligatorio' },
      { k: 'apellidos', label: 'Apellidos', req: true, ac: 'family-name', ph: 'Tus apellidos', error: 'Los apellidos son obligatorios', corto: 'son obligatorios' },
      { k: 'email', label: 'Email', req: true, type: 'email', ac: 'email', ph: 'email@ejemplo.com', error: 'Introduce un email válido', corto: 'introduce un email válido' },
      { k: 'telefono', label: 'Teléfono', type: 'tel', ac: 'tel', ph: '+34 600 000 000' },
      { k: 'sexo', label: 'Sexo', req: true, error: 'Elige una opción', corto: 'elige una opción' }, { k: 'categoria', label: 'Categoría de peso', req: true, error: 'Selecciona tu categoría', corto: 'selecciona tu categoría' },
      { k: 'fechaNacimiento', label: 'Fecha de nacimiento', req: true, error: 'Indica tu fecha de nacimiento', corto: 'indica tu fecha de nacimiento' },
      { k: 'licencia', label: 'Licencia AEP', req: true, ph: 'VAL-0000', error: 'Indica tu número de licencia AEP', corto: 'indica tu número de licencia' },
      { k: 'club', label: 'Club', ph: 'Tu club' },
    ],
  },
  en: {
    inscribete: "Sign up for the",
    inscripcion: "Registration",
    subGratis: "Fill in your details and confirm your place in a minute. We will confirm by email.",
    subPago: "Fill in your details and pay for your place in a minute. We will confirm by email.",
    noCargar: "We couldn't load the registration. It is a temporary problem: please try again in a few minutes.",
    proximamente: "Coming soon",
    siguenos: "Follow us on Instagram",
    insAep: "AEP registration",
    insAepTxt: "Registration for the championship is done on the official website of the Spanish Powerlifting Association (AEP).",
    irAep: "Go to the official AEP registration",
    sinUrlAep: "The AEP registration URL has not been published yet. Coming soon…",
    insCompletas: "Registration full",
    insCerradas: "Registration closed",
    plazasCompletas: "All places taken",
    insCerrada: "Registration closed",
    verInscritos: "View registered athletes",
    darAlta: "Register your athlete",
    verAtletas: "View athletes",
    listaEspera: "AEP waiting list",
    yaInscrito: "Already registered?",
    areaAtleta: "Athlete area",
    animar: "Coming to cheer?",
    reservar: "Book a ticket",
    noCompletado: "The payment was not completed and nothing has been charged.",
    sigueReservada: " Your place stays held for a few minutes.",
    reintentarPago: "Retry the payment",
    cerrarAviso: "Close notice",
    noCobrar: "We cannot take online payments for registration yet. Only codes that make it free are accepted.",
    sexo: "Sex",
    eligeSexo: "Choose your sex first",
    selCat: "Select weight class",
    fmtFecha: "dd/mm/yyyy",
    formato: "Format dd/mm/yyyy.",
    independiente: "Leave it empty if you are unaffiliated.",
    descuentos: "Discounts",
    codDesc: "Discount code",
    quitar: "Remove",
    aplicar: "Apply",
    invitado: "Did someone invite you?",
    codRef: "Referral code",
    cupon: "Coupon",
    codigo: "Code",
    heLeidoAcepto: "I have read and accept the ",
    terminos: "registration terms",
    yEl: " and the ",
    reglamento: "rulebook",
    heLeido: "I have read the ",
    politica: "privacy policy",
    fotoWeb: "I agree to my photo being published on the website (optional, can be withdrawn)",
    apuntarme: "Join the waiting list",
    confirmar: "Confirm registration",
    pagar: "Pay ",
    seguroStripe: "Secure payment with Stripe",
    seguro: "Secure payment",
    pruebas: " · currently in test mode, nothing is charged",
    mujer: "Female",
    hombre: "Male",
    fecha: "Date",
    porConfirmar: "To be confirmed",
    sede: "Venue",
    plazas: "Places",
    terminosResumen: "Terms and privacy: accept them to continue",
    seoT: "Registration · GR Strength Cup",
    seoAep: "Registration for the GR Strength Cup is handled by the AEP. Register your athlete so your profile is published.",
    noComprobar: "The code couldn't be checked.",
    msgLicencia: "Only unaccented letters and numbers: 3 to 20, not counting hyphens, dots or spaces",
    msgTel: "Enter the full phone number",
    aceptaTerminos: "Accept the terms, the rulebook and the privacy policy",
    revisaCodigos: "Check the discount codes (or remove them) before continuing.",
    noCompletar: "The registration couldn't be completed. Please try again in a few minutes.",
    confirmando: "Confirming the payment…",
    noCierres: "Don't close this page. It takes a few seconds to receive the bank's confirmation.",
    noComprobarPago: "We couldn't check the payment, retrying…",
    noEncontrada: "We can't find this registration",
    siPagado: "If you have paid, you will receive a confirmation email. If not, go back and ",
    inscribirte: "sign up",
    inscrito: "You're registered!",
    sinPago: "Registration confirmed with no payment.",
    invita: "Invite friends and get part of your fee back",
    invitaTxt: "Your friends get a discount with your code and we refund part of what you paid for each one.",
    copiado: "Copied",
    copiar: "Copy",
    compartirCod: "Share my code",
    enlaceCopiado: "Link copied",
    irArea: "Go to my athlete area",
    enReserva: "You're on the waiting list",
    volverInicio: "Back to home",
    esperando: "Still waiting for confirmation",
    comprobar: "Check again",
    pagoNo: "Payment not completed",
    cambiarDatos: "Change the details",
    pago: "Payment",
    referencia: "Reference",
    seoEstado: "Your registration confirmation.",
    shareTxt: "Sign up with my code and get a discount",
    caducado: "This payment has expired",
    caducadoTxt: "Go back to the website and start the registration again.",
    volverIns: "Back to registration",
    completado: "Payment completed",
    yaHecho: "This payment is already done; you will not be charged again.",
    verEstado: "View my registration status",
    pagarTarjeta: "Pay by card",
    datosTarjeta: "Card details",
    nombreTarjeta: "Name on card",
    tarjetasPrueba: "Test cards",
    autenticar: "Authenticate",
    fallar: "Fail authentication",
    seoPago: "Payment (test mode) · GR Strength Cup",
    seoPagoD: "Payment gateway in test mode.",
    noPago: "The payment couldn't be completed.",
    abreEl: (n: string, f: string) => `Registration for the ${n} opens on ${f}. Follow us on Instagram so you don't miss it.`,
    noAbiertas: (n: string) => `Registration for the ${n} is not open yet. Follow us on Instagram to stay up to date.`,
    completasAep: (n: string) => `Registration for the ${n} is handled by the AEP and there are no places left. If someone withdraws, the federation contacts people in waiting-list order.`,
    completasPropia: (n: string) => `There are no places left for the ${n}. If one frees up, we will announce it on Instagram.`,
    cerradaTxt: (n: string, c: string) => `Registration for the ${n} is closed. If you have a question about your registration, write to us${c ? ' at ' + c : ''}.`,
    entraArea: (propia: boolean) => `Sign in to your athlete area with ${propia ? 'the email you registered with' : 'your AEP email'}: complete your profile, check your flight and set your rack heights.`,
    animarTxt: (sorteo: boolean) => `Entry is free with a booking. You get a QR code by email${sorteo ? ' and you can join the prize draw' : ''}.`,
    revisaCampos: (n: number) => `Check ${n === 1 ? 'one field' : n + ' fields'} before submitting`,
    cubiertas: (n: number) => `All ${n} places are taken. You can join the waiting list: nothing is charged until a place is available, and then we send you the payment link.`,
    cuponAplicado: (x: string) => `Coupon applied: ${x} off the fee`,
    teInvito: (p: string, x: string) => `${p} invited you: ${x}`,
    siAmigo: (x: string) => `If a registered friend gave you their code, you get ${x}.`,
    seoPropia: (e: string, n: number) => `Sign up for the GR Strength Cup: ${e}, ${n} places.`,
    pagoDe: (e: string) => 'Payment of ' + e + ' confirmed.',
    enviadoA: (e: string) => `We have sent it to ${e}.`,
    reservaTxt: (e: string) => `Nothing has been charged. If a place frees up, we will email ${e} with the payment link.`,
    bancoTarda: (e: string) => `The bank is taking longer than usual. Don't pay again: you will get an email at ${e} as soon as it is confirmed.`,
    campos: <Campo[]>[
      { k: 'nombre', label: 'First name', req: true, ac: 'given-name', ph: 'Your first name', error: 'First name is required', corto: 'is required' },
      { k: 'apellidos', label: 'Surname', req: true, ac: 'family-name', ph: 'Your surname', error: 'Surname is required', corto: 'is required' },
      { k: 'email', label: 'Email', req: true, type: 'email', ac: 'email', ph: 'email@example.com', error: 'Enter a valid email', corto: 'enter a valid email' },
      { k: 'telefono', label: 'Phone', type: 'tel', ac: 'tel', ph: '+34 600 000 000' },
      { k: 'sexo', label: 'Sex', req: true, error: 'Choose an option', corto: 'choose an option' }, { k: 'categoria', label: 'Weight class', req: true, error: 'Select your weight class', corto: 'select your weight class' },
      { k: 'fechaNacimiento', label: 'Date of birth', req: true, error: 'Enter your date of birth', corto: 'enter your date of birth' },
      { k: 'licencia', label: 'AEP licence', req: true, ph: 'VAL-0000', error: 'Enter your AEP licence number', corto: 'enter your licence number' },
      { k: 'club', label: 'Club', ph: 'Your club' },
    ],
  },
};
export const eur = (c?: number, loc = 'es-ES') => ((c ?? 0) / 100).toLocaleString(loc, { style: 'currency', currency: 'EUR' });
const fechaLarga = (iso?: string, loc = 'es-ES') => (iso ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');
/** «35 €», «26,25 €» (Figma: whole euros without decimals in the event strip). */
const eurCorto = (c?: number, loc = 'es-ES') => ((c ?? 0) / 100).toLocaleString(loc, { style: 'currency', currency: 'EUR', minimumFractionDigits: (c ?? 0) % 100 ? 2 : 0 });
/** «M 83» → «Hombre · −83 kg»; «F 84+» → «Mujer · +84 kg» (UX2-R1-13). */
const catTexto = (c: string, f = 'Mujer', m = 'Hombre') => {
  const [sexo, k] = c.split(' ');
  return k ? `${{ F: f, M: m }[sexo] ?? sexo} · ${cat(k)} kg` : c;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Same rule as the server (athletes.NormLicencia + licenciaValida). */
const normLicencia = (s: string) => s.replace(/[\s.-]/g, '').toUpperCase();
const LICENCIA = /^[A-Z0-9]{3,20}$/;
/** 422 codes without errors[] that belong to one field. */
const CAMPO_DE_CODIGO: Record<string, string> = { LICENCIA_INVALIDA: 'licencia', EMAIL_INVALIDO: 'email', FECHA_INVALIDA: 'fechaNacimiento', EDAD_MINIMA: 'fechaNacimiento', NOMBRE_INVALIDO: 'nombre' };

/** Shared look of the form controls (Figma 06b «Input»: 48 px, radius 10, padding 14). */
const CAMPO = 'h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none';

type Vista = 'cargando' | 'error' | 'formulario' | 'proximamente' | 'aep' | 'completas' | 'cerrada';
interface Campo { k: keyof InscripcionPage['d']; label: string; req?: boolean; type?: string; ac?: string; ph?: string; error?: string; corto?: string }

/** /inscripcion (Figma pages 06 and 06b): AEP link (external mode) or own registration with payment, coupon and referral. */
@Component({
  selector: 'gr-inscripcion-page',
  imports: [RouterLink, LocPipe, GrSelect, GrTelefono, Page, FormsModule, GrButton, GrIcon, GrSkeleton, GrInscripcionesCerradas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = cfg();
    @let v = vista();
    <gr-page [title]="t().inscribete" [accent]="tituloComp() + '!'" [eyebrow]="t().inscripcion" [centrado]="true" [cabecera]="v === 'formulario' || v === 'cargando'"
      [subtitle]="c?.cuota === 0 ? t().subGratis : t().subPago">
      @if (v === 'cargando') { <gr-skeleton class="h-96 rounded-[18px]" /> }
      @if (v === 'error') {
        <section class="flex flex-col items-center gap-4 pt-2 text-center md:pt-8">
          <h1 class="text-display-m md:text-display-l">{{ t().inscripcion }}</h1>
          <p class="flex max-w-[560px] items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-left text-body-s text-text-secondary" role="alert"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().noCargar }}</p>
        </section>
      }

      <!-- Figma 06 «Próximamente»: own registration not open yet, or the AEP has not opened it -->
      @if (v === 'proximamente') {
        <section class="flex flex-col items-center gap-6 pt-2 pb-2 text-center md:gap-8 md:pt-8">
          <p class="inline-flex h-7 items-center rounded-pill border border-warning bg-warning/12 px-3 text-label-xs text-warning uppercase">{{ t().proximamente }}</p>
          <h1 class="text-display-m [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-xl">{{ t().proximamente }}…</h1>
          <gr-icon name="instagram" [size]="56" class="text-text-primary" />
          <p class="max-w-[560px] text-body-m text-text-secondary md:text-body-l">
            @if (c?.modo === 'propia' && c?.abre) { {{ t().abreEl(nombreComp(), fechaLarga(c!.abre)) }} }
            @else { {{ t().noAbiertas(nombreComp()) }} }
          </p>
          <a grButton size="l" [href]="instagram()" target="_blank" rel="noopener" icon="instagram" class="border-white/10! bg-white/6!">{{ t().siguenos }}</a>
        </section>
      }

      <!-- Figma 06 «Modo AEP» -->
      @if (v === 'aep') {
        <section class="flex flex-col items-center gap-6 pt-2 text-center md:gap-8 md:pt-8">
          <h1 class="text-display-m [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-xl">{{ t().insAep }}</h1>
          <p class="max-w-[560px] text-body-m text-text-secondary md:text-body-l">{{ t().insAepTxt }}</p>
          @if (urlAep()) { <a grButton variant="primary" size="l" [href]="urlAep()" target="_blank" rel="noopener" iconRight="external-link" class="w-full md:w-auto">{{ t().irAep }}</a> }
          @else {
            <p class="flex w-full max-w-[560px] items-center gap-2 rounded-md border border-warning bg-warning/8 px-4 py-3 text-left text-body-s text-text-secondary"><gr-icon name="clock" [size]="18" class="shrink-0 text-warning" />{{ t().sinUrlAep }}</p>
          }
        </section>
      }

      <!-- Figma 06 «Completas» (and the closed registration, same layout) -->
      @if (v === 'completas' || v === 'cerrada') {
        <section class="flex flex-col items-center gap-6 pt-2 text-center md:gap-8 md:pt-8">
          @if (v === 'completas') { <p class="inline-flex h-7 items-center rounded-pill border border-text-tertiary bg-text-tertiary/12 px-3 text-label-xs text-text-tertiary uppercase">{{ t().insCompletas }}</p> }
          <h1 class="text-display-m [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-xl">{{ v === 'completas' ? t().plazasCompletas : t().insCerrada }}</h1>
          @if (plazas() && v === 'completas') {
            <p class="flex items-end gap-2"><span class="font-display text-[60px] leading-none text-accent-text md:text-[72px]">{{ inscritos() }}</span><span class="pb-1 text-display-2xs text-text-tertiary md:text-display-xs">/ {{ plazas() }} atletas</span></p>
          }
          @if (v === 'cerrada' && c?.modo !== 'propia') { <gr-inscripciones-cerradas [chip]="false" /> }
          @else {
          <p class="max-w-[640px] text-body-m text-text-secondary md:text-body-l">
            @if (v === 'completas' && c?.modo !== 'propia') { {{ t().completasAep(nombreComp()) }} }
            @else if (v === 'completas') { {{ t().completasPropia(nombreComp()) }} }
            @else { {{ t().cerradaTxt(nombreComp(), contacto()) }} }
          </p>
          }
          <div class="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            @if (c?.modo === 'propia') {
              <a grButton variant="primary" size="l" [routerLink]="'/atletas' | loc">{{ t().verInscritos }}</a>
            } @else {
              <a grButton variant="primary" size="l" [routerLink]="'/alta-atleta' | loc">{{ t().darAlta }}</a>
              <a grButton variant="outline" size="l" [routerLink]="'/atletas' | loc">{{ t().verAtletas }}</a>
            }
            @if (v === 'completas' && c?.modo !== 'propia' && urlAep()) { <a grButton variant="outline" size="l" [href]="urlAep()" target="_blank" rel="noopener">{{ t().listaEspera }}</a> }
          </div>
          <div class="grid w-full gap-4 pt-6 text-left md:max-w-[960px] md:grid-cols-2">
            <article class="flex flex-col items-start gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
              <span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="user" [size]="20" /></span>
              <h2 class="text-ui-h5">{{ t().yaInscrito }}</h2>
              <p class="text-body-s text-text-tertiary">{{ t().entraArea(c?.modo === 'propia') }}</p>
              <a grButton variant="glass" [routerLink]="'/area-atleta' | loc" iconRight="arrow-right" class="mt-auto">{{ t().areaAtleta }}</a>
            </article>
            @if (entradas()) {
              <article class="flex flex-col items-start gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                <span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="ticket" [size]="20" /></span>
                <h2 class="text-ui-h5">{{ t().animar }}</h2>
                <p class="text-body-s text-text-tertiary">{{ t().animarTxt(sorteo()) }}</p>
                <a grButton variant="glass" [routerLink]="'/entradas' | loc" iconRight="arrow-right" class="mt-auto">{{ t().reservar }}</a>
              </article>
            }
          </div>
        </section>
      }

      <!-- Figma 06b: own registration with payment, coupon and referral -->
      @if (v === 'formulario' && c) {
        <dl class="flex flex-col gap-3 rounded-[18px] border border-line-subtle bg-bg-card p-4 md:flex-row md:justify-center md:gap-8 md:px-6">
          @for (m of meta(); track m.k) {
            <div class="flex items-center gap-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="m.icon" [size]="16" /></span>
              <span class="flex flex-col gap-0.5"><dt class="text-mono-xs text-text-muted">{{ m.k }}</dt><dd class="text-label-s">{{ m.v }}</dd></span>
            </div>
          }
        </dl>

        @if (pagoCancelado(); as pc) {
          <!-- Figma 06b «Pago rechazado»: the place stays held while the payment page is valid -->
          <div class="flex items-start gap-3 rounded-md border border-accent bg-accent/8 p-4 md:items-center" role="alert">
            <gr-icon name="circle-alert" [size]="20" class="shrink-0 text-accent-text" />
            <div class="flex min-w-0 flex-1 flex-col items-start gap-3 md:flex-row md:items-center">
              <p class="flex-1 text-body-s">{{ t().noCompletado }}{{ pc.checkoutUrl ? t().sigueReservada : '' }}</p>
              @if (pc.checkoutUrl) { <a [href]="pc.checkoutUrl" class="flex h-9 shrink-0 items-center rounded-sm bg-accent/15 px-2.5 text-label-s text-accent-text hover:bg-accent/25">{{ t().reintentarPago }}</a> }
            </div>
            <button type="button" class="flex size-8 shrink-0 items-center justify-center text-text-tertiary hover:text-text-primary" [attr.aria-label]="t().cerrarAviso" (click)="pagoCancelado.set(null)"><gr-icon name="x" [size]="16" /></button>
          </div>
        }
        @if (c.pasarela === 'ninguna' && c.estado !== 'completa') {
          <p class="flex items-start gap-3 rounded-md border border-line-strong bg-bg-card p-4 text-body-s text-text-secondary"><gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-text-tertiary" />{{ t().noCobrar }}</p>
        }
        @if (resumenErrores().length) {
          <!-- Figma 06 «Errores de validación» -->
          <div #errores tabindex="-1" class="scroll-mt-28 rounded-md border border-accent bg-accent/8 p-4 outline-none" role="alert">
            <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />{{ t().revisaCampos(resumenErrores().length) }}</p>
            <ul class="mt-2 flex flex-col gap-1 pl-1 text-body-s text-text-secondary">@for (e of resumenErrores(); track e) { <li>• {{ e }}</li> }</ul>
          </div>
        }

        <form class="flex flex-col gap-5 rounded-[18px] border border-line-subtle bg-bg-card p-4 md:p-7" (ngSubmit)="enviar()" novalidate>
          @if (c.estado === 'completa') {
            <!-- Figma 06b «Plazas completas → reserva» (inside the form card) -->
            <p class="flex items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().cubiertas(c.plazas) }}</p>
          }
          <div class="grid gap-4 md:grid-cols-2">
            @for (f of campos; track f.k) {
              <div class="flex min-w-0 flex-col gap-2">
                <label class="text-label-s" [for]="'i-' + f.k">{{ f.label }}{{ f.req ? ' *' : '' }}</label>
                @switch (f.k) {
                  @case ('sexo') {
                    <!-- UX2-R1-6: mismo control que el alta (segmented 48 px), sin valor por defecto -->
                    <div [id]="'i-' + f.k" tabindex="-1" class="flex gap-2 outline-none" role="radiogroup" [attr.aria-label]="t().sexo" aria-required="true" [attr.aria-invalid]="err()[f.k] ? true : null" [attr.aria-describedby]="err()[f.k] ? 'e-' + f.k : null">
                      @for (o of SEXOS; track o.v) {
                        <button type="button" role="radio" [attr.aria-checked]="d.sexo === o.v" (click)="d.sexo = o.v; d.categoria = ''; revalidar()"
                          class="inline-flex h-12 flex-1 items-center justify-center rounded-[10px] border px-4 text-label-m transition-colors"
                          [class]="d.sexo === o.v ? 'border-accent-text bg-accent-deep/30 text-text-primary' : (err()[f.k] ? 'border-accent-text' : 'border-line-strong') + ' text-text-secondary hover:text-text-primary'">{{ o.l }}</button>
                      }
                    </div>
                  }
                  @case ('categoria') {
                    <gr-select [id]="'i-' + f.k" tam="l" name="categoria" [(ngModel)]="d.categoria" (ngModelChange)="revalidar()" [invalido]="!!err()[f.k]" [aria-describedby]="err()[f.k] ? 'e-' + f.k : ''" [vacio]="t().eligeSexo"><option value="" hidden>{{ t().selCat }}</option>@for (k of categorias(); track k) { <option [value]="k">{{ cat(k) }} kg</option> }</gr-select>
                  }
                  @case ('fechaNacimiento') {
                    <!-- UX2-R1-7: mismo campo que el alta (dd/mm/aaaa con máscara), no el date nativo en formato US -->
                    <input [id]="'i-' + f.k" [class]="CAMPO + ' ' + (err()[f.k] ? 'border-accent-text' : 'border-line-strong')" name="fechaNacimiento" type="text" inputmode="numeric" autocomplete="bday" [placeholder]="t().fmtFecha"
                      [value]="fechaTexto" (input)="fechaCambia($any($event.target))"
                      [attr.aria-invalid]="!!err()[f.k]" [attr.aria-describedby]="err()[f.k] ? 'e-' + f.k + ' h-' + f.k : 'h-' + f.k" />
                    <p [id]="'h-' + f.k" class="text-body-s text-text-tertiary">{{ t().formato }}</p>
                  }
                  @case ('telefono') {
                    <gr-telefono [id]="'i-' + f.k" tam="l" [name]="f.k" [aria-label]="f.label" [invalido]="!!err()[f.k]" [(ngModel)]="d.telefono" (ngModelChange)="revalidar()" />
                  }
                  @default {
                    <input [id]="'i-' + f.k" [class]="CAMPO + ' ' + (err()[f.k] ? 'border-accent-text' : 'border-line-strong')" [name]="f.k" [attr.name]="f.k" [type]="f.type || 'text'" [attr.autocomplete]="f.ac" [attr.placeholder]="f.ph" [(ngModel)]="d[f.k]" (ngModelChange)="revalidar()"
                      [attr.aria-invalid]="!!err()[f.k]" [attr.aria-describedby]="err()[f.k] ? 'e-' + f.k : null" />
                  }
                }
                @if (f.k === 'club') { <p class="text-body-s text-text-tertiary">{{ t().independiente }}</p> }
                @if (err()[f.k]; as e) { <p [id]="'e-' + f.k" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
              </div>
            }
          </div>

          @if ((c.cupones || c.referidos) && c.cuota > 0) {
            <fieldset class="flex min-w-0 flex-col gap-3">
              <legend class="mb-3 text-ui-h5">{{ t().descuentos }}</legend>
              <div class="grid gap-3 md:grid-cols-2">
                @if (c.cupones) {
                  <div class="flex min-w-0 flex-col gap-2">
                    <label class="text-label-s" for="i-cupon">{{ t().codDesc }}</label>
                    <span class="flex h-12 items-center rounded-[10px] border bg-bg-field pr-3.5 focus-within:border-accent-text" [class]="precio()?.cupon && !precio()!.cupon!.valido ? 'border-accent-text' : 'border-line-strong'">
                      <input id="i-cupon" name="cupon" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" enterkeyhint="done" [attr.aria-invalid]="precio()?.cupon && !precio()!.cupon!.valido ? true : null" [attr.aria-describedby]="precio()?.cupon ? 'e-cupon' : null" class="h-full w-0 min-w-0 flex-1 bg-transparent px-3.5 text-body-m uppercase outline-none placeholder:normal-case placeholder:text-text-muted" [(ngModel)]="cupon" (ngModelChange)="vaciado('cupon', $event)" [readonly]="!!precio()?.cupon?.valido" (keydown.enter)="$event.preventDefault(); calcular()" />
                      <button type="button" class="h-full shrink-0 pl-2 text-label-s text-accent-text hover:underline" (click)="precio()?.cupon?.valido ? quitar('cupon') : calcular()">{{ precio()?.cupon?.valido ? t().quitar : t().aplicar }}</button>
                    </span>
                    @if (precio()?.cupon; as x) { <p id="e-cupon" class="flex items-center gap-1.5 text-body-s" [class]="x.valido ? 'text-success' : 'text-accent-text'" aria-live="polite">@if (x.valido) { <gr-icon name="check" [size]="14" /> {{ t().cuponAplicado(x.texto) }} } @else { {{ x.motivo }} }</p> }
                  </div>
                }
                @if (c.referidos) {
                  <div class="flex min-w-0 flex-col gap-2">
                    <label class="text-label-s" for="i-ref">{{ t().invitado }}</label>
                    <span class="flex h-12 items-center rounded-[10px] border bg-bg-field pr-3.5 focus-within:border-accent-text" [class]="precio()?.referido && !precio()!.referido!.valido ? 'border-accent-text' : 'border-line-strong'">
                      <input id="i-ref" name="referido" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" enterkeyhint="done" [attr.aria-invalid]="precio()?.referido && !precio()!.referido!.valido ? true : null" [attr.aria-describedby]="precio()?.referido ? 'e-ref' : (c.referidoTexto ? 'h-ref' : null)" [placeholder]="t().codRef" class="h-full w-0 min-w-0 flex-1 bg-transparent px-3.5 text-body-m uppercase outline-none placeholder:normal-case placeholder:text-text-muted" [(ngModel)]="referido" (ngModelChange)="vaciado('referido', $event)" [readonly]="!!precio()?.referido?.valido" (keydown.enter)="$event.preventDefault(); calcular()" />
                      <button type="button" class="h-full shrink-0 pl-2 text-label-s text-accent-text hover:underline" (click)="precio()?.referido?.valido ? quitar('referido') : calcular()">{{ precio()?.referido?.valido ? t().quitar : t().aplicar }}</button>
                    </span>
                    @if (precio()?.referido; as x) { <p id="e-ref" class="flex items-center gap-1.5 text-body-s" [class]="x.valido ? 'text-success' : 'text-accent-text'" aria-live="polite">@if (x.valido) { <gr-icon name="check" [size]="14" /> {{ t().teInvito(x.invitadoPor ?? '', x.texto) }} } @else { {{ x.motivo }} }</p> }
                    @else if (c.referidoTexto) { <p id="h-ref" class="text-body-s text-text-tertiary">{{ t().siAmigo(c.referidoTexto.replace(' con el código de un amigo inscrito', '')) }}</p> }
                  </div>
                }
              </div>
            </fieldset>
          }

          @if (c.estado !== 'completa') {
            <div class="rounded-[14px] border border-line-subtle bg-bg-surface px-5 py-2">
              <p class="flex justify-between gap-4 py-2.5 text-body-s"><span class="text-text-secondary">{{ t().inscripcion }} · {{ tituloComp() }}</span><span class="text-mono-s">{{ eur(c.cuota) }}</span></p>
              @if (precio()?.cupon?.valido) { <p class="flex justify-between gap-4 py-2.5 text-body-s"><span class="text-text-secondary">{{ t().cupon }} {{ precio()!.cupon!.codigo }} ({{ precio()!.cupon!.texto }})</span><span class="text-mono-s text-success">−{{ eur(precio()!.cupon!.importe) }}</span></p> }
              @if (precio()?.referido?.valido) { <p class="flex justify-between gap-4 py-2.5 text-body-s"><span class="text-text-secondary">{{ t().codigo }} {{ precio()!.referido!.codigo }} ({{ precio()!.referido!.texto }})</span><span class="text-mono-s text-success">−{{ eur(precio()!.referido!.importe) }}</span></p> }
              <p class="flex items-center justify-between border-t border-line-subtle py-3"><span class="text-label-m">Total</span><span class="text-ui-h4">{{ eur(total()) }}</span></p>
            </div>
          }

          <div class="flex flex-col">
            @for (k of checks; track k.k) {
              <label class="flex min-h-11 items-start gap-2.5 py-1 text-body-s" [class]="k.req ? 'text-text-primary' : 'text-text-secondary'">
                <span class="relative -mt-px flex size-6 shrink-0 items-center justify-center">
                  <input type="checkbox" [name]="k.k" [attr.name]="k.k" [(ngModel)]="acepta[k.k]" (ngModelChange)="revalidar()" class="peer size-[22px] cursor-pointer appearance-none rounded-[5px] border bg-bg-base checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text" [class]="k.req && err()['terminos'] && !acepta[k.k] ? 'border-accent-text' : 'border-line-strong'" />
                  @if (acepta[k.k]) { <gr-icon name="check" [size]="14" class="pointer-events-none absolute text-white" /> }
                </span>
                <span>
                  @switch (k.k) {
                    @case ('terminos') { {{ t().heLeidoAcepto }}<a [href]="'/terminos' | loc" target="_blank" class="text-accent-text hover:underline">{{ t().terminos }}</a>{{ t().yEl }}<a [href]="'/reglamento' | loc" target="_blank" class="text-accent-text hover:underline">{{ t().reglamento }}</a> * }
                    @case ('privacidad') { {{ t().heLeido }}<a [href]="'/privacidad' | loc" target="_blank" class="text-accent-text hover:underline">{{ t().politica }}</a> * }
                    @default { {{ t().fotoWeb }} }
                  }
                </span>
              </label>
            }
            @if (err()['terminos']; as e) { <p class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
          </div>
          @if (error()) { <p class="flex items-start gap-2 rounded-md border border-accent bg-accent/8 p-4 text-body-s" role="alert"><gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0 text-accent-text" />{{ error() }}</p> }
          <!-- UX2-R1-4: en móvil, CTA con el total fijo abajo mientras el formulario está en vista -->
          <div class="flex flex-col gap-3 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-line-subtle max-md:bg-bg-base/95 max-md:px-4 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:backdrop-blur-[10px]">
            <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="enviando()">{{ c.estado === 'completa' ? t().apuntarme : total() === 0 ? t().confirmar : t().pagar + eur(total()) }}</button>
            <p class="text-center text-body-s text-text-muted">
              @if (c.estado === 'completa') { No se cobra nada hasta que haya plaza. }
              @else if (total() === 0) { Sin pago: te inscribimos al confirmar. }
              @else { <gr-icon name="lock" [size]="13" class="mr-1.5 inline-block align-[-2px]" />{{ c.pasarela === 'stripe' ? t().seguroStripe : t().seguro }}{{ c.pruebas ? t().pruebas : '' }} }
            </p>
          </div>
        </form>
      }
    </gr-page>
  `,
})
export class InscripcionPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  /** Idempotency-Key of the current submission (kept on retries of the same data, renewed when it succeeds). */
  private idem = '';
  /** Registering (price check and submit) needs the public account session (atleta or público). */
  private readonly fan = inject(FanSession);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly eur = (c?: number) => eur(c, this.i18n.locale());
  protected readonly cat = cat;
  protected readonly fechaLarga = (iso?: string) => fechaLarga(iso, this.i18n.locale());
  protected readonly CAMPO = CAMPO;
  protected get SEXOS() {
    return [{ v: 'F' as const, l: this.t().mujer }, { v: 'M' as const, l: this.t().hombre }];
  }
  protected readonly cfg = signal<ConfigPub | null | undefined>(undefined);
  protected readonly competicion = signal<CompeticionPublica | null>(null);
  protected readonly precio = signal<Precio | null>(null);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  /** ?cancelado=<id>: the buyer came back from the payment page without paying. */
  protected readonly pagoCancelado = signal<{ checkoutUrl?: string } | null>(null);
  /** Field errors, shown after the first submit and updated while the person fixes them. */
  protected readonly err = signal<Record<string, string>>({});
  private intentado = false;
  d = { nombre: '', apellidos: '', email: '', telefono: '', sexo: '' as '' | 'F' | 'M', categoria: '', fechaNacimiento: '', licencia: '', club: '' };
  protected cupon = '';
  protected referido = '';
  protected acepta: Record<'terminos' | 'privacidad' | 'imagen', boolean> = { terminos: false, privacidad: false, imagen: false };
  protected readonly checks = [{ k: 'terminos' as const, req: true }, { k: 'privacidad' as const, req: true }, { k: 'imagen' as const, req: false }];
  protected get campos(): Campo[] {
    return this.t().campos;
  }
  protected readonly total = computed(() => this.precio()?.total ?? this.cfg()?.cuota ?? 0);
  protected readonly vista = computed<Vista>(() => {
    const c = this.cfg();
    const comp = this.competicion();
    if (c === undefined) return 'cargando';
    if (c === null) return 'error';
    if (c.modo === 'propia') {
      if (c.estado === 'completa' && !c.reserva) return 'completas'; // no reserve list: nothing to sign up for
      return c.estado === 'proximamente' ? 'proximamente' : c.estado === 'cerrada' ? 'cerrada' : 'formulario';
    }
    // external (AEP) registration: the state the organiser set in «Evento»
    // BIZ-160: the AEP registration is closed (152 athletes), so the open «aep» view is no longer shown
    switch (comp?.inscripcion?.estado) {
      case 'proximamente': return 'proximamente';
      case 'completa': return 'completas';
      default: return 'cerrada';
    }
  });
  /** «II GR Strength Cup» (edition in Roman numerals, without the year of the name). */
  protected readonly tituloComp = computed(() => {
    const c = this.competicion();
    const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][c?.edicion ?? 0] ?? '';
    return `${roman ? roman + ' ' : ''}${(c?.nombre ?? 'GR Strength Cup').replace(/\s*\d{4}$/, '')}`;
  });
  protected readonly nombreComp = computed(() => this.competicion()?.nombre ?? 'GR Strength Cup');
  protected readonly urlAep = computed(() => this.competicion()?.inscripcion?.url ?? '');
  protected readonly instagram = computed(() => instagramOf(this.competicion()));
  protected readonly contacto = computed(() => this.competicion()?.evento?.emailContacto ?? '');
  protected readonly plazas = computed(() => this.cfg()?.plazas || this.competicion()?.inscripcion?.plazas || 0);
  protected readonly inscritos = computed(() => Math.min(this.cfg()?.ocupadas ?? 0, this.plazas()) || (this.vista() === 'completas' ? this.plazas() : 0));
  protected readonly entradas = computed(() => this.competicion()?.modulos?.['entradas'] !== false);
  protected readonly sorteo = computed(() => this.competicion()?.modulos?.['sorteo'] === true);
  protected readonly meta = computed(() => {
    const c = this.cfg();
    const f = this.competicion()?.fechaInicio;
    const t = this.t();
    return [
      { k: t.fecha, icon: 'calendar' as const, v: f ? new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(f)).replace(/ de /g, ' ') : t.porConfirmar },
      { k: t.sede, icon: 'map-pin' as const, v: `${this.competicion()?.sede?.ciudad || 'Almussafes'} (Valencia)` },
      { k: t.plazas, icon: 'user' as const, v: `${c?.plazas || '—'}${c?.modo === 'propia' && c.cuota > 0 ? ' · ' + eurCorto(c.cuota, this.i18n.locale()) : ''}` },
    ];
  });
  protected readonly resumenErrores = computed(() => {
    const e = this.err();
    const l = this.campos.filter((f) => e[f.k]).map((f) => `${f.label}: ${e[f.k] === f.error ? f.corto : e[f.k]}`);
    if (e['terminos']) l.push(this.t().terminosResumen);
    return l;
  });

  constructor() {
    const route = inject(ActivatedRoute);
    const comp = inject(Competition);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [c, cp] = await Promise.all([firstValueFrom(this.http.get<ConfigPub>(base)).catch(() => null), comp.load()]);
      this.cfg.set(c);
      this.competicion.set(cp);
      // shared link …?ref=CODE: price it now only with a session (never open the login modal on arrival)
      if (this.browser && this.referido && c?.modo === 'propia') void this.fan.cargar().then((f) => f && this.calcular());
      seo.set({ title: this.t().seoT, description: c?.modo === 'propia' ? this.t().seoPropia(this.eur(c.cuota), c.plazas) : this.t().seoAep, path: '/inscripcion' });
    });
    if (this.browser) {
      void this.fan.cargar();
      // Live place counter (SSE inscripcion.plazas_actualizadas): no polling of GET …/inscripcion.
      // Reopened on every come-back: iOS Safari leaves the stream dead after a freeze.
      const cerrar = esConReanudacion(() => {
        const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
        es.addEventListener('inscripcion.plazas_actualizadas', (ev) => {
          try {
            const d = JSON.parse((ev as MessageEvent).data).datos as Pick<ConfigPub, 'plazas' | 'ocupadas' | 'estado' | 'reserva'>;
            this.cfg.update((c) => (c ? { ...c, plazas: d.plazas, ocupadas: d.ocupadas, estado: d.estado, reserva: d.reserva } : c));
          } catch { /* malformed event: keep the last state */ }
        });
        return es;
      });
      inject(DestroyRef).onDestroy(() => cerrar());
      const p = new URLSearchParams(location.search);
      const ref = p.get('ref');
      if (ref) this.referido = ref; // shared link …/inscripcion?ref=LAURA412
      this.restaurar();
      const cancelado = route.snapshot.queryParamMap.get('cancelado');
      if (cancelado) {
        this.pagoCancelado.set({});
        // the payment page stays valid while the place is held: offer to go back to it
        if (/^[0-9a-f-]{36}$/.test(cancelado)) void firstValueFrom(this.http.get<Estado>(`${base}/${cancelado}`)).then((e) => this.pagoCancelado.set(e.estado === 'pendiente_pago' ? { checkoutUrl: e.checkoutUrl } : {}), () => undefined);
      }
    }
  }

  protected categorias(): string[] {
    return this.d.sexo ? CATEGORIAS_IPF[this.d.sexo] : [];
  }

  protected async calcular(): Promise<void> {
    if (!(await this.sesion())) return;
    try {
      this.precio.set(await firstValueFrom(this.http.post<Precio>(`${base}/precio`, { cupon: this.cupon, referido: this.referido, email: this.d.email })));
    } catch (e) {
      if (codigoError(e).startsWith('SESION_FAN')) return this.pedirAcceso();
      this.error.set(textoError(e, this.t().noComprobar));
    }
  }

  /** True with a session; otherwise opens the login modal (the person resumes after signing in). */
  private async sesion(): Promise<boolean> {
    if (await this.fan.cargar()) return true;
    this.pedirAcceso();
    return false;
  }

  /** Login modal with the way back to this form (and what was typed, restored on return). */
  private pedirAcceso(): void {
    try {
      localStorage.setItem(BORRADOR, JSON.stringify({ d: this.d, cupon: this.cupon, referido: this.referido, t: Date.now() }));
    } catch { /* private mode: the link still comes back here */ }
    const q = new URLSearchParams();
    if (this.referido) q.set('ref', this.referido);
    this.fan.abrirAcceso('inscripcion', this.i18n.path('/inscripcion') + (q.size ? '?' + q : ''));
  }

  private restaurar(): void {
    try {
      const b = JSON.parse(localStorage.getItem(BORRADOR) ?? 'null') as { d?: Partial<InscripcionPage['d']>; cupon?: string; referido?: string; t?: number } | null;
      if (!b || Date.now() - (b.t ?? 0) > 2 * 3600_000) return;
      Object.assign(this.d, b.d ?? {});
      this.cupon ||= b.cupon ?? '';
      this.referido ||= b.referido ?? '';
    } catch { /* no draft */ }
  }

  /** UX2-R2-2: al vaciar el campo se borra su error (y el bloqueo de «Pagar»). */
  protected vaciado(k: 'cupon' | 'referido', v: string): void {
    const p = this.precio();
    if (!v.trim() && p?.[k]) this.precio.set({ ...p, [k]: undefined });
  }

  protected quitar(k: 'cupon' | 'referido'): void {
    if (k === 'cupon') this.cupon = '';
    else this.referido = '';
    void this.calcular();
  }

  /** Lo que se ve en el campo fecha (dd/mm/aaaa); d.fechaNacimiento guarda la ISO solo si la fecha existe. */
  protected fechaTexto = '';
  protected fechaCambia(el: HTMLInputElement): void {
    const { texto, iso } = mascaraFecha(el.value);
    el.value = this.fechaTexto = texto;
    this.d.fechaNacimiento = iso;
    this.revalidar();
  }

  private validar(): Record<string, string> {
    const d = this.d;
    const e: Record<string, string> = {};
    const msg = (k: string) => this.campos.find((f) => f.k === k)!.error!;
    if (!d.nombre.trim()) e['nombre'] = msg('nombre');
    if (!d.apellidos.trim()) e['apellidos'] = msg('apellidos');
    if (!EMAIL.test(d.email.trim())) e['email'] = msg('email');
    if (d.telefono.trim() && !telefonoValido(d.telefono)) e['telefono'] = this.t().msgTel;
    if (!d.sexo) e['sexo'] = msg('sexo');
    if (!d.categoria) e['categoria'] = msg('categoria');
    if (!d.fechaNacimiento) e['fechaNacimiento'] = msg('fechaNacimiento');
    const lic = normLicencia(d.licencia);
    if (!lic) e['licencia'] = msg('licencia');
    else if (!LICENCIA.test(lic)) e['licencia'] = this.t().msgLicencia;
    if (!this.acepta.terminos || !this.acepta.privacidad) e['terminos'] = this.t().aceptaTerminos;
    return e;
  }

  protected revalidar(): void {
    if (this.intentado) this.err.set(this.validar());
  }

  private enfocarResumen(): void {
    // the summary sits above the form: take the person there (Figma 06 «Errores de validación»)
    afterNextRender(() => {
      const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('[role=alert][tabindex]');
      if (!el) return;
      // scroll-behavior:smooth del html anula el scroll del focus: se desplaza a mano (UX2-R1-3).
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /** Field errors of a 422 (errors[].location body.x, or a code tied to one field); true if any was shown. */
  private erroresServidor(err: unknown): boolean {
    const b = (err as { error?: { code?: string; detail?: string; errors?: { location?: string; message?: string }[] } }).error;
    const e: Record<string, string> = {};
    // EN: never the raw Spanish detail / message of the API
    const en = idiomaActual() === 'en' ? errorEn(b?.code) ?? 'This field is not valid.' : '';
    for (const x of b?.errors ?? []) {
      const k = x.location?.replace(/^body\./, '');
      if (k && this.campos.some((f) => f.k === k)) e[k] = en || x.message || b?.detail || '';
    }
    const k = CAMPO_DE_CODIGO[b?.code ?? ''];
    if (k && !e[k]) e[k] = en || (b?.detail ?? '');
    if (!Object.keys(e).length) return false;
    this.err.set(e);
    this.enfocarResumen();
    return true;
  }

  protected async enviar(): Promise<void> {
    if (this.enviando()) return; // double click: one request
    this.error.set('');
    this.intentado = true;
    const e = this.validar();
    this.err.set(e);
    if (Object.keys(e).length) {
      this.enfocarResumen();
      return;
    }
    this.enviando.set(true);
    try {
      if (!(await this.sesion())) return;
      const p = this.precio();
      if ((this.cupon && !p?.cupon?.valido) || (this.referido && !p?.referido?.valido)) {
        await this.calcular();
        const q = this.precio();
        if ((this.cupon && !q?.cupon?.valido) || (this.referido && !q?.referido?.valido)) return this.error.set(this.t().revisaCodigos);
      }
      this.idem ||= crypto.randomUUID();
      const r = await firstValueFrom(this.http.post<Estado>(base, { ...this.d, cupon: this.cupon, referido: this.referido, aceptaTerminos: true, aceptaPrivacidad: true, aceptaImagen: this.acepta.imagen }, { headers: { 'Idempotency-Key': this.idem }, context: sinTimeout() }));
      this.idem = '';
      try { localStorage.removeItem(BORRADOR); } catch { /* ignore */ }
      if (r.checkoutUrl) location.href = r.checkoutUrl;
      else void this.router.navigate([this.i18n.path('/inscripcion/estado')], { queryParams: { id: r.id } });
    } catch (err) {
      const c = codigoError(err);
      if (c !== 'INSCRIPCION_EN_CURSO' && !c.startsWith('HTTP_0') && !c.startsWith('HTTP_5')) this.idem = ''; // a rejected form gets a new key once fixed
      if (c.startsWith('SESION_FAN')) return this.pedirAcceso();
      if (this.erroresServidor(err)) return;
      this.error.set(textoError(err, this.t().noCompletar));
    } finally {
      this.enviando.set(false);
    }
  }
}

/** /inscripcion/estado?id=… — confirmation after paying (polls while the webhook arrives). Figma 06b «/inscripcion/confirmada». */
@Component({
  selector: 'gr-inscripcion-estado',
  imports: [RouterLink, LocPipe, Page, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = estado();
    <gr-page [title]="t().inscripcion" [centrado]="true" [cabecera]="false">
      <div class="-mt-4 mx-auto flex w-full max-w-[560px] flex-col gap-5 md:mt-0 md:pt-4">
        @if (e === undefined || (e?.estado === 'pendiente_pago' && !esperando())) {
          <div class="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
            <span class="size-14 animate-spin rounded-full border-4 border-accent/25 border-t-accent" aria-hidden="true"></span>
            <h1 class="mt-1 text-display-s md:text-display-m">{{ t().confirmando }}</h1>
            <p class="text-body-m text-text-secondary">{{ t().noCierres }}</p>
            @if (aviso()) { <p class="text-body-s text-warning" role="status">{{ t().noComprobarPago }}</p> }
          </div>
        } @else if (e === null) {
          <div class="flex flex-col items-center gap-3 text-center">
            <h1 class="text-display-s md:text-display-m">{{ t().noEncontrada }}</h1>
            <p class="text-body-m text-text-secondary">{{ t().siPagado }}<a [routerLink]="'/inscripcion' | loc" class="text-accent-text hover:underline">{{ t().inscribirte }}</a>.</p>
          </div>
        } @else if (e.estado === 'pagada' || e.estado === 'gratuita') {
          <div class="flex flex-col items-center gap-2.5 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-success bg-success/14 text-success"><gr-icon name="circle-check" [size]="30" /></span>
            <h1 class="mt-2.5 text-display-m">{{ t().inscrito }}</h1>
            <p class="text-body-m text-text-secondary">{{ e.estado === 'pagada' ? t().pagoDe(eur(e.total)) : t().sinPago }} {{ t().enviadoA(e.email) }}</p>
          </div>
          <dl class="rounded-[18px] border border-line-subtle bg-bg-card px-5 py-2">
            <div class="flex justify-between gap-4 py-3" [class.border-b]="e.estado === 'pagada' || e.referencia" [class.border-line-subtle]="true"><dt class="text-body-s text-text-tertiary">{{ t().inscripcion }}</dt><dd class="text-label-s">{{ catTexto(e.categoria) }}{{ e.division ? ' · ' + e.division : '' }}</dd></div>
            @if (e.estado === 'pagada') { <div class="flex justify-between gap-4 py-3" [class.border-b]="!!e.referencia" [class.border-line-subtle]="true"><dt class="text-body-s text-text-tertiary">{{ t().pago }}</dt><dd class="text-label-s">{{ eur(e.total) }}{{ e.tarjeta ? ' · ' + e.tarjeta : '' }}</dd></div> }
            @if (e.referencia) { <div class="flex justify-between gap-4 py-3"><dt class="text-body-s text-text-tertiary">{{ t().referencia }}</dt><dd class="text-label-s">{{ e.referencia }}</dd></div> }
          </dl>
          @if (e.codigoReferido) {
            <section class="flex flex-col gap-3 rounded-[18px] border border-line-subtle bg-bg-card p-6">
              <h2 class="text-label-m">{{ t().invita }}</h2>
              <p class="text-body-s text-text-tertiary">{{ e.invitaTexto || t().invitaTxt }}</p>
              <div class="flex h-12 items-center gap-2.5 rounded-[10px] border border-line-strong bg-bg-field pl-3.5"><gr-icon name="link" [size]="16" class="text-text-tertiary" /><span class="min-w-0 flex-1 truncate text-mono-s">{{ e.codigoReferido }}</span><button type="button" class="h-full px-3.5 text-label-s text-accent-text hover:underline" (click)="copiar(e.codigoReferido!)">{{ copiado() ? t().copiado : t().copiar }}</button></div>
              <!-- UX2-R1-13: hoja de compartir nativa (si no hay, copia el enlace) -->
              <button grButton variant="primary" size="l" type="button" [block]="true" (click)="compartir(e.codigoReferido!)"><gr-icon name="share" [size]="18" />{{ t().compartirCod }}</button>
              <p class="sr-only" aria-live="polite">{{ copiado() ? t().enlaceCopiado : '' }}</p>
            </section>
          }
          <a grButton variant="outline" size="l" [block]="true" [routerLink]="'/area-atleta' | loc">{{ t().irArea }}</a>
        } @else if (e.estado === 'reserva') {
          <div class="flex flex-col items-center gap-2.5 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-warning bg-warning/12 text-warning"><gr-icon name="clock" [size]="30" /></span>
            <h1 class="mt-2.5 text-display-m">{{ t().enReserva }}</h1>
            <p class="text-body-m text-text-secondary">{{ t().reservaTxt(e.email) }}</p>
          </div>
          <a grButton variant="outline" size="l" [block]="true" [routerLink]="'/' | loc">{{ t().volverInicio }}</a>
        } @else if (e.estado === 'pendiente_pago') {
          <!-- Reached from the gateway's success URL: the charge went through, only the webhook is late. Never offer to pay again. -->
          <div class="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
            <span class="flex size-16 items-center justify-center rounded-full border border-warning bg-warning/12 text-warning"><gr-icon name="clock" [size]="30" /></span>
            <h1 class="mt-1 text-display-s md:text-display-m">{{ t().esperando }}</h1>
            <p class="text-body-m text-text-secondary">{{ t().bancoTarda(e.email) }}</p>
          </div>
          <button grButton variant="primary" size="l" [block]="true" (click)="comprobar()">{{ t().comprobar }}</button>
        } @else {
          <!-- Figma 06b «Pago rechazado» -->
          <h1 class="text-center text-display-s md:text-display-m">{{ t().pagoNo }}</h1>
          <div class="flex items-start gap-3 rounded-md border border-accent bg-accent/8 p-4 md:items-center" role="alert">
            <gr-icon name="circle-alert" [size]="20" class="shrink-0 text-accent-text" />
            <div class="flex min-w-0 flex-1 flex-col items-start gap-3 md:flex-row md:items-center">
              <p class="flex-1 text-body-s">{{ t().noCompletado }}{{ e.checkoutUrl ? t().sigueReservada : '' }}</p>
              @if (e.checkoutUrl) { <a [href]="e.checkoutUrl" class="flex h-9 shrink-0 items-center rounded-sm bg-accent/15 px-2.5 text-label-s text-accent-text hover:bg-accent/25">{{ t().reintentarPago }}</a> }
            </div>
          </div>
          <a [routerLink]="'/inscripcion' | loc" class="self-center py-2 text-label-s text-text-secondary hover:text-text-primary">{{ t().cambiarDatos }}</a>
        }
      </div>
    </gr-page>
  `,
})
export class InscripcionEstadoPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly eur = (c?: number) => eur(c, this.i18n.locale());
  protected readonly catTexto = (c: string) => catTexto(c, this.t().mujer, this.t().hombre);
  protected readonly estado = signal<Estado | null | undefined>(undefined);
  /** Polled for 2 minutes without the webhook: stop and let the athlete check by hand. */
  protected readonly esperando = signal(false);
  /** A transient error (network, 5xx, 429) while checking: keep polling with backoff instead of «not found». */
  protected readonly aviso = signal(false);
  protected readonly copiado = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private poll?: () => Promise<void>;
  private desde = 0;

  constructor() {
    inject(Seo).set({ title: this.t().seoT, description: this.t().seoEstado, path: '/inscripcion/estado', robots: 'noindex' });
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    if (!browser) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      this.estado.set(null);
      return;
    }
    let fallos = 0;
    let n = 0;
    const poll = async () => {
      try {
        const e = await firstValueFrom(this.http.get<Estado>(`${base}/${encodeURIComponent(id)}`));
        fallos = 0;
        this.aviso.set(false);
        this.estado.set(e);
        if (e.estado === 'pendiente_pago') {
          if (Date.now() - this.desde >= 120_000) {
            this.esperando.set(true);
            return;
          }
          this.timer = setTimeout(poll, Math.min(2000 * 1.5 ** n++, 15000));
        }
      } catch (err) {
        if (err instanceof HttpErrorResponse && [400, 404, 422].includes(err.status)) {
          this.estado.set(null);
          return;
        }
        this.aviso.set(true);
        this.timer = setTimeout(poll, Math.min(2000 * 2 ** fallos++, 30000));
      }
    };
    this.poll = async () => {
      n = 0;
      this.desde = Date.now();
      return poll();
    };
    void this.poll();
  }

  protected comprobar(): void {
    clearTimeout(this.timer);
    this.esperando.set(false);
    void this.poll?.();
  }

  protected async compartir(code: string): Promise<void> {
    const url = `${location.origin}${this.i18n.path('/inscripcion')}?ref=${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'GR Strength Cup', text: this.t().shareTxt, url }); } catch { /* cancelado */ }
      return;
    }
    await this.copiar(code);
  }

  protected async copiar(code: string): Promise<void> {
    await navigator.clipboard?.writeText(`${location.origin}${this.i18n.path('/inscripcion')}?ref=${code}`);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}

interface SesionSim { id: string; descripcion: string; importe: number; email: string; estado: string; cancelUrl: string; successUrl?: string; pruebas: boolean; tarjetas: [string, string][]; lineas?: { concepto: string; importe: number }[] }

/** /pago/simulado?s=<service>:<session> — test gateway that imitates Stripe Checkout (Figma 06b). */
@Component({
  selector: 'gr-pago-simulado',
  imports: [RouterLink, LocPipe, FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen bg-bg-base' },
  template: `
    @let s = sesion();
    <p class="flex h-9 items-center justify-center bg-warning/15 text-mono-xs text-warning">MODO PRUEBAS · NO SE COBRA NADA</p>
    @if (s === undefined) { <div class="mx-auto max-w-md p-8"><gr-skeleton class="h-80 rounded-lg" /></div> }
    @else if (s === null || s.estado === 'caducada') {
      <div class="mx-auto max-w-md p-8"><gr-alert tone="warning" [title]="t().caducado">{{ t().caducadoTxt }}</gr-alert><a grButton class="mt-4" [routerLink]="'/inscripcion' | loc">{{ t().volverIns }}</a></div>
    } @else if (s.estado === 'paid') {
      <div class="mx-auto max-w-md p-8"><gr-alert tone="success" [title]="t().completado">{{ t().yaHecho }}</gr-alert>
        @if (s.successUrl) { <a grButton variant="primary" class="mt-4" [href]="s.successUrl">{{ t().verEstado }}</a> } @else { <a grButton class="mt-4" [routerLink]="'/' | loc">{{ t().volverInicio }}</a> }
      </div>
    } @else {
      <!-- Figma 06b «Pasarela simulada»: summary half (surface) and payment half, 420 px columns -->
      <div class="grid md:min-h-[calc(100vh-36px)] md:grid-cols-2">
        <section class="flex flex-col gap-4 px-5 pt-[21px] md:bg-bg-surface md:px-16 md:pt-24 md:pb-16 xl:pl-[120px]">
          <div class="flex w-full flex-col gap-3 md:max-w-[420px] md:gap-4">
            <a [href]="s.cancelUrl" class="-my-2.5 flex h-11 items-center gap-1.5 self-start text-label-s text-text-secondary hover:text-text-primary"><gr-icon name="arrow-left" [size]="16" />GR Strength Cup</a>
            <p class="text-body-m text-text-secondary">{{ s.descripcion }}</p>
            <p class="text-display-m md:text-display-l">{{ eur(s.importe) }}</p>
            @if (s.lineas?.length) {
              <dl class="hidden md:block">
                @for (l of s.lineas; track l.concepto) { <div class="flex justify-between border-b border-line-subtle py-2.5"><dt class="text-body-s text-text-tertiary">{{ l.concepto }}</dt><dd class="text-label-s">{{ l.importe < 0 ? '−' + eur(-l.importe) : eur(l.importe) }}</dd></div> }
                <div class="flex justify-between border-b border-line-subtle py-2.5"><dt class="text-body-s text-text-tertiary">Total</dt><dd class="text-label-s">{{ eur(s.importe) }}</dd></div>
              </dl>
            }
          </div>
        </section>
        <section class="flex flex-col gap-4 px-5 pt-[21px] pb-10 md:px-16 md:pt-24 md:pb-16">
          <div class="flex w-full flex-col gap-4 md:max-w-[420px]">
          <h1 class="text-ui-h5">{{ t().pagarTarjeta }}</h1>
          <label class="flex flex-col gap-2"><span class="text-label-s">Email</span><input class="h-12 rounded-[10px] border border-line-strong bg-bg-field px-3.5 text-body-m focus:border-accent-text focus:outline-none" name="email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" [(ngModel)]="email" autocomplete="email" /></label>
          <label class="flex flex-col gap-2"><span class="text-label-s">{{ t().datosTarjeta }}</span>
            <span class="flex items-center gap-2.5 rounded-[10px] border border-line-strong bg-bg-field px-3.5 focus-within:border-accent-text"><gr-icon name="credit-card" [size]="16" class="text-text-tertiary" /><input class="h-12 w-0 min-w-0 flex-1 bg-transparent text-body-m outline-none placeholder:text-text-muted" name="tarjeta" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234" maxlength="23" [attr.aria-invalid]="mensaje() && !tresDS() ? true : null" [attr.aria-describedby]="mensaje() ? 'pago-msg' : null" [ngModel]="tarjeta" (ngModelChange)="tarjeta = agrupar($event)" /><span class="text-label-s text-text-tertiary">12/34 · 123</span></span></label>
          <label class="flex flex-col gap-2"><span class="text-label-s">{{ t().nombreTarjeta }}</span><input class="h-12 rounded-[10px] border border-line-strong bg-bg-field px-3.5 text-body-m focus:border-accent-text focus:outline-none" name="nombre" autocomplete="cc-name" [(ngModel)]="nombre" /></label>
          <div class="flex flex-col gap-1.5 rounded-[10px] bg-bg-raised p-3">
            <p class="text-label-xs text-text-tertiary uppercase">{{ t().tarjetasPrueba }}</p>
            @for (tj of s.tarjetas; track tj[0]) { <button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 text-left hover:text-accent-text" (click)="tarjeta = agrupar(tj[0])"><span class="text-mono-s">{{ agrupar(tj[0]) }}</span><span class="text-body-s text-text-tertiary">{{ tj[1] }}</span></button> }
          </div>
          @if (mensaje()) { <gr-alert id="pago-msg" class="scroll-mt-28" [tone]="tresDS() ? 'info' : 'danger'" [title]="tresDS() ? '3D Secure' : t().pagoNo">{{ mensaje() }}</gr-alert> }
          @if (tresDS()) {
            <div class="flex gap-2"><button grButton variant="primary" class="flex-1" [loading]="pagando()" (click)="pagar('ok')">{{ t().autenticar }}</button><button grButton class="flex-1" [disabled]="pagando()" (click)="pagar('fallo')">{{ t().fallar }}</button></div>
          } @else {
            <button grButton variant="primary" size="l" [loading]="pagando()" (click)="pagar('')">{{ t().pagar }}{{ eur(s.importe) }}</button>
          }
          </div>
        </section>
      </div>
    }
  `,
})
export class PagoSimuladoPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly eur = (c?: number) => eur(c, this.i18n.locale());
  protected readonly sesion = signal<SesionSim | null | undefined>(undefined);
  protected readonly mensaje = signal('');
  protected readonly tresDS = signal(false);
  protected readonly pagando = signal(false);
  protected email = '';
  protected tarjeta = '';
  protected nombre = '';
  private api = '';

  constructor() {
    inject(Seo).set({ title: this.t().seoPago, description: this.t().seoPagoD, path: '/pago/simulado', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const s = new URLSearchParams(location.search).get('s') ?? '';
    const [svc, id] = s.split(':');
    if (!/^[a-z]+$/.test(svc ?? '') || !/^sim_cs_[a-z0-9]+$/.test(id ?? '')) {
      this.sesion.set(null);
      return;
    }
    this.api = `/api/pagos/simulado/${svc}/${id}`;
    void firstValueFrom(this.http.get<SesionSim>(this.api)).then((x) => {
      this.sesion.set(x);
      this.email = x.email;
    }).catch(() => this.sesion.set(null));
  }

  protected async pagar(tresDS: '' | 'ok' | 'fallo'): Promise<void> {
    if (this.pagando()) return; // double click: one payment attempt
    this.pagando.set(true);
    this.mensaje.set('');
    try {
      const r = await firstValueFrom(this.http.post<{ estado: string; mensaje?: string; redirect?: string }>(`${this.api}/pagar`, { tarjeta: this.tarjeta.replace(/\s/g, ''), email: this.email, tresDS }, { context: sinTimeout() }));
      if (r.estado === 'pagado' && r.redirect) {
        location.href = r.redirect;
        return;
      }
      this.tresDS.set(r.estado === '3ds');
      this.mensaje.set(r.mensaje ?? this.t().noPago);
      this.verMensaje();
    } catch (e) {
      this.tresDS.set(false);
      this.mensaje.set(textoError(e, this.t().noPago));
      this.verMensaje();
    } finally {
      this.pagando.set(false);
    }
  }

  /** «4000000000000002» → «4000 0000 0000 0002» (UX2-R1-12). */
  protected agrupar(v: string): string {
    return (v ?? '').replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  /** El aviso puede quedar bajo el teclado: se lleva a la vista. */
  private verMensaje(): void {
    setTimeout(() => document.getElementById('pago-msg')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
}
