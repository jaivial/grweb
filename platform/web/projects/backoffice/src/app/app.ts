import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { GrErrorState, GrToaster } from '@grcup/ui';
import { ConfirmHost } from './shared/ui';

@Component({
  selector: 'bo-root',
  imports: [RouterOutlet, GrToaster, ConfirmHost, GrErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (fallo()) { <gr-error-state class="min-h-dvh!" (reintentar)="recargar()" /> } @else { <router-outlet /> }<gr-toaster /><bo-confirm-host />`,
})
export class App {
  /** Figma 17 «ErrorBoundary (backoffice)»: a screen that fails to load (e.g. a stale chunk after a deploy). Holds the URL that failed. */
  protected readonly fallo = signal('');
  constructor() {
    inject(Router).events.subscribe((e) => {
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
