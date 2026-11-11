import { ViewportScroller } from '@angular/common';
import { ApplicationRef, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router, RouterOutlet, Scroll } from '@angular/router';
import { GrPageLoader, GrToaster, GrToasts } from '@grcup/ui';

@Component({
  selector: 'gr-root',
  imports: [RouterOutlet, GrToaster, GrPageLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><gr-toaster [top]="true" />@if (cargando()) { <gr-page-loader /> }`,
})
export class App {
  /** Figma 17 «Loader de página»: when an in-app navigation (chunk, resolver or the new page's data) takes more than 300 ms. */
  protected readonly cargando = signal(false);

  constructor() {
    // In-page links («routerLink="." fragment="…"»): leave room for the floating navbar (88 px) above the target.
    const scroller = inject(ViewportScroller);
    scroller.setOffset([0, 104]);
    scroller.setHistoryScrollRestoration('manual');
    const app = inject(ApplicationRef);
    const toasts = inject(GrToasts);
    let t: ReturnType<typeof setTimeout> | undefined;
    let id = 0;
    let scrollN = 0;
    const fin = (n: number) => {
      if (n !== id) return;
      clearTimeout(t);
      this.cargando.set(false);
    };
    inject(Router).events.subscribe((e) => {
      // not on the first navigation: the server HTML is already on screen while the app boots
      if (e instanceof NavigationStart && e.id > 1) {
        clearTimeout(t);
        id = e.id;
        t = setTimeout(() => this.cargando.set(true), 300);
      } else if (e instanceof NavigationEnd) {
        // the page fetches its data after the route resolves: keep the loader until it settles (at most 10 s)
        const n = e.id;
        void Promise.race([app.whenStable(), new Promise((r) => setTimeout(r, 10_000))]).then(() => fin(n));
      } else if (e instanceof NavigationError) {
        fin(e.id);
        // e.g. a stale lazy chunk after a deploy: tell the user and offer a full load of the target page
        toasts.error('No se pudo abrir la página', 'Comprueba tu conexión.', { label: 'Reintentar', run: () => location.assign(e.url) });
      } else if (e instanceof NavigationCancel || e instanceof NavigationSkipped) fin(e.id);
      else if (e instanceof Scroll && !e.anchor && typeof window !== 'undefined') {
        // New page → top at once; back/forward → saved position once the page has its data (and height).
        const n = ++scrollN;
        const pos = e.position;
        const ir = () => n === scrollN && window.scrollTo({ left: pos?.[0] ?? 0, top: pos?.[1] ?? 0, behavior: 'instant' });
        ir();
        if (pos) void Promise.race([app.whenStable(), new Promise((r) => setTimeout(r, 10_000))]).then(() => requestAnimationFrame(ir));
      }
    });
  }
}
