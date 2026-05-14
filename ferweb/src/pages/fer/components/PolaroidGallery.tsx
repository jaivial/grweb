import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useCdnImage } from '@hooks/useCdnImage';
import {
  FER_COLORS,
  CLUB_PHOTOS,
  POLAROID_START_OFFSET_X,
  POLAROID_START_ROTATION,
} from '../constants';

interface PolaroidCardProps {
  src: string;
  caption: string;
  rotation: number;
  index: number;
  side: 'left' | 'right';
}

function PolaroidCard({ src, caption, rotation, index, side }: PolaroidCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const resolvedSrc = useCdnImage(src);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'center center'],
  });

  const startX = side === 'left' ? -POLAROID_START_OFFSET_X : POLAROID_START_OFFSET_X;
  const startRot = side === 'left' ? -POLAROID_START_ROTATION : POLAROID_START_ROTATION;

  const x = useTransform(scrollYProgress, [0, 1], [startX, 0]);
  const rotate = useTransform(scrollYProgress, [0, 1], [startRot, rotation]);
  const opacity = useTransform(scrollYProgress, [0, 0.25], [0, 1]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.75, 1]);

  const motionStyle = useMemo(
    () =>
      prefersReducedMotion
        ? { transform: `rotate(${rotation}deg)` }
        : { x, rotate, opacity, scale },
    [prefersReducedMotion, rotation, x, rotate, opacity, scale]
  );

  return (
    <motion.div
      ref={cardRef}
      style={motionStyle}
      className="group relative rounded-sm p-2 pb-5 shadow-2xl select-none bg-white/80"
      data-ui={`polaroid-card-${index}`}
      data-testid={`polaroid-card-${index}`}
    >
      <div
        className="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-5 -rotate-1 opacity-50 z-10 pointer-events-none"
        style={{ backgroundColor: 'rgba(255, 235, 180, 0.65)' }}
        data-ui={`polaroid-tape-${index}`}
        aria-hidden="true"
      />

      <div
        className="relative w-full aspect-[4/3] overflow-hidden bg-gray-200"
        data-ui={`polaroid-img-wrapper-${index}`}
      >
        <img
          src={resolvedSrc}
          alt={caption}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          data-ui={`polaroid-img-${index}`}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: 'inset 0 0 15px rgba(0,0,0,0.12)' }}
          data-ui={`polaroid-vignette-${index}`}
          aria-hidden="true"
        />
      </div>

      <p
        className="text-center mt-3 text-sm tracking-wide"
        style={{
          fontFamily: '"Caveat", cursive, sans-serif',
          color: '#111827',
        }}
        data-ui={`polaroid-caption-${index}`}
      >
        {caption}
      </p>
    </motion.div>
  );
}

interface PolaroidGalleryProps {
  className?: string;
}

const GALLERY_CAPTIONS = [
  'El club',
  'Competición',
  'Entrenamiento',
  'La energía',
  'Superación',
  'Compañerismo',
  'Fuerza',
  'Pasión',
  'Comunidad',
] as const;

const GALLERY_ROTATIONS = [-3, 2.5, -2, 3.5, -4, 2, -1.5, 3, -2.5] as const;

export function PolaroidGallery({ className = '' }: PolaroidGalleryProps): JSX.Element {
  const photos = useMemo(
    () =>
      CLUB_PHOTOS.gallery.map((src, i) => ({
        src,
        caption: GALLERY_CAPTIONS[i],
        rotation: GALLERY_ROTATIONS[i],
      })),
    []
  );

  const sides = useMemo(
    () => photos.map((_, i) => (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right'),
    [photos]
  );

  const cards = useMemo(
    () =>
      photos.map((photo, i) => (
        <PolaroidCard
          key={`polaroid-${i}`}
          src={photo.src}
          caption={photo.caption}
          rotation={photo.rotation}
          index={i}
          side={sides[i]}
        />
      )),
    [photos, sides]
  );

  return (
    <section
      className={`py-20 sm:py-28 px-4 overflow-hidden ${className}`}
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="polaroid-gallery-section"
      data-testid="polaroid-gallery-section"
    >
      <div className="max-w-6xl mx-auto" data-ui="polaroid-gallery-container">
        <div
          className="text-center mb-14 sm:mb-16"
          data-ui="polaroid-gallery-header"
        >
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="polaroid-gallery-title"
          >
            Momentos{' '}
            <span
              style={{ color: FER_COLORS.gold }}
              data-ui="polaroid-gallery-title-highlight"
            >
              épicos
            </span>
          </h2>
          <p
            className="text-base sm:text-lg"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="polaroid-gallery-subtitle"
          >
            Esto es lo que vivimos en GR Strength.
          </p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 sm:gap-12 lg:gap-14"
          data-ui="polaroid-gallery-grid"
        >
          {cards}
        </div>
      </div>
    </section>
  );
}

export default PolaroidGallery;
