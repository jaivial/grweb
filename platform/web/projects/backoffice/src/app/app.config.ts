import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { Auth, authInterceptor } from './core/auth';
import { Realtime } from './core/realtime';
import { GR_SKIN, alReanudar, grHttpTimeoutInterceptor, grViewTransitions } from '@grcup/ui';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: GR_SKIN, useValue: 'bo' },
    provideBrowserGlobalErrorListeners(),
    // The 12 s cut goes last (closest to the network); auth stays outside so its 401 retry is not cut.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, grHttpTimeoutInterceptor])),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' }), grViewTransitions()),
    // Back from a frozen tab (iOS Safari): the session and the live stream died in the background, rebuild both.
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      const auth = inject(Auth);
      const realtime = inject(Realtime);
      alReanudar(() => {
        auth.verificarSesion();
        // Also while bootstrapping: a resume can drop that first refresh before it restores the session.
        if (auth.isLoggedIn() || !auth.ready()) void auth.freshToken();
        realtime.reanudar();
      });
    }),
  ],
};
