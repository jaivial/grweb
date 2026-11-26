/**
 * Random id of this browser (localStorage: the same in every tab), sent as `?v=` by the streams of /en-directo so
 * the «espectadores» and the chat «conectados» count people, not connections (pkg/visitas). Browser only.
 */
export function visitante(): string {
  const k = 'gr_visitante';
  try {
    let v = localStorage.getItem(k);
    if (!v) {
      v = uuid();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return uuid(); // storage blocked: this tab counts on its own
  }
}

/** crypto.randomUUID only exists in secure contexts (https, localhost): a v4 uuid from getRandomValues otherwise. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
