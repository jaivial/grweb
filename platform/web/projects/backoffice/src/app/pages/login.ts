import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrField, GrIconTile, GrInput, GrLogo } from '@grcup/ui';
import { Auth } from '../core/auth';
import { problemOf } from '../core/api';

/** Split brand panel used by every access screen (Figma «Login · escritorio»). */
@Component({
  selector: 'bo-access-layout',
  imports: [GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-2' },
  template: `
    <section class="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-24" style="background: radial-gradient(120% 90% at 0% 0%, #5a1520 0%, #2a0d12 45%, #160b0d 100%)">
      <div class="grain-acento absolute inset-0 opacity-60"></div>
      <div class="relative max-w-xl">
        <gr-logo [height]="60" />
        <p class="mt-6 text-mono-xs text-text-secondary">Backoffice</p>
        <h1 class="mt-4 text-display-l italic">Todo el evento en un solo sitio</h1>
        <p class="mt-6 text-body-l text-text-secondary">Atletas y horarios, entradas gratuitas, sorteo, directo, web y comunicación. Con permisos por rol y registro de cada cambio.</p>
        <img src="/img/trofeo-acento.webp" alt="" class="mt-10 h-48 w-auto select-none" draggable="false" />
      </div>
    </section>
    <section class="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
      <div class="mb-8 lg:hidden"><gr-logo [height]="48" /></div>
      <ng-content />
      <p class="mt-6 text-center text-body-xs text-text-muted">¿Problemas para entrar? admin&#64;grstrength.com</p>
    </section>
  `,
})
export class AccessLayout {}

@Component({
  selector: 'bo-login',
  imports: [FormsModule, AccessLayout, GrButton, GrField, GrInput, GrIconTile, GrAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bo-access-layout>
      <div class="w-full max-w-[400px] rounded-xl border border-line-subtle bg-bg-card p-6 shadow-card sm:p-8">
        <div class="flex items-center gap-3">
          <gr-icon-tile icon="lock" tone="accent" />
          <div>
            <h1 class="text-ui-h4">{{ sent() ? 'Revisa tu email' : mode() === 'password' ? 'Entrar al backoffice' : 'Enlace de acceso' }}</h1>
            <p class="text-body-xs text-text-tertiary">GR Cup · FER · multi-competición</p>
          </div>
        </div>

        @if (sent()) {
          <!-- Figma 51 «Acceso · estados» · enlace enviado (202) -->
          <p class="mt-6 text-body-s text-text-secondary">Hemos enviado un enlace de acceso a <strong class="text-text-primary">{{ email }}</strong>. Caduca en 15 minutos y solo sirve una vez.</p>
          <div class="mt-6 flex flex-col gap-3">
            <a grButton variant="primary" [block]="true" icon="mail" href="https://mail.google.com/" target="_blank" rel="noopener">Abrir Gmail</a>
            <button grButton variant="ghost" type="button" [block]="true" [disabled]="espera() > 0" [loading]="busy()" (click)="submit()">¿No llega? {{ espera() > 0 ? 'Reenviar en ' + mmss(espera()) : 'Reenviar enlace' }}</button>
          </div>
        } @else {
        @if (error()) {
          <gr-alert class="mt-5" tone="danger" [title]="errorTitle()">{{ error() }}</gr-alert>
        }

        <form class="mt-6 flex flex-col gap-4" (ngSubmit)="submit()" novalidate>
          <gr-field label="Email" for="email" [error]="emailError()">
            <input grInput id="email" name="email" type="email" autocomplete="username" inputmode="email" required [(ngModel)]="email" [invalid]="!!emailError() || !!fieldError()" />
          </gr-field>
          @if (mode() === 'password') {
            <gr-field label="Contraseña" for="password" [error]="fieldError()">
              <input grInput id="password" name="password" type="password" autocomplete="current-password" required [(ngModel)]="password" [invalid]="!!fieldError()" />
            </gr-field>
            <!-- Figma 51 (mobile): the link drops under the box when there is no room -->
            <div class="flex flex-wrap items-center justify-between gap-x-2">
              <label class="flex min-h-11 items-center gap-2 text-body-s whitespace-nowrap text-text-secondary md:min-h-0">
                <input type="checkbox" name="recordar" [(ngModel)]="recordar" class="size-5 rounded-2xs accent-[#C42B3E]" />Recordarme 30 días
              </label>
              <button type="button" class="min-h-11 text-left text-label-s text-accent-text hover:underline md:min-h-0" (click)="setMode('magic')">¿Olvidaste la contraseña?</button>
            </div>
            <button grButton variant="primary" type="submit" [block]="true" [loading]="busy()" [disabled]="bloqueo() > 0">Entrar</button>
            <div class="flex items-center gap-3 text-body-xs text-text-muted"><span class="h-px flex-1 bg-line-subtle"></span>o<span class="h-px flex-1 bg-line-subtle"></span></div>
            <button grButton type="button" [block]="true" class="h-auto! min-h-11 py-2 whitespace-normal! md:min-h-10" (click)="setMode('magic')">Recibir enlace mágico por email</button>
          } @else {
            <button grButton variant="primary" type="submit" [block]="true" [loading]="busy()" icon="mail">Enviar enlace</button>
            <button grButton variant="ghost" type="button" [block]="true" (click)="setMode('password')">Entrar con contraseña</button>
          }
        </form>
        }
      </div>
    </bo-access-layout>
  `,
})
export class LoginPage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  readonly siguiente = input<string>('');
  readonly error_ = input<string>('', { alias: 'error' });
  protected email = '';
  protected password = '';
  protected recordar = true;
  protected readonly mode = signal<'password' | 'magic'>('password');
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly errorCode = signal('');
  protected readonly errorText = signal('');
  protected readonly error = computed(() => this.errorText() || (this.error_() === 'enlace-caducado' ? 'El enlace ha caducado o ya se usó. Pide uno nuevo.' : ''));
  protected readonly errorTitle = computed(() =>
    this.errorCode() === 'DEMASIADAS_PETICIONES' ? `Acceso bloqueado ${this.bloqueoMin()} min (429)` : this.errorCode() === 'CREDENCIALES_INVALIDAS' || this.errorCode() === 'NO_AUTENTICADO' ? 'Email o contraseña incorrectos' : 'No se pudo entrar',
  );
  protected readonly fieldError = computed(() => (this.errorCode() === 'CREDENCIALES_INVALIDAS' ? 'Email o contraseña incorrectos.' : null));
  protected readonly emailError = signal<string | null>(null);
  /** Seconds left of the 429 lock (Retry-After) and of the magic-link resend cooldown. */
  protected readonly bloqueo = signal(0);
  protected readonly bloqueoMin = signal(1);
  protected readonly espera = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected mmss(s: number): string {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private tick(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.bloqueo.update((v) => Math.max(0, v - 1));
      this.espera.update((v) => Math.max(0, v - 1));
      if (!this.bloqueo() && !this.espera()) clearInterval(this.timer);
    }, 1000);
  }

  protected setMode(m: 'password' | 'magic'): void {
    this.mode.set(m);
    this.errorText.set('');
    this.errorCode.set('');
    this.emailError.set(null);
    this.sent.set(false);
  }

  protected async submit(): Promise<void> {
    const email = this.email.trim();
    this.emailError.set(!email ? 'Escribe tu email' : !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) ? 'Falta el dominio (.com, .es…)' : null);
    if (this.emailError()) return;
    this.busy.set(true);
    this.errorText.set('');
    this.errorCode.set('');
    try {
      if (this.mode() === 'magic') {
        await this.auth.magicLink(email, this.siguiente());
        this.sent.set(true);
        this.espera.set(60);
        this.tick();
        return;
      }
      await this.auth.login(email, this.password, this.recordar);
      await this.router.navigateByUrl(this.siguiente() || '/');
    } catch (e) {
      const p = problemOf(e);
      this.sent.set(false);
      this.errorCode.set(p.code);
      if (p.code === 'DEMASIADAS_PETICIONES') {
        const s = Number((e as HttpErrorResponse).headers?.get('Retry-After')) || 60;
        const hasta = new Date(Date.now() + s * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        this.bloqueo.set(s);
        this.bloqueoMin.set(Math.ceil(s / 60));
        this.tick();
        this.errorText.set(`Demasiados intentos desde esta IP. Usa el enlace mágico o espera a las ${hasta}.`);
      } else {
        this.errorText.set(p.code === 'CREDENCIALES_INVALIDAS' ? 'Revisa el email y la contraseña. Tras varios intentos fallidos el acceso se bloquea unos minutos.' : p.detail ?? 'No se pudo entrar.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}

/** Figma «Sesión caducada». */
@Component({
  selector: 'bo-session-expired',
  imports: [AccessLayout, GrButton, GrIconTile, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bo-access-layout>
      <div class="w-full max-w-[400px] rounded-xl border border-line-subtle bg-bg-card p-8 text-center shadow-card">
        <div class="flex justify-center"><gr-icon-tile icon="clock" tone="warning" /></div>
        <h1 class="mt-4 text-ui-h4">Tu sesión ha caducado</h1>
        <p class="mt-2 text-body-s text-text-tertiary">Por seguridad cerramos la sesión tras un tiempo sin actividad o si se cerró desde otro dispositivo. Los cambios guardados no se han perdido.</p>
        <a grButton variant="primary" class="mt-6" [block]="true" [routerLink]="['/login']" [queryParams]="{ siguiente: siguiente() }">Volver a entrar</a>
      </div>
    </bo-access-layout>
  `,
})
export class SessionExpiredPage {
  readonly siguiente = input('');
}
