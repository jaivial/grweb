import { useState, useEffect } from 'react';

/**
 * Loads an image from a CDN URL via fetch + blob URL.
 *
 * This bypasses CORS restrictions that can block <img src="cross-origin"> on
 * some browsers/configurations by fetching the bytes first, then creating a
 * same-origin blob URL for the <img> element.
 *
 * Falls back to the original URL if fetch fails (so the image still renders
 * when CORS is properly configured).
 */
export function useCdnImage(src: string): string {
  const [blobUrl, setBlobUrl] = useState<string>(src);

  useEffect(() => {
    let cancelled = false;
    let revoked = false;

    const load = async () => {
      try {
        const response = await fetch(src, { mode: 'cors', cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (cancelled) {
          // Component unmounted — revoke immediately
          URL.revokeObjectURL(URL.createObjectURL(blob));
          return;
        }
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setBlobUrl(url);
      } catch {
        // Fallback: use original URL if blob loading fails
        if (!cancelled) setBlobUrl(src);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return blobUrl;
}
