import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrInput, type GrIconName } from '@grcup/ui';
import { FanSession, codigoError, detalleError, mensajeCampo } from '../../core/fan';
import { I18n, LocPipe } from '../../core/i18n';

type Estado = 'formulario' | 'enviado' | 'atleta';
type Modo = 'entrar' | 'crear' | 'recuperar';

const T = {
  es: {
    cerrar: 'Cerrar', enviadoA: 'Enviado a ', otroDispositivo: 'Puedes abrirlo en otro dispositivo: te lleva igualmente a la sala.',
    abreloComo: (atleta: boolean) => 'Ábrelo en este dispositivo para entrar como ' + (atleta ? 'ATLETA' : 'PÚBLICO') + '.',
    yaAbierto: 'Ya lo he abierto', otroEmail: 'Usar otro email', caduca: 'El enlace caduca en 30 min · máx. 5 enlaces por hora',
    noAtleta: 'No encontramos ningún atleta inscrito con ese email', usaEmail: 'Usa el email de tu inscripción en la AEP o entra como público: podrás chatear igual.',
    emailAep: 'Email con el que te inscribiste en la AEP *', emailInscripcion: 'Email de inscripción', insignia: 'La insignia «Atleta» solo se acredita con el email de inscripción.',
    comoPublico: 'Entrar como público', reintentarAtleta: 'Reintentar como atleta', comoFunciona: 'Cómo funciona', entrarOCrear: 'Entrar o crear cuenta',
    comoEntras: '¿Cómo entras?', telefono: 'Móvil (opcional)', telefonoAyuda: 'Para recibir los avisos del directo también por WhatsApp.', alias: 'Alias *', aliasPh: 'tu alias en el directo', aliasAyuda: '3–20 caracteres: letras, números, espacios o _ . -',
    email: 'Email *', emailPh: 'email@ejemplo.com', enlaceAyuda: 'Te enviamos un enlace para verificar tu email; al abrirlo eliges tu contraseña.',
    clave: 'Contraseña *', claveAria: 'Contraseña', ocultar: 'Ocultar', mostrar: 'Mostrar', olvido: '¿Has olvidado tu contraseña?',
    normasPart: 'Acepto las normas de participación de GRS Cup 2.', normasChat: 'Acepto las normas del chat: sin enlaces, sin insultos, sin spam.', marca: 'Marca la casilla para continuar.',
    entrar: 'Entrar', crear: 'Crear cuenta', enviarEnlace: 'Enviarme el enlace', volverEntrar: 'Volver a entrar',
    pieEntrar: 'Contraseña cifrada · sesión de 30 días', pieEnlace: 'Verificamos tu email · el enlace caduca en 30 min',
    gratis: 'Gratis', minuto: '1 minuto',
    atleta: 'Atleta', atletaD: 'Insignia ATLETA con tu email de la AEP', publico: 'Público', publicoD: 'Familia, clubs y afición',
    textos: {
      porra: ['Entra para jugar a la porra', 'Apuesta en la porra del directo con tu cuenta de GRS Cup.'],
      fantasy: ['Entra para jugar al GRS Fantasy', 'Crea tu equipo y compite en salas con tu cuenta de GRS Cup.'],
      chat: ['Entra al chat del directo', 'Chatea con el público y los atletas durante el directo.'],
      donar: ['Entra para donar', 'Tu donación aparece con tu alias en el directo.'],
    } as Record<string, [string, string]>,
    abreEmail: 'Abre el email de GRS Cup 2', pulsaInscripcion: 'Pulsa «Continuar la inscripción»', vuelvesInscripcion: 'Vuelves al formulario de inscripción',
    pulsaEnlace: 'Pulsa el enlace del email', vuelvesReserva: 'Vuelves a tu reserva con lo que ya has rellenado', vuelvesFicha: 'Vuelves a la ficha y le sigues sin repetir nada',
    vuelvesFormulario: 'Vuelves al formulario y lo envías', pulsaDirecto: 'Pulsa «Entrar al directo»', vuelvesSala: 'Vuelves a la sala con tu alias', vuelvesChat: 'Vuelves al chat con tu alias',
    revisa: 'Revisa tu correo', entrarAtleta: 'Entrar como atleta', creaClave: 'Crea o cambia tu contraseña', paraInscribirte: 'Entra para inscribirte', paraReservar: 'Entra para reservar',
    paraSeguir: 'Entra para seguir al atleta', paraSolicitud: 'Entra para enviar la solicitud', entrarDirecto: 'Entrar al directo',
    subRecuperarEnviado: 'Abre el enlace y elige tu contraseña nueva.', subEnviado: 'Abre el enlace para verificar tu email y elegir tu contraseña.',
    subRecuperar: 'Te enviamos un enlace a tu email: al abrirlo eliges la contraseña nueva. Sirve también para cuentas antiguas sin contraseña.',
    subAtleta: 'Comprobamos tu email contra la inscripción de la AEP.',
    subInscripcion: 'Necesitas tu cuenta de GRS Cup 2 para inscribirte. Vuelves al formulario con lo que ya has rellenado.',
    subEntradas: 'Tu entrada va asociada a tu cuenta de GRS Cup 2. Vuelves a la reserva con lo que ya has rellenado.',
    subFormulario: 'La solicitud va asociada a tu cuenta de GRS Cup 2. Vuelves al formulario para enviarla.',
    subSeguir: 'Sigue a tus atletas con tu cuenta de GRS Cup 2: te avisamos por email antes de que compitan.', subDef: 'Chatea, dona y juega con tu cuenta de directo.',
    errAlias: 'El alias debe tener entre 3 y 20 caracteres.', entrarConEmail: 'Entrar con este email', errEmail: 'Escribe un email válido.', errClave: 'Escribe tu contraseña.',
    crearAtleta: 'Crea tu cuenta de atleta aquí', crearAtletaAyuda: 'La cuenta de atleta se crea en el alta: eliges tu categoría y subes tus marcas.',
  },
  en: {
    cerrar: 'Close', enviadoA: 'Sent to ', otroDispositivo: 'You can open it on another device: it still takes you to the room.',
    abreloComo: (atleta: boolean) => 'Open it on this device to sign in as ' + (atleta ? 'ATHLETE' : 'SPECTATOR') + '.',
    yaAbierto: 'I have opened it', otroEmail: 'Use another email', caduca: 'The link expires in 30 min · max. 5 links per hour',
    noAtleta: 'We could not find any registered athlete with that email', usaEmail: 'Use the email of your AEP registration or sign in as a spectator: you can still chat.',
    emailAep: 'Email you registered with at the AEP *', emailInscripcion: 'Registration email', insignia: 'The «Athlete» badge is only granted with the registration email.',
    comoPublico: 'Sign in as a spectator', reintentarAtleta: 'Try again as an athlete', comoFunciona: 'How it works', entrarOCrear: 'Sign in or create an account',
    comoEntras: 'How are you joining?', telefono: 'Mobile (optional)', telefonoAyuda: 'To also get the live-stream notices on WhatsApp.', alias: 'Alias *', aliasPh: 'your alias in the live stream', aliasAyuda: '3–20 characters: letters, numbers, spaces or _ . -',
    email: 'Email *', emailPh: 'email@example.com', enlaceAyuda: 'We will send you a link to verify your email; when you open it you choose your password.',
    clave: 'Password *', claveAria: 'Password', ocultar: 'Hide', mostrar: 'Show', olvido: 'Forgotten your password?',
    normasPart: 'I accept the GRS Cup 2 participation rules.', normasChat: 'I accept the chat rules: no links, no insults, no spam.', marca: 'Tick the box to continue.',
    entrar: 'Sign in', crear: 'Create account', enviarEnlace: 'Send me the link', volverEntrar: 'Back to sign in',
    pieEntrar: 'Encrypted password · 30-day session', pieEnlace: 'We verify your email · the link expires in 30 min',
    gratis: 'Free', minuto: '1 minute',
    atleta: 'Athlete', atletaD: 'ATHLETE badge with your AEP email', publico: 'Spectator', publicoD: 'Family, clubs and fans',
    textos: {
      porra: ['Sign in to play the pool', 'Bet in the live pool with your GRS Cup account.'],
      fantasy: ['Sign in to play GRS Fantasy', 'Build your team and compete in rooms with your GRS Cup account.'],
      chat: ['Join the live chat', 'Chat with the crowd and the athletes during the live stream.'],
      donar: ['Sign in to donate', 'Your donation appears with your alias in the live stream.'],
    } as Record<string, [string, string]>,
    abreEmail: 'Open the GRS Cup 2 email', pulsaInscripcion: 'Tap «Continue registration»', vuelvesInscripcion: 'You return to the registration form',
    pulsaEnlace: 'Tap the link in the email', vuelvesReserva: 'You return to your booking with what you have already filled in', vuelvesFicha: 'You return to the profile and follow them without repeating anything',
    vuelvesFormulario: 'You return to the form and send it', pulsaDirecto: 'Tap «Join the live stream»', vuelvesSala: 'You return to the room with your alias', vuelvesChat: 'You return to the chat with your alias',
    revisa: 'Check your inbox', entrarAtleta: 'Sign in as an athlete', creaClave: 'Create or change your password', paraInscribirte: 'Sign in to register', paraReservar: 'Sign in to book',
    paraSeguir: 'Sign in to follow the athlete', paraSolicitud: 'Sign in to send the request', entrarDirecto: 'Join the live stream',
    subRecuperarEnviado: 'Open the link and choose your new password.', subEnviado: 'Open the link to verify your email and choose your password.',
    subRecuperar: 'We will send a link to your email: when you open it you choose the new password. It also works for old accounts without a password.',
    subAtleta: 'We check your email against the AEP registration.',
    subInscripcion: 'You need your GRS Cup 2 account to register. You return to the form with what you have already filled in.',
    subEntradas: 'Your ticket is linked to your GRS Cup 2 account. You return to the booking with what you have already filled in.',
    subFormulario: 'The request is linked to your GRS Cup 2 account. You return to the form to send it.',
    subSeguir: 'Follow your athletes with your GRS Cup 2 account: we will email you before they compete.', subDef: 'Chat, donate and play with your live account.',
    errAlias: 'The alias must be between 3 and 20 characters.', entrarConEmail: 'Sign in with this email', errEmail: 'Enter a valid email.', errClave: 'Enter your password.',
    crearAtleta: 'Create your athlete account here', crearAtletaAyuda: 'Athlete accounts are created in the sign-up: you pick your class and upload your marks.',
  },
};

