import { Pipe, PipeTransform } from '@angular/core';
import { CDN_MANIFEST } from './cdn-manifest';

/**
 * URL of a static media file of the web: the content-hashed copy on the Bunny CDN when scripts/cdn-publicar.mjs has
 * published it (immutable, cached by the CDN edge), the same-origin file of public/ otherwise (new file not published
 * yet, or a build without CDN: empty base). Keys are the local paths: «/img/home/x.webp», «/media/x.mp4».
 */
export function cdn(path: string): string {
  const ruta = CDN_MANIFEST.files[path];
  return CDN_MANIFEST.base && ruta ? `${CDN_MANIFEST.base}/${ruta}` : path;
}

/** `cdn()` over every URL of a srcset («/img/a-s.webp 640w, /img/a-l.webp 1200w»). */
export const cdnSrcset = (srcset: string) => srcset.replace(/(^|,\s*)(\S+)/g, (_, sep: string, url: string) => sep + cdn(url));

/** GRS Cup 2 logo (WebP of the 588 × 366 PNG of logos/grcuplogo-2026.png: 43 KB instead of 130 KB). */
export const LOGO = cdn('/img/logo/grcuplogo-2026.webp');

/** srcset of a static WebP with width variants «<name>-<w>.webp» next to it in public/ (`ancho` = the original's width). */
export const cdnSrcsetW = (path: string, anchos: number[], ancho: number) =>
  [...anchos.map((w) => `${cdn(path.replace(/\.webp$/, `-${w}.webp`))} ${w}w`), `${cdn(path)} ${ancho}w`].join(', ');

/** srcset of LOGO (200 and 400 px wide copies): pair it with a `sizes` of its rendered width. */
export const LOGO_SRCSET = cdnSrcsetW('/img/logo/grcuplogo-2026.webp', [200, 400], 588);

/**
 * Sponsor logos of the CMS with 48 / 96 px tall copies «<name>-h48.webp», «-h96.webp» next to them (Bunny, same hashed
 * folder; /img/home ones in public/). Logos uploaded later have no entry and keep a plain src.
 */
const SPONSORS = 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/opt/';
const LOGOS_ALTURA = new Set([
  ...['aece21f2bc4d/aep', '18188816bc52/a7', 'e2b4a7b1262d/maniak', 'd631b65dee41/valkyria', '3f6cdaf34bd4/phed', '7ca97bbb08e0/isabel-atlas', 'd4e16976168c/gym-mediterrani']
    .map((n) => `${SPONSORS}${n}.webp`),
  '/img/home/patro-alm.webp',
]);
/** Already ≤ 96 px tall: the original is the 2x copy. */
const LOGOS_ALTURA_1X = new Set(['/img/home/patro-coa.webp', '/img/home/patro-str.webp']);

/** «1x, 2x» srcset of a sponsor logo shown up to 48 px tall, or null when it has no copies. */
export function srcsetLogo(url: string | null | undefined): string | null {
  if (!url) return null;
  const h = (n: number) => cdn(url.replace(/\.webp$/, `-h${n}.webp`));
  if (LOGOS_ALTURA.has(url)) return `${h(48)} 1x, ${h(96)} 2x`;
  if (LOGOS_ALTURA_1X.has(url)) return `${h(48)} 1x, ${cdn(url)} 2x`;
  return null;
}

/** `cdn()` in templates: `[src]="r.imagen | cdn"` (CMS values that are local «/img/…» paths too; others pass through). */
@Pipe({ name: 'cdn' })
export class CdnPipe implements PipeTransform {
  transform(path: string | null | undefined): string {
    return path ? cdn(path) : '';
  }
}
