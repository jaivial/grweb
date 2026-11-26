import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrInput, GrSkeleton } from '@grcup/ui';
import { DESTINO_INTERNO, FanSession, codigoError, detalleError } from '../core/fan';
import { I18n, LocPipe } from '../core/i18n';
import { Page } from '../layout/page';
import { Seo } from '../core/seo';

const T = {
  es: {
    titulo: 'Acceso', acento: 'al directo', h1: 'Acceso al directo',
    entrando: 'Entrando…', comprobando: 'Estamos comprobando tu enlace mágico.',
    noEntrar: 'No hemos podido entrar', pedirOtro: 'Pedir un enlace nuevo', irDirecto: 'Ir al directo',
    caduca: 'Cada enlace sirve una vez y caduca en 30 min',
    elige: 'Elige tu contraseña', verificado: 'Email verificado. A partir de ahora entras con tu email y esta contraseña.',
    nueva: 'Contraseña nueva *', nuevaAria: 'Contraseña nueva', minimo: 'Mínimo 8 caracteres. Se guarda cifrada.',
    guardar: 'Guardar y continuar', dentro: '¡Ya estás dentro!',
    alDirecto: 'Te llevamos al directo', deVuelta: 'Te llevamos de vuelta', conAlias: 'con tu alias', continuar: 'Continuar',
    noValido: 'Este enlace no es válido. Pide uno nuevo y entra en un minuto.',
    caducado: 'El enlace ha caducado o ya se usó. Pide uno nuevo y entra en un minuto.',
    corta: 'La contraseña debe tener al menos 8 caracteres.',
  },
  en: {
    titulo: 'Access', acento: 'to the live', h1: 'Access to the live stream',
    entrando: 'Signing in…', comprobando: 'We are checking your magic link.',
    noEntrar: 'We couldn’t sign you in', pedirOtro: 'Request a new link', irDirecto: 'Go to the live stream',
    caduca: 'Each link works once and expires in 30 min',
    elige: 'Choose your password', verificado: 'Email verified. From now on you sign in with your email and this password.',
    nueva: 'New password *', nuevaAria: 'New password', minimo: 'At least 8 characters. Stored encrypted.',
    guardar: 'Save and continue', dentro: 'You’re in!',
    alDirecto: 'Taking you to the live stream', deVuelta: 'Taking you back', conAlias: 'with your alias', continuar: 'Continue',
    noValido: 'This link isn’t valid. Request a new one and you’ll be in within a minute.',
    caducado: 'The link has expired or has already been used. Request a new one and you’ll be in within a minute.',
    corta: 'The password must be at least 8 characters long.',
  },
};

/**
 * Página /acceso: canjea el enlace mágico (?acceso=TOKEN) y deja al fan dentro del directo.
 * Con SSR el canje se hace en el navegador (la cookie es httpOnly: solo el navegador la guarda).
 */
