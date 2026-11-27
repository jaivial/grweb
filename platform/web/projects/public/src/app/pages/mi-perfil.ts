import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession, detalleError } from '../core/fan';
import { I18n } from '../core/i18n';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';

const T = {
  es: {
    titulo: 'Mi', acento: 'perfil', h1: 'Mi perfil',
    alias: 'Alias', email: 'Email', tipo: 'Tipo de cuenta', publico: 'Público', telefono: 'Teléfono',
    contrasena: 'Contraseña', contrasenaTexto: 'Te enviamos un email con un botón para elegir una contraseña nueva.',
    pedir: 'Solicitar cambio de contraseña',
    enviado: (e: string) => `Te hemos enviado un email a ${e}. El enlace caduca en 30 minutos y solo funciona una vez.`,
  },
  en: {
    titulo: 'My', acento: 'profile', h1: 'My profile',
    alias: 'Alias', email: 'Email', tipo: 'Account type', publico: 'Spectator', telefono: 'Phone',
    contrasena: 'Password', contrasenaTexto: 'We will email you a button to choose a new password.',
    pedir: 'Request a password change',
    enviado: (e: string) => `We have emailed ${e}. The link expires in 30 minutes and works only once.`,
  },
};

/** /mi-perfil: the público account (athletes have /area-atleta). Without a session it goes back home. */
@Component({
  selector: 'gr-mi-perfil-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [centrado]="true" [cabecera]="false">
      <h1 class="sr-only">{{ t().h1 }}</h1>
      <div class="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-line-subtle bg-bg-card p-6 shadow-card md:p-8">
        @if (fan.yo(); as yo) {
          <p class="font-display text-[28px] leading-tight uppercase italic">{{ t().h1 }}</p>
          <dl class="flex flex-col divide-y divide-line-subtle">
            <div class="flex justify-between gap-4 py-3"><dt class="text-body-s text-text-tertiary">{{ t().alias }}</dt><dd class="truncate text-label-m">{{ yo.alias }}</dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-body-s text-text-tertiary">{{ t().email }}</dt><dd class="truncate text-label-m">{{ yo.email }}</dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-body-s text-text-tertiary">{{ t().tipo }}</dt><dd class="text-label-m">{{ t().publico }}</dd></div>
            @if (yo.telefono) { <div class="flex justify-between gap-4 py-3"><dt class="text-body-s text-text-tertiary">{{ t().telefono }}</dt><dd class="text-label-m">{{ yo.telefono }}</dd></div> }
          </dl>
          <div class="flex flex-col gap-2 border-t border-line-subtle pt-4">
            <p class="text-label-s">{{ t().contrasena }}</p>
            <p class="text-body-s text-text-secondary">{{ t().contrasenaTexto }}</p>
            <button type="button" grButton variant="primary" size="l" [block]="true" icon="mail" class="mt-1" [loading]="enviando()" (click)="pedir(yo.email ?? '')">{{ t().pedir }}</button>
            <div aria-live="polite">
              @if (enviado()) { <p class="flex items-start gap-1.5 text-body-s text-success"><gr-icon name="check" [size]="16" />{{ t().enviado(yo.email ?? '') }}</p> }
              @if (error(); as e) { <p class="flex items-start gap-1.5 text-body-s text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="16" />{{ e }}</p> }
            </div>
          </div>
        } @else {
          <gr-skeleton class="h-8 w-40 rounded-sm" />
          <gr-skeleton class="h-40 w-full rounded-sm" />
        }
      </div>
    </gr-page>
  `,
})
export class MiPerfilPage {
  protected readonly fan = inject(FanSession);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.dict(T);
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(Seo).set({ title: this.t().h1, description: this.t().h1, path: '/mi-perfil', robots: 'noindex, nofollow' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.fan.cargar();
    // Logged out (here or from the navbar) or an athlete account: this page is not theirs.
    effect(() => {
      if (!this.fan.cargada()) return;
      const yo = this.fan.yo();
      if (!yo) void this.router.navigateByUrl(this.i18n.path('/'));
      else if (yo.tipo === 'atleta') void this.router.navigateByUrl(this.i18n.path('/area-atleta'));
    });
  }

  /** Same «¿Has olvidado tu contraseña?» link of the access dialog (no alias): one-use, 30 min. */
  protected async pedir(email: string): Promise<void> {
    if (this.enviando() || !email) return;
    this.enviando.set(true);
    this.enviado.set(false);
    this.error.set(null);
    try {
      await this.fan.pedirAcceso({ email, tipo: 'publico', alias: '', aceptaNormas: false, next: '' });
      this.enviado.set(true);
    } catch (e) {
      this.error.set(detalleError(e, this.i18n.lang()));
    } finally {
      this.enviando.set(false);
    }
  }
}
