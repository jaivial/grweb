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

/** `cdn()` in templates: `[src]="r.imagen | cdn"` (CMS values that are local «/img/…» paths too; others pass through). */
@Pipe({ name: 'cdn' })
export class CdnPipe implements PipeTransform {
  transform(path: string | null | undefined): string {
    return path ? cdn(path) : '';
  }
}
