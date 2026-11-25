import { ChangeDetectionStrategy, Component, afterNextRender, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton } from '@grcup/ui';
import { Consentimiento } from '../core/consentimiento';
import { I18n, LocPipe } from '../core/i18n';
import type { SafeResourceUrl } from '@angular/platform-browser';

const T = {
  es: {
    region: 'Aviso de cookies',
    texto: 'Usamos cookies técnicas necesarias para el inicio de sesión y para recordar tus preferencias. Con tu permiso, también cargaremos contenido de terceros (retransmisión en YouTube/Twitch), que puede instalar sus propias cookies.',
    politica: 'Política de cookies', aceptar: 'Aceptar', rechazar: 'Rechazar opcionales',
    videoTexto: 'La retransmisión se emite en YouTube/Twitch, que puede instalar cookies propias.', videoAceptar: 'Aceptar y ver la retransmisión',
  },
  en: {
    region: 'Cookie notice',
    texto: 'We use necessary technical cookies for signing in and to remember your preferences. With your permission, we will also load third-party content (the YouTube/Twitch broadcast), which may set its own cookies.',
    politica: 'Cookie policy', aceptar: 'Accept', rechazar: 'Reject optional',
    videoTexto: 'The broadcast is streamed on YouTube/Twitch, which may set its own cookies.', videoAceptar: 'Accept and watch the broadcast',
  },
};

/**
 * Cookie banner (BIZ-201): non-modal, bottom-left like the BIZ-178 notice, «Aceptar» and «Rechazar opcionales» with the
 * same look and size. Closing the page without choosing stores nothing. Projected content goes above the cookie text
 * (the home puts the BIZ-178 site notice there, so there is a single banner).
 */
@Component({
  selector: 'gr-cookies',
  imports: [RouterLink, LocPipe, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region', '[attr.aria-label]': 't().region',
    class: 'fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 block max-h-[70vh] overflow-y-auto rounded-lg border border-white/15 bg-black p-4 text-sm shadow-lg md:inset-x-auto md:left-6 md:bottom-6 md:max-w-md data-[barra]:max-md:bottom-[calc(88px+env(safe-area-inset-bottom))]',
    '[attr.data-barra]': "sobreBarra() ? '' : null",
  },
  template: `
    <ng-content />
    <p class="text-text-secondary">{{ t().texto }} <a class="whitespace-nowrap text-text-primary underline" [routerLink]="'/cookies' | loc">{{ t().politica }}</a></p>
    <div class="mt-3 grid gap-2 sm:grid-cols-2">
      <button grButton type="button" variant="secondary" [block]="true" (click)="elegir(true)">{{ t().aceptar }}</button>
      <button grButton type="button" variant="secondary" [block]="true" (click)="elegir(false)">{{ t().rechazar }}</button>
    </div>
  `,
})
export class CookiesBanner {
  /** The mobile bottom «Reservar» bar is on screen: the banner sits above it. */
  readonly sobreBarra = input(false);
  readonly elegido = output<boolean>();
  protected readonly t = inject(I18n).dict(T);
  private readonly consentimiento = inject(Consentimiento);
  protected elegir(si: boolean): void {
    if (si) this.consentimiento.aceptar(); else this.consentimiento.rechazar();
    this.elegido.emit(si);
  }
}

/**
 * Third-party embed behind consent (BIZ-201): the iframe only once optional cookies are accepted; before, a dark
 * placeholder filling the same box (the parent keeps the aspect ratio) with the reason and a button to accept.
 */
@Component({
  selector: 'gr-video-consentido',
  imports: [RouterLink, LocPipe, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-0 block' },
  template: `
    @if (consentimiento.opcionales()) {
      <iframe [src]="src()" class="absolute inset-0 size-full border-0" [title]="titulo()" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
    } @else {
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-bg-deep p-4 text-center">
        <p class="max-w-md text-body-s text-text-secondary">{{ t().videoTexto }}</p>
        <button grButton type="button" variant="primary" (click)="consentimiento.aceptar()">{{ t().videoAceptar }}</button>
        <a class="inline-flex min-h-11 items-center text-body-xs text-text-tertiary underline hover:text-text-primary" [routerLink]="'/cookies' | loc">{{ t().politica }}</a>
      </div>
    }
  `,
})
export class VideoConsentido {
  readonly src = input.required<SafeResourceUrl>();
  readonly titulo = input('');
  protected readonly t = inject(I18n).dict(T);
  protected readonly consentimiento = inject(Consentimiento);
  constructor() { afterNextRender(() => this.consentimiento.cargar()); }
}
