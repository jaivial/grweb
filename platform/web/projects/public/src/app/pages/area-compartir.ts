import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { StoryMovil, StoryRecorte, type Recorte } from './area-compartir-ui';
import { StoryDatos, cargarImagen, componer, diasHasta, textoStory } from './compartir-story';

interface PanelStory {
  atleta: { nombreCompleto: string; sexo: 'F' | 'M'; categoria: string; perfil: { fotoUrl: string; focalX: number; focalY: number } };
  prueba?: { elegida: string; opciones: { codigo: string; nombre: string; fecha: string; nivel?: string }[] };
}
interface Config { estado: 'acceso' | 'pendiente' | 'editor' | 'finalizada'; motivo?: string; panel?: PanelStory }
type Vista = 'cargando' | 'acceso' | 'pendiente' | 'listo' | 'error';
const api = '/api/area-atleta';
const opt = <T extends string>(v: T, l: string, i?: 'align-start' | 'align-center' | 'align-end') => ({ v, l, i });
const ZOOM = 'gr-story-zoom';
const T = {
  es: {
    migas: 'Migas', area: 'Área de atleta', h1: 'Comparte tu cuenta atrás',
    intro: 'Crea tu story para Instagram con tu foto en blanco y negro y los datos de tu inscripción. Se genera en 1080 × 1920 px.',
    reintentar: 'Reintentar', soloInscritos: 'Solo para atletas inscritos',
    entra: 'Entra con el email de tu inscripción y te enviamos un enlace de acceso, sin contraseñas. Después podrás crear tu story.',
    revisa: 'Revisa tu email', siInscrito: (e: string) => `Si ${e} está inscrito, te llegará un enlace que te trae de vuelta aquí. Caduca en 30 minutos.`,
    emailIns: 'Email de tu inscripción', ph: 'tu@email.com', enviarme: 'Enviarme el enlace', sinPerfil: '¿Aún no tienes perfil de atleta?', crearPerfil: 'Crear perfil de atleta',
    aunNo: 'Aún no puedes crear tu story', sinIns: 'No tienes inscripción en AEP-2 ni AEP-3 de esta edición.',
    enRevision: 'Tu solicitud de alta está en revisión. Podrás compartir tu cuenta atrás en cuanto la aprobemos; te avisaremos por email.',
    verArea: 'Ver mi área de atleta', sinIns2026: '¿No tienes inscripción en la edición 2026?',
    sinIns2026Txt: 'Si tu cuenta no está inscrita en AEP-2 o AEP-3 de esta edición, crea primero tu perfil de atleta.',
    cuandoTermine: 'Cuando termine la competición esta página llevará a tus resultados; la story de cuenta atrás deja de estar disponible.',
    qrAlt: 'Código QR para abrir esta página en el móvil', ordenador: '¿Estás en el ordenador?',
    ordenadorTxt: 'Tu navegador no puede compartir a Instagram, así que hemos descargado la imagen. Escanea el código para abrir esta página en el móvil y compartirla desde allí.',
    tuFoto: 'Tu foto', stickerSinFoto: 'En modo sticker no hace falta foto: descargas un PNG transparente y lo pegas en Instagram sobre la foto que quieras.',
    subiendo: (f: string) => `Subiendo ${f}…`, subiendoFoto: 'Subiendo foto', alTerminar: 'Al terminar se abre el recorte 9:16.',
    recorteInfo: (z: string) => `Recorte 9:16 · zoom ${z} · blanco y negro`, recortar: 'Recortar', cambiar: 'Cambiar',
    arrastra: 'Arrastra tu foto o pulsa para elegirla', formatos: 'JPG, PNG o WebP · máx. 8 MB. La pasamos a blanco y negro y la recortas a 9:16.',
    elegir: 'Elegir foto', fotoRota: 'No hemos podido cargar tu foto', intentaOtra: 'Inténtalo de nuevo o sube otra.',
    queMostrar: 'Qué quieres mostrar', queMostrarAria: 'Qué mostrar', enDirecto: 'EN DIRECTO',
    hoyCompite: 'Hoy se compite: la cuenta atrás ya no está disponible. Comparte la fecha.',
    ayudaFecha: 'Muestra el día de la competición, el día de la semana y la hora de apertura de puertas.',
    ayudaCuenta: 'La cuenta atrás es estática: muestra los días que faltan el día que generas la imagen (hora de Madrid).',
    formato: 'Formato', ayudaStory: 'Story completa: tu foto en blanco y negro con el texto y los logos encima.',
    ayudaSticker: 'PNG transparente con el texto y los logos, como el de Strava. Lo pegas en Instagram encima de tu foto.',
    alineacion: 'Alineación del texto', alineacionAria: 'Alineación',
    ayudaAlin: 'Coloca el bloque de texto y logos a la izquierda, centrado o a la derecha para que no tape lo importante de tu foto.',
    comoPoner: 'Cómo ponerlo sobre tu foto', paso1: 'Pulsa «Compartir sticker» y elige «Guardar imagen» (o Instagram › Historia).',
    paso2: 'En Instagram crea tu historia con la foto o el vídeo que quieras.', paso3: 'Toca Stickers › Foto de la galería, elige el PNG y colócalo donde quieras.',
    ayudaPng: 'Si compartes el PNG directamente a Historias, Instagram le pone un fondo de color: para verlo sobre tu foto usa el sticker de galería.',
    tusDatos: 'Tus datos de inscripción', salen: 'Salen de tu inscripción y no se pueden editar aquí. ¿Algo no cuadra? Edita tu perfil →',
    ejemploSticker: 'Ejemplo: tu foto + sticker en Instagram', vistaPrevia: 'Vista previa · así se verá en tu story', asiQuedara: 'Así quedará tu story',
    pngTransp: 'PNG TRANSPARENTE', compSticker: 'Compartir sticker', compIg: 'Compartir en Instagram', descPng: 'Descargar PNG', descImg: 'Descargar imagen', siguenos: 'Síguenos en Instagram',
    cuentaAtras: 'Cuenta atrás', fecha: 'Fecha', conFoto: 'Con tu foto', soloSticker: 'Solo sticker (PNG)', izq: 'Izquierda', centro: 'Centro', der: 'Derecha', coma: ',',
    competicion: 'Competición', categoria: 'Categoría de peso', sexo: 'Sexo', fem: 'Femenino', masc: 'Masculino', ciudad: 'Ciudad', puertas: 'PUERTAS ',
    pieAcceso: 'Ejemplo desenfocado. Inicia sesión para crear la tuya con tu foto y tus datos.', piePendiente: 'Solo para atletas con inscripción confirmada.',
    pieSticker: 'A la izquierda, cómo queda sobre una foto tuya en Instagram; a la derecha, el PNG que descargas.',
    pieSubiendo: 'Subiendo… al terminar se abre el recorte 9:16.', pieSinFoto: 'Cuando subas tu foto la verás aquí en blanco y negro.',
    espera: 'Espera a que termine la subida.', botSticker: 'Comparte o descarga el PNG transparente (1080 × 1920) y pégalo en Instagram sobre tu foto.',
    botSinFoto: 'Sube una foto para compartir (o cambia a «Solo sticker», que no la necesita).',
    botListo: 'Compartir abre el menú del móvil (Instagram › Historia). Si tu navegador no puede compartir archivos, descargamos la imagen. «Síguenos» abre @grstrengthclub.',
    seoT: 'Comparte tu cuenta atrás · GR Cup', seoD: 'Crea tu story de Instagram con la cuenta atrás de la GRS Cup 2.',
    demasiados: 'Demasiados intentos', pruebaEn: (m: number) => `Prueba en ${m} min.`, noDatos: 'No hemos podido cargar tus datos',
    conexion: 'Revisa tu conexión e inténtalo de nuevo.', fallo: 'Ha fallado algo por nuestra parte. Inténtalo de nuevo en unos minutos.',
    noAdmitido: 'Formato no admitido o foto de más de 8 MB. Sube un JPG, PNG o WebP.', subida: 'Foto subida. Recórtala a 9:16.',
    noSubir: 'No hemos podido subir tu foto. Revisa tu conexión e inténtalo de nuevo.', generando: 'Generando tu imagen…', lista: 'Imagen lista.',
    noGenerar: 'No hemos podido generar tu imagen. Revisa tu conexión e inténtalo de nuevo.',
    noMenu: 'No se ha podido abrir el menú de compartir. Descarga la imagen y súbela a tu historia.',
    guardada: 'Imagen guardada. Ábrela en Instagram › Historia.', descargada: 'Imagen descargada: ',
    demasiados2: 'Demasiados intentos, prueba en unos minutos.', noEnlace: 'No hemos podido enviar el enlace. Revisa el email e inténtalo de nuevo.',
  },
  en: {
    migas: 'Breadcrumb', area: 'Athlete area', h1: 'Share your countdown',
    intro: 'Create your Instagram story with your photo in black and white and your entry details. It is generated at 1080 × 1920 px.',
    reintentar: 'Try again', soloInscritos: 'Registered athletes only',
    entra: 'Sign in with the email you registered with and we will send you an access link, no passwords. Then you can create your story.',
    revisa: 'Check your email', siInscrito: (e: string) => `If ${e} is registered, you will receive a link that brings you back here. It expires in 30 minutes.`,
    emailIns: 'Your registration email', ph: 'you@email.com', enviarme: 'Send me the link', sinPerfil: "Don't have an athlete profile yet?", crearPerfil: 'Create athlete profile',
    aunNo: "You can't create your story yet", sinIns: 'You have no entry in AEP-2 or AEP-3 for this edition.',
    enRevision: 'Your sign-up request is under review. You can share your countdown as soon as we approve it; we will let you know by email.',
    verArea: 'View my athlete area', sinIns2026: 'No entry for the 2026 edition?',
    sinIns2026Txt: 'If your account is not entered in AEP-2 or AEP-3 for this edition, create your athlete profile first.',
    cuandoTermine: 'When the competition ends this page will take you to your results; the countdown story will no longer be available.',
    qrAlt: 'QR code to open this page on your phone', ordenador: 'On a computer?',
    ordenadorTxt: "Your browser can't share to Instagram, so we have downloaded the image. Scan the code to open this page on your phone and share it from there.",
    tuFoto: 'Your photo', stickerSinFoto: 'Sticker mode needs no photo: you download a transparent PNG and paste it in Instagram over any photo you like.',
    subiendo: (f: string) => `Uploading ${f}…`, subiendoFoto: 'Uploading photo', alTerminar: 'When it finishes, the 9:16 crop opens.',
    recorteInfo: (z: string) => `9:16 crop · zoom ${z} · black and white`, recortar: 'Crop', cambiar: 'Change',
    arrastra: 'Drag your photo here or tap to choose it', formatos: 'JPG, PNG or WebP · max. 8 MB. We turn it black and white and you crop it to 9:16.',
    elegir: 'Choose photo', fotoRota: "We couldn't load your photo", intentaOtra: 'Try again or upload another one.',
    queMostrar: 'What do you want to show', queMostrarAria: 'What to show', enDirecto: 'LIVE',
    hoyCompite: 'Competition day: the countdown is no longer available. Share the date.',
    ayudaFecha: 'Shows the competition date, the day of the week and the doors opening time.',
    ayudaCuenta: 'The countdown is static: it shows the days left on the day you generate the image (Madrid time).',
    formato: 'Format', ayudaStory: 'Full story: your photo in black and white with the text and logos on top.',
    ayudaSticker: 'Transparent PNG with the text and logos, like the Strava one. You paste it in Instagram over your photo.',
    alineacion: 'Text alignment', alineacionAria: 'Alignment',
    ayudaAlin: 'Place the text and logos on the left, centre or right so they do not cover the important part of your photo.',
    comoPoner: 'How to place it over your photo', paso1: 'Tap «Share sticker» and choose «Save image» (or Instagram › Story).',
    paso2: 'In Instagram, create your story with any photo or video you like.', paso3: 'Tap Stickers › Photo from gallery, choose the PNG and place it wherever you like.',
    ayudaPng: 'If you share the PNG straight to Stories, Instagram adds a coloured background: to see it over your photo, use the gallery sticker.',
    tusDatos: 'Your entry details', salen: "They come from your entry and can't be edited here. Something wrong? Edit your profile →",
    ejemploSticker: 'Example: your photo + sticker on Instagram', vistaPrevia: 'Preview · how it will look in your story', asiQuedara: 'How your story will look',
    pngTransp: 'TRANSPARENT PNG', compSticker: 'Share sticker', compIg: 'Share on Instagram', descPng: 'Download PNG', descImg: 'Download image', siguenos: 'Follow us on Instagram',
    cuentaAtras: 'Countdown', fecha: 'Date', conFoto: 'With your photo', soloSticker: 'Sticker only (PNG)', izq: 'Left', centro: 'Centre', der: 'Right', coma: '.',
    competicion: 'Competition', categoria: 'Weight class', sexo: 'Sex', fem: 'Female', masc: 'Male', ciudad: 'City', puertas: 'DOORS ',
    pieAcceso: 'Blurred example. Sign in to create yours with your photo and details.', piePendiente: 'Only for athletes with a confirmed entry.',
    pieSticker: 'On the left, how it looks over one of your photos on Instagram; on the right, the PNG you download.',
    pieSubiendo: 'Uploading… when it finishes, the 9:16 crop opens.', pieSinFoto: 'Once you upload your photo you will see it here in black and white.',
    espera: 'Wait for the upload to finish.', botSticker: 'Share or download the transparent PNG (1080 × 1920) and paste it in Instagram over your photo.',
    botSinFoto: 'Upload a photo to share (or switch to «Sticker only», which needs none).',
    botListo: "Share opens your phone's menu (Instagram › Story). If your browser can't share files, we download the image. «Follow us» opens @grstrengthclub.",
    seoT: 'Share your countdown · GR Cup', seoD: 'Create your Instagram story with the GRS Cup 2 countdown.',
    demasiados: 'Too many attempts', pruebaEn: (m: number) => `Try again in ${m} min.`, noDatos: "We couldn't load your details",
    conexion: 'Check your connection and try again.', fallo: 'Something went wrong on our side. Please try again in a few minutes.',
    noAdmitido: 'Unsupported format or photo over 8 MB. Upload a JPG, PNG or WebP.', subida: 'Photo uploaded. Crop it to 9:16.',
    noSubir: "We couldn't upload your photo. Check your connection and try again.", generando: 'Generating your image…', lista: 'Image ready.',
    noGenerar: "We couldn't generate your image. Check your connection and try again.",
    noMenu: "The share menu couldn't be opened. Download the image and upload it to your story.",
    guardada: 'Image saved. Open it in Instagram › Story.', descargada: 'Image downloaded: ',
    demasiados2: 'Too many attempts, try again in a few minutes.', noEnlace: "We couldn't send the link. Check the email and try again.",
  },
};

