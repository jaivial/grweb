import { inject } from '@angular/core';
import { Router, ViewTransitionInfo, withViewTransitions } from '@angular/router';

/**
 * Short cross-fade between pages (View Transitions API; browsers without it just swap). Not on the first load, not with
 * prefers-reduced-motion and not when only the query or fragment changes (tabs, filters, ?vista=), so the page never
 * fades under the user's own control. The keyframes live in tokens.css («gr-vt»).
 */
export function grViewTransitions() {
  return withViewTransitions({
    skipInitialTransition: true,
    onViewTransitionCreated: ({ transition }: ViewTransitionInfo) => {
      const router = inject(Router);
      const nav = router.getCurrentNavigation();
      const ruta = (u: string) => u.split(/[?#]/)[0];
      const destino = nav ? router.serializeUrl(nav.finalUrl ?? nav.extractedUrl) : '';
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || (nav && ruta(destino) === ruta(router.url))) transition.skipTransition();
    },
  });
}
