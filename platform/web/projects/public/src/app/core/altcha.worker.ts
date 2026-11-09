/// <reference lib="webworker" />

/**
 * Worker del reto ALTCHA: busca el número que resuelve el reto con `crypto.subtle` (SHA-256) sin
 * bloquear el hilo principal. Si el reto no tiene solución devuelve -1.
 */

interface Peticion {
  challenge: string;
  salt: string;
  maxnumber: number;
}

/** Trozo de números que se resuelven en paralelo. */
const LOTE = 512;

addEventListener('message', async ({ data }: MessageEvent<Peticion>) => {
  try {
    const n = await buscar(data.challenge, data.salt, data.maxnumber);
    postMessage({ number: n });
  } catch {
    postMessage({ number: -1 });
  }
});

/** Busca el número n tal que SHA-256(salt + n) es el challenge. */
async function buscar(challenge: string, salt: string, maxnumber: number): Promise<number> {
  const enc = new TextEncoder();
  const prefijo = enc.encode(salt);
  const buf = new Uint8Array(prefijo.length + 8);
  for (let ini = 0; ini <= maxnumber; ini += LOTE) {
    const fines = Math.min(ini + LOTE, maxnumber);
    const numeros: number[] = [];
    for (let n = ini; n <= fines; n++) numeros.push(n);
    const hashes = await Promise.all(
      numeros.map(async (n) => {
        buf.set(prefijo);
        const num = enc.encode(String(n));
        buf.set(num, prefijo.length);
        const bytes = buf.slice(0, prefijo.length + num.length);
        const dig = await crypto.subtle.digest('SHA-256', bytes);
        const hex = Array.from(new Uint8Array(dig))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        return hex === challenge ? n : -1;
      }),
    );
    const encontrado = hashes.find((h) => h >= 0);
    if (encontrado !== undefined) return encontrado;
  }
  return -1;
}