/** /area-atleta/compartir (Figma 83): «Comparte tu cuenta atrás». Only for confirmed athletes (area session). */
@Component({
  selector: 'gr-area-compartir',
  imports: [RouterLink, LocPipe, FormsModule, Navbar, Footer, GrAlert, GrButton, GrIcon, GrSkeleton, StoryMovil, StoryRecorte],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.seg{display:flex;gap:4px;border-radius:8px;border:1px solid var(--color-line-subtle);background:var(--color-bg-field);padding:4px}
    .seg button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:4px 8px;white-space:normal;text-align:center;line-height:1.2;border-radius:6px;font-size:14px;font-weight:600;color:var(--color-text-tertiary);transition:color .15s,background .15s}
    .seg button:hover:not(:disabled){color:var(--color-text-secondary)} .seg button:disabled{opacity:.45;cursor:not-allowed}
    .seg button:focus-visible{outline:none;box-shadow:0 0 0 2px rgb(230 96 107/.9)}
    .seg button[aria-checked=true]{color:#fff;background:linear-gradient(180deg,#c4283a,#8c1422)}
    .card{border-radius:12px;border:1px solid var(--color-line-subtle);background:var(--color-bg-card);padding:20px}
    .card h2{font-size:18px;font-weight:600;line-height:1.3} .card h2 span{margin-right:8px;font-family:var(--font-mono,monospace);font-size:11px;color:var(--color-accent-text)}
    .ayuda{margin-top:12px;font-size:13px;line-height:1.5;color:var(--color-text-tertiary)}
    .ajedrez{background:repeating-conic-gradient(#3a3a3e 0 25%,#2a2a2e 0 50%) 0 0/12px 12px}
    @media (prefers-reduced-motion:reduce){.seg button{transition:none}}`,
  template: `
    <gr-navbar />
    <main class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px]">
      <nav class="text-body-s text-text-tertiary" [attr.aria-label]="t().migas"><a [routerLink]="'/area-atleta' | loc" class="-my-3 inline-flex h-11 items-center hover:text-text-primary">{{ t().area }}</a> › <span class="text-text-primary">{{ t().h1 }}</span></nav>
      <h1 class="mt-2 text-display-m md:text-display-l">{{ t().h1 }}</h1>
      <p class="mt-3 max-w-xl text-[14px] leading-relaxed text-text-secondary md:text-body-l">{{ t().intro }}</p>
      <div class="sr-only" aria-live="polite">{{ anuncio() }}</div>
      @switch (vista()) {
        @case ('cargando') { <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,640px)_1fr]" aria-busy="true"><gr-skeleton class="h-96 rounded-lg" /><gr-skeleton class="h-[600px] rounded-lg" /></div> }
        @case ('error') {
          <gr-alert class="mt-8 block max-w-xl" tone="danger" [title]="errorTitulo()">{{ errorTexto() }} @if (!espera()) { <button class="underline" (click)="cargar()">{{ t().reintentar }}</button> }</gr-alert>
        }
        @default {
          <div class="mt-8 flex flex-col-reverse gap-6 md:grid md:grid-cols-2 md:items-start lg:grid-cols-[minmax(0,640px)_1fr]">
            <div class="flex flex-col gap-4">
              @if (vista() === 'acceso') {
                <section class="card">
                  <h2>{{ t().soloInscritos }}</h2>
                  <p class="mt-3 text-body-s text-text-secondary">{{ t().entra }}</p>
                  @if (enviado()) {
                    <gr-alert class="mt-4 block" tone="success" [title]="t().revisa">{{ t().siInscrito(email) }}</gr-alert>
                  } @else {
                    <form class="mt-4 flex flex-col gap-3" (ngSubmit)="pedirEnlace()">
                      <label for="story-email" class="text-label-s">{{ t().emailIns }}</label>
                      <input id="story-email" name="email" type="email" required autocomplete="email" [(ngModel)]="email" [placeholder]="t().ph" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" />
                      @if (errorEnlace()) { <p class="text-body-s text-accent-text" role="alert">{{ errorEnlace() }}</p> }
                      <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="busy()">{{ t().enviarme }}</button>
                    </form>
                  }
                  <div class="my-4 flex items-center gap-3 text-[11px] text-text-tertiary"><span class="h-px flex-1 bg-line-subtle"></span>{{ t().sinPerfil }}<span class="h-px flex-1 bg-line-subtle"></span></div>
                  <a grButton size="l" [block]="true" [routerLink]="'/alta-atleta' | loc">{{ t().crearPerfil }}</a>
                </section>
              } @else if (vista() === 'pendiente') {
                <section class="card">
                  <h2>{{ t().aunNo }}</h2>
                  <gr-alert class="mt-4 block" tone="warning" title="">{{ motivo() === 'SIN_INSCRIPCION' ? t().sinIns : t().enRevision }}</gr-alert>
                  <a grButton class="mt-4" [routerLink]="'/area-atleta' | loc">{{ t().verArea }}</a>
                </section>
                <section class="card">
                  <h2>{{ t().sinIns2026 }}</h2>
                  <p class="mt-3 text-body-s text-text-secondary">{{ t().sinIns2026Txt }}</p>
                  <a grButton variant="primary" class="mt-4" [routerLink]="'/alta-atleta' | loc">{{ t().crearPerfil }}</a>
                </section>
              } @else {
                @if (enDirecto()) { <gr-alert tone="info" title="">{{ t().cuandoTermine }}</gr-alert> }
                @if (qr()) {
                  <section class="card flex gap-4">
                    <img [src]="qr()" [alt]="t().qrAlt" class="size-[88px] shrink-0 rounded-xs bg-white" />
                    <div><h2>{{ t().ordenador }}</h2><p class="mt-2 text-body-s text-text-secondary">{{ t().ordenadorTxt }}</p></div>
                  </section>
                }
                <section class="card">
                  <h2><span>01</span>{{ t().tuFoto }}</h2>
                  @if (formato() === 'sticker') {
                    <p class="mt-3 text-body-s text-text-secondary">{{ t().stickerSinFoto }}</p>
                  } @else if (subida() !== null) {
                    <div class="mt-4 flex items-center gap-4">
                      <div class="h-20 w-[45px] shrink-0 rounded-xs bg-bg-raised"></div>
                      <div class="flex-1"><div class="flex justify-between text-label-s"><span class="truncate">{{ t().subiendo(fichero()) }}</span><span>{{ subida() }} %</span></div>
                        <div class="mt-2 h-1 rounded bg-bg-raised" role="progressbar" [attr.aria-valuenow]="subida()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="t().subiendoFoto"><div class="h-full rounded bg-accent" [style.width.%]="subida()"></div></div></div>
                    </div>
                    <p class="ayuda">{{ t().alTerminar }}</p>
                  } @else if (fotoSrc() && !fotoRota()) {
                    <div class="mt-4 flex items-center gap-4">
                      <img [src]="fotoSrc()" alt="" class="h-20 w-[45px] rounded-xs object-cover grayscale" [style.object-position]="rec().focalX + '% ' + rec().focalY + '%'" />
                      <div class="min-w-0">
                        <p class="truncate text-label-s">{{ fichero() }}</p>
                        <p class="text-[12px] text-text-tertiary">{{ t().recorteInfo(zoomTxt()) }}</p>
                        <div class="mt-2 flex flex-wrap gap-2"><button grButton type="button" [disabled]="!foto()" (click)="recortando.set(true)">{{ t().recortar }}</button><button grButton type="button" (click)="input.click()">{{ t().cambiar }}</button></div>
                      </div>
                    </div>
                  } @else {
                    <div class="mt-4 flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center" [class]="arrastrando() ? 'border-accent bg-accent/5' : errorFoto() ? 'border-accent/70' : 'border-line-strong'"
                      (dragover)="$event.preventDefault(); arrastrando.set(true)" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
                      <gr-icon name="upload" [size]="20" />
                      <p class="text-label-m">{{ t().arrastra }}</p>
                      <p class="max-w-xs text-[12px] text-text-tertiary">{{ t().formatos }}</p>
                      <button grButton type="button" class="mt-1" (click)="input.click()">{{ t().elegir }}</button>
                    </div>
                    @if (fotoRota()) { <gr-alert class="mt-3 block" tone="warning" [title]="t().fotoRota">{{ t().intentaOtra }} <button class="underline" (click)="cargarFoto()">{{ t().reintentar }}</button></gr-alert> }
                  }
                  @if (errorFoto()) { <gr-alert class="mt-3 block" tone="danger" title="">{{ errorFoto() }}</gr-alert> }
                  <input #input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" tabindex="-1" aria-hidden="true" (change)="elegir($event)" />
                </section>
                <section class="card">
                  <h2><span>02</span>{{ t().queMostrar }}</h2>
                  <div class="seg mt-4" role="radiogroup" [attr.aria-label]="t().queMostrarAria">@for (o of modos(); track o.v) { <button type="button" role="radio" [attr.aria-checked]="modo() === o.v" [disabled]="o.v === 'cuenta_atras' && enDirecto()" (click)="modo.set(o.v)">{{ o.l }}</button> }</div>
                  @if (enDirecto()) { <span class="mt-3 inline-block rounded-full border border-accent/60 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-accent-text">{{ t().enDirecto }}</span> }
                  <p class="ayuda">{{ enDirecto() ? t().hoyCompite : modo() === 'fecha' ? t().ayudaFecha : t().ayudaCuenta }}</p>
                </section>
                <section class="card">
                  <h2><span>03</span>{{ t().formato }}</h2>
                  <div class="seg mt-4" role="radiogroup" [attr.aria-label]="t().formato">@for (o of formatos(); track o.v) { <button type="button" role="radio" [attr.aria-checked]="formato() === o.v" (click)="formato.set(o.v)">{{ o.l }}</button> }</div>
                  <p class="ayuda">{{ formato() === 'story' ? t().ayudaStory : t().ayudaSticker }}</p>
                </section>
                <section class="card">
                  <h2><span>04</span>{{ t().alineacion }}</h2>
                  <div class="seg mt-4" role="radiogroup" [attr.aria-label]="t().alineacionAria">@for (o of alins(); track o.v) { <button type="button" role="radio" [attr.aria-checked]="alin() === o.v" (click)="alin.set(o.v)"><gr-icon [name]="o.i!" [size]="14" /><span class="max-sm:sr-only">{{ o.l }}</span></button> }</div>
                  <p class="ayuda">{{ t().ayudaAlin }}</p>
                </section>
                @if (formato() === 'sticker') {
                  <section class="card">
                    <h2><span>06</span>{{ t().comoPoner }}</h2>
                    <ol class="mt-3 flex flex-col gap-2 text-body-s">
                      <li><span class="mr-2 font-mono text-[11px] text-accent-text">01</span>{{ t().paso1 }}</li>
                      <li><span class="mr-2 font-mono text-[11px] text-accent-text">02</span>{{ t().paso2 }}</li>
                      <li><span class="mr-2 font-mono text-[11px] text-accent-text">03</span>{{ t().paso3 }}</li>
                    </ol>
                    <p class="ayuda">{{ t().ayudaPng }}</p>
                  </section>
                }
                <section class="card">
                  <h2><span>05</span>{{ t().tusDatos }}</h2>
                  <dl class="mt-2">@for (f of filas(); track f[0]) { <div class="flex justify-between gap-4 border-t border-line-subtle py-3 text-body-s"><dt class="text-text-tertiary">{{ f[0] }}</dt><dd class="text-right font-semibold">{{ f[1] }}</dd></div> }</dl>
                  <a [routerLink]="'/area-atleta' | loc" [queryParams]="{ vista: 'perfil' }" class="text-[13px] text-accent-text hover:underline">{{ t().salen }}</a>
                </section>
              }
            </div>
            <div class="flex flex-col gap-3 md:sticky md:top-28">
              <div class="card px-4! py-8! sm:px-6!">
                <p class="flex flex-wrap items-center justify-center gap-2 text-center font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase"><gr-icon name="eye" [size]="14" />{{ vista() === 'listo' ? (formato() === 'sticker' ? t().ejemploSticker : t().vistaPrevia) : t().asiQuedara }}</p>
                <div class="mt-5 flex items-end justify-center gap-4">
                  @if (vista() === 'listo') {
                    @if (formato() === 'sticker') {
                      <gr-story-movil [src]="url()" [alt]="alt()" [fondo]="fotoSrc() || '/img/edicion-2025/foto-1.webp'" />
                      <div class="hidden flex-col items-center gap-2 sm:flex md:hidden xl:flex"><img [src]="url()" alt="" class="ajedrez aspect-[9/16] w-[118px] rounded-xs" /><span class="text-[11px] font-semibold tracking-[0.06em] text-text-tertiary">{{ t().pngTransp }}</span></div>
                    } @else {
                      <gr-story-movil [src]="url()" [alt]="alt()" [hueco]="!foto()" />
                    }
                  } @else {
                    <gr-story-movil src="/img/edicion-2025/foto-1.webp" alt="" [borroso]="true" />
                  }
                </div>
                <p class="mt-4 text-center text-[12px] text-text-tertiary">{{ pie() }}</p>
              </div>
              @if (vista() === 'listo') {
                @if (fallo()) {
                  <gr-alert tone="danger" title="">{{ fallo() }} <button class="underline" (click)="reintentar()">{{ t().reintentar }}</button></gr-alert>
                }
                <!-- UX3-R1-5: primary CTA fixed in the thumb zone on mobile, with a 9:16 thumbnail -->
                <div class="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:flex max-md:items-center max-md:gap-3 max-md:border-t max-md:border-line-subtle max-md:bg-bg-base/95 max-md:px-5 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:backdrop-blur-[10px]">
                  @if (url()) { <img [src]="url()" alt="" class="aspect-[9/16] w-10 shrink-0 rounded-xs object-cover md:hidden" [class.ajedrez]="formato() === 'sticker'" /> }
                  <button grButton variant="primary" size="l" [block]="true" icon="instagram" class="min-w-0 flex-1 overflow-hidden" [loading]="busy()" [disabled]="!listo()" (click)="compartir()"><span class="min-w-0 truncate">{{ formato() === 'sticker' ? t().compSticker : t().compIg }}</span></button>
                </div>
                <button grButton variant="secondary" size="l" [block]="true" [disabled]="!listo()" (click)="descargar()">{{ formato() === 'sticker' ? t().descPng : t().descImg }}</button>
                <a grButton variant="link" iconRight="arrow-right" href="https://instagram.com/grstrengthclub" target="_blank" rel="noopener" class="inline-flex min-h-11 items-center self-center">{{ t().siguenos }}</a>
                <p class="text-center text-[13px] text-text-tertiary">{{ ayudaBotones() }}</p>
              }
            </div>
          </div>
          @if (recortando() && fotoSrc() && foto(); as f) {
            <gr-story-recorte [src]="fotoSrc()" [ancho]="f.naturalWidth" [alto]="f.naturalHeight" [inicial]="rec()" (aplicar)="aplicarRecorte($event)" (cancelar)="recortando.set(false)" />
          }
        }
      }
    </main>
    <gr-footer />
    @if (vista() === 'listo') { <div class="h-[calc(76px+env(safe-area-inset-bottom))] md:hidden" aria-hidden="true"></div> }
  `,
})
export class AreaCompartirPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly comp = inject(Competition);
  private readonly toasts = inject(GrToasts);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly modos = computed(() => [opt('cuenta_atras' as const, this.t().cuentaAtras), opt('fecha' as const, this.t().fecha)]);
  protected readonly formatos = computed(() => [opt('story' as const, this.t().conFoto), opt('sticker' as const, this.t().soloSticker)]);
  protected readonly alins = computed(() => [opt('izq' as const, this.t().izq, 'align-start'), opt('centro' as const, this.t().centro, 'align-center'), opt('der' as const, this.t().der, 'align-end')]);
  protected readonly vista = signal<Vista>('cargando');
  protected readonly motivo = signal('');
  protected readonly p = signal<PanelStory | null>(null);
  protected readonly foto = signal<HTMLImageElement | undefined>(undefined);
  protected readonly fotoSrc = signal('');
  protected readonly fotoRota = signal(false);
  protected readonly fichero = signal(this.t().tuFoto);
  protected readonly subida = signal<number | null>(null);
  protected readonly errorFoto = signal('');
  protected readonly arrastrando = signal(false);
  protected readonly recortando = signal(false);
  protected readonly rec = signal<Recorte>({ focalX: 50, focalY: 35, zoom: 1 });
  protected readonly modo = signal<StoryDatos['modo']>('cuenta_atras');
  protected readonly formato = signal<StoryDatos['formato']>('story');
  protected readonly alin = signal<StoryDatos['alin']>('izq');
  protected readonly url = signal('');
  protected readonly alt = signal('');
  protected readonly busy = signal(false);
  protected readonly fallo = signal('');
  protected readonly anuncio = signal('');
  protected readonly qr = signal('');
  protected readonly errorTitulo = signal('');
  protected readonly errorTexto = signal('');
  protected readonly espera = signal(false);
  protected readonly enviado = signal(false);
  protected readonly errorEnlace = signal('');
  protected email = '';
  private blob?: Blob;
  private ultimo?: StoryDatos;
  private temporizador?: ReturnType<typeof setTimeout>;

  private readonly prueba = computed(() => {
    const pr = this.p()?.prueba;
    return pr?.opciones.find((o) => o.codigo === pr.elegida);
  });
  private readonly fechaISO = computed(() => this.prueba()?.fecha || this.comp.data()?.fechaInicio || '');
  private readonly dias = computed(() => (this.fechaISO() ? diasHasta(this.fechaISO()) : 1));
  /** Competition day (Figma 83 · 12): only the date can be shared. */
  protected readonly enDirecto = computed(() => this.dias() <= 0);
  protected readonly zoomTxt = computed(() => this.rec().zoom.toFixed(1).replace('.', this.t().coma) + '×');
  /** The story needs a photo; the sticker does not. */
  protected readonly listo = computed(() => !!this.url() && (this.formato() === 'sticker' || !!this.foto()));
  protected readonly filas = computed(() => {
    const a = this.p()?.atleta;
    if (!a) return [];
    const pr = this.prueba();
    const t = this.t();
    return [[t.competicion, pr ? [pr.nombre, pr.nivel].filter(Boolean).join(' · ') : '—'], [t.categoria, peso(a.categoria)], [t.sexo, a.sexo === 'F' ? t.fem : t.masc], [t.ciudad, 'Almussafes · Valencia'], [t.fecha, fechaLarga(this.fechaISO(), this.i18n.locale())]];
  });
  protected readonly pie = computed(() => {
    if (this.vista() === 'acceso') return this.t().pieAcceso;
    if (this.vista() === 'pendiente') return this.t().piePendiente;
    if (this.formato() === 'sticker') return this.t().pieSticker;
    if (this.subida() !== null) return this.t().pieSubiendo;
    return this.foto() ? '' : this.t().pieSinFoto;
  });
  protected readonly ayudaBotones = computed(() => {
    if (this.subida() !== null) return this.t().espera;
    if (this.formato() === 'sticker') return this.t().botSticker;
    if (!this.foto()) return this.t().botSinFoto;
    return this.t().botListo;
  });

  constructor() {
    inject(Seo).set({ title: this.t().seoT, description: this.t().seoD, path: '/area-atleta/compartir', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(DestroyRef).onDestroy(() => { clearTimeout(this.temporizador); if (this.url()) URL.revokeObjectURL(this.url()); });
    const z = Number(localStorage.getItem(ZOOM));
    if (z >= 1 && z <= 4) this.rec.update((r) => ({ ...r, zoom: z }));
    void this.cargar();
    effect(() => { if (this.enDirecto()) this.modo.set('fecha'); });
    effect(() => {
      const a = this.p()?.atleta;
      if (!a || this.vista() !== 'listo') return;
      const f = this.fechaISO();
      const r = this.rec();
      const t = this.t();
      const d: StoryDatos = {
        lang: this.i18n.lang(),
        modo: this.enDirecto() ? 'fecha' : this.modo(), formato: this.formato(), alin: this.alin(), dias: Math.max(0, this.dias()),
        fecha: fechaCorta(f), detalleFecha: detalle(f, this.i18n.locale(), t.puertas, this.comp.data()?.evento?.puertas),
        nombre: a.nombreCompleto, prueba: (this.prueba()?.codigo ?? '').toUpperCase().replace('AEP', 'AEP-'), peso: peso(a.categoria).toUpperCase(),
        sexo: (a.sexo === 'F' ? t.fem : t.masc).toUpperCase(), foto: this.foto(), focalX: r.focalX, focalY: r.focalY, zoom: r.zoom,
      };
      // debounce 600 ms: one render per burst of clicks (Figma 83 · notas)
      clearTimeout(this.temporizador);
      this.temporizador = setTimeout(() => void this.render(d), untracked(this.url) ? 600 : 0);
    });
  }

  async cargar() {
    this.vista.set('cargando');
    try {
      const [c] = await Promise.all([firstValueFrom(this.http.get<Config>(api + '/story/config')), this.comp.load()]);
      if (c.estado === 'finalizada') { void this.router.navigateByUrl(this.i18n.path('/resultados'), { replaceUrl: true }); return; }
      if (c.estado !== 'editor' || !c.panel) { this.motivo.set(c.motivo ?? ''); this.vista.set(c.estado === 'pendiente' ? 'pendiente' : 'acceso'); return; }
      this.p.set(c.panel);
      const pf = c.panel.atleta.perfil;
      this.rec.update((r) => ({ ...r, focalX: pf.focalX, focalY: pf.focalY }));
      this.vista.set('listo');
      await this.cargarFoto();
    } catch (e) {
      const st = e instanceof HttpErrorResponse ? e.status : 0;
      if (st === 429) {
        const min = Math.max(1, Math.ceil(Number(e instanceof HttpErrorResponse && e.headers.get('Retry-After')) / 60) || 1);
        this.errorTitulo.set(this.t().demasiados);
        this.errorTexto.set(this.t().pruebaEn(min));
        this.espera.set(true);
        setTimeout(() => this.espera.set(false), min * 60000);
      } else {
        this.errorTitulo.set(this.t().noDatos);
        this.errorTexto.set(st === 0 ? this.t().conexion : this.t().fallo);
        this.espera.set(false);
      }
      this.vista.set('error');
    }
  }

  /** The photo comes through our API (same origin) so the canvas can be exported. */
  async cargarFoto(recargar = false) {
    const u = this.p()?.atleta.perfil.fotoUrl;
    this.fotoRota.set(false);
    this.foto.set(undefined);
    this.fotoSrc.set('');
    if (!u) return;
    this.fichero.set(decodeURIComponent(u.split('/').pop()?.split('?')[0] || this.t().tuFoto));
    const src = api + '/story/foto?v=' + encodeURIComponent(u) + (recargar ? '&t=' + Date.now() : '');
    try {
      this.foto.set(await cargarImagen(src));
      this.fotoSrc.set(src);
    } catch {
      this.fotoRota.set(true);
    }
  }

  protected soltar(e: DragEvent) {
    e.preventDefault();
    this.arrastrando.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void this.subir(f);
  }

  protected elegir(e: Event) {
    const i = e.target as HTMLInputElement;
    const f = i.files?.[0];
    i.value = '';
    if (f) void this.subir(f);
  }

  private async subir(f: File) {
    this.errorFoto.set('');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 8 << 20) {
      this.errorFoto.set(this.t().noAdmitido);
      return;
    }
    const fd = new FormData();
    fd.append('file', f);
    this.fichero.set(f.name);
    this.subida.set(0);
    this.http.post<PanelStory>(api + '/foto', fd, { reportProgress: true, observe: 'events' }).subscribe({
      next: async (ev) => {
        if (ev.type === HttpEventType.UploadProgress) this.subida.set(Math.round((100 * ev.loaded) / (ev.total || f.size)));
        if (ev.type !== HttpEventType.Response || !ev.body) return;
        const nombre = f.name;
        this.p.set(ev.body);
        await this.cargarFoto(true);
        this.fichero.set(nombre);
        this.subida.set(null);
        this.formato.set('story');
        if (this.foto()) { this.anuncio.set(this.t().subida); this.recortando.set(true); }
      },
      error: (e: HttpErrorResponse) => {
        this.subida.set(null);
        this.errorFoto.set(e.status === 413 || e.status === 415 || e.status === 422 ? e.error?.detail || this.t().noAdmitido : this.t().noSubir);
      },
    });
  }

  protected aplicarRecorte(r: Recorte) {
    this.recortando.set(false);
    this.rec.set(r);
    localStorage.setItem(ZOOM, String(r.zoom));
    this.http.put(api + '/foto/encuadre', { focalX: Math.round(r.focalX), focalY: Math.round(r.focalY) }).subscribe({ error: () => undefined });
  }

  private async render(d: StoryDatos) {
    this.ultimo = d;
    this.fallo.set('');
    this.anuncio.set(this.t().generando);
    try {
      const c = await componer(d);
      const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
      if (!b) throw new Error('png');
      if (d !== this.ultimo) return;
      this.blob = b;
      if (this.url()) URL.revokeObjectURL(this.url());
      this.url.set(URL.createObjectURL(b));
      this.alt.set(textoStory(d));
      this.anuncio.set(this.t().lista);
    } catch {
      this.fallo.set(this.t().noGenerar);
      this.anuncio.set('');
    }
  }

  protected reintentar() {
    if (this.ultimo) void this.render(this.ultimo);
  }

  private nombreFichero() {
    return this.formato() === 'sticker' ? 'sticker-cuenta-atras.png' : this.modo() === 'fecha' || this.enDirecto() ? 'story-fecha.png' : 'story-cuenta-atras.png';
  }

  protected async compartir() {
    if (!this.blob || this.busy()) return;
    this.busy.set(true);
    this.fallo.set('');
    const file = new File([this.blob], this.nombreFichero(), { type: 'image/png' });
    try {
      if (!navigator.canShare?.({ files: [file] })) return await this.descargar(true);
      await navigator.share({ files: [file], title: 'GRS Cup 2' });
      this.registrar('compartir');
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') this.fallo.set(this.t().noMenu);
    } finally {
      this.busy.set(false);
    }
  }

  protected async descargar(sinShare = false) {
    if (!this.url()) return;
    const a = document.createElement('a');
    a.href = this.url();
    a.download = this.nombreFichero();
    a.click();
    this.registrar('descarga');
    // one feedback channel (toast); the QR hand-off only makes sense on a computer (UX3-R1-13)
    const movil = matchMedia('(pointer: coarse)').matches;
    this.toasts.success(movil ? this.t().guardada : this.t().descargada + a.download);
    if (sinShare && !movil && !this.qr()) {
      const mod = await import('qrcode');
      const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
      this.qr.set(await QR.toDataURL(location.origin + this.i18n.path('/area-atleta/compartir'), { margin: 1, width: 176, errorCorrectionLevel: 'M' }));
    }
  }

  protected async pedirEnlace() {
    if (this.busy() || !this.email.trim()) return;
    this.busy.set(true);
    this.errorEnlace.set('');
    try {
      await firstValueFrom(this.http.post(api + '/enlace', { competicion: COMPETITION_SLUG, email: this.email.trim(), next: '/area-atleta/compartir' }));
      this.enviado.set(true);
    } catch (e) {
      this.errorEnlace.set(e instanceof HttpErrorResponse && e.status === 429 ? this.t().demasiados2 : this.t().noEnlace);
    } finally {
      this.busy.set(false);
    }
  }

  private registrar(canal: 'compartir' | 'descarga') {
    this.http.post(api + '/story/comparticiones', { modo: this.enDirecto() ? 'fecha' : this.modo(), formato: this.formato(), canal }).subscribe({ error: () => undefined });
  }
}

/** «-63» / «+120» / «63kg» → «−63 kg» / «+120 kg». */
const peso = (c: string) => (c ? c.replace(/kg$/i, '').trim().replace(/^-/, '−') + ' kg' : '—');
const dia = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00Z');
/** «Sábado 19 de diciembre de 2026» (Figma: no comma). */
const fechaLarga = (f: string, loc: string) => {
  if (!f) return '—';
  const s = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dia(f)).replace(',', '');
  return s[0].toUpperCase() + s.slice(1);
};
/** «19.12.26». */
const fechaCorta = (f: string) => (f ? f.slice(8, 10) + '.' + f.slice(5, 7) + '.' + f.slice(2, 4) : '');
/** «SÁBADO · PUERTAS 08:30». */
const detalle = (f: string, loc: string, pt: string, puertas?: string) =>
  f ? [new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(dia(f)).toUpperCase(), puertas ? pt + puertas : ''].filter(Boolean).join(' · ') : '';
