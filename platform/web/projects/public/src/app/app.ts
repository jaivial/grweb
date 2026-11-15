import { ViewportScroller } from '@angular/common';
import { ApplicationRef, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router, RouterOutlet, Scroll } from '@angular/router';
import { GrPageLoader, GrToaster, GrToasts } from '@grcup/ui';
import { GrColaEspera } from './core/cola';
import { I18n } from './core/i18n';

const T = {
  es: { error: 'No se pudo abrir la página', conexion: 'Comprueba tu conexión.', reintentar: 'Reintentar' },
  en: { error: 'The page could not be opened', conexion: 'Check your connection.', reintentar: 'Retry' },
};

@Component({
  selector: 'gr-root',
  imports: [RouterOutlet, GrToaster, GrPageLoader, GrColaEspera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><gr-toaster [top]="true" /><gr-cola-espera />@if (cargando()) { <gr-page-loader /> }`,
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
    const tx = inject(I18n).dict(T);
    let t: ReturnType<typeof setTimeout> | undefined;
    let id = 0;
    let scrollN = 0;
    // a replaceUrl query change on the same page (?vista=, filters): no loader and no jump to the top
    let mismaVista = false;
    const router = inject(Router);
    const fin = (n: number) => {
      if (n !== id) return;
      clearTimeout(t);
      this.cargando.set(false);
    };
    router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        const ruta = (u: string) => u.split(/[?#]/)[0];
        mismaVista = e.id > 1 && ruta(e.url) === ruta(router.url) && !!router.currentNavigation()?.extras.replaceUrl;
      }
      // not on the first navigation: the server HTML is already on screen while the app boots
      if (e instanceof NavigationStart && e.id > 1 && !mismaVista) {
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
        toasts.error(tx().error, tx().conexion, { label: tx().reintentar, run: () => location.assign(e.url) });
      } else if (e instanceof NavigationCancel || e instanceof NavigationSkipped) fin(e.id);
      else if (e instanceof Scroll && e.anchor && !e.position && typeof window !== 'undefined') {
        // In-app link to /x#anchor: the router tries before the new page has its (async) sections; try again once it settles.
        const n = ++scrollN;
        const anchor = e.anchor;
        void Promise.race([app.whenStable(), new Promise((r) => setTimeout(r, 10_000))]).then(() => requestAnimationFrame(() => n === scrollN && scroller.scrollToAnchor(anchor)));
      } else if (e instanceof Scroll && !e.anchor && !mismaVista && typeof window !== 'undefined') {
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
