/** Composes the 1080×1920 «cuenta atrás» story (Figma 83) on a canvas: B/N photo, GRS Cup logo on top, data and
 * GRS Powerlifting Coaching | AEP | Ajuntament d'Almussafes at the bottom. `sticker` leaves the background transparent. */
export interface StoryDatos {
  modo: 'cuenta_atras' | 'fecha';
  formato: 'story' | 'sticker';
  alin: 'izq' | 'centro' | 'der';
  dias: number;
  fecha: string; // «25.07.26»
  detalleFecha: string; // «SÁBADO · PUERTAS 08:30»
  nombre: string;
  prueba: string; // AEP-2
  peso: string; // −83 KG
  sexo: string; // MASCULINO
  foto?: HTMLImageElement;
  focalX: number;
  focalY: number;
  zoom: number; // 1 = the photo covers the 9:16 frame; up to 4
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
      const s = Math.max(W / f.naturalWidth, H / f.naturalHeight) * Math.min(4, Math.max(1, d.zoom || 1));
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

  // block ends ≈78 % of the height: clear of Instagram's reply bar (bottom ~250 px)
  let y = 720;
  logo(grs, 120, y, alinX(ancho(grs, 120)));
  y += 200;
  g.font = '600 30px Inter, sans-serif';
  g.fillText(d.modo === 'cuenta_atras' ? (d.dias > 0 ? 'FALTAN' : 'ES') : 'COMPITO EL', x, y);
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
    g.font = (d.modo === 'fecha' ? '160px' : '200px') + ' "Contrail One", Impact, sans-serif';
    g.fillText(grande, x, y);
  }
  y += 60;
  g.font = '600 26px Inter, sans-serif';
  g.fillText(d.modo === 'fecha' ? d.detalleFecha : 'PARA LA GRS CUP 2 · 2026', x, y, W - 2 * m);
  y += 100;
  // long names: smaller type first, then two lines (never outside the 96 px margins)
  const nombre = encajar(g, d.nombre.toUpperCase(), W - 2 * m);
  g.font = nombre.font;
  nombre.lineas.forEach((l, i) => g.fillText(l, x, y + i * nombre.alto));
  y += (nombre.lineas.length - 1) * nombre.alto + 64;
  g.font = '700 30px Inter, sans-serif';
  g.fillText([d.prueba, d.peso, d.sexo].filter(Boolean).join('  ·  '), x, y, W - 2 * m);
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

/** Fits a name in maxW: 64 px down to 44 px, then two lines (cut with «…» if it still does not fit). */
function encajar(g: CanvasRenderingContext2D, texto: string, maxW: number): { font: string; alto: number; lineas: string[] } {
  const fuente = (px: number) => `${px}px "Contrail One", Impact, sans-serif`;
  for (let px = 64; px >= 44; px -= 4) {
    g.font = fuente(px);
    if (g.measureText(texto).width <= maxW) return { font: g.font, alto: px, lineas: [texto] };
  }
  const px = 44;
  g.font = fuente(px);
  const palabras = texto.split(/\s+/);
  let a = '';
  let i = 0;
  while (i < palabras.length && g.measureText((a + ' ' + palabras[i]).trim()).width <= maxW) a = (a + ' ' + palabras[i++]).trim();
  if (!a) return { font: g.font, alto: px, lineas: [cortar(g, texto, maxW)] };
  const resto = palabras.slice(i).join(' ');
  return { font: g.font, alto: px, lineas: resto ? [a, cortar(g, resto, maxW)] : [a] };
}

function cortar(g: CanvasRenderingContext2D, t: string, maxW: number): string {
  if (g.measureText(t).width <= maxW) return t;
  const c = Array.from(t);
  while (c.length && g.measureText(c.join('') + '…').width > maxW) c.pop();
  return c.join('') + '…';
}

/** The text of the story, for the alt of the preview. */
export function textoStory(d: StoryDatos): string {
  const cab = d.modo === 'fecha' ? `Compito el ${d.fecha}, ${d.detalleFecha.toLowerCase()}` : d.dias > 0 ? `Faltan ${d.dias} ${d.dias === 1 ? 'día' : 'días'} para la GRS Cup 2` : 'Es hoy: GRS Cup 2';
  return `${d.formato === 'sticker' ? 'Sticker' : 'Story'}: ${cab}. ${d.nombre} · ${[d.prueba, d.peso, d.sexo].filter(Boolean).join(' · ')}. Almussafes · Valencia.`;
}

/** Black and white with contrast 1.18 (canvas `filter` is not available in Safari). */
function grises(g: CanvasRenderingContext2D) {
  const img = g.getImageData(0, 0, W, H);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = Math.min(255, Math.max(0, (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114 - 128) * 1.18 + 128));
    p[i] = p[i + 1] = p[i + 2] = l;
  }
  g.putImageData(img, 0, 0);
}

/** Static countdown: whole days between today and the competition day, both in Madrid time (0 = today, < 0 = past). */
export function diasHasta(fechaISO: string): number {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return Math.round((Date.parse(fechaISO.slice(0, 10)) - Date.parse(hoy)) / 86400000);
}

