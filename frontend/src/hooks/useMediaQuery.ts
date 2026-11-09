import { useCallback, useSyncExternalStore } from 'react';

/** Live `window.matchMedia(query).matches` (false during SSR / without matchMedia). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** First entry whose `query` matches; the last entry is the default. */
export function useMatchingEntry<T extends { query: string }>(entries: readonly T[]): T {
  const queries = entries.map((entry) => entry.query).join('|');
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const lists = queries.split('|').map((q) => window.matchMedia(q));
      lists.forEach((mql) => mql.addEventListener('change', onChange));
      return () => lists.forEach((mql) => mql.removeEventListener('change', onChange));
    },
    [queries],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return entries.length - 1;
    const index = entries.findIndex((entry) => window.matchMedia(entry.query).matches);
    return index === -1 ? entries.length - 1 : index;
  }, [entries]);
  const index = useSyncExternalStore(subscribe, getSnapshot, () => entries.length - 1);
  return entries[index];
}