@Component({
  selector: 'gr-acceso-page',
  imports: [FormsModule, RouterLink, LocPipe, Page, GrButton, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes gr-progreso { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .gr-progreso { transform-origin: left; animation: gr-progreso 900ms var(--ease-out-soft) both; }
    @media (prefers-reduced-motion: reduce) { .gr-progreso { animation: none; } }
  `,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [centrado]="true" [cabecera]="false">
      <h1 class="sr-only">{{ t().h1 }}</h1>
      <div class="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-line-subtle bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.45),transparent_220px)] shadow-card" aria-live="polite">
        <div class="flex flex-col items-center gap-3 px-6 pt-9 pb-8 text-center md:px-8">
          @if (estado() === 'cargando') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/45 bg-accent-deep/40 text-accent-text"><gr-icon name="loader" [size]="26" [spin]="true" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().entrando }}</p>
            <p class="text-body-s text-text-secondary">{{ t().comprobando }}</p>
            <gr-skeleton class="mt-2 h-11 w-full rounded-sm" />
          } @else if (estado() === 'error') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text"><gr-icon name="circle-alert" [size]="28" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().noEntrar }}</p>
            <p class="text-body-s text-text-secondary">{{ error() }}</p>
            <div class="mt-3 flex w-full flex-col gap-2">
              <button type="button" grButton variant="primary" size="l" [block]="true" icon="mail" (click)="pedirOtro()">{{ t().pedirOtro }}</button>
              <a grButton variant="outline" [block]="true" [routerLink]="'/en-directo' | loc">{{ t().irDirecto }}</a>
            </div>
            <p class="mt-1 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ t().caduca }}</p>
          } @else if (estado() === 'clave') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/45 bg-accent-deep/40 text-accent-text"><gr-icon name="lock" [size]="26" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().elige }}</p>
            <p class="text-body-s text-text-secondary">{{ t().verificado }}</p>
            <label class="mt-2 block w-full text-left">
              <span class="text-label-s text-text-primary">{{ t().nueva }}</span>
              <input grInput grSize="l" type="password" autocomplete="new-password" class="mt-1.5" placeholder="••••••••" [attr.aria-label]="t().nuevaAria" [invalid]="!!errorClave()" [ngModel]="clave()" (ngModelChange)="clave.set($event)" (keydown.enter)="guardarClave()" />
              @if (errorClave(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
              @else { <span class="mt-1.5 block text-body-xs text-text-tertiary">{{ t().minimo }}</span> }
            </label>
            <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-2" [loading]="guardando()" (click)="guardarClave()">{{ t().guardar }}</button>
          } @else {
            <span class="flex size-16 items-center justify-center rounded-full border-2 border-success/50 bg-success/14 text-success shadow-[0_0_28px_rgb(34_197_94/0.35)]"><gr-icon name="check" [size]="30" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">{{ t().dentro }}</p>
            <p class="text-body-s text-text-secondary">{{ destino() === '/en-directo' ? t().alDirecto : t().deVuelta }} {{ t().conAlias }} <span class="font-semibold text-text-primary">{{ alias() }}</span>.</p>
            <span class="mt-2 block h-1 w-full overflow-hidden rounded-full bg-bg-raised" aria-hidden="true"><span class="gr-progreso block h-full rounded-full bg-accent-grain"></span></span>
            <a grButton variant="primary" size="l" [block]="true" [href]="destino() | loc" iconRight="arrow-right" class="mt-2">{{ destino() === '/en-directo' ? t().irDirecto : t().continuar }}</a>
          }
        </div>
      </div>
    </gr-page>
  `,
})
export class AccesoPage {
  private readonly fan = inject(FanSession);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  /** The access dialog (mounted in the layout) asks for a new magic link. */
  protected pedirOtro(): void {
    this.fan.abrirAcceso();
  }
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly estado = signal<'cargando' | 'error' | 'clave' | 'ok'>('cargando');
  protected readonly clave = signal('');
  protected readonly errorClave = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly alias = signal('');
  /** Where the fan goes after redeeming: the internal destination saved with the link (an invitation to a room) or the direct. */
  protected readonly destino = signal('/en-directo');

  constructor() {
    // Enlace mágico de un solo uso: ni se indexa ni se sigue (única página pública sin SEO propio que sí se rastreaba).
    inject(Seo).set({ title: this.t().titulo, description: this.t().h1, path: '/acceso', robots: 'noindex, nofollow' });
    effect(() => {
      const token = this.route.snapshot.queryParamMap.get('acceso') ?? '';
      if (!this.browser) return;
      if (!token) {
        this.estado.set('error');
        this.error.set(this.t().noValido);
        return;
      }
      void this.fan
        .canjear(token)
        .then((f) => {
          this.alias.set(f.alias);
          // Back to where the link was asked for (only a path of this web), else the live page.
          const next = f.next || (this.route.snapshot.queryParamMap.get('next') ?? '');
          if (/^\/(?!\/)[A-Za-z0-9/_.~?=&%-]*$/.test(next)) this.destino.set(next);
          // New account, older account without password or «he olvidado mi contraseña»: choose it now.
          if (f.requiereContrasena) this.estado.set('clave');
          else this.continuar();
        })
        .catch((e) => {
          this.estado.set('error');
          if (codigoError(e) === 'CUENTA_NO_ENCONTRADA') return this.error.set(detalleError(e, this.i18n.lang()));
          // ENLACE_INVALIDO, VALIDACION (a malformed token answers 422 «validation failed») or any bare 4xx: the fan only needs a new link.
          const c = codigoError(e);
          this.error.set(c === 'ENLACE_INVALIDO' || c === 'VALIDACION' || /^HTTP_4/.test(c) ? this.t().caducado : detalleError(e, this.i18n.lang()));
        });
    });
  }

  private continuar(): void {
    this.estado.set('ok');
    setTimeout(() => void this.router.navigateByUrl(this.i18n.path(this.destino())), 900);
  }

  protected async guardarClave(): Promise<void> {
    if (this.guardando()) return;
    if (this.clave().length < 8) return this.errorClave.set(this.t().corta);
    this.guardando.set(true);
    this.errorClave.set(null);
    try {
      await this.fan.fijarContrasena(this.clave());
      this.clave.set('');
      this.continuar();
    } catch (e) {
      this.errorClave.set(detalleError(e, this.i18n.lang()));
    } finally {
      this.guardando.set(false);
    }
  }
}
