import { effect, inject, untracked, type WritableSignal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Keeps an in-page tab (the ones that phones pick in a bottom sheet) in a URL query param, so a reload or a shared link
 * opens the same tab. Call it in an injection context (a field initializer):
 * `private readonly tabUrl = tabEnUrl(this.tab, () => this.tabs.map((t) => t.key));`
 *
 * - On load, `?<param>=` picks the tab when it is one of `validos()`; an unknown value falls back to the first tab.
 *   Without the param the page keeps its own default. `validos` may arrive later (tabs built from loaded data): the URL
 *   is applied once, when the list is first non-empty.
 * - Every later change of the tab rewrites the param with `replaceUrl` (no history entry per tab) and keeps the other
 *   query params.
 */
export function tabEnUrl<T extends string>(tab: WritableSignal<T>, validos: () => readonly T[], param = 'tab'): void {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  let listo = false;
  let defecto: T | null = null; // the page's own default: not written to a clean URL
  const enUrl = () => route.snapshot.queryParamMap.get(param);
  effect(() => {
    const vs = validos();
    if (listo || !vs.length) return;
    listo = true;
    const q = enUrl();
    if (q !== null) untracked(() => tab.set((vs.includes(q as T) ? q : vs[0]) as T));
    else defecto = untracked(tab);
  });
  effect(() => {
    const v = tab();
    const q = untracked(enUrl);
    if (!listo || q === v || (q === null && v === defecto)) return;
    untracked(() => void router.navigate([], { relativeTo: route, queryParams: { [param]: v }, queryParamsHandling: 'merge', replaceUrl: true }));
  });
}
