import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useCdnImage } from '@hooks/useCdnImage';
import { FER_COLORS, CLUB_PHOTOS } from '../constants';

/** Offsets from center (0,0 = viewport center) */
interface FloatingPhotoProps {
  src: string;
  scrollProgress: ReturnType<typeof useTransform<number, number>>;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startRotation: number;
  endRotation: number;
  startScale: number;
  size: 'sm' | 'md' | 'lg';
  zIndex: number;
  moveRange: [number, number];
  visibleRange: [number, number];
}

function FloatingPhoto({
  src,
  scrollProgress,
  startX,
  startY,
  endX,
  endY,
  startRotation,
  endRotation,
  startScale,
  size,
  zIndex,
  moveRange,
  visibleRange,
}: FloatingPhotoProps) {
  const resolvedSrc = useCdnImage(src);

  const x = useTransform(scrollProgress, [0, moveRange[0], moveRange[1], 1], [startX, startX, endX, endX]);
  const y = useTransform(scrollProgress, [0, moveRange[0], moveRange[1], 1], [startY, startY, endY, endY]);
  const rotate = useTransform(scrollProgress, [0, moveRange[0], moveRange[1], 1], [startRotation, startRotation, endRotation, endRotation]);
  const scale = useTransform(scrollProgress, [visibleRange[0], moveRange[0], moveRange[1], visibleRange[1]], [startScale, 1, 1.05, startScale * 0.98]);
  const opacity = useTransform(
    scrollProgress,
    [visibleRange[0], visibleRange[0] + 0.06, visibleRange[1] - 0.08, visibleRange[1]],
    [0, 0.9, 0.9, 0]
  );

  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'w-20 h-28 sm:w-36 sm:h-48 md:w-44 md:h-56';
      case 'md':
        return 'w-24 h-32 sm:w-48 sm:h-64 md:w-56 md:h-72';
      case 'lg':
        return 'w-28 h-36 sm:w-56 sm:h-72 md:w-64 md:h-80';
    }
  }, [size]);

  return (
    <motion.div
      style={{ x, y, rotate, scale, opacity, zIndex, position: 'absolute' }}
      className={`${sizeClasses} rounded-xl overflow-hidden shadow-2xl`}
      data-ui="parallax-photo"
    >
      <img
        src={resolvedSrc}
        alt=""
        className="w-full h-full object-cover"
        style={{ objectPosition: 'center 25%' }}
        loading="lazy"
        decoding="async"
        data-ui="parallax-photo-img"
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${FER_COLORS.bgDark}40 0%, transparent 60%)` }}
        aria-hidden="true"
        data-ui="parallax-photo-overlay"
      />
    </motion.div>
  );
}

interface ParallaxTextProps {
  scrollProgress: ReturnType<typeof useTransform<number, number>>;
  text: string;
  color: string;
  fontSize: string;
  enterAt: number;
  exitAt: number;
  yStart: number;
  zIndex: number;
}

function ParallaxText({
  scrollProgress,
  text,
  color,
  fontSize,
  enterAt,
  exitAt,
  yStart,
  zIndex,
}: ParallaxTextProps) {
  const y = useTransform(scrollProgress, [enterAt, (enterAt + exitAt) / 2, exitAt], [yStart, 0, yStart]);
  const opacity = useTransform(
    scrollProgress,
    [enterAt, enterAt + 0.06, exitAt - 0.06, exitAt],
    [0, 1, 1, 0]
  );
  const scale = useTransform(
    scrollProgress,
    [enterAt, enterAt + 0.1, exitAt - 0.1, exitAt],
    [0.85, 1, 1, 0.85]
  );

  return (
    <div
      className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center overflow-x-clip"
      style={{ zIndex }}
      data-ui="parallax-text-wrapper"
    >
      <motion.h2
        style={{ y, opacity, scale, color, fontSize, fontWeight: 900, fontFamily: '"Syne", "Inter", system-ui, sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase', textShadow: `0 0 24px ${FER_COLORS.bgDark}, 0 4px 32px ${FER_COLORS.bgDark}` }}
        className="text-center pointer-events-none select-none whitespace-nowrap"
        data-ui="parallax-text"
      >
        {text}
      </motion.h2>
    </div>
  );
}

/** 8 unique images not used by any other component */
const PARALLAX_IMAGES = CLUB_PHOTOS.parallax;
const PARALLAX_VIDEO = CLUB_PHOTOS.parallaxVideo;
const PARALLAX_ACCELERATION_START = 0.06;
const PARALLAX_ACCELERATION_END = 0.9;

export function ParallaxShowcase(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const videoOpacity = useTransform(scrollYProgress, [0, 0.12, 0.9, 1], [0, 0.35, 0.35, 0]);
  const videoScale = useTransform(scrollYProgress, [0, 0.55, 1], [1, 1.18, 1.36]);
  const acceleratedScrollProgress = useTransform(
    scrollYProgress,
    [PARALLAX_ACCELERATION_START, PARALLAX_ACCELERATION_END],
    [0, 1],
    { clamp: true }
  );

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const useStaticLayout = prefersReducedMotion;

  /** Responsive scale factor for photo offsets (1.0 on desktop, ~0.42-0.54 on mobile) */
  const mobileScale = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    return Math.min(1, window.innerWidth / 768);
  }, []);

  /**
   * Center-based offsets: (0,0) = center of viewport.
   * Photos fan out from center and drift inward as user scrolls.
   */
  const photoConfigs = useMemo(
    () => [
      { src: PARALLAX_IMAGES[0], startX: -240 * mobileScale, startY: 100 * mobileScale, endX: -80 * mobileScale, endY: -30 * mobileScale, startRot: -8, endRot: 2, startScale: 0.8, size: 'md' as const, z: 2, move: [0.22, 0.56], visible: [0.18, 0.62] },
      { src: PARALLAX_IMAGES[1], startX: 225 * mobileScale, startY: -80 * mobileScale, endX: 100 * mobileScale, endY: 50 * mobileScale, startRot: 5, endRot: -3, startScale: 0.85, size: 'lg' as const, z: 3, move: [0.26, 0.62], visible: [0.22, 0.68] },
      { src: PARALLAX_IMAGES[2], startX: -165 * mobileScale, startY: -180 * mobileScale, endX: -100 * mobileScale, endY: 60 * mobileScale, startRot: -4, endRot: 1, startScale: 0.75, size: 'sm' as const, z: 1, move: [0.32, 0.66], visible: [0.28, 0.72] },
      { src: PARALLAX_IMAGES[3], startX: 195 * mobileScale, startY: 140 * mobileScale, endX: 60 * mobileScale, endY: -60 * mobileScale, startRot: 7, endRot: -2, startScale: 0.9, size: 'md' as const, z: 2, move: [0.38, 0.72], visible: [0.34, 0.78] },
      { src: PARALLAX_IMAGES[4], startX: -260 * mobileScale, startY: 120 * mobileScale, endX: -40 * mobileScale, endY: 30 * mobileScale, startRot: -6, endRot: 3, startScale: 0.8, size: 'lg' as const, z: 3, move: [0.44, 0.8], visible: [0.4, 0.86] },
      { src: PARALLAX_IMAGES[5], startX: 255 * mobileScale, startY: -100 * mobileScale, endX: 80 * mobileScale, endY: -20 * mobileScale, startRot: 4, endRot: -4, startScale: 0.85, size: 'sm' as const, z: 1, move: [0.5, 0.84], visible: [0.46, 0.9] },
      { src: PARALLAX_IMAGES[6], startX: -135 * mobileScale, startY: 200 * mobileScale, endX: -90 * mobileScale, endY: -50 * mobileScale, startRot: -3, endRot: 2, startScale: 0.8, size: 'md' as const, z: 2, move: [0.56, 0.88], visible: [0.52, 0.94] },
      { src: PARALLAX_IMAGES[7], startX: 150 * mobileScale, startY: -160 * mobileScale, endX: 110 * mobileScale, endY: 40 * mobileScale, startRot: 6, endRot: -1, startScale: 0.9, size: 'lg' as const, z: 3, move: [0.6, 0.9], visible: [0.56, 0.96] },
    ],
    [mobileScale]
  );

  const photos = useMemo(
    () =>
      useStaticLayout
        ? null
        : photoConfigs.map((cfg, i) => (
            <FloatingPhoto
              key={`parallax-photo-${i}`}
              src={cfg.src}
              scrollProgress={acceleratedScrollProgress}
              startX={cfg.startX}
              startY={cfg.startY}
              endX={cfg.endX}
              endY={cfg.endY}
              startRotation={cfg.startRot}
              endRotation={cfg.endRot}
              startScale={cfg.startScale}
              size={cfg.size}
              zIndex={cfg.z}
              moveRange={cfg.move as [number, number]}
              visibleRange={cfg.visible as [number, number]}
            />
          )),
    [acceleratedScrollProgress, photoConfigs, useStaticLayout]
  );

  const textLayers = useMemo(
    () =>
      useStaticLayout
        ? null
        : [
            { text: 'LA FUERZA', color: FER_COLORS.gold, fontSize: 'clamp(1.25rem, 5vw, 6rem)', enter: 0.03, exit: 0.56, yStart: 72 * mobileScale, z: 20 },
            { text: 'NO SE HEREDA', color: FER_COLORS.glow, fontSize: 'clamp(1.1rem, 4vw, 4.5rem)', enter: 0.2, exit: 0.7, yStart: 56 * mobileScale, z: 20 },
            { text: 'SE ENTRENA', color: FER_COLORS.gold, fontSize: 'clamp(1.25rem, 5vw, 6rem)', enter: 0.68, exit: 0.98, yStart: -56 * mobileScale, z: 20 },
          ].map((cfg) => (
            <ParallaxText
              key={`parallax-text-${cfg.text}`}
              scrollProgress={acceleratedScrollProgress}
              text={cfg.text}
              color={cfg.color}
              fontSize={cfg.fontSize}
              enterAt={cfg.enter}
              exitAt={cfg.exit}
              yStart={cfg.yStart}
              zIndex={cfg.z}
            />
          )),
    [acceleratedScrollProgress, useStaticLayout, mobileScale]
  );

  /* ---------- Static fallback (reduced motion only) ---------- */
  const staticPhotos = useMemo(
    () => PARALLAX_IMAGES.map((src, i) => (
      <StaticPhoto key={`static-photo-${i}`} src={src} index={i} />
    )),
    []
  );

  if (useStaticLayout) {
    return (
      <section
        className="py-16 sm:py-20 md:py-24 px-4 sm:px-6"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="parallax-showcase-section"
      >
        <div className="max-w-5xl mx-auto text-center" data-ui="parallax-static-container">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-black mb-4 sm:mb-6"
            style={{ color: FER_COLORS.gold }}
            data-ui="parallax-static-title-1"
          >
            LA FUERZA
          </h2>
          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-display font-black mb-4 sm:mb-6"
            style={{ color: FER_COLORS.glow }}
            data-ui="parallax-static-title-2"
          >
            NO SE HEREDA
          </h2>
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-black mb-10 sm:mb-14 md:mb-16"
            style={{ color: FER_COLORS.gold }}
            data-ui="parallax-static-title-3"
          >
            SE ENTRENA
          </h2>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4"
            data-ui="parallax-static-grid"
          >
            {staticPhotos}
          </div>
        </div>
      </section>
    );
  }

  /* ---------- Animated parallax ---------- */
  return (
    <section
      ref={containerRef}
      className="relative w-full max-w-full min-h-[410svh] overflow-x-clip sm:min-h-[530svh] md:min-h-[610vh]"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="parallax-showcase-section"
    >
      <div
        className="sticky inset-x-0 top-0 h-[100svh] min-h-[100svh] w-full max-w-full overflow-clip md:h-screen md:min-h-screen"
        data-ui="parallax-viewport"
      >
        <motion.video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: videoOpacity, scale: videoScale }}
          data-ui="parallax-video"
        >
          <source src={PARALLAX_VIDEO} type="video/webm" data-ui="parallax-video-source" />
        </motion.video>

        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${FER_COLORS.bgDark} 0%, transparent 25%, transparent 75%, ${FER_COLORS.bgDark} 100%)` }}
          aria-hidden="true"
          data-ui="parallax-video-gradient"
        />

        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 60% 50% at 50% 50%, transparent 0%, ${FER_COLORS.bgDark}DD 100%)` }}
          aria-hidden="true"
          data-ui="parallax-vignette"
        />

        <div
          className="relative flex h-full w-full max-w-full items-center justify-center overflow-x-clip"
          data-ui="parallax-layers"
        >
          {photos}
          {textLayers}
        </div>
      </div>
    </section>
  );
}

function StaticPhoto({ src, index }: { src: string; index: number }) {
  const resolvedSrc = useCdnImage(src);
  return (
    <div
      className="aspect-[3/4] rounded-lg overflow-hidden"
      data-ui={`parallax-static-photo-${index}`}
    >
      <img
        src={resolvedSrc}
        alt=""
        className="w-full h-full object-cover"
        style={{ objectPosition: 'center 25%' }}
        loading="lazy"
        decoding="async"
        data-ui={`parallax-static-img-${index}`}
      />
    </div>
  );
}

export default ParallaxShowcase;
