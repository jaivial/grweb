import { RenderMode, ServerRoute } from '@angular/ssr';

// Rendered per request (fresh data from the API); the HTTP transfer cache avoids refetching in the browser.
// Missing pages set HTTP 404 themselves (RESPONSE_INIT in NotFoundPage and ContentPage).
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
