import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, PLATFORM_ID, PendingTasks, type Signal, afterNextRender, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { cat, hora, kg } from '../core/atletas';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';

interface Marcas {
  sq?: number;
  bp?: number;
  dl?: number;
}
interface Panel {
  competicion: { slug: string; nombre: string };
  atleta: {
    id: string; nombre: string; apellidos: string; nombreCompleto: string; sexo: 'F' | 'M'; categoria: string; divisionNombre: string; club: string; ciudad: string; menor: boolean; licencia: string;
    estado: 'confirmado' | 'reserva' | 'baja'; origen: string; jornada: string; lote?: number; horaInicio?: string; pesajeInicio?: string; pesajeFin?: string; completo: number;
    pesaje: { rackSq?: number; rackBp: string; segurosBp?: number; intentos: Marcas; estado: string; at?: string };
    perfil: { slug: string; fotoUrl: string; focalX: number; focalY: number; frase: string; bio: string; instagram: string; marcas: Marcas; visible: boolean; imagen?: { at: string; version: string } };
  };
  acreditacion: string;
  tienePassword?: boolean;
  checklist: { clave: string; texto: string; hecho: boolean; accion?: 'pesaje' | 'perfil' }[];
  pesajeAbierto: boolean;
  avisos: string[];
  referido?: { codigo: string; invitados: number; maxUsos: number; devuelto: number; pendiente: number; pagado: number; descuento: string; recompensa: string; tope: boolean };
  prueba?: PruebaArea;
}
interface PruebaArea {
  elegida: '' | 'aep2' | 'aep3';
  opciones: { codigo: string; nombre: string; fecha: string; plazas: number; ocupadas: number }[];
  limite?: string;
  cerrada: boolean;
  cambioOrg?: string;
}
type Vista = 'cargando' | 'acceso' | 'enviado' | 'panel' | 'perfil' | 'pesaje';

