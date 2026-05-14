import { useEffect, type ReactNode } from 'react';

interface HeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  canonicalUrl?: string;
  children?: ReactNode;
}

const DEFAULT_TITLE = 'FER CUP II 2026';
const DEFAULT_DESCRIPTION = 'Tu primera competición de powerlifting en Valencia, Valencia.';
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
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);

    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', title || DEFAULT_TITLE);

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);

    let ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) {
      ogImg.setAttribute('content', ogImage || DEFAULT_OG_IMAGE);
    }

    let twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) {
      twTitle.setAttribute('content', title || DEFAULT_TITLE);
    }

    let twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) {
      twDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);
    }

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
