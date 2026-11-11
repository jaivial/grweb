import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { GrPageLoader, GrToaster } from '@grcup/ui';

@Component({
  selector: 'gr-root',
  imports: [RouterOutlet, GrToaster, GrPageLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><gr-toaster [top]="true" />@if (cargando()) { <gr-page-loader /> }`,
})
export class App {
  /** Figma 17 «Loader de página»: only when a navigation (lazy chunk, resolver) takes more than 300 ms. */
  protected readonly cargando = signal(false);

  constructor() {
    // In-page links («routerLink="." fragment="…"»): leave room for the floating navbar (88 px) above the target.
    inject(ViewportScroller).setOffset([0, 104]);
    let t: ReturnType<typeof setTimeout> | undefined;
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) t = setTimeout(() => this.cargando.set(true), 300);
      else if (e instanceof NavigationEnd || e instanceof NavigationError || e instanceof NavigationCancel || e instanceof NavigationSkipped) {
        clearTimeout(t);
        this.cargando.set(false);
      }
    });
  }
}
