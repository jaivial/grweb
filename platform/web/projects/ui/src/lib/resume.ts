/*
 * iOS Safari suspends a tab in the background: the connections die and the requests queued on them never settle, so the
 * page looks frozen until a manual reload. This turns the three «the page is back» signals (visible after a long time
 * hidden, bfcache restore, network back) into one notice, so services drop their stuck promises and reopen their
 * streams. It is a notice, never a wait: nothing gates navigation on it.
 */
const FUERA_MINIMO = 30_000;
let ocultoEn = 0;
let reanudadoEn = 0;
const oyentes = new Set<() => void>();

function reanudar(): void {
  const ahora = Date.now();
  // visible + pageshow + online arrive together after a freeze: one notice.
  if (ahora - reanudadoEn < 1000) return;
  reanudadoEn = ahora;
  for (const f of oyentes) {
    // One service failing to rebuild its connection must not leave the others waiting.
    try {
      f();
    } catch {
      /* ignore */
    }
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      ocultoEn = Date.now();
      return;
    }
    const fuera = ocultoEn ? Date.now() - ocultoEn : 0;
    ocultoEn = 0;
    if (fuera > FUERA_MINIMO) reanudar();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) reanudar();
  });
  window.addEventListener('online', () => reanudar());
}

/** The page came back a moment ago (~1,5 s): the document may still be thawing, so nothing should wait on it. */
export const reanudando = (): boolean => Date.now() - reanudadoEn < 1500;

/** Runs `fn` on every come-back; returns how to stop listening. */
export function alReanudar(fn: () => void): () => void {
  oyentes.add(fn);
  return () => void oyentes.delete(fn);
}

/**
 * An EventSource of the page dies while the tab is frozen (iOS) and the browser does not reopen it: `abrir` builds and
 * wires a new one, and every come-back closes the previous one and calls it again. Returns how to stop.
 */
export function esConReanudacion(abrir: () => EventSource): () => void {
  let es = abrir();
  const parar = alReanudar(() => {
    es.close();
    es = abrir();
  });
  return () => {
    parar();
    es.close();
  };
}
