/**
 * Random id of this browser (localStorage: the same in every tab), sent as `?v=` by the streams of /en-directo so
 * the «espectadores» and the chat «conectados» count people, not connections (pkg/visitas). Browser only.
 */
export function visitante(): string {
  const k = 'gr_visitante';
  try {
    let v = localStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return crypto.randomUUID(); // storage blocked: this tab counts on its own
  }
}