const api = '/api/area-atleta';
const T = {
  es: {
    area: "Área de atleta",
    enlaceNo: "El enlace no sirve",
    emailIns: "Email de tu inscripción",
    pass: "Contraseña",
    enviarme: "Enviarme el enlace",
    entrar: "Entrar",
    entrarPass: "Entrar con contraseña",
    sinPass: "Sin contraseña: enviarme un enlace por email",
    sinCuenta: "¿Aún no tienes cuenta?",
    crearCuenta: "Crear cuenta de atleta",
    noLlega: "¿No te llega?",
    spam: "Revisa spam",
    oEscribe: "o escribe a ",
    privacidad: ". Por privacidad, no confirmamos si un email está inscrito.",
    revisa: "Revisa tu email",
    reenviarEn: "Reenviar en 0:",
    reenviar: "Reenviar el enlace",
    abrirCorreo: "Abrir app de correo",
    otroEmail: "Usar otro email",
    catPorPublicar: "Categoría por publicar",
    fem: "Femenino",
    masc: "Masculino",
    perfilPublico: "Perfil público",
    salir: "Salir",
    accesos: "Accesos del área de atleta",
    importante: "Importante",
    falta: "Te falta elegir competición",
    faltaTxt: "Sin ella no tienes flight ni hora de salida.",
    elegirAhora: "Elegir ahora",
    tuComp: "Tu competición",
    insConf: "Inscripción confirmada",
    insAep: "Inscripción AEP confirmada",
    reserva: "En la reserva",
    cambiar: "Cambiar",
    qrAlt: "Código QR de tu acreditación",
    acred: "Tu acreditación",
    acredTxt: "Enséñala en el pesaje. Es el QR de tu inscripción.",
    prepara: "Prepara tu día",
    anadir: "Añadir",
    completar: "Completar",
    cambiarPass: "Cambiar contraseña",
    creaPass: "Crea tu contraseña",
    yaPuedes: "Ya puedes entrar con tu email y contraseña.",
    paraEntrar: "Para entrar con email y contraseña sin esperar al enlace.",
    nuevaPass: "Nueva contraseña (mín. 10 caracteres)",
    guardarPass: "Guardar contraseña",
    conFoto: "Con foto y mejores marcas, tu perfil sale destacado en /atletas y en la pantalla del pabellón.",
    completarPerfil: "Completar perfil",
    comparte: "Comparte tu cuenta atrás",
    creaStory: "Crea tu story para Instagram con tu foto y los datos de tu inscripción.",
    crearStory: "Crear mi story",
    invita: "Invita y ahorra",
    recuperado: "Has recuperado toda tu cuota",
    copiado: "Copiado",
    copiar: "Copiar enlace",
    invitados: "Invitados",
    devuelto: "Devuelto a tu tarjeta",
    tope: " (tope)",
    pendiente: "Pendiente",
    previa: "Previa del pesaje",
    volver: "Volver",
    tuPerfil: "Tu perfil",
    loVeran: "Lo verán en /atletas/",
    encuadre: "Encuadre: pulsa en tu cara",
    fotoPerfil: "Foto de perfil",
    fotoTxt: "JPG, PNG o WebP hasta 8 MB. Pulsa en la foto para centrar tu cara (se guarda la posición).",
    subiendo: "Subiendo…",
    subirFoto: "Subir foto",
    noPublica: "Tu foto no se publicará en tu ficha hasta que aceptes el consentimiento de imagen.",
    acepto: "Acepto que la organización publique mi foto en la web de la competición (",
    consImg: "consentimiento de imagen",
    retirarlo: "). Puedo retirarlo cuando quiera.",
    retirar: "Retirarlo",
    ciudad: "Ciudad",
    usuario: "@usuario",
    sobreTi: "Sobre ti (máx. 280)",
    bioPh: "Tercera temporada en powerlifting. Vengo de la halterofilia…",
    marcas: "Mejores marcas (kg)",
    marcasMal: "Las marcas van entre 0 y 600 kg.",
    mostrar: "Mostrar mi perfil público",
    mostrarTxt: "Tu ficha en /atletas con foto, bio, Instagram y marcas. Tu nombre, club, categoría, horario y resultados son públicos siempre en participantes y resultados.",
    guardarPerfil: "Guardar perfil",
    tuSesion: "Tu sesión: ",
    pesajeSp: " · pesaje ",
    horarioPP: "Horario por publicar",
    volverPanel: "Volver al panel",
    dejalo: "Déjalo hecho y el pesaje irá más rápido. La mesa lo verá precargado y solo tendrás que confirmarlo.",
    bajar: "Bajar ",
    subir: "Subir ",
    primeros: "Primeros intentos previstos (kg)",
    intentosMal: "Entre 0 y 600 kg, en múltiplos de 2,5.",
    guardarPesaje: "Guardar para el pesaje",
    sesionDe: "Sesión de las ",
    de: " de ",
    plazas: " plazas",
    sinLimite: "Sin límite de plazas",
    cerrada: "Cerrada",
    completa: "Completa",
    ultimas: "Últimas plazas",
    disponible: "Disponible",
    guardarComp: "Guardar competición",
    editar: "Editar mi perfil",
    verHorarios: "Ver mis horarios",
    postBuilder: "Post builder",
    verResultados: "Ver mis resultados",
    escribeEmailPass: "Escribe tu email y tu contraseña.",
    demasiados: "Demasiados intentos. Espera unos minutos.",
    noEntrar: "No hemos podido entrar. Inténtalo de nuevo.",
    passCorta: "La contraseña debe tener al menos 10 caracteres.",
    passGuardada: "Contraseña guardada",
    caducada: "Tu sesión ha caducado.",
    rackSq: "Altura rack sentadilla",
    rackBp: "Altura rack banca",
    seguros: "Seguros de banca",
    trasElegir: "Tras elegir competición",
    competicion: "Competición",
    categoria: "Categoría",
    porPublicar: "Por publicar",
    division: "División",
    orden: "Orden de salida",
    lote: "Lote ",
    pesaje: "Pesaje",
    inicio: "Inicio",
    licencia: "Licencia",
    sinElegir: "Sin elegir",
    eleccionCerrada: "Elección cerrada",
    cambiadaOrg: "Cambiada por la organización",
    noGuardar: "No se pudo guardar",
    eligeComp: "Elige tu competición",
    bloqueada: "Bloqueada",
    error: "Error",
    elegida: "Elegida",
    compGuardada: "Competición guardada: ",
    noGuardarComp: "No se pudo guardar tu competición.",
    reintenta: " Reintenta en unos segundos.",
    orgCambio: "La organización ha cambiado tu competición a ",
    seoT: "Área de atleta · GR Strength Cup",
    seoD: "Acceso para atletas inscritos: tu flight, tu acreditación, tu perfil y la previa del pesaje.",
    caducado: "Ha caducado o ya se usó. Pide uno nuevo con tu email.",
    escribeEmail: "Escribe el email de tu inscripción.",
    faltaArroba: "Revisa el email: falta la @.",
    noValido: "Revisa el email: no parece válido.",
    faltaDominio: "Revisa el email: falta el dominio (p. ej. @gmail.com).",
    noEnviar: "No hemos podido enviarlo. Inténtalo de nuevo en unos minutos.",
    fotoSubida: "Foto subida",
    noSubir: "No se pudo subir la foto.",
    perfilGuardado: "Perfil guardado",
    guardadoPesaje: "Guardado para el pesaje",
    noGuardarGen: "No se pudo guardar. Inténtalo de nuevo.",
    siInscrito: (e: string) => `Si ${e} está inscrito, te llegará un enlace de acceso. Caduca en 30 minutos.`,
    invitaTxt: (d: string, r: string) => d + ' para tus invitados · ' + r + ' para ti por cada uno',
    consAceptado: (v: string) => `Consentimiento de imagen aceptado (${v}).`,
    cambiadoA: (n: string, d: string) => `La organización te ha cambiado a ${n} el ${d}. Tu flight sale al publicar los horarios.`,
    cerro: (d: string, c: string) => 'La elección cerró' + (d ? ' el ' + d + ' a las 12:00' : '') + '. Para cambiarla escribe a ' + (c || 'la organización') + '.',
    puedes: (d: string) => 'Puedes cambiarla hasta el ' + d + ' a las 12:00.',
    elegidaN: (n: string) => n + ' elegida',
    seMantiene: (n: string) => ' Se mantiene ' + n + '.',
    inscribete: (c: string) => `Inscríbete con mi código ${c}`,
  },
  en: {
    area: "Athlete area",
    enlaceNo: "This link is not valid",
    emailIns: "Your registration email",
    pass: "Password",
    enviarme: "Send me the link",
    entrar: "Sign in",
    entrarPass: "Sign in with password",
    sinPass: "No password: email me a link",
    sinCuenta: "Don't have an account yet?",
    crearCuenta: "Create athlete account",
    noLlega: "Not arriving?",
    spam: "Check your spam",
    oEscribe: "or write to ",
    privacidad: ". For privacy reasons, we do not confirm whether an email is registered.",
    revisa: "Check your email",
    reenviarEn: "Resend in 0:",
    reenviar: "Resend the link",
    abrirCorreo: "Open email app",
    otroEmail: "Use another email",
    catPorPublicar: "Weight class to be announced",
    fem: "Female",
    masc: "Male",
    perfilPublico: "Public profile",
    salir: "Sign out",
    accesos: "Athlete area shortcuts",
    importante: "Important",
    falta: "You still need to choose a competition",
    faltaTxt: "Without it you have no flight or start time.",
    elegirAhora: "Choose now",
    tuComp: "Your competition",
    insConf: "Entry confirmed",
    insAep: "AEP entry confirmed",
    reserva: "On the waiting list",
    cambiar: "Change",
    qrAlt: "QR code of your accreditation",
    acred: "Your accreditation",
    acredTxt: "Show it at the weigh-in. It is the QR code of your entry.",
    prepara: "Get ready for your day",
    anadir: "Add",
    completar: "Complete",
    cambiarPass: "Change password",
    creaPass: "Create your password",
    yaPuedes: "You can now sign in with your email and password.",
    paraEntrar: "To sign in with email and password without waiting for the link.",
    nuevaPass: "New password (min. 10 characters)",
    guardarPass: "Save password",
    conFoto: "With a photo and best lifts, your profile is featured on /atletas and on the venue screen.",
    completarPerfil: "Complete profile",
    comparte: "Share your countdown",
    creaStory: "Create your Instagram story with your photo and your entry details.",
    crearStory: "Create my story",
    invita: "Invite and save",
    recuperado: "You have recovered your whole fee",
    copiado: "Copied",
    copiar: "Copy link",
    invitados: "Invited",
    devuelto: "Refunded to your card",
    tope: " (cap)",
    pendiente: "Pending",
    previa: "Weigh-in preview",
    volver: "Back",
    tuPerfil: "Your profile",
    loVeran: "They will see it at /atletas/",
    encuadre: "Framing: tap on your face",
    fotoPerfil: "Profile photo",
    fotoTxt: "JPG, PNG or WebP up to 8 MB. Tap on the photo to centre your face (the position is saved).",
    subiendo: "Uploading…",
    subirFoto: "Upload photo",
    noPublica: "Your photo will not be published on your page until you accept the image consent.",
    acepto: "I agree that the organisers may publish my photo on the competition website (",
    consImg: "image consent",
    retirarlo: "). I can withdraw it at any time.",
    retirar: "Withdraw it",
    ciudad: "City",
    usuario: "@username",
    sobreTi: "About you (max. 280)",
    bioPh: "Third season in powerlifting. I come from weightlifting…",
    marcas: "Best lifts (kg)",
    marcasMal: "Lifts must be between 0 and 600 kg.",
    mostrar: "Show my public profile",
    mostrarTxt: "Your page on /atletas with photo, bio, Instagram and lifts. Your name, club, weight class, schedule and results are always public in participants and results.",
    guardarPerfil: "Save profile",
    tuSesion: "Your session: ",
    pesajeSp: " · weigh-in ",
    horarioPP: "Schedule to be announced",
    volverPanel: "Back to dashboard",
    dejalo: "Get it done and the weigh-in will be quicker. The desk will see it preloaded and you will only have to confirm it.",
    bajar: "Decrease ",
    subir: "Increase ",
    primeros: "Planned openers (kg)",
    intentosMal: "Between 0 and 600 kg, in multiples of 2.5.",
    guardarPesaje: "Save for the weigh-in",
    sesionDe: "Session at ",
    de: " of ",
    plazas: " places",
    sinLimite: "No place limit",
    cerrada: "Closed",
    completa: "Full",
    ultimas: "Last places",
    disponible: "Available",
    guardarComp: "Save competition",
    editar: "Edit my profile",
    verHorarios: "View my schedule",
    postBuilder: "Post builder",
    verResultados: "View my results",
    escribeEmailPass: "Enter your email and password.",
    demasiados: "Too many attempts. Please wait a few minutes.",
    noEntrar: "We couldn't sign you in. Please try again.",
    passCorta: "The password must be at least 10 characters long.",
    passGuardada: "Password saved",
    caducada: "Your session has expired.",
    rackSq: "Squat rack height",
    rackBp: "Bench rack height",
    seguros: "Bench safeties",
    trasElegir: "After choosing a competition",
    competicion: "Competition",
    categoria: "Weight class",
    porPublicar: "To be announced",
    division: "Division",
    orden: "Start order",
    lote: "Group ",
    pesaje: "Weigh-in",
    inicio: "Start",
    licencia: "Licence",
    sinElegir: "Not chosen",
    eleccionCerrada: "Choice closed",
    cambiadaOrg: "Changed by the organisers",
    noGuardar: "Couldn't save",
    eligeComp: "Choose your competition",
    bloqueada: "Locked",
    error: "Error",
    elegida: "Chosen",
    compGuardada: "Competition saved: ",
    noGuardarComp: "Your competition couldn't be saved.",
    reintenta: " Try again in a few seconds.",
    orgCambio: "The organisers have changed your competition to ",
    seoT: "Athlete area · GR Strength Cup",
    seoD: "Access for registered athletes: your flight, your accreditation, your profile and the weigh-in preview.",
    caducado: "It has expired or was already used. Request a new one with your email.",
    escribeEmail: "Enter the email you registered with.",
    faltaArroba: "Check the email: the @ is missing.",
    noValido: "Check the email: it doesn't look valid.",
    faltaDominio: "Check the email: the domain is missing (e.g. @gmail.com).",
    noEnviar: "We couldn't send it. Please try again in a few minutes.",
    fotoSubida: "Photo uploaded",
    noSubir: "Couldn't upload the photo.",
    perfilGuardado: "Profile saved",
    guardadoPesaje: "Saved for the weigh-in",
    noGuardarGen: "Couldn't save. Please try again.",
    siInscrito: (e: string) => `If ${e} is registered, you will receive an access link. It expires in 30 minutes.`,
    invitaTxt: (d: string, r: string) => d + ' for your guests · ' + r + ' for you for each one',
    consAceptado: (v: string) => `Image consent accepted (${v}).`,
    cambiadoA: (n: string, d: string) => `The organisers have moved you to ${n} on ${d}. Your flight comes out when the schedule is published.`,
    cerro: (d: string, c: string) => 'The choice closed' + (d ? ' on ' + d + ' at 12:00' : '') + '. To change it, write to ' + (c || 'the organisers') + '.',
    puedes: (d: string) => 'You can change it until ' + d + ' at 12:00.',
    elegidaN: (n: string) => n + ' chosen',
    seMantiene: (n: string) => ' ' + n + ' is kept.',
    inscribete: (c: string) => `Sign up with my code ${c}`,
  },
};

