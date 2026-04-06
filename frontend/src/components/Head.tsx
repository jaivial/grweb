import { useEffect } from 'preact/hooks';

interface HeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  canonicalUrl?: string;
  children?: preact.ComponentChildren;
}

const DEFAULT_TITLE = 'GR Cup 2026 — Copa de Powerlifting en España';
const DEFAULT_DESCRIPTION = 'GR Cup 2026: la mayor competición de powerlifting en España. Participa en el sorteo de cinturones SBD y A7.';
const DEFAULT_OG_IMAGE = '/og-image.png';

export function Head({
  title,
  description,
  ogImage,
  canonicalUrl,
  children,
}: HeadProps): JSX.Element {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
    // Update or inject meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);

    // Update og:title
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', title || DEFAULT_TITLE);

    // Update og:description
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);

    // Update og:image
    let ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) {
      ogImg.setAttribute('content', ogImage || DEFAULT_OG_IMAGE);
    }

    // Update twitter:title
    let twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) {
      twTitle.setAttribute('content', title || DEFAULT_TITLE);
    }

    // Update twitter:description
    let twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) {
      twDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);
    }

    // Canonical URL
    if (canonicalUrl) {
      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);
    }
  }, [title, description, ogImage, canonicalUrl]);

  return <>{children}</>;
}
