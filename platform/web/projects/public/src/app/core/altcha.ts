/**
 * Reto antibots ALTCHA del alta de atleta.
 *
 * El servicio `athletes` entrega el reto (algoritmo, challenge, salt, signature y maxnumber) en
 * `GET /api/competiciones/{slug}/alta-atleta/config`; la solución viaja en el campo `altcha` del
 * `datos` JSON, en base64 (formato `Payload` de altcha-lib-go v1.0.0: algorithm, challenge, number,
 * salt, signature).
 *
 * El reto se resuelve en un Web Worker con `crypto.subtle` (para no congelar el hilo principal); si
 * no hay worker o no hay contexto seguro, se resuelve con SHA-256 en JavaScript troceado, cediendo
 * el hilo cada 500 iteraciones.
 */

/** Reto tal y como lo devuelve el servicio. */
export interface AltchaConfig {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber: number;
}

/** Solución del reto (el mismo formato que verifica altcha-lib-go). */
export interface AltchaPayload {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}

/** Estados del widget que ve la persona. */
export type AltchaEstado = 'idle' | 'verificando' | 'verificado' | 'fallo';

/** Payload en base64: es lo que viaja al servicio. */
export function payloadBase64(p: AltchaPayload): string {
  return base64(new TextEncoder().encode(JSON.stringify(p)));
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Resuelve el reto y devuelve el número que lo resuelve (null si no hay solución).
 * Web Worker con `crypto.subtle` si se puede; si no, SHA-256 en JavaScript troceado.
 */
export async function resolverReto(c: AltchaConfig): Promise<number | null> {
  if (!c.challenge || !c.salt) return null;
  const max = Math.max(1, Math.min(c.maxnumber || 100000, 1000000));
  if (puedeWorker()) {
    const n = await resolverEnWorker(c.challenge, c.salt, max);
    if (n !== null) return n;
  }
  return await resolverEnHilo(c.challenge, c.salt, max);
}

/** ¿Hay Web Worker y contexto seguro para `crypto.subtle`? */
function puedeWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof crypto !== 'undefined' && typeof crypto.subtle?.digest === 'function';
}

/** El worker busca el número; si falla o no contesta, el llamante usa el respaldo. */
function resolverEnWorker(challenge: string, salt: string, max: number): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const w = new Worker(new URL('./altcha.worker', import.meta.url), { type: 'module' });
      const fin = setTimeout(() => {
        w.terminate();
        resolve(null);
      }, 30000);
      w.onmessage = ({ data }: MessageEvent<{ number?: number }>) => {
        clearTimeout(fin);
        w.terminate();
        resolve(typeof data?.number === 'number' && data.number >= 0 ? data.number : null);
      };
      w.onerror = () => {
        clearTimeout(fin);
        w.terminate();
        resolve(null);
      };
      w.postMessage({ challenge, salt, maxnumber: max });
    } catch {
      resolve(null);
    }
  });
}

/** Respaldo: SHA-256 en el hilo principal, cediendo el hilo cada 500 iteraciones. */
export async function resolverEnHilo(challenge: string, salt: string, max: number): Promise<number | null> {
  for (let n = 0; n <= max; n++) {
    if (sha256Hex(salt + n) === challenge) return n;
    if (n % 500 === 499) await ceder();
  }
  return null;
}

/** Cede el hilo al navegador (un macrotarea). */
const ceder = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ---- SHA-256 en JavaScript (respaldo cuando no hay worker) ----

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/** SHA-256 de una cadena ASCII, en hexadecimal (como `hashHex` de altcha-lib-go). */
export function sha256Hex(texto: string): string {
  const datos = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) datos[i] = texto.charCodeAt(i) & 0xff;
  const largo = ((datos.length + 8) >> 6) + 1;
  const bloques = new Uint8Array(largo << 6);
  bloques.set(datos);
  bloques[datos.length] = 0x80;
  const dv = new DataView(bloques.buffer);
  const bits = datos.length * 8;
  dv.setUint32(bloques.length - 4, bits >>> 0, false);
  dv.setUint32(bloques.length - 8, Math.floor(bits / 4294967296), false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let off = 0; off < bloques.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}
