import { inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

export type Dir = 'asc' | 'desc';

/**
 * Table sort persisted in the URL (`?orden=…&dir=…`, replaceUrl so it doesn't pollute history).
 * Call in an injection context. `toggle(c)`: same column flips asc/desc, a new column starts at `firstDir(c)`.
 */
export function urlSort<T extends string>(cols: readonly T[], def: T, defDir: Dir, firstDir: (c: T) => Dir = () => 'asc') {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const q = route.snapshot.queryParamMap;
  const o = q.get('orden') as T | null;
  const d = q.get('dir');
  const orden = signal<T>(o && cols.includes(o) ? o : def);
  const dir = signal<Dir>(d === 'asc' || d === 'desc' ? d : orden() === def ? defDir : firstDir(orden()));
  // invalid ?orden/?dir: normalise the URL (drop them, or rewrite dir if only it is wrong)
  if ((o !== null && orden() !== o) || (d !== null && dir() !== d)) {
    const ok = o !== null && orden() === o;
    void router.navigate([], { relativeTo: route, queryParams: { orden: ok ? o : null, dir: ok ? dir() : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  return {
    orden: orden.asReadonly(),
    dir: dir.asReadonly(),
    sortDe: (c: string): Dir | null => (orden() === c ? dir() : null),
    toggle(c: T): void {
      dir.set(orden() === c ? (dir() === 'asc' ? 'desc' : 'asc') : firstDir(c));
      orden.set(c);
      void router.navigate([], { relativeTo: route, queryParams: { orden: c, dir: dir() }, queryParamsHandling: 'merge', replaceUrl: true });
    },
  };
}
