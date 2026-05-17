import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HERO_SLIDESHOW_IMAGES } from '../constants';
import { useCdnImage } from '@hooks/useCdnImage';

interface HeroSlideshowProps {
  prefersReducedMotion: boolean;
}

const SLIDESHOW_INTERVAL_MS = 6000;
const FADE_DURATION = 0.8;
const KEN_BURNS_DURATION = 6.0;
const KEN_BURNS_SCALE_FROM = 1.0;
const KEN_BURNS_SCALE_TO = 1.08;

export function HeroSlideshow({ prefersReducedMotion }: HeroSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const total = HERO_SLIDESHOW_IMAGES.length;

  const resolvedImages = useMemo(
    () => HERO_SLIDESHOW_IMAGES.map((url) => url),
    []
  );

  // Preload first 3 images via link preload
  useEffect(() => {
    const preloadCount = Math.min(3, total);
    const links: HTMLLinkElement[] = [];
    for (let i = 0; i < preloadCount; i++) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = resolvedImages[i];
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      links.forEach((link) => {
        if (link.parentNode) link.parentNode.removeChild(link);
      });
    };
  }, [total, resolvedImages]);

  // Auto-rotate slideshow
  useEffect(() => {
    if (prefersReducedMotion || total <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, SLIDESHOW_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [prefersReducedMotion, total]);

  return (
    <div
      className="absolute inset-0 w-full h-full"
      data-ui="fer-hero-slideshow-container"
      aria-hidden="true"
    >
      <AnimatePresence>
        <SlideshowImage
          key={currentIndex}
          imageIndex={currentIndex}
          prefersReducedMotion={prefersReducedMotion}
        />
      </AnimatePresence>

      {/* Black overlay at 70% opacity */}
      <div
        className="absolute inset-0 z-[1]"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        data-ui="fer-hero-slideshow-overlay"
      />
    </div>
  );
}

interface SlideshowImageProps {
  imageIndex: number;
  prefersReducedMotion: boolean;
}

function SlideshowImage({ imageIndex, prefersReducedMotion }: SlideshowImageProps) {
  const src = useCdnImage(HERO_SLIDESHOW_IMAGES[imageIndex]);

  const fadeIn = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: {
        duration: FADE_DURATION,
        ease: 'easeInOut' as const,
      },
    }),
    []
  );

  const kenBurnsAnimate = useMemo(
    () =>
      prefersReducedMotion
        ? { scale: KEN_BURNS_SCALE_FROM }
        : { scale: [KEN_BURNS_SCALE_FROM, KEN_BURNS_SCALE_TO] },
    [prefersReducedMotion]
  );

  const kenBurnsTransition = useMemo(
    () => ({
      duration: KEN_BURNS_DURATION,
      ease: 'linear' as const,
    }),
    []
  );

  return (
    <motion.div
      className="absolute inset-0 w-full h-full"
      data-ui={`fer-hero-slideshow-image-${imageIndex}`}
    >
      <motion.img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        style={{ filter: 'grayscale(100%)', objectPosition: 'center 25%' }}
        loading={imageIndex < 3 ? 'eager' : 'lazy'}
        decoding="async"
        initial={fadeIn.initial}
        animate={{ ...fadeIn.animate, ...kenBurnsAnimate }}
        exit={fadeIn.exit}
        transition={{
          ...fadeIn.transition,
          scale: kenBurnsTransition,
        }}
        data-ui={`fer-hero-slideshow-img-${imageIndex}`}
      />
    </motion.div>
  );
}
