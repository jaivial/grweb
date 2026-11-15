import { RenderMode, ServerRoute } from '@angular/ssr';

// Rendered per request (fresh data from the API); the HTTP transfer cache avoids refetching in the browser.
// Missing pages set HTTP 404 themselves (RESPONSE_INIT in NotFoundPage and ContentPage).
// The internal Figma gallery (/_componentes, ~350 KB of SSR) renders in the browser only: the server just sends the
// shell, so it cannot be used to load the SSR nodes.
export const serverRoutes: ServerRoute[] = [
  { path: '_componentes', renderMode: RenderMode.Client },
  { path: '_overlays', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
