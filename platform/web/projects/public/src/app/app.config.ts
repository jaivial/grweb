import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay, withIncrementalHydration, withHttpTransferCacheOptions } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { apiBaseInterceptor, noEncontradoInterceptor } from './core/competition';
import { langInterceptor } from './core/i18n';
import { colaInterceptor } from './core/cola';
import { GR_LANG, grViewTransitions } from '@grcup/ui';
import { I18n } from './core/i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: GR_LANG, useFactory: () => inject(I18n).lang },
    provideHttpClient(withFetch(), withInterceptors([langInterceptor, noEncontradoInterceptor, apiBaseInterceptor, colaInterceptor])),
    // Position restoration is done in App (instant, after the page settles): html{scroll-behavior:smooth} broke the router's own.
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'disabled' }), withComponentInputBinding(), grViewTransitions()),
    provideClientHydration(withEventReplay(), withIncrementalHydration(), withHttpTransferCacheOptions({ includePostRequests: false })),
    // New page → top, subscribed before bootstrap: a click replayed during hydration navigates before App listens to Scroll.
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      let pop = false;
      let ruta = '';
      const router = inject(Router);
      router.events.subscribe((e) => {
        if (e instanceof NavigationStart) pop = e.navigationTrigger === 'popstate';
        else if (e instanceof NavigationEnd) {
          // a replaceUrl query change on the same page (?vista=, filters) keeps the scroll
          const antes = ruta;
          ruta = e.urlAfterRedirects.split(/[?#]/)[0];
          const mismaVista = ruta === antes && !!router.lastSuccessfulNavigation()?.extras.replaceUrl;
          if (e.id > 1 && !pop && !mismaVista && !e.urlAfterRedirects.includes('#')) window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        }
      });
    }),
  ],
};
