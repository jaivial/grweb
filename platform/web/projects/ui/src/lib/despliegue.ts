import { withNavigationErrorHandler, type NavigationError } from '@angular/router';

/**
 * Tras un redeploy, una pestaña abierta conserva el index.html anterior: sus chunks (con hash) ya no existen en el
 * servidor (404) y el import() de la ruta perezosa falla. Sin esto, la navegación se queda «cargando» hasta refrescar.
 * Ese error se detecta y se recarga la página en la URL de destino (una vez cada 10 s, para no entrar en bucle si el
 * fallo es otro, p. ej. sin red).
 */
const CLAVE = 'gr-recarga-despliegue';
const RE_CHUNK = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed|is not a valid JavaScript MIME type/i;

export function esErrorDeChunk(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? '');
  return RE_CHUNK.test(m);
}

/** Recarga (a `url` o a la actual) si no se ha recargado por esto en los últimos 10 s. Devuelve si recarga. */
export function recargaPorDespliegue(url?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const antes = Number(sessionStorage.getItem(CLAVE) || 0);
    if (Date.now() - antes < 10_000) return false;
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // sin sessionStorage: se recarga igual
  }
  console.warn('[gr] versión nueva desplegada: recargando', url ?? location.href);
  if (url) location.assign(url);
  else location.reload();
  return true;
}

let escuchando = false;

/** Router feature: una navegación que falla al cargar un chunk recarga la página en su destino. También cubre los
 * import() fuera del router (bloques @defer) con unhandledrejection. */
export function grRecargaTrasDespliegue() {
  if (typeof window !== 'undefined' && !escuchando) {
    escuchando = true;
    window.addEventListener('unhandledrejection', (ev) => {
      if (esErrorDeChunk(ev.reason)) recargaPorDespliegue();
    });
  }
  return withNavigationErrorHandler((e: NavigationError) => {
    if (esErrorDeChunk(e.error)) recargaPorDespliegue(e.url);
  });
}
