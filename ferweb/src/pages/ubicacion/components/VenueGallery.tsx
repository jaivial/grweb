import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { FER_COLORS, FER_UBICACION_INSTALACIONES_IMAGES } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { UBICACION_SECTION_IDS } from '../constants';

const GALLERY_IMAGES = FER_UBICACION_INSTALACIONES_IMAGES;

function GalleryThumbnail({
  src,
  index,
  onClick,
}: {
  src: string;
  index: number;
  onClick: (index: number) => void;
}) {
  const resolvedSrc = useCdnImage(src);
  const handleClick = useCallback(() => onClick(index), [onClick, index]);

  return (
    <button
      onClick={handleClick}
      className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer transition-transform duration-200 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
      data-ui={`ubicacion-gallery-thumb-${index}`}
      aria-label={`Ver foto ${index + 1} del club`}
    >
      <img
        src={resolvedSrc}
        alt={`Instalaciones del club ${index + 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        data-ui={`ubicacion-gallery-thumb-img-${index}`}
      />
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
        style={{ backgroundColor: `${FER_COLORS.bgDark}80` }}
        data-ui={`ubicacion-gallery-thumb-overlay-${index}`}
      >
        <span
          className="text-sm font-medium"
          style={{ color: FER_COLORS.text }}
          data-ui={`ubicacion-gallery-thumb-zoom-${index}`}
        >
          Ampliar
        </span>
      </div>
    </button>
  );
}

function Lightbox({
  images,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: {
  images: readonly string[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const currentSrc = useCdnImage(images[currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: `${FER_COLORS.bgDark}f0` }}
      data-ui="ubicacion-gallery-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Visor de fotos del club"
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-3 rounded-full transition-colors hover:bg-white/10 z-10"
        data-ui="ubicacion-gallery-lightbox-close"
        aria-label="Cerrar visor"
      >
        <X size={24} style={{ color: FER_COLORS.text }} data-ui="ubicacion-gallery-lightbox-close-icon" />
      </button>

      {/* Prev */}
      <button
        onClick={onPrev}
        className="absolute left-2 sm:left-4 p-2 sm:p-3 rounded-full transition-colors hover:bg-white/10 z-10"
        data-ui="ubicacion-gallery-lightbox-prev"
        aria-label="Foto anterior"
      >
        <ChevronLeft size={28} style={{ color: FER_COLORS.text }} data-ui="ubicacion-gallery-lightbox-prev-icon" />
      </button>

      {/* Image */}
      <div
        className="max-w-4xl max-h-[80vh] w-full"
        data-ui="ubicacion-gallery-lightbox-img-wrapper"
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={currentIndex}
            src={currentSrc}
            alt={`Foto del club ${currentIndex + 1}`}
            className="w-full h-full object-contain rounded-lg"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            data-ui={`ubicacion-gallery-lightbox-img-${currentIndex}`}
          />
        </AnimatePresence>
      </div>

      {/* Next */}
      <button
        onClick={onNext}
        className="absolute right-2 sm:right-4 p-2 sm:p-3 rounded-full transition-colors hover:bg-white/10 z-10"
        data-ui="ubicacion-gallery-lightbox-next"
        aria-label="Foto siguiente"
      >
        <ChevronRight size={28} style={{ color: FER_COLORS.text }} data-ui="ubicacion-gallery-lightbox-next-icon" />
      </button>

      {/* Counter */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium"
        style={{
          backgroundColor: `${FER_COLORS.bgCard}e6`,
          color: FER_COLORS.textMuted,
          border: `1px solid ${FER_COLORS.accent}25`,
        }}
        data-ui="ubicacion-gallery-lightbox-counter"
      >
        {currentIndex + 1} / {images.length}
      </div>
    </motion.div>
  );
}

export function VenueGallery() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const sectionVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 30 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: 'easeOut' },
      },
    }),
    []
  );

  const gridVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
      },
    }),
    []
  );

  const thumbVariants = useMemo(
    () => ({
      hidden: { opacity: 0, scale: 0.9 },
      visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
    }),
    []
  );

  const handleOpen = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const handlePrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length : null
    );
  }, []);

  const handleNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % GALLERY_IMAGES.length : null
    );
  }, []);

  return (
    <section
      id={UBICACION_SECTION_IDS.gallery}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="ubicacion-gallery-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="ubicacion-gallery-container"
      >
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={sectionVariants}
          className="text-center mb-10 sm:mb-14"
          data-ui="ubicacion-gallery-header"
        >
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="ubicacion-gallery-title"
          >
            Nuestras{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="ubicacion-gallery-title-highlight">
              instalaciones
            </span>
          </h2>
          <div
            className="w-20 h-1 mx-auto rounded-full"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="ubicacion-gallery-divider"
            aria-hidden="true"
          />
        </motion.div>

        {/* Grid */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={gridVariants}
          className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4"
          data-ui="ubicacion-gallery-grid"
        >
          {GALLERY_IMAGES.map((src, i) => (
            <motion.div key={`gallery-${i}`} variants={thumbVariants}>
              <GalleryThumbnail src={src} index={i} onClick={handleOpen} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            images={GALLERY_IMAGES}
            currentIndex={lightboxIndex}
            onClose={handleClose}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
