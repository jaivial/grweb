import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_BASE } from './core/competition';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // In the cluster the server renders against the gateway Service directly (no round trip through nginx).
    { provide: API_BASE, useValue: process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:18300' },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
