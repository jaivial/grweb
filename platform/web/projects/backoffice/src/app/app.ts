import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationError, Router, RouterOutlet } from '@angular/router';
import { GrErrorState, GrToaster } from '@grcup/ui';
import { ConfirmHost } from './shared/ui';

@Component({
  selector: 'bo-root',
  imports: [RouterOutlet, GrToaster, ConfirmHost, GrErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (fallo()) { <gr-error-state (reintentar)="recargar()" /> } @else { <router-outlet /> }<gr-toaster /><bo-confirm-host />`,
})
export class App {
  /** Figma 17 «ErrorBoundary (backoffice)»: a screen that fails to load (e.g. a stale chunk after a deploy). */
  protected readonly fallo = signal(false);
  constructor() {
    inject(Router).events.subscribe((e) => e instanceof NavigationError && this.fallo.set(true));
  }
  protected recargar(): void {
    location.reload();
  }
}
