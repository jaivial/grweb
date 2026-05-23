import { useState, useCallback } from 'react';
import { ImageIcon } from 'lucide-react';

interface FallbackImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}

export function FallbackImage({ src, alt, className = '', iconClassName = '' }: FallbackImageProps) {
  const [hasError, setHasError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const showFallback = !src || hasError;

  if (showFallback) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-800 rounded-xl ${className}`}
        data-testid="fallback-image-icon"
        data-ui="fallback-image"
      >
        <ImageIcon className={`text-gray-500 ${iconClassName || 'w-12 h-12'}`} />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`} data-ui="fallback-image-wrapper">
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-800"
          data-ui="fallback-image-loading"
        >
          <ImageIcon className="w-12 h-12 text-gray-500 animate-pulse" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onError={handleError}
        onLoad={handleLoad}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        data-ui="fallback-image-img"
      />
    </div>
  );
}
