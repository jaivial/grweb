import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay, withHttpTransferCacheOptions } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { apiBaseInterceptor, noEncontradoInterceptor } from './core/competition';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([noEncontradoInterceptor, apiBaseInterceptor])),
    // Position restoration is done in App (instant, after the page settles): html{scroll-behavior:smooth} broke the router's own.
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'disabled' }), withComponentInputBinding()),
    provideClientHydration(withEventReplay(), withHttpTransferCacheOptions({ includePostRequests: false })),
    // New page → top, subscribed before bootstrap: a click replayed during hydration navigates before App listens to Scroll.
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      let pop = false;
      inject(Router).events.subscribe((e) => {
        if (e instanceof NavigationStart) pop = e.navigationTrigger === 'popstate';
        else if (e instanceof NavigationEnd && e.id > 1 && !pop && !e.urlAfterRedirects.includes('#')) window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      });
    }),
  ],
};