/**
 * Modal global de acceso (Figma 70): «Entrar» con email y contraseña, o «Crear cuenta» (atleta o público, alias y email),
 * que manda un enlace para verificar el email; tras abrirlo, /acceso pide la contraseña. El título depende
 * del motivo con que se abre (porra, fantasy, chat, donar…).
 * Se monta una sola vez (en el layout) y se abre cuando `FanSession.accesoAbierto()` es true.
 */
@Component({
  selector: 'gr-acceso-modal',
  imports: [FormsModule, A11yModule, GrButton, GrIcon, GrInput, RouterLink, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes gr-velo { from { opacity: 0; } to { opacity: 1; } }
    @keyframes gr-sube { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
    @keyframes gr-aparece { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
    .gr-velo { animation: gr-velo 180ms ease-out both; }
    .gr-hoja { animation: gr-sube 260ms var(--ease-out-soft) both; }
    @media (min-width: 768px) { .gr-hoja { animation-name: gr-aparece; } }
    @media (prefers-reduced-motion: reduce) { .gr-velo, .gr-hoja { animation: none; } }
  `,
  template: `
    @if (fan.accesoAbierto()) {
      <div class="gr-velo fixed inset-0 z-[70] flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center md:px-4" (click)="cerrar()" (keydown.escape)="cerrar()">
        <div class="gr-hoja relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-xl border border-line-strong bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.5),transparent_240px)] px-5 pt-2.5 pb-7 shadow-card md:max-w-[440px] md:rounded-xl md:p-6"
          role="dialog" aria-modal="true" aria-labelledby="acceso-titulo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <span class="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden="true"></span>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 id="acceso-titulo" class="font-display text-[24px] leading-tight uppercase italic">{{ titulo() }}</h2>
              <p class="mt-1.5 text-body-s text-text-secondary">{{ subtitulo() }}</p>
            </div>
            <button type="button" class="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-subtle bg-bg-raised text-text-secondary hover:text-text-primary" [attr.aria-label]="t().cerrar" (click)="cerrar()"><gr-icon name="x" [size]="16" /></button>
          </div>

          @switch (estado()) {
            @case ('enviado') {
              <div class="mt-5 flex flex-col items-center gap-2.5 rounded-lg border border-line-subtle bg-bg-surface px-4 py-5 text-center">
                <span class="flex size-14 items-center justify-center rounded-full bg-accent-grain text-white shadow-glow"><gr-icon name="mail" [size]="24" /></span>
                <p class="text-label-s break-all text-text-primary">{{ t().enviadoA }}{{ email() }}</p>
                <p class="text-body-s text-text-secondary">{{ fan.destino() ? t().otroDispositivo : t().abreloComo(tipo() === 'atleta') }}</p>
              </div>
              <ol class="mt-4 flex flex-col gap-2.5">
                @for (p of pasos(); track p; let i = $index) {
                  <li class="flex items-center gap-2.5 text-body-s text-text-secondary"><span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/18 text-[12px] font-medium text-accent-text">{{ i + 1 }}</span>{{ p }}</li>
                }
              </ol>
              <div class="mt-5 flex flex-col gap-2">
                <button type="button" grButton variant="primary" size="l" [block]="true" (click)="cerrar()">{{ t().yaAbierto }}</button>
                <button type="button" grButton variant="outline" [block]="true" (click)="volver()">{{ t().otroEmail }}</button>
              </div>
              <p class="mt-3 flex items-center justify-center gap-1.5 text-center text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ t().caduca }}</p>
            }
            @case ('atleta') {
              <div class="mt-5 flex items-start gap-3 rounded-md border border-accent/50 bg-accent-deep/30 p-3" role="alert">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-text"><gr-icon name="circle-alert" [size]="16" /></span>
                <div class="min-w-0">
                  <p class="text-label-s text-accent-text">{{ error() || t().noAtleta }}</p>
                  <p class="mt-0.5 text-body-xs text-text-secondary">{{ t().usaEmail }}</p>
                </div>
              </div>
              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ t().emailAep }}</span>
                <input grInput grSize="l" type="email" autocomplete="email" class="mt-1.5" placeholder="carlos@otroclub.com" [attr.aria-label]="t().emailInscripcion" [invalid]="true" [ngModel]="email()" (ngModelChange)="email.set($event)" />
                <span class="mt-1.5 block text-body-xs text-text-tertiary">{{ t().insignia }}</span>
              </label>
              @if (modo() === 'crear') {
              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ t().telefono }}</span>
                <input grInput grSize="l" type="tel" autocomplete="tel" inputmode="tel" class="mt-1.5" placeholder="+34 600 123 456" [attr.aria-label]="t().telefono" [ngModel]="telefono()" (ngModelChange)="telefono.set($event)" />
                <span class="mt-1.5 block text-body-xs text-text-tertiary">{{ t().telefonoAyuda }}</span>
              </label>
              }
              <div class="mt-5 flex flex-col gap-2">
                <button type="button" grButton variant="primary" size="l" [block]="true" [loading]="enviando()" (click)="entrarComoPublico()">{{ t().comoPublico }}</button>
                <button type="button" grButton variant="outline" [block]="true" (click)="estado.set('formulario')">{{ t().reintentarAtleta }}</button>
              </div>
            }
            @default {
              <ul class="mt-4 flex flex-wrap gap-1.5" [attr.aria-label]="t().comoFunciona">
                @for (g of garantias(); track g.t) {
                  <li class="inline-flex h-6 items-center gap-1.5 rounded-pill border border-line-subtle bg-bg-raised pr-2 pl-1.5 font-mono text-[11px] tracking-[0.08em] text-text-secondary uppercase"><gr-icon [name]="g.i" [size]="12" class="text-success" />{{ g.t }}</li>
                }
              </ul>

              @if (modo() !== 'recuperar') {
              <div class="mt-5 grid grid-cols-2 gap-1 rounded-md border border-line-subtle bg-bg-surface p-1" role="tablist" [attr.aria-label]="t().entrarOCrear">
                @for (m of modos(); track m.v) {
                  <button type="button" role="tab" [attr.aria-selected]="modo() === m.v" class="min-h-11 rounded-sm text-label-s transition-colors"
                    [class]="modo() === m.v ? 'bg-bg-raised text-text-primary shadow-card' : 'text-text-secondary hover:text-text-primary'" (click)="cambiarModo(m.v)">{{ m.l }}</button>
                }
              </div>
              }

              @if (modo() === 'crear') {
              <!-- atleta o público -->
              @if (!inscripcion()) {
              <p class="mt-5 text-label-s text-text-primary" id="acceso-tipo">{{ t().comoEntras }}</p>
              <div class="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="acceso-tipo">
                @for (o of tipos(); track o.v) {
                  <button type="button" role="radio" [attr.aria-checked]="tipo() === o.v" class="flex flex-col gap-1.5 rounded-md border p-3 text-left transition-[border-color,background]"
                    [class]="tipo() === o.v ? 'border-accent bg-accent-deep/28 ring-1 ring-accent/40' : 'border-line-strong bg-bg-surface hover:border-text-muted'" (click)="tipo.set(o.v)">
                    <span class="flex w-full items-center gap-2">
                      <span class="flex size-7 shrink-0 items-center justify-center rounded-full" [class]="tipo() === o.v ? 'bg-accent/25 text-accent-text' : 'bg-bg-raised text-text-secondary'"><gr-icon [name]="o.i" [size]="14" /></span>
                      <span class="flex-1 text-label-s text-text-primary">{{ o.l }}</span>
                      <span class="size-[18px] shrink-0 rounded-full" [class]="tipo() === o.v ? 'border-[5px] border-accent' : 'border-[1.5px] border-line-strong'" aria-hidden="true"></span>
                    </span>
                    <span class="text-body-xs text-text-tertiary">{{ o.d }}</span>
                  </button>
                }
              </div>
              }

              @if (!crearAtleta()) {
              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ t().alias }}</span>
                <input grInput grSize="l" type="text" autocomplete="nickname" class="mt-1.5" [placeholder]="t().aliasPh" aria-label="Alias" [invalid]="!!errorAlias()" [ngModel]="alias()" (ngModelChange)="alias.set($event); errorAlias.set(null)" (blur)="comprobar()" />
                @if (errorAlias(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @else { <span class="mt-1.5 block text-body-xs text-text-tertiary">{{ t().aliasAyuda }}</span> }
              </label>
              }
              }

              @if (!crearAtleta()) {
              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ t().email }}</span>
                <input grInput grSize="l" type="email" autocomplete="email" class="mt-1.5" [placeholder]="t().emailPh" aria-label="Email" [invalid]="!!error()" [ngModel]="email()" (ngModelChange)="email.set($event); limpiarEmailRegistrado()" (blur)="comprobar()" />
                @if (error(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @if (emailRegistrado()) { <button type="button" class="mt-1 min-h-11 text-body-s text-accent-text underline-offset-4 hover:underline" (click)="cambiarModo('entrar')">{{ t().entrarConEmail }}</button> }
                @else if (modo() !== 'entrar') { <span class="mt-1.5 block text-body-xs text-text-tertiary">{{ t().enlaceAyuda }}</span> }
              </label>
              }

              @if (modo() === 'entrar') {
              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ t().clave }}</span>
                <span class="relative mt-1.5 block">
                  <input grInput grSize="l" [type]="verClave() ? 'text' : 'password'" autocomplete="current-password" class="pr-24" placeholder="••••••••" [attr.aria-label]="t().claveAria" [invalid]="!!errorClave()" [ngModel]="clave()" (ngModelChange)="clave.set($event)" (keydown.enter)="enviar()" />
                  <button type="button" class="absolute inset-y-0 right-1 my-auto flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-body-xs text-text-secondary hover:text-text-primary" [attr.aria-pressed]="verClave()" (click)="verClave.set(!verClave())"><gr-icon name="eye" [size]="14" />{{ verClave() ? t().ocultar : t().mostrar }}</button>
                </span>
                @if (errorClave(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
              </label>
                <button type="button" class="mt-2 min-h-11 text-body-s text-accent-text underline-offset-4 hover:underline" (click)="cambiarModo('recuperar')">{{ t().olvido }}</button>
              }

              @if (modo() === 'crear' && !crearAtleta()) {
              <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" class="size-5 shrink-0 accent-[#c42b3e]" [ngModel]="normas()" (ngModelChange)="normas.set($event)" />
                <span class="text-body-s text-text-secondary">{{ inscripcion() || entradas() || seguir() || formulario() ? t().normasPart : t().normasChat }}</span>
              </label>
              @if (errorNormas()) { <span class="mt-1 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ t().marca }}</span> }
              }

              @if (crearAtleta()) {
              <!-- La cuenta de atleta se crea en el alta: aquí solo se ofrece el enlace (no hay alias ni email) -->
              <p class="mt-5 text-body-s text-text-secondary">{{ t().crearAtletaAyuda }}</p>
              <a grButton variant="primary" size="l" [block]="true" class="mt-3" [routerLink]="'/alta-atleta' | loc" (click)="cerrar()">{{ t().crearAtleta }}</a>
              } @else {
              <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-4" [loading]="enviando()" (click)="enviar()">{{ modo() === 'entrar' ? t().entrar : modo() === 'crear' ? t().crear : t().enviarEnlace }}</button>
              @if (modo() === 'recuperar') {
                <button type="button" grButton variant="outline" [block]="true" class="mt-2" (click)="cambiarModo('entrar')">{{ t().volverEntrar }}</button>
              }
              <p class="mt-3 flex items-center justify-center gap-1.5 text-center text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />{{ modo() === 'entrar' ? t().pieEntrar : t().pieEnlace }}</p>
              }
            }
          }
        </div>
      </div>
    }
  `,
})
export class AccesoModal {
  protected readonly fan = inject(FanSession);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);

  private readonly router = inject(Router);
  protected readonly estado = signal<Estado>('formulario');
  protected readonly modo = signal<Modo>('entrar');
  protected readonly clave = signal('');
  protected readonly verClave = signal(false);
  protected readonly errorClave = signal<string | null>(null);
  protected readonly tipo = signal<'atleta' | 'publico'>('publico');
  protected readonly alias = signal('');
  protected readonly email = signal('');
  protected readonly normas = signal(false);
  protected readonly telefono = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly errorAlias = signal<string | null>(null);
  /** /disponible (or /acceso) said the email already has an account: offers «Entrar con este email». */
  protected readonly emailRegistrado = signal(false);
  protected readonly errorNormas = signal(false);
  protected readonly enviando = signal(false);

  protected readonly garantias = computed<{ i: GrIconName; t: string }[]>(() => [
    { i: 'check', t: this.t().gratis },
    { i: 'clock', t: this.t().minuto },
  ]);
  protected readonly tipos = computed<{ v: 'atleta' | 'publico'; l: string; d: string; i: GrIconName }[]>(() => [
    { v: 'atleta', l: this.t().atleta, d: this.t().atletaD, i: 'trophy' },
    { v: 'publico', l: this.t().publico, d: this.t().publicoD, i: 'users' },
  ]);
  protected readonly modos = computed<{ v: Modo; l: string }[]>(() => [
    { v: 'entrar', l: this.t().entrar },
    { v: 'crear', l: this.t().crear },
  ]);
  /** Title and subtitle of each place that opens the modal (motivo of `abrirAcceso`). */
  private readonly textos = computed(() => this.t().textos);
  protected readonly inscripcion = computed(() => this.fan.motivoAcceso() === 'inscripcion');
  /** Creating an account as athlete: the account is made in /alta-atleta, so the alias and email fields are not shown. */
  protected readonly crearAtleta = computed(() => this.modo() === 'crear' && this.tipo() === 'atleta');
  protected readonly entradas = computed(() => this.fan.motivoAcceso() === 'entradas');
  protected readonly seguir = computed(() => this.fan.motivoAcceso() === 'seguir');
  protected readonly formulario = computed(() => this.fan.motivoAcceso() === 'formulario');
  protected readonly pasos = computed(() => {
    const t = this.t();
    return [t.abreEmail,
      ...(this.inscripcion() ? [t.pulsaInscripcion, t.vuelvesInscripcion] : this.entradas() ? [t.pulsaEnlace, t.vuelvesReserva]
        : this.seguir() ? [t.pulsaEnlace, t.vuelvesFicha] : this.formulario() ? [t.pulsaEnlace, t.vuelvesFormulario] : [t.pulsaDirecto, this.fan.destino() ? t.vuelvesSala : t.vuelvesChat])];
  });

  protected readonly titulo = computed(() => {
    const t = this.t();
    return this.estado() === 'enviado' ? t.revisa : this.estado() === 'atleta' ? t.entrarAtleta : this.modo() === 'recuperar' ? t.creaClave
      : this.textos()[this.fan.motivoAcceso() ?? '']?.[0] ?? (this.inscripcion() ? t.paraInscribirte : this.entradas() ? t.paraReservar : this.seguir() ? t.paraSeguir : this.formulario() ? t.paraSolicitud : t.entrarDirecto);
  });
  protected readonly subtitulo = computed(() => {
    const t = this.t();
    if (this.estado() === 'enviado') return this.modo() === 'recuperar' ? t.subRecuperarEnviado : t.subEnviado;
    if (this.modo() === 'recuperar') return t.subRecuperar;
    if (this.estado() === 'atleta') return t.subAtleta;
    return this.inscripcion() ? t.subInscripcion : this.entradas() ? t.subEntradas
      : this.formulario() ? t.subFormulario
      : this.seguir() ? t.subSeguir : this.textos()[this.fan.motivoAcceso() ?? '']?.[1] ?? t.subDef;
  });
  protected readonly puedeEnviar = computed(() => this.email().includes('@') && (this.modo() !== 'entrar' || this.clave().length > 0)
    && (this.modo() !== 'crear' || (this.alias().trim().length >= 3 && this.alias().trim().length <= 20 && this.normas())));

  constructor() {
    // The modal opens on every request of access: it always starts clean.
    effect(() => {
      if (!this.fan.accesoAbierto()) return;
      this.estado.set('formulario');
      this.modo.set('entrar');
      this.clave.set('');
      this.verClave.set(false);
      this.errorClave.set(null);
      // Always preselect «Público» (U10-R2-2); registering has no athlete yet, so it stays público.
      this.tipo.set('publico');
      if (this.fan.emailAcceso()) this.email.set(this.fan.emailAcceso());
      this.error.set(null);
      this.errorAlias.set(null);
      this.errorNormas.set(false);
      this.emailRegistrado.set(false);
    });
  }

  protected cerrar(): void {
    this.fan.cerrarAcceso();
  }

  protected cambiarModo(m: Modo): void {
    this.modo.set(m);
    this.clave.set('');
    this.error.set(null);
    this.emailRegistrado.set(false);
    this.errorAlias.set(null);
    this.errorClave.set(null);
    this.errorNormas.set(false);
  }

  protected limpiarEmailRegistrado(): void {
    if (!this.emailRegistrado()) return;
    this.emailRegistrado.set(false);
    this.error.set(null);
  }

  /**
   * Account creation: asks /disponible whether the alias and the email are free and puts the answer under each
   * field (on blur and before sending the link). Returns false when something is taken or invalid. A network
   * error does not block: /acceso checks the same again.
   */
  protected async comprobar(): Promise<boolean> {
    if (this.modo() !== 'crear') return true;
    const alias = this.alias().trim();
    const email = this.email().trim();
    const b = { ...(alias.length >= 3 ? { alias } : {}), ...(email.includes('@') ? { email } : {}), tipo: this.tipo() };
    if (!b.alias && !b.email) return true;
    try {
      const r = await this.fan.disponible(b);
      // the answer is for these values and this form: ignore it if the user kept typing or left «Crear cuenta»
      // meanwhile (e.g. «Entrar con este email»: its click blurs the alias field and starts a check)
      if (this.modo() !== 'crear' || this.alias().trim() !== alias || this.email().trim() !== email) return true;
      if (r.alias && !r.alias.libre) this.errorAlias.set(mensajeCampo(r.alias));
      if (r.email && !r.email.libre) { this.error.set(mensajeCampo(r.email)); this.emailRegistrado.set(true); }
      return (!r.alias || r.alias.libre) && (!r.email || r.email.libre);
    } catch {
      return true;
    }
  }

  protected volver(): void {
    this.estado.set('formulario');
    this.email.set('');
    this.error.set(null);
  }

  protected async enviar(): Promise<void> {
    if (this.enviando()) return;
    if (!this.puedeEnviar()) {
      // Field errors instead of a silent no-op (U10-R2-2).
      const crear = this.modo() === 'crear';
      const a = this.alias().trim().length;
      this.errorAlias.set(crear && (a < 3 || a > 20) ? this.t().errAlias : null);
      this.error.set(this.email().includes('@') ? null : this.t().errEmail);
      const c = this.clave().length;
      this.errorClave.set(this.modo() === 'entrar' && c === 0 ? this.t().errClave : null);
      this.errorNormas.set(crear && !this.normas());
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.emailRegistrado.set(false);
    this.errorAlias.set(null);
    this.errorClave.set(null);
    this.errorNormas.set(false);
    try {
      if (this.modo() === 'entrar') {
        await this.fan.entrar(this.email().trim(), this.clave());
        const v = this.fan.volverA();
        const volverA = v ? this.i18n.path(v) : null;
        this.cerrar();
        // Porra, fantasy and «mis apuestas» load their data once: re-enter the page so they load it with the session.
        if (volverA && volverA !== this.router.url) await this.router.navigateByUrl(volverA);
        else location.reload();
        return;
      }
      const crear = this.modo() === 'crear';
      if (crear && !(await this.comprobar())) return;
      await this.fan.pedirAcceso({ email: this.email().trim(), tipo: crear ? this.tipo() : 'publico', alias: crear ? this.alias().trim() : '',
        aceptaNormas: crear && this.normas(), next: this.fan.volverA() ?? undefined, ...(crear && this.telefono().trim() ? { telefono: this.telefono().trim() } : {}) });
      this.estado.set('enviado');
    } catch (e) {
      const codigo = codigoError(e);
      if (codigo === 'CREDENCIALES_INVALIDAS') this.errorClave.set(detalleError(e));
      else if (codigo === 'ALIAS_NO_VALIDO' || codigo === 'ALIAS_OCUPADO') this.errorAlias.set(detalleError(e));
      else if (codigo === 'EMAIL_REGISTRADO') { this.error.set(detalleError(e)); this.emailRegistrado.set(true); }
      else if (codigo === 'ATLETA_NO_ENCONTRADO') {
        this.estado.set('atleta');
        this.error.set(this.t().noAtleta);
      } else this.error.set(detalleError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  /** From the «atleta no encontrado» state: the same email enters as público. */
  protected async entrarComoPublico(): Promise<void> {
    this.tipo.set('publico');
    const anterior = this.estado();
    this.estado.set('formulario');
    await this.enviar();
    if (this.estado() !== 'enviado') this.estado.set(anterior);
  }
}
