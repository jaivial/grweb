import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_BASE, SSR_SECRET } from './core/competition';

const apiBase = process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:18300';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // In the cluster the server renders against the gateway Service directly (no round trip through nginx).
    { provide: API_BASE, useValue: apiBase },
    // Transfer cache keys: the browser asks the public origin, the server the gateway (see apiBaseInterceptor).
    { provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP, useValue: { [new URL(apiBase).origin]: process.env['PUBLIC_ORIGIN'] ?? 'https://grcup-qa.menustudioai.com' } },
    { provide: SSR_SECRET, useValue: process.env['SSR_SECRET'] ?? '' },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