/** /area-atleta (Figma page 42): password-less access, panel, profile editor and weigh-in preview. Not indexed. */
@Component({
  selector: 'gr-area-atleta',
  imports: [RouterLink, LocPipe, FormsModule, NgTemplateOutlet, Navbar, Footer, GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = panel();
    <gr-navbar />
    <main class="relative">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style="background: radial-gradient(60% 70% at 15% 0%, rgb(110 20 32 / 0.35), transparent 70%)"></div>
      <div class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px]">
        @switch (vista()) {
          @case ('cargando') { <div class="mx-auto max-w-md"><gr-skeleton class="h-64 rounded-lg" /></div> }

          @case ('acceso') {
            <div class="mx-auto max-w-md rounded-2xl border border-white/8 bg-white/3 p-6 md:p-8">
              <span class="mx-auto flex size-14 items-center justify-center rounded-lg bg-accent/16 text-accent-text"><gr-icon name="lock" [size]="26" /></span>
              <h1 class="mt-4 text-center text-display-xs md:text-display-s">{{ t().area }}</h1>
              @if (errorEnlace()) { <gr-alert class="mt-6" tone="warning" [title]="t().enlaceNo">{{ errorEnlace() }}</gr-alert> }
              <form class="mt-6 flex flex-col gap-4" (ngSubmit)="modoEnlace() ? pedir() : entrar()" novalidate>
                <gr-field [label]="t().emailIns" for="a-email"><input grInput id="a-email" name="email" type="email" autocomplete="username" inputmode="email" spellcheck="false" autocapitalize="none" [(ngModel)]="email" required [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="error() ? 'a-email-err' : null" /></gr-field>
                @if (!modoEnlace()) {
                  <gr-field [label]="t().pass" for="a-pass"><input grInput id="a-pass" name="password" type="password" autocomplete="current-password" enterkeyhint="go" [(ngModel)]="password" required /></gr-field>
                }
                <p id="a-email-err" class="-mt-2 min-h-5 text-body-s text-accent-text" role="alert">{{ error() }}</p>
                <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="busy()">{{ modoEnlace() ? t().enviarme : t().entrar }}</button>
                <button type="button" class="h-11 text-label-m text-accent-text hover:underline" (click)="modoEnlace.set(!modoEnlace()); error.set('')">{{ modoEnlace() ? t().entrarPass : t().sinPass }}</button>
              </form>
              <div class="mt-6 flex items-center gap-3 text-label-xs text-text-tertiary uppercase" aria-hidden="true"><span class="h-px flex-1 bg-line-subtle"></span>{{ t().sinCuenta }}<span class="h-px flex-1 bg-line-subtle"></span></div>
              <a grButton variant="glass" size="l" [routerLink]="'/alta-atleta' | loc" [block]="true" class="mt-4">{{ t().crearCuenta }}</a>
              <aside class="mt-4 rounded-lg border border-line-subtle bg-bg-card p-5">
                <p class="text-label-m">{{ t().noLlega }}</p>
                <p class="mt-1 text-body-s text-text-tertiary">{{ t().spam }}@if (contacto()) { {{ t().oEscribe }}<a [href]="'mailto:' + contacto()" class="text-accent-text underline">{{ contacto() }}</a>}{{ t().privacidad }}</p>
              </aside>
            </div>
          }

          @case ('enviado') {
            <div class="mx-auto flex max-w-md flex-col items-center text-center">
              <span class="flex size-20 items-center justify-center rounded-full bg-accent-deep/50 text-accent-text"><gr-icon name="mail" [size]="32" /></span>
              <h1 class="mt-6 text-display-m">{{ t().revisa }}</h1>
              <p class="mt-3 text-body-l text-text-secondary">{{ t().siInscrito(email) }}</p>
              <button grButton class="mt-6" [disabled]="espera() > 0" [loading]="busy()" (click)="pedir()">{{ espera() > 0 ? t().reenviarEn + espera().toString().padStart(2, '0') : t().reenviar }}</button>
              <button grButton type="button" variant="secondary" class="mt-3" (click)="abrirCorreo()">{{ t().abrirCorreo }}</button>
              <button type="button" class="mt-3 h-11 text-label-m text-accent-text" (click)="vista.set('acceso')">{{ t().otroEmail }}</button>
            </div>
          }

          @case ('panel') {
            @if (p) {
              <!-- Jaime 15-nov: athlete hero (photo, name, weight class and sex) + four square shortcuts (icon and title only) -->
              <header class="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(160deg,rgb(110_20_32/0.35),rgb(20_17_18/0.6)_55%)] px-5 pt-8 pb-6 text-center md:flex-row md:gap-8 md:p-8 md:text-left">
                <span class="size-28 shrink-0 overflow-hidden rounded-full border-2 border-accent/60 bg-bg-raised shadow-[0_0_40px_rgb(196_43_62/0.35)] md:size-36">
                  @if (p.atleta.perfil.fotoUrl) { <img [src]="p.atleta.perfil.fotoUrl" alt="" class="size-full object-cover" [style.object-position]="p.atleta.perfil.focalX + '% ' + p.atleta.perfil.focalY + '%'" /> }
                  @else { <span class="flex size-full items-center justify-center font-display text-[40px]">{{ ((p.atleta.nombre[0] ?? '') + (p.atleta.apellidos[0] ?? '')).toUpperCase() }}</span> }
                </span>
                <div class="flex min-w-0 flex-1 flex-col items-center gap-3 md:items-start">
                  <p class="text-label-xs tracking-[0.08em] text-text-tertiary uppercase">{{ t().area }} · {{ p.competicion.nombre }}</p>
                  <h1 class="break-words font-display text-[32px] leading-[1.1] tracking-[0.04em] uppercase outline-none md:text-[48px]" tabindex="-1">{{ p.atleta.nombreCompleto || p.atleta.nombre + ' ' + p.atleta.apellidos }}</h1>
                  <p class="flex flex-wrap justify-center gap-2 md:justify-start">
                    <span class="inline-flex h-8 items-center gap-1.5 rounded-pill border border-white/12 bg-white/6 px-3 text-label-s"><gr-icon name="scale" [size]="14" />{{ p.atleta.categoria ? cat(p.atleta.categoria) + ' kg' : t().catPorPublicar }}</span>
                    <span class="inline-flex h-8 items-center gap-1.5 rounded-pill border border-white/12 bg-white/6 px-3 text-label-s"><gr-icon name="user" [size]="14" />{{ p.atleta.sexo === 'F' ? t().fem : t().masc }}</span>
                  </p>
                </div>
                <div class="flex shrink-0 gap-2 md:flex-col md:self-start">
                  <a [routerLink]="('/atletas' | loc) + '/' + p.atleta.perfil.slug" class="inline-flex h-11 items-center gap-2 rounded-sm border border-white/12 bg-white/5 px-4 text-label-m hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent">{{ t().perfilPublico }}<gr-icon name="arrow-right" [size]="16" /></a>
                  <button type="button" class="inline-flex h-11 items-center gap-2 rounded-sm px-4 text-label-m text-text-tertiary hover:bg-white/5 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent" (click)="salir()"><gr-icon name="log-out" [size]="18" />{{ t().salir }}</button>
                </div>
              </header>
              <nav class="mt-4 grid grid-cols-2 gap-3 md:mt-6 md:grid-cols-4 md:gap-4" [attr.aria-label]="t().accesos">
                @for (x of accesos(); track x.id) {
                  @if (x.ruta) {
                    <a [routerLink]="x.ruta | loc" [class]="tile"><span [class]="tileIcono"><gr-icon [name]="x.icono" [size]="26" /></span><span class="text-[15px] leading-tight font-semibold md:text-[17px]">{{ x.texto }}</span></a>
                  } @else {
                    <button type="button" [class]="tile" (click)="acceso(x.id)"><span [class]="tileIcono"><gr-icon [name]="x.icono" [size]="26" /></span><span class="text-[15px] leading-tight font-semibold md:text-[17px]">{{ x.texto }}</span></button>
                  }
                }
              </nav>
              @for (a of p.avisos; track a) { <gr-alert class="mt-6" tone="info" [title]="t().importante">{{ a }}</gr-alert> }
              @if (p.prueba && !p.prueba.elegida && !p.prueba.cerrada) {
                <div class="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning/10 p-4" role="status">
                  <gr-icon name="clock" [size]="20" class="shrink-0 text-warning" />
                  <p class="min-w-0 flex-1 text-body-s text-text-primary"><span class="block text-label-m">{{ t().falta }}</span>{{ t().faltaTxt }}</p>
                  <button grButton type="button" variant="primary" class="max-sm:w-full" (click)="irEleccion()">{{ t().elegirAhora }}</button>
                </div>
              }
              <div class="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:mt-7 md:grid-cols-2 lg:grid-cols-[432fr_360fr_360fr]">
                <div class="flex flex-col gap-6">
                  @if (p.prueba; as pr) { @if (!pr.elegida && !pr.cerrada) { <ng-container *ngTemplateOutlet="eleccionTpl; context: { $implicit: pr }" /> } }
                  <section id="mis-horarios" class="flex scroll-mt-28 flex-col gap-3 rounded-lg border border-accent/40 bg-bg-card p-6">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
                      <h2 class="mr-auto text-ui-h5 md:mr-0">{{ t().tuComp }}</h2>
                      <p class="inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-wide" [class]="p.atleta.estado === 'confirmado' ? 'border-success/40 bg-success/12 text-success' : 'border-info/40 bg-info/10 text-info'">
                        <gr-icon [name]="p.atleta.estado === 'confirmado' ? 'check' : 'clock'" [size]="12" />{{ p.atleta.estado === 'confirmado' ? (p.atleta.origen === 'propia' ? t().insConf : t().insAep) : t().reserva }}</p>
                    </div>
                    <dl class="grid grid-cols-2 gap-2">
                      @for (d of datos(); track d.k; let i = $index) { <div class="flex min-w-0 flex-col gap-1 rounded-md bg-white/4 p-3" [class.col-span-2]="i === 0"><dt class="text-label-xs uppercase tracking-wide text-text-tertiary">{{ d.k }}</dt><dd class="break-words text-[16px] font-semibold" [class.text-warning]="i === 0 && p.prueba && !p.prueba.elegida">{{ d.v }}</dd>@if (i === 0 && p.prueba && !p.prueba.cerrada && p.prueba.elegida) { <button type="button" class="-my-3 -ml-2 inline-flex h-11 min-w-11 items-center self-start px-2 text-[14px] font-semibold text-accent-text hover:underline" aria-controls="pr-sec" [attr.aria-expanded]="verEleccion()" (click)="toggleEleccion()">{{ t().cambiar }}</button> }</div> }
                    </dl>
                    @if (qr()) {
                      <div class="flex items-center gap-3 border-t border-line-subtle pt-3">
                        <img [src]="qr()" [alt]="t().qrAlt" class="size-[88px] shrink-0 bg-white p-1" />
                        <div class="flex flex-col gap-1"><p class="text-label-l">{{ t().acred }}</p><p class="text-body-xs text-text-tertiary">{{ t().acredTxt }}</p></div>
                      </div>
                    }
                  </section>
                  @if (p.prueba; as pr) { @if ((pr.elegida || pr.cerrada) && (!pr.elegida || pr.cambioOrg || verEleccion() || errorPrueba())) { <ng-container *ngTemplateOutlet="eleccionTpl; context: { $implicit: pr }" /> } }
                </div>
                <div class="flex flex-col gap-4">
                  <section class="rounded-lg border border-line-subtle bg-bg-card px-5 py-4">
                    <h2 class="text-ui-h5">{{ t().prepara }}</h2>
                    <ul>
                      @for (c of p.checklist; track c.clave) {
                        <li class="flex min-h-[49px] items-center gap-3 border-b border-line-subtle py-3">
                          <span class="flex size-6 shrink-0 items-center justify-center rounded-full" [class]="c.hecho ? 'bg-success/16 text-success' : 'border border-line-strong bg-white/5'">@if (c.hecho) { <gr-icon name="check" [size]="14" /> }</span>
                          <span class="flex-1 text-body-s" [class]="c.hecho ? 'text-text-tertiary' : 'text-text-primary'">{{ c.texto }}</span>
                          @if (c.accion && !c.hecho) { <button type="button" class="-my-3 h-11 text-[14px] font-semibold text-accent-text hover:underline" (click)="abrir(c.accion)">{{ c.accion === 'pesaje' ? t().anadir : t().completar }}</button> }
                        </li>
                      }
                    </ul>
                  </section>
                  <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                    <div class="flex items-center gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="key" [size]="18" /></span><h2 class="text-[18px] leading-tight font-semibold">{{ p.tienePassword ? t().cambiarPass : t().creaPass }}</h2></div>
                    <p class="text-body-s text-text-tertiary">{{ p.tienePassword ? t().yaPuedes : t().paraEntrar }}</p>
                    <form class="flex flex-col gap-3" (ngSubmit)="guardarPassword()" novalidate>
                      <gr-field [label]="t().nuevaPass" for="a-newpass"><input grInput id="a-newpass" name="nueva" type="password" autocomplete="new-password" minlength="10" [(ngModel)]="nuevaPassword" /></gr-field>
                      @if (errorPassword()) { <p class="text-body-s text-accent-text" role="alert">{{ errorPassword() }}</p> }
                      <button grButton type="submit" [block]="true" [loading]="busy()">{{ t().guardarPass }}</button>
                    </form>
                  </section>
                  <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                    <div class="flex items-center justify-between"><h2 class="text-ui-h5">{{ t().perfilPublico }}</h2><span class="text-[14px] font-semibold text-accent-text">{{ p.atleta.completo }} %</span></div>
                    <div class="h-1.5 rounded-pill bg-line-strong"><div class="h-full rounded-pill bg-[linear-gradient(90deg,#c42b3e,#8b1a2b)]" [style.width.%]="p.atleta.completo"></div></div>
                    <p class="text-body-s text-text-tertiary">{{ t().conFoto }}</p>
                    <button grButton variant="primary" [block]="true" (click)="abrir('perfil')">{{ t().completarPerfil }}</button>
                  </section>
                  @if (p.atleta.estado === 'confirmado') {
                    <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                      <div class="flex items-center gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="instagram" [size]="18" /></span><h2 class="text-[18px] font-semibold leading-tight">{{ t().comparte }}</h2></div>
                      <p class="text-[15px] leading-normal text-text-tertiary">{{ t().creaStory }}</p>
                      <a grButton [block]="true" [routerLink]="'/area-atleta/compartir' | loc">{{ t().crearStory }}</a>
                    </section>
                  }
                  @if (p.referido; as r) {
                    <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                      <div class="flex items-center gap-3"><span class="flex size-10 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="trophy" [size]="18" /></span>
                        <span><span class="block text-label-m">{{ t().invita }}</span><span class="block text-body-xs text-text-tertiary">{{ r.tope ? t().recuperado : t().invitaTxt(r.descuento, r.recompensa) }}</span></span></div>
                      <div class="mt-3 flex items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3"><span class="flex-1 py-3 text-mono-s">{{ r.codigo }}</span><button type="button" class="h-11 text-label-s text-accent-text" (click)="compartir(r.codigo)">{{ copiado() ? t().copiado : t().copiar }}</button></div>
                      <dl class="mt-3 text-body-s">
                        <div class="flex justify-between border-b border-line-subtle py-2"><dt class="text-text-tertiary">{{ t().invitados }}</dt><dd>{{ r.invitados }}{{ r.maxUsos ? ' / ' + r.maxUsos : '' }}</dd></div>
                        <div class="flex justify-between py-2" [class.border-b]="r.pendiente" [class.border-line-subtle]="r.pendiente"><dt class="text-text-tertiary">{{ t().devuelto }}</dt><dd>{{ euros(r.devuelto) }}{{ r.tope ? t().tope : '' }}</dd></div>
                        @if (r.pendiente) { <div class="flex justify-between py-2"><dt class="text-text-tertiary">{{ t().pendiente }}</dt><dd>{{ euros(r.pendiente) }}</dd></div> }
                      </dl>
                    </section>
                  }
                </div>
                @if (p.pesajeAbierto && p.atleta.estado === 'confirmado') {
                  <section class="hidden flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6 lg:flex">
                    <h2 class="text-ui-h5">{{ t().previa }}</h2>
                    <ng-container *ngTemplateOutlet="previa" />
                  </section>
                }
              </div>
            }
          }

          @case ('perfil') {
            @if (p) {
              <div class="mx-auto max-w-xl">
                <button type="button" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary" (click)="ir('panel')"><gr-icon name="chevron-left" [size]="16" />{{ t().volver }}</button>
                <h1 class="text-display-m outline-none" tabindex="-1">{{ t().tuPerfil }}</h1>
                <p class="mt-1 text-body-s text-text-tertiary">{{ t().loVeran }}{{ p.atleta.perfil.slug }}</p>
                <div class="mt-6 flex gap-4">
                  <button type="button" class="relative size-24 shrink-0 overflow-hidden rounded-full bg-bg-raised" (click)="focal($event)" [disabled]="!p.atleta.perfil.fotoUrl" [attr.aria-label]="t().encuadre">
                    @if (p.atleta.perfil.fotoUrl) { <img [src]="p.atleta.perfil.fotoUrl" alt="" class="size-full object-cover" [style.object-position]="fx + '% ' + fy + '%'" /> }
                    @else { <span class="flex size-full items-center justify-center text-label-l text-text-tertiary">{{ ((p.atleta.nombre[0] ?? '') + (p.atleta.apellidos[0] ?? '')).toUpperCase() }}</span> }
                  </button>
                  <div class="min-w-0">
                    <p class="text-label-m">{{ t().fotoPerfil }}</p>
                    <p class="text-body-xs text-text-tertiary">{{ t().fotoTxt }}</p>
                    <label class="mt-2 inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 text-label-s focus-within:outline-2 focus-within:outline-accent">{{ subiendo() ? t().subiendo : p.atleta.perfil.fotoUrl ? t().cambiar : t().subirFoto }}<gr-icon name="arrow-right" [size]="14" />
                      <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="foto($event)" [disabled]="subiendo()" /></label>
                  </div>
                </div>
                @if (!p.atleta.perfil.imagen) {
                  @if (p.atleta.perfil.fotoUrl) { <p class="mt-4 text-body-s text-warning" role="note">{{ t().noPublica }}</p> }
                  <label class="mt-4 flex min-h-11 items-start gap-3 rounded-md border border-line-subtle bg-bg-card p-3 text-body-s text-text-secondary">
                    <input type="checkbox" name="imagen" [(ngModel)]="aceptaImagen" class="mt-0.5 size-6 shrink-0 accent-[#C42B3E]" />
                    <span>{{ t().acepto }}<a [href]="'/consentimiento-datos' | loc" target="_blank" class="text-accent-text underline">{{ t().consImg }}</a>{{ t().retirarlo }}</span>
                  </label>
                } @else {
                  <p class="mt-4 text-body-xs text-text-tertiary">{{ t().consAceptado(p.atleta.perfil.imagen.version) }} <button type="button" class="text-accent-text underline" (click)="retirar = true; guardarPerfil()">{{ t().retirar }}</button></p>
                }
                <form class="mt-6 flex flex-col gap-5" (ngSubmit)="guardarPerfil()" novalidate>
                  <gr-field label="Club" for="f-club"><input grInput id="f-club" name="club" [(ngModel)]="f.club" maxlength="120" /></gr-field>
                  <gr-field [label]="t().ciudad" for="f-city"><input grInput id="f-city" name="ciudad" autocomplete="address-level2" [(ngModel)]="f.ciudad" maxlength="80" /></gr-field>
                  @if (!p.atleta.menor) { <gr-field label="Instagram" for="f-ig" [optional]="true"><input grInput id="f-ig" name="ig" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" [(ngModel)]="f.instagram" [placeholder]="t().usuario" maxlength="60" /></gr-field> }
                  <gr-field [label]="t().sobreTi" for="f-bio"><textarea grInput id="f-bio" name="bio" rows="4" [(ngModel)]="f.bio" maxlength="280" [placeholder]="t().bioPh"></textarea></gr-field>
                  <fieldset><legend class="text-label-s">{{ t().marcas }}</legend>
                    <div class="mt-2 grid grid-cols-3 gap-3">
                      @for (m of lifts; track m.k) { <label class="flex flex-col gap-1"><span class="text-mono-xs text-text-tertiary">{{ m.s }}</span><input grInput type="number" inputmode="decimal" step="2.5" min="0" max="600" [name]="'m' + m.k" [(ngModel)]="f.marcas[m.k]" [attr.aria-invalid]="fuera(f.marcas[m.k]) || null" [attr.aria-describedby]="fuera(f.marcas[m.k]) ? 'm-err' : null" [class.border-accent]="fuera(f.marcas[m.k])" /></label> }
                    </div>
                    @if (marcasMal()) { <p id="m-err" class="mt-2 text-body-s text-accent-text" role="alert">{{ t().marcasMal }}</p> }
                  </fieldset>
                  <div class="flex items-center justify-between gap-4 rounded-md border border-line-subtle bg-bg-card p-4">
                    <span><span class="block text-label-m">{{ t().mostrar }}</span><span class="block text-body-xs text-text-tertiary">{{ t().mostrarTxt }}</span></span>
                    <button type="button" role="switch" [attr.aria-checked]="f.visible" (click)="f.visible = !f.visible" class="flex h-11 w-12 shrink-0 items-center justify-center" [attr.aria-label]="t().mostrar">
                      <span class="relative h-6 w-10 rounded-pill" [class]="f.visible ? 'bg-accent' : 'bg-line-strong'"><span class="absolute top-0.5 size-5 rounded-full bg-white transition-[left]" [style.left.px]="f.visible ? 18 : 2"></span></span>
                    </button>
                  </div>
                  @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                  <div class="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-5 max-md:border-t max-md:border-line-subtle max-md:bg-bg-base/95 max-md:px-5 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:backdrop-blur-[10px]"><button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="busy()" [disabled]="marcasMal()">{{ t().guardarPerfil }}</button></div>
                </form>
              </div>
            }
          }

          @case ('pesaje') {
            @if (p) {
              <div class="mx-auto max-w-xl">
                <h1 class="text-display-xs outline-none md:text-display-m" tabindex="-1">{{ t().previa }}</h1>
                <p class="mt-1 text-body-m text-text-tertiary">{{ p.atleta.jornada ? t().tuSesion + hora(p.atleta.horaInicio) + (p.atleta.pesajeInicio ? t().pesajeSp + hora(p.atleta.pesajeInicio) + '–' + hora(p.atleta.pesajeFin) : '') : t().horarioPP }}</p>
                <section class="mt-5 flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6"><ng-container *ngTemplateOutlet="previa" /></section>
                <button type="button" class="mt-3 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary" (click)="ir('panel')"><gr-icon name="chevron-left" [size]="16" />{{ t().volverPanel }}</button>
              </div>
            }
          }
        }
        <ng-template #previa>
          <p class="text-body-s text-text-tertiary">{{ t().dejalo }}</p>
          @for (s of steppers(); track s.k) {
            <div class="flex min-h-[61px] items-center justify-between gap-3 border-b border-line-subtle py-2">
              <span class="text-body-m text-text-secondary">{{ s.label }}</span>
              <span class="flex items-center gap-2">
                <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent" [attr.aria-label]="t().bajar + s.label" (click)="paso(s.k, -1)"><gr-icon name="minus" [size]="18" /></button>
                <span class="w-7 text-center text-ui-h4" aria-live="polite">{{ pz[s.k] ?? '–' }}</span>
                <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent" [attr.aria-label]="t().subir + s.label" (click)="paso(s.k, 1)"><gr-icon name="plus" [size]="18" /></button>
              </span>
            </div>
          }
          <p class="text-label-m text-text-secondary">{{ t().primeros }}</p>
          <div class="grid grid-cols-3 gap-2">
            @for (m of lifts; track m.k) { <label class="flex flex-col gap-1"><span class="text-mono-xs text-text-tertiary">{{ m.s }}</span><input grInput class="font-mono" type="number" inputmode="decimal" step="2.5" min="0" max="600" [name]="'i' + m.k" [(ngModel)]="pz.intentos[m.k]" [attr.aria-invalid]="fueraIntento(pz.intentos[m.k]) || null" [attr.aria-describedby]="fueraIntento(pz.intentos[m.k]) ? 'i-err' : null" [class.border-accent]="fueraIntento(pz.intentos[m.k])" /></label> }
          </div>
          @if (intentosMal()) { <p id="i-err" class="text-body-s text-accent-text" role="alert">{{ t().intentosMal }}</p> }
          @if (error() && vista() !== 'perfil') { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
          <button grButton variant="primary" size="l" [block]="true" [loading]="busy()" [disabled]="intentosMal()" (click)="guardarPesaje()">{{ t().guardarPesaje }}</button>
        </ng-template>
        <ng-template #eleccionTpl let-pr>
          <section id="pr-sec" class="flex scroll-mt-24 flex-col gap-3 rounded-lg border bg-bg-card p-6 motion-safe:animate-[gr-abrir_250ms_cubic-bezier(.2,.8,.2,1)]" [class]="!pr.elegida && !pr.cerrada ? 'border-warning/50' : 'border-line-subtle'" aria-labelledby="pr-tit">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 id="pr-tit" class="text-ui-h5 outline-none" tabindex="-1">{{ tituloPrueba(pr) }}</h2>
              <span class="inline-flex h-6 items-center gap-1.5 rounded-pill border px-2.5 text-[12px] font-medium uppercase tracking-wide" [class]="pr.elegida && !errorPrueba() ? 'border-success/40 bg-success/12 text-success' : 'border-warning/40 bg-warning/12 text-warning'">@if (pr.elegida && !pr.cerrada && !pr.cambioOrg) { <gr-icon name="check" [size]="12" /> }{{ badgePrueba(pr) }}</span>
            </div>
            @if (pr.cambioOrg) {
              <p class="flex items-start gap-3 rounded-md border border-info/50 bg-info/10 p-4 text-body-s text-text-primary"><gr-icon name="info" [size]="20" class="shrink-0 text-info" />{{ t().cambiadoA(nombrePrueba(pr.elegida), diaCorto(pr.cambioOrg)) }}</p>
            }
            <div class="flex flex-col gap-3" role="radiogroup" aria-labelledby="pr-tit">
              @for (o of pr.opciones; track o.codigo) {
                @let sel = (eleccion() || pr.elegida) === o.codigo;
                @let llena = o.plazas > 0 && o.ocupadas >= o.plazas && pr.elegida !== o.codigo;
                @let ultimas = o.plazas > 0 && o.plazas - o.ocupadas <= 5;
                @if ((!pr.cerrada && (!pr.cambioOrg || verEleccion())) || pr.elegida === o.codigo) {
                  <button type="button" role="radio" [attr.aria-checked]="sel" [disabled]="pr.cerrada || llena || guardandoPrueba()" (click)="eleccion.set(o.codigo)"
                    class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border-2 p-4 text-left focus-visible:outline-2 focus-visible:outline-accent" [class]="sel ? 'border-accent bg-accent/8' : 'border-line-subtle bg-white/2 hover:border-line-strong'" [class.opacity-50]="llena">
                    <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" [class]="sel ? 'border-accent' : 'border-line-strong'">@if (sel) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
                    <span class="flex min-w-0 flex-1 flex-col gap-1 max-sm:basis-[calc(100%-36px)]"><span class="text-[16px] font-semibold">{{ o.nombre }}@if (o.fecha) { · <span class="whitespace-nowrap">{{ dia(o.fecha) }}</span> }</span><span class="text-body-xs text-text-tertiary">{{ sel && p?.atleta?.jornada ? t().sesionDe + hora(p!.atleta.horaInicio) + (p!.atleta.pesajeInicio ? t().pesajeSp + hora(p!.atleta.pesajeInicio) : '') : (o.plazas > 0 ? (o.ocupadas > o.plazas ? o.plazas : o.ocupadas) + t().de + o.plazas + t().plazas : t().sinLimite) + (sede() ? ' · ' + sede() : '') }}</span></span>
                    <span class="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-pill border px-2 text-[11px] font-medium uppercase tracking-wide max-sm:ml-9 md:px-2.5 md:text-[12px]" [class]="llena ? 'border-line-strong text-text-tertiary' : !sel && ultimas ? 'border-accent/40 bg-accent/10 text-accent-text' : 'border-success/40 bg-success/12 text-success'">{{ pr.cerrada ? t().cerrada : llena ? t().completa : pr.elegida === o.codigo ? t().tuComp : ultimas ? t().ultimas : t().disponible }}</span>
                  </button>
                }
              }
            </div>
            @if (errorPrueba()) { <p class="flex items-start gap-3 rounded-md border border-accent/40 bg-accent/8 p-4 text-body-s" role="alert"><gr-icon name="circle-alert" [size]="20" class="shrink-0 text-accent-text" />{{ errorPrueba() }}</p> }
            <p class="text-body-xs text-text-tertiary">{{ pr.cerrada ? t().cerro(pr.limite ? diaCorto(pr.limite) : '', contacto()) : (pr.limite ? t().puedes(diaCorto(pr.limite)) : '') }}</p>
            @if (!pr.cerrada && eleccion() && eleccion() !== pr.elegida) {
              <button grButton variant="primary" class="self-start" [loading]="guardandoPrueba()" (click)="guardarPrueba()">{{ t().guardarComp }}</button>
            }
          </section>
        </ng-template>
        @if (ok()) { <p class="fixed inset-x-5 bottom-5 z-50 mx-auto max-w-md rounded-md border border-success/40 bg-bg-raised px-4 py-3 text-center text-label-s text-success shadow-card" role="status">{{ ok() }}</p> }
      </div>
    </main>
    <gr-footer />
  `,
})
export class AreaAtletaPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly comp = inject(Competition);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly hora = hora;
  protected readonly cat = cat;
  protected readonly tile = 'group flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-white/8 bg-white/3 p-4 text-center transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:gap-4';
  protected readonly tileIcono = 'flex size-14 items-center justify-center rounded-lg bg-accent/16 text-accent-text transition-colors group-hover:bg-accent/24 md:size-16';
  protected readonly accesos: Signal<{ id: string; texto: string; icono: 'pencil' | 'calendar' | 'instagram' | 'trophy'; ruta?: string }[]> = computed(() => [
    { id: 'perfil', texto: this.t().editar, icono: 'pencil' },
    { id: 'horarios', texto: this.t().verHorarios, icono: 'calendar' },
    { id: 'post', texto: this.t().postBuilder, icono: 'instagram', ruta: '/area-atleta/compartir' },
    { id: 'resultados', texto: this.t().verResultados, icono: 'trophy', ruta: '/resultados' },
  ]);
  protected acceso(id: string): void {
    if (id === 'perfil') return this.abrir('perfil');
    document.getElementById('mis-horarios')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  protected readonly vista = signal<Vista>('cargando');
  protected readonly panel = signal<Panel | null>(null);
  protected readonly qr = signal('');
  protected readonly busy = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal('');
  protected readonly errorEnlace = signal('');
  protected readonly ok = signal('');
  protected readonly espera = signal(0);
  protected email = '';
  protected password = '';
  protected nuevaPassword = '';
  protected readonly modoEnlace = signal(false);
  protected readonly errorPassword = signal('');
  protected async entrar(): Promise<void> {
    this.error.set('');
    if (!this.email.trim() || !this.password) return this.error.set(this.t().escribeEmailPass);
    this.busy.set(true);
    try {
      await this.set(await firstValueFrom(this.http.post<Panel>(`${api}/login`, { competicion: COMPETITION_SLUG, email: this.email.trim(), password: this.password })));
      this.password = '';
    } catch (e) {
      this.error.set(e instanceof HttpErrorResponse && e.status === 429 ? this.t().demasiados : (e as { error?: { detail?: string } }).error?.detail ?? this.t().noEntrar);
    } finally {
      this.busy.set(false);
    }
  }
  protected async guardarPassword(): Promise<void> {
    this.errorPassword.set('');
    if (this.nuevaPassword.length < 10) return this.errorPassword.set(this.t().passCorta);
    this.busy.set(true);
    try {
      await this.set(await firstValueFrom(this.http.put<Panel>(`${api}/password`, { password: this.nuevaPassword })));
      this.nuevaPassword = '';
      this.aviso(this.t().passGuardada);
    } catch (e) {
      this.errorPassword.set(this.msg(e) || this.t().caducada);
    } finally {
      this.busy.set(false);
    }
  }
  /** iOS opens Mail with message://; elsewhere mailto: opens the default client (UX3-R1-18). */
  protected abrirCorreo(): void {
    location.href = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'message://' : 'mailto:';
  }
  protected aceptaImagen = false;
  protected retirar = false;
  protected fx = 50;
  protected fy = 50;
  protected f = { club: '', ciudad: '', instagram: '', bio: '', marcas: {} as Marcas, visible: true };
  protected pz: { rackSq?: number; rackBp?: number; segurosBp?: number; intentos: Marcas } = { intentos: {} };
  protected readonly lifts: { k: keyof Marcas; s: string }[] = [{ k: 'sq', s: 'SQ' }, { k: 'bp', s: 'BP' }, { k: 'dl', s: 'DL' }];
  protected readonly steppers: Signal<{ k: 'rackSq' | 'rackBp' | 'segurosBp'; label: string }[]> = computed(() => [{ k: 'rackSq', label: this.t().rackSq }, { k: 'rackBp', label: this.t().rackBp }, { k: 'segurosBp', label: this.t().seguros }]);
  protected readonly nombreComp = computed(() => this.comp.data()?.nombre || 'GR Cup');
  protected readonly sede = computed(() => this.comp.data()?.sede?.ciudad ?? '');
  protected readonly contacto = computed(() => this.comp.data()?.evento.emailContacto ?? '');
  protected readonly datos = computed(() => {
    const a = this.panel()?.atleta;
    if (!a) return [];
    const pr = this.panel()?.prueba;
    const t = this.t();
    const sinPrueba = !!pr && !pr.elegida ? t.trasElegir : '';
    return [
      { k: t.competicion, v: this.textoPrueba() },
      { k: t.categoria, v: a.categoria ? `${a.sexo} ${cat(a.categoria)} kg` : t.porPublicar }, { k: t.division, v: a.divisionNombre },
      { k: t.orden, v: sinPrueba || (a.lote ? t.lote + a.lote : t.porPublicar) },
      { k: t.pesaje, v: sinPrueba || (a.pesajeInicio ? `${hora(a.pesajeInicio)}–${hora(a.pesajeFin)}` : t.porPublicar) },
      { k: t.inicio, v: sinPrueba || (a.horaInicio ? hora(a.horaInicio) : t.porPublicar) },
      { k: t.licencia, v: a.licencia || '–' },
    ];
  });
  protected readonly eleccion = signal('');
  protected readonly verEleccion = signal(false);
  protected readonly guardandoPrueba = signal(false);
  protected readonly errorPrueba = signal('');
  protected toggleEleccion(): void {
    this.verEleccion.update((v) => !v);
    if (this.verEleccion()) this.irEleccion();
  }
  /** Brings the competition picker into view and focuses its title (UX3-R1-7, UX3-R1-10). */
  protected irEleccion(): void {
    if (!this.browser) return;
    afterNextRender(() => {
      const s = document.getElementById('pr-sec');
      s?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      document.getElementById('pr-tit')?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
  private textoPrueba(): string {
    const pr = this.panel()?.prueba;
    const o = pr?.opciones.find((x) => x.codigo === pr.elegida);
    return o ? o.nombre + (o.fecha ? ' · ' + this.dia(o.fecha) : '') : this.t().sinElegir;
  }
  protected nombrePrueba(c: string): string {
    return this.panel()?.prueba?.opciones.find((o) => o.codigo === c)?.nombre ?? c;
  }
  /** «sábado 21 nov» */
  protected dia(f: string): string {
    return new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString(this.i18n.locale(), { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '').replace('.', '');
  }
  /** «11 nov» */
  protected diaCorto(f: string): string {
    return new Date(f.length === 10 ? f + 'T12:00:00' : f).toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).replace('.', '');
  }
  protected tituloPrueba(pr: PruebaArea): string {
    if (pr.cerrada) return this.t().eleccionCerrada;
    if (pr.cambioOrg) return this.t().cambiadaOrg;
    if (this.errorPrueba()) return this.t().noGuardar;
    return pr.elegida ? this.t().elegidaN(this.nombrePrueba(pr.elegida)) : this.t().eligeComp;
  }
  protected badgePrueba(pr: PruebaArea): string {
    if (pr.cerrada) return this.t().bloqueada;
    if (pr.cambioOrg) return this.t().cambiadaOrg;
    if (this.errorPrueba()) return this.t().error;
    return pr.elegida ? this.t().elegida : this.t().sinElegir;
  }
  protected async guardarPrueba(): Promise<void> {
    this.errorPrueba.set('');
    this.guardandoPrueba.set(true);
    try {
      await this.set(await firstValueFrom(this.http.put<Panel>(`${api}/prueba`, { prueba: this.eleccion() })));
      this.verEleccion.set(false);
      this.aviso(this.t().compGuardada + this.nombrePrueba(this.eleccion()));
    } catch (e) {
      const actual = this.panel()?.prueba?.elegida;
      this.errorPrueba.set(((e as { error?: { detail?: string } }).error?.detail ?? this.t().noGuardarComp) + (actual ? this.t().seMantiene(this.nombrePrueba(actual)) : '') + this.t().reintenta);
      firstValueFrom(this.http.get<Panel>(`${api}/yo`)).then((p) => this.panel.set(p), () => undefined);
    } finally {
      this.guardandoPrueba.set(false);
    }
  }
  private timer?: ReturnType<typeof setInterval>;
  protected fuera(v: unknown): boolean {
    return v !== null && v !== undefined && v !== '' && !(Number(v) >= 0 && Number(v) <= 600);
  }
  protected fueraIntento(v: unknown): boolean {
    return this.fuera(v) || (v !== null && v !== undefined && v !== '' && Number(v) % 2.5 !== 0);
  }
  protected intentosMal(): boolean {
    return this.lifts.some((m) => this.fueraIntento(this.pz.intentos[m.k]));
  }
  protected marcasMal(): boolean {
    return this.lifts.some((m) => this.fuera(this.f.marcas[m.k]));
  }

  private async recargar(): Promise<void> {
    const antes = this.panel()?.prueba?.elegida;
    try {
      const p = await firstValueFrom(this.http.get<Panel>(`${api}/yo`));
      await this.set(p);
      if (antes !== undefined && p.prueba && p.prueba.elegida !== antes) this.aviso(this.t().orgCambio + this.nombrePrueba(p.prueba.elegida));
    } catch {
      /* keeps the panel shown */
    }
  }

  constructor() {
    inject(Seo).set({ title: this.t().seoT, description: this.t().seoD, path: '/area-atleta', robots: 'noindex' });
    const route = inject(ActivatedRoute);
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
    void inject(PendingTasks).run(() => this.comp.load());
    if (!this.browser) return; // private page: rendered in the browser (session cookie)
    // back to the tab: reload the panel so changes made by the organisation show up (U17-R1-4)
    const alVolver = () => { if (document.visibilityState === 'visible' && this.vista() === 'panel') void this.recargar(); };
    document.addEventListener('visibilitychange', alVolver);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', alVolver));
    void (async () => {
      const token = route.snapshot.queryParamMap.get('acceso');
      if (token) {
        const next = route.snapshot.queryParamMap.get('next');
        history.replaceState(null, '', this.i18n.path('/area-atleta')); // the one-time token never stays in the address bar
        try {
          this.set(await firstValueFrom(this.http.post<Panel>(`${api}/sesion`, { acceso: token })));
          // the link asked from «Comparte tu cuenta atrás» comes back there (Figma 83 · 01)
          if (next === '/area-atleta/compartir') void this.router.navigateByUrl(this.i18n.path(next), { replaceUrl: true });
          return;
        } catch {
          this.errorEnlace.set(this.t().caducado);
        }
      }
      try {
        this.set(await firstValueFrom(this.http.get<Panel>(`${api}/yo`)));
      } catch {
        this.vista.set('acceso');
      }
    })();
  }

  private async set(p: Panel): Promise<void> {
    this.panel.set(p);
    this.eleccion.set(p.prueba?.elegida ?? '');
    if (this.vista() !== 'pesaje') this.prepararPesaje(p);
    if (this.vista() === 'cargando' || this.vista() === 'acceso') this.vista.set('panel');
    // qrcode is CommonJS: the dynamic import exposes it as `default`.
    const mod = await import('qrcode');
    const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
    this.qr.set(await QR.toDataURL(p.acreditacion, { margin: 1, width: 240, errorCorrectionLevel: 'M' }));
  }

  protected async pedir(): Promise<void> {
    this.error.set('');
    const e = this.email.trim();
    if (!e) return this.error.set(this.t().escribeEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return this.error.set(!e.includes('@') ? this.t().faltaArroba : /@[^\s@]*\.[^\s@]{2,}$/.test(e) ? this.t().noValido : this.t().faltaDominio);
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post(`${api}/enlace`, { competicion: COMPETITION_SLUG, email: this.email.trim() }));
      this.vista.set('enviado');
      this.espera.set(45);
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.espera.update((n) => Math.max(0, n - 1));
        if (this.espera() === 0) clearInterval(this.timer);
      }, 1000);
    } catch (e) {
      this.error.set(e instanceof HttpErrorResponse && (e.status === 422 || e.status === 400) ? this.t().noValido : e instanceof HttpErrorResponse && e.status === 429 ? this.t().demasiados : this.t().noEnviar);
    } finally {
      this.busy.set(false);
    }
  }

  protected abrir(v: 'perfil' | 'pesaje'): void {
    const a = this.panel()?.atleta;
    if (!a) return;
    this.error.set('');
    if (v === 'perfil') {
      this.f = { club: a.club, ciudad: a.ciudad, instagram: a.perfil.instagram, bio: a.perfil.bio || a.perfil.frase, marcas: { ...a.perfil.marcas }, visible: a.perfil.visible };
      this.fx = a.perfil.focalX;
      this.fy = a.perfil.focalY;
      this.aceptaImagen = false;
      this.retirar = false;
    } else this.prepararPesaje(this.panel()!);
    this.ir(v);
  }

  private readonly injector = inject(Injector);
  /** Switches view and, once rendered, jumps to the top and focuses the H1 (UX3-R1-1). */
  protected ir(v: Vista): void {
    this.vista.set(v);
    if (!this.browser) return;
    afterNextRender(() => {
      scrollTo({ top: 0, behavior: 'instant' });
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  private prepararPesaje(p: Panel): void {
    const a = p.atleta;
    const [bp, seg] = (a.pesaje.rackBp || '').split('/').map((x) => Number(x) || undefined);
    this.pz = { rackSq: a.pesaje.rackSq ?? 12, rackBp: bp ?? 6, segurosBp: a.pesaje.segurosBp ?? seg ?? 4, intentos: { ...a.pesaje.intentos } };
  }

  protected paso(k: 'rackSq' | 'rackBp' | 'segurosBp', d: number): void {
    this.pz[k] = Math.min(30, Math.max(k === 'segurosBp' ? 0 : 1, (this.pz[k] ?? 0) + d));
  }

  protected async focal(ev: MouseEvent): Promise<void> {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.fx = Math.round(((ev.clientX - r.left) / r.width) * 100);
    this.fy = Math.round(((ev.clientY - r.top) / r.height) * 100);
    try {
      this.set(await firstValueFrom(this.http.put<Panel>(`${api}/foto/encuadre`, { focalX: this.fx, focalY: this.fy })));
    } catch {
      /* the next save keeps trying */
    }
  }

  protected async foto(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set('');
    this.subiendo.set(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const p = await firstValueFrom(this.http.post<Panel>(`${api}/foto`, fd));
      this.fx = p.atleta.perfil.focalX;
      this.fy = p.atleta.perfil.focalY;
      this.set(p);
      this.aviso(this.t().fotoSubida);
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? this.t().noSubir);
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async guardarPerfil(): Promise<void> {
    this.error.set('');
    const mal = this.lifts.filter((m) => this.fuera(this.f.marcas[m.k])).map((m) => m.s);
    if (mal.length) return this.error.set(mal.join(', ') + ': las marcas van entre 0 y 600 kg.');
    this.busy.set(true);
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));
    try {
      const p = await firstValueFrom(this.http.put<Panel>(`${api}/perfil`, {
        club: this.f.club, ciudad: this.f.ciudad, instagram: this.f.instagram, bio: this.f.bio, marcas: { sq: n(this.f.marcas.sq), bp: n(this.f.marcas.bp), dl: n(this.f.marcas.dl) },
        visible: this.f.visible, aceptaUsoDeImagen: this.aceptaImagen, retirarConsentimiento: this.retirar,
      }));
      this.set(p);
      this.retirar = false;
      this.ir('panel');
      this.aviso(this.t().perfilGuardado);
    } catch (e) {
      this.error.set(this.msg(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async guardarPesaje(): Promise<void> {
    this.error.set('');
    if (this.intentosMal() || this.busy()) return; // UX3-R2-4: sync guard against double tap
    this.busy.set(true);
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));
    try {
      this.set(await firstValueFrom(this.http.put<Panel>(`${api}/pesaje`, { rackSq: this.pz.rackSq, rackBp: this.pz.rackBp, segurosBp: this.pz.segurosBp, intentos: { sq: n(this.pz.intentos.sq), bp: n(this.pz.intentos.bp), dl: n(this.pz.intentos.dl) } })));
      this.ir('panel');
      this.aviso(this.t().guardadoPesaje);
    } catch (e) {
      this.error.set(this.msg(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected readonly copiado = signal(false);
  protected euros(c: number): string {
    return (c / 100).toLocaleString(this.i18n.locale(), { style: 'currency', currency: 'EUR' });
  }
  protected async compartir(code: string): Promise<void> {
    const url = `${location.origin}${this.i18n.path('/inscripcion')}?ref=${code}`;
    if (navigator.share) {
      await navigator.share({ title: 'GR Strength Cup', text: this.t().inscribete(code), url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }

  protected async salir(): Promise<void> {
    await firstValueFrom(this.http.post(`${api}/salir`, {})).catch(() => undefined);
    this.panel.set(null);
    this.vista.set('acceso');
  }

  private msg(e: unknown): string {
    if (e instanceof HttpErrorResponse && e.status === 401) {
      this.vista.set('acceso');
      return '';
    }
    return (e as { error?: { detail?: string } }).error?.detail ?? this.t().noGuardarGen;
  }

  private aviso(t: string): void {
    this.ok.set(t);
    setTimeout(() => this.ok.set(''), 2500);
  }
}
