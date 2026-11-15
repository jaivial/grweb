import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { GrErrorState, GrPageLoader } from '@grcup/ui';
import { BoToaster } from './shared/kit';
import { ConfirmHost } from './shared/ui';

@Component({
  selector: 'bo-root',
  imports: [RouterOutlet, BoToaster, ConfirmHost, GrErrorState, GrPageLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (fallo()) { <gr-error-state class="min-h-dvh!" (reintentar)="recargar()" /> } @else { <router-outlet /> }<bo-toaster /><bo-confirm-host />@if (cargando()) { <gr-page-loader /> }`,
})
export class App {
  /** Figma 17 «ErrorBoundary (backoffice)»: a screen that fails to load (e.g. a stale chunk after a deploy). Holds the URL that failed. */
  protected readonly fallo = signal('');
  /** The web's page loader (hero bar on top) while a screen's chunk/guards take longer than 300 ms; the old screen stays. */
  protected readonly cargando = signal(false);
  constructor() {
    let t: ReturnType<typeof setTimeout> | undefined;
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        clearTimeout(t);
        t = setTimeout(() => this.cargando.set(true), 300);
      } else if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError || e instanceof NavigationSkipped) {
        clearTimeout(t);
        this.cargando.set(false);
      }
      if (e instanceof NavigationError) {
        this.fallo.set(e.url);
        setTimeout(() => document.querySelector<HTMLElement>('gr-error-state h1')?.focus());
      } else if (e instanceof NavigationEnd) this.fallo.set(''); // e.g. «Atrás» to a screen that loads
    });
  }
  /** Full load of the screen that failed (fresh index and chunks), not the one that was on screen. */
  protected recargar(): void {
    location.assign(this.fallo() || location.href);
  }
}
