import { RenderMode, ServerRoute } from '@angular/ssr';

// Rendered per request (fresh data from the API); the HTTP transfer cache avoids refetching in the browser.
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
