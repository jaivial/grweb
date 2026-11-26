import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, inject, input } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';
import { I18n, LocPipe } from '../core/i18n';
import { JuegosEnVivo, JuegosEstado } from '../core/juegos';
import { Page } from '../layout/page';

const T = {
  es: {
    titulo: 'GRS Porra y GRS Fantasy', eyebrow: 'Juegos del directo', cerrados: 'Los juegos todavía no están abiertos',
    texto: 'La porra y el fantasy se abren muy pronto. Esta página se actualiza sola: cuando abran, podrás jugar aquí mismo sin recargar.',
    directo: 'Ir al directo', como: 'Cómo se juega', nunca: 'Monedas de juego: nunca se compran con dinero.',
  },
  en: {
    titulo: 'GRS Pool and GRS Fantasy', eyebrow: 'Live games', cerrados: 'The games are not open yet',
    texto: 'The pool and the fantasy open very soon. This page updates by itself: once they open you can play right here, no reload needed.',
    directo: 'Go to the live stream', como: 'How to play', nunca: 'Game coins: never bought with money.',
  },
};

/** Aviso de «los juegos aún no están abiertos» (interruptor «Activar juegos» del backoffice apagado). */
@Component({
  selector: 'gr-juegos-cerrados',
  imports: [RouterLink, LocPipe, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'status' },
  template: `
    <div class="relative mx-auto flex flex-col items-center gap-4 overflow-hidden rounded-xl border border-line-subtle bg-bg-card text-center"
      [class]="compacto() ? 'px-4 py-6' : 'max-w-[640px] px-6 py-12 md:px-12 md:py-16'">
      <div class="pointer-events-none absolute -top-24 left-1/2 size-[320px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.5),transparent)]" aria-hidden="true"></div>
      <span class="relative flex size-14 items-center justify-center rounded-full border border-accent/40 bg-accent-deep/30 text-accent-text"><gr-icon name="hourglass" [size]="26" /></span>
      <h2 class="relative text-balance" [class]="compacto() ? 'text-ui-h5' : 'text-ui-h3 md:text-ui-h2'">{{ t().cerrados }}</h2>
      <p class="relative max-w-[46ch] text-body-s text-text-secondary md:text-body-m">{{ t().texto }}</p>
      @if (!compacto()) {
        <div class="relative mt-2 flex flex-wrap justify-center gap-3">
          <a grButton variant="primary" icon="radio" [routerLink]="'/en-directo' | loc">{{ t().directo }}</a>
          <a grButton icon="help" [routerLink]="'/fantasy/como-se-juega' | loc">{{ t().como }}</a>
        </div>
      }
      <p class="relative flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" class="shrink-0" />{{ t().nunca }}</p>
    </div>
  `,
})
export class JuegosCerrados {
  /** Versión para la pestaña porra de /en-directo (sin botones). */
  readonly compacto = input(false);
  protected readonly t = inject(I18n).dict(T);

  constructor() {
    // while the notice is on screen the live stream stays open: juegos.estado swaps it for the games at once
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const vivo = inject(JuegosEnVivo);
      vivo.conectar();
      inject(DestroyRef).onDestroy(() => vivo.desconectar());
    }
  }
}

/**
 * Puerta de /porra y /fantasy: con «Activar juegos» apagado enseña el aviso en lugar de la página (el aviso mantiene
 * abierta la conexión en vivo para pasar a los juegos en cuanto el backoffice los active).
 */
@Component({
  selector: 'gr-juegos-puerta',
  imports: [RouterOutlet, Page, JuegosCerrados],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (estado.cerrados()) {
      <gr-page [title]="t().titulo" [eyebrow]="t().eyebrow" [centrado]="true">
        <gr-juegos-cerrados />
      </gr-page>
    } @else {
      <router-outlet />
    }
  `,
})
export class JuegosPuerta {
  protected readonly estado = inject(JuegosEstado);
  protected readonly t = inject(I18n).dict(T);

  constructor() {
    // the server renders the right side (SSR waits for the config); the browser always re-reads it
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    void inject(PendingTasks).run(() => this.estado.cargarConfig(browser));
  }
}
