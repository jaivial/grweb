import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrInput, GrSkeleton } from '@grcup/ui';
import { Cuenta } from '../core/cuenta';
import { FanSession, codigoError, detalleError } from '../core/fan';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';

const T = {
  es: {
    titulo: 'Nueva', acento: 'contraseña', h1: 'Restablecer contraseña',
    comprobando: 'Comprobando tu enlace…',
    elige: 'Elige tu nueva contraseña', texto: 'A partir de ahora entras con tu email y esta contraseña.',
    nueva: 'Contraseña nueva *', repite: 'Repite la contraseña *', minimo: 'Mínimo 8 caracteres. Se guarda cifrada.',
    guardar: 'Guardar contraseña', corta: 'La contraseña debe tener al menos 8 caracteres.', distintas: 'Las contraseñas no coinciden.',
    listo: 'Contraseña actualizada', listoTexto: 'Ya puedes entrar con tu email y la contraseña nueva.', perfil: 'Ir a mi perfil',
    noValido: 'No hemos podido validar el enlace', caducado: 'El enlace ha caducado o ya se usó. Pide uno nuevo desde «¿Has olvidado tu contraseña?».',
    pedirOtro: 'Pedir un enlace nuevo', caduca: 'Cada enlace sirve una vez y caduca en 30 min',
  },
  en: {
    titulo: 'New', acento: 'password', h1: 'Reset password',
    comprobando: 'Checking your link…',
    elige: 'Choose your new password', texto: 'From now on you sign in with your email and this password.',
    nueva: 'New password *', repite: 'Repeat the password *', minimo: 'At least 8 characters. Stored encrypted.',
    guardar: 'Save password', corta: 'The password must be at least 8 characters long.', distintas: 'The passwords do not match.',
    listo: 'Password updated', listoTexto: 'You can now sign in with your email and the new password.', perfil: 'Go to my profile',
    noValido: 'We couldn’t validate the link', caducado: 'The link has expired or has already been used. Request a new one from «Forgot your password?».',
    pedirOtro: 'Request a new link', caduca: 'Each link works once and expires in 30 min',
  },
};

/**
 * /restablecer-contrasena?token=…: the button of the «Crea tu nueva contraseña» email. Redeeming the one-use token
 * (30 min) proves the email and opens a 30-minute window to replace the password (PUT /fans/yo/contrasena).
 */
@Component({
  selector: 'gr-restablecer-contrasena-page',
  imports: [FormsModule, RouterLink, LocPipe, Page, GrButton, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [centrado]="true" [cabecera]="false">
      <h1 class="sr-only">{{ t().h1 }}</h1>
      <div class="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-line-subtle bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.45),transparent_220px)] shadow-card" aria-live="polite">
        <div class="flex flex-col items-center gap-3 px-6 pt-9 pb-8 text-center md:px-8">
          @if (estado() === 'cargando') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/45 bg-accent-deep/40 text-accent-text"><gr-icon name="loader" [size]="26" [spin]="true" /></span>
            <p class="text-body-s text-text-secondary">{{ t().comprobando }}</p>
            <gr-skeleton class="mt-2 h-11 w-full rounded-sm" />
          } @else if (estado() === 'error') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text"><gr-icon name="circle-alert" [size]="28" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().noValido }}</p>
            <p class="text-body-s text-text-secondary">{{ error() }}</p>
            <button type="button" grButton variant="primary" size="l" [block]="true" icon="mail" class="mt-3" (click)="fan.abrirAcceso()">{{ t().pedirOtro }}</button>
            <p class="mt-1 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ t().caduca }}</p>
          } @else if (estado() === 'clave') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/45 bg-accent-deep/40 text-accent-text"><gr-icon name="lock" [size]="26" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().elige }}</p>
            <p class="text-body-s text-text-secondary">{{ t().texto }}</p>
            <label class="mt-2 block w-full text-left">
              <span class="text-label-s text-text-primary">{{ t().nueva }}</span>
              <input grInput grSize="l" type="password" autocomplete="new-password" class="mt-1.5" placeholder="••••••••" [invalid]="!!errorClave()" [ngModel]="clave()" (ngModelChange)="clave.set($event)" />
            </label>
            <label class="block w-full text-left">
              <span class="text-label-s text-text-primary">{{ t().repite }}</span>
              <input grInput grSize="l" type="password" autocomplete="new-password" class="mt-1.5" placeholder="••••••••" [invalid]="!!errorClave()" [ngModel]="repite()" (ngModelChange)="repite.set($event)" (keydown.enter)="guardar()" />
              @if (errorClave(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
              @else { <span class="mt-1.5 block text-body-xs text-text-tertiary">{{ t().minimo }}</span> }
            </label>
            <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-2" [loading]="guardando()" (click)="guardar()">{{ t().guardar }}</button>
          } @else {
            <span class="flex size-16 items-center justify-center rounded-full border-2 border-success/50 bg-success/14 text-success shadow-[0_0_28px_rgb(34_197_94/0.35)]"><gr-icon name="check" [size]="30" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().listo }}</p>
            <p class="text-body-s text-text-secondary">{{ t().listoTexto }}</p>
            <a grButton variant="primary" size="l" [block]="true" [routerLink]="cuenta.perfil() | loc" iconRight="arrow-right" class="mt-2">{{ t().perfil }}</a>
          }
        </div>
      </div>
    </gr-page>
  `,
})
export class RestablecerContrasenaPage {
  protected readonly fan = inject(FanSession);
  protected readonly cuenta = inject(Cuenta);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly estado = signal<'cargando' | 'error' | 'clave' | 'ok'>('cargando');
  protected readonly error = signal('');
  protected readonly clave = signal('');
  protected readonly repite = signal('');
  protected readonly errorClave = signal<string | null>(null);
  protected readonly guardando = signal(false);

  constructor() {
    inject(Seo).set({ title: this.t().h1, description: this.t().h1, path: '/restablecer-contrasena', robots: 'noindex, nofollow' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
    if (!token) {
      this.fallo(this.t().caducado);
      return;
    }
    void this.fan.canjear(token).then(
      () => this.estado.set('clave'),
      (e) => {
        const c = codigoError(e);
        this.fallo(c === 'ENLACE_INVALIDO' || c === 'VALIDACION' || /^HTTP_4/.test(c) ? this.t().caducado : detalleError(e, this.i18n.lang()));
      },
    );
  }

  private fallo(msg: string): void {
    this.error.set(msg);
    this.estado.set('error');
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.clave().length < 8) return this.errorClave.set(this.t().corta);
    if (this.clave() !== this.repite()) return this.errorClave.set(this.t().distintas);
    this.guardando.set(true);
    this.errorClave.set(null);
    try {
      await this.fan.fijarContrasena(this.clave());
      this.clave.set('');
      this.repite.set('');
      this.estado.set('ok');
    } catch (e) {
      this.errorClave.set(detalleError(e, this.i18n.lang()));
    } finally {
      this.guardando.set(false);
    }
  }
}
