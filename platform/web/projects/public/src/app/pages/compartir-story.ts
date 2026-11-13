/** Composes the 1080×1920 «cuenta atrás» story (Figma 83) on a canvas: B/N photo, GRS Cup logo on top, data and
 * GRS Powerlifting Coaching | AEP | Ajuntament d'Almussafes at the bottom. `sticker` leaves the background transparent. */
export interface StoryDatos {
  modo: 'cuenta_atras' | 'fecha';
  formato: 'story' | 'sticker';
  alin: 'izq' | 'centro' | 'der';
  dias: number;
  fecha: string; // «25 JUL 2026»
  nombre: string;
  prueba: string; // AEP-2
  peso: string; // −83 KG
  sexo: string; // MASCULINO
  foto?: HTMLImageElement;
  focalX: number;
  focalY: number;
}

export const W = 1080;
export const H = 1920;
const LOGOS = ['grscup', 'coaching', 'aep', 'almussafes'] as const;
const cache = new Map<string, Promise<HTMLImageElement>>();

export function cargarImagen(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => { cache.delete(src); ko(new Error('imagen')); };
      i.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

export async function componer(d: StoryDatos): Promise<HTMLCanvasElement> {
  const [grs, coaching, aep, alm] = await Promise.all(LOGOS.map((l) => cargarImagen(`/stories/logo-${l}.png`)));
  await document.fonts?.load('120px "Contrail One"').catch(() => undefined);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  if (d.formato === 'story') {
    g.fillStyle = '#0b0b0c';
    g.fillRect(0, 0, W, H);
    if (d.foto) {
      const f = d.foto;
      const s = Math.max(W / f.naturalWidth, H / f.naturalHeight);
      const fw = f.naturalWidth * s, fh = f.naturalHeight * s;
      g.drawImage(f, -(fw - W) * (d.focalX / 100), -(fh - H) * (d.focalY / 100), fw, fh);
      grises(g);
    }
    const sombra = g.createLinearGradient(0, H * 0.35, 0, H);
    sombra.addColorStop(0, 'rgba(0,0,0,0)');
    sombra.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = sombra;
    g.fillRect(0, 0, W, H);
  }
  const m = 96;
  const x = d.alin === 'izq' ? m : d.alin === 'der' ? W - m : W / 2;
  g.textAlign = d.alin === 'izq' ? 'left' : d.alin === 'der' ? 'right' : 'center';
  g.fillStyle = '#fff';
  const logo = (img: HTMLImageElement, h: number, y: number, x0: number) => g.drawImage(img, x0, y, (img.naturalWidth / img.naturalHeight) * h, h);
  const ancho = (img: HTMLImageElement, h: number) => (img.naturalWidth / img.naturalHeight) * h;
  const alinX = (w: number) => (d.alin === 'izq' ? m : d.alin === 'der' ? W - m - w : (W - w) / 2);

  let y = 1040;
  logo(grs, 120, y, alinX(ancho(grs, 120)));
  y += 200;
  g.font = '600 30px Inter, sans-serif';
  g.fillText(d.modo === 'cuenta_atras' ? (d.dias > 0 ? 'FALTAN' : 'ES') : 'NOS VEMOS EL', x, y);
  y += 190;
  g.font = '200px "Contrail One", Impact, sans-serif';
  const grande = d.modo === 'fecha' ? d.fecha : d.dias > 0 ? String(d.dias) : 'HOY';
  if (d.modo === 'cuenta_atras' && d.dias > 0) {
    const sufijo = d.dias === 1 ? ' DÍA' : ' DÍAS';
    g.font = '200px "Contrail One", Impact, sans-serif';
    const wn = g.measureText(grande).width;
    g.font = '64px "Contrail One", Impact, sans-serif';
    const ws = g.measureText(sufijo).width;
    const x0 = alinX(wn + ws);
    g.textAlign = 'left';
    g.font = '200px "Contrail One", Impact, sans-serif';
    g.fillText(grande, x0, y);
    g.font = '64px "Contrail One", Impact, sans-serif';
    g.fillText(sufijo, x0 + wn, y);
    g.textAlign = d.alin === 'izq' ? 'left' : d.alin === 'der' ? 'right' : 'center';
  } else {
    g.font = (d.modo === 'fecha' ? '120px' : '200px') + ' "Contrail One", Impact, sans-serif';
    g.fillText(grande, x, y);
  }
  y += 60;
  g.font = '600 26px Inter, sans-serif';
  g.fillText('PARA LA GRS CUP 2 · 2026', x, y);
  y += 100;
  g.font = '64px "Contrail One", Impact, sans-serif';
  g.fillText(d.nombre.toUpperCase(), x, y);
  y += 64;
  g.font = '700 30px Inter, sans-serif';
  g.fillText([d.prueba, d.peso, d.sexo].filter(Boolean).join('  ·  '), x, y);
  y += 44;
  g.font = '500 24px Inter, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('ALMUSSAFES · VALENCIA', x, y);
  g.fillStyle = '#fff';
  y += 70;
  const h = 56, sep = 40;
  const fila = [coaching, aep, alm];
  const total = fila.reduce((a, i) => a + ancho(i, h), 0) + sep * 2 * (fila.length - 1);
  let lx = alinX(total);
  fila.forEach((img, i) => {
    if (i) {
      g.fillRect(lx + sep - 1, y + 6, 2, h - 12);
      lx += sep * 2;
    }
    logo(img, h, y, lx);
    lx += ancho(img, h);
  });
  return c;
}

/** Desaturates in place (canvas `filter` is not available in Safari). */
function grises(g: CanvasRenderingContext2D) {
  const img = g.getImageData(0, 0, W, H);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
    p[i] = p[i + 1] = p[i + 2] = l;
  }
  g.putImageData(img, 0, 0);
}

/** Static countdown: whole days between today and the competition day, both in Madrid time. */
export function diasHasta(fechaISO: string): number {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return Math.max(0, Math.round((Date.parse(fechaISO.slice(0, 10)) - Date.parse(hoy)) / 86400000));
}

