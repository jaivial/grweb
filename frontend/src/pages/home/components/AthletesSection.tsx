import { FC, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useCdnImage } from '@hooks/useCdnImage';

export interface AthletesSectionProps {
  className?: string;
}

/**
 * AthletesSection Component
 * 
 * Features:
 * - Dark theme with black background and dark red accents
 * - Diagonal positioned texts with fade animations
 * - Athlete images with scroll-triggered animations
 * - Faded margins on all 4 sides
 * - Uses Contrail One font (matching Hero/Test sections)
 * - Intersection Observer-based enter/exit animations
 */

// Custom hook for scroll-based visibility with animation state
function useScrollVisibility(options: {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  enterDuration?: number;
  exitDuration?: number;
  threshold?: number;
  rootMargin?: string;
}) {
  const {
    direction = 'up',
    distance = 60,
    enterDuration = 700,
    exitDuration = 500,
    threshold = 0.15,
    rootMargin = '-80px',
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [animationStyle, setAnimationStyle] = useState<React.CSSProperties>(() => ({
    opacity: 0,
    transform: getTransform(direction, distance),
  }));

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Track if element has been seen (for per-element visibility)
  const hasBeenSeen = useRef(false);

  function getTransform(dir: typeof direction, dist: number): string {
    switch (dir) {
      case 'up': return `translateY(${dist}px)`;
      case 'down': return `translateY(${-dist}px)`;
      case 'left': return `translateX(${dist}px)`;
      case 'right': return `translateX(${-dist}px)`;
      default: return `translateY(${dist}px)`;
    }
  }

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only animate in - once visible, stay visible (each element tracks itself)
        if (entry.isIntersecting && !hasBeenSeen.current) {
          hasBeenSeen.current = true;
          if (prefersReducedMotion) {
            setAnimationStyle({ opacity: 1, transform: 'none' });
          } else {
            setAnimationStyle({
              opacity: 1,
              transform: 'none',
              transition: `opacity ${enterDuration}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${enterDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            });
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [direction, distance, enterDuration, exitDuration, threshold, rootMargin, prefersReducedMotion]);

  return { ref, animationStyle };
}

// Individual animated item wrapper
const AnimatedItem: FC<{
  children: React.ReactNode;
  direction: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  className?: string;
  dataUi?: string;
}> = ({ children, direction, delay = 0, className = '', dataUi = 'animated-item' }) => {
  const { ref, animationStyle } = useScrollVisibility({
    direction,
    distance: 50,
    enterDuration: 700,
    exitDuration: 500,
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...animationStyle,
        transitionDelay: `${delay}ms`,
      }}
      data-ui={dataUi}
    >
      {children}
    </div>
  );
};

/**
 * AthletesSection Component
 */
export const AthletesSection: FC<AthletesSectionProps> = ({ className = '' }) => {
  // Text styling matching TestSection (Contrail One font)
  const textStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5)',
  };
  const athlete1Src = useCdnImage('https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_40_58.png');
  const athlete2Src = useCdnImage('https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_52_34.png');

  // Dark red accent style
  const accentStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: '#DC143C', // Crimson red
    textTransform: 'uppercase',
    textShadow: '0 0 30px rgba(220, 20, 60, 0.6), 0 0 60px rgba(139, 0, 0, 0.4)',
  };

  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{
        minHeight: '1300px',
        background: '#0a0a0a',
        paddingTop: '40px',
        paddingBottom: '40px',
      }}
      data-section="athletes"
      data-ui="athletes-section"
    >
      {/* Fade overlay - Top */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-top"
        aria-hidden
      />

      {/* Fade overlay - Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-bottom"
        aria-hidden
      />

      {/* Fade overlay - Left */}
      <div
        className="absolute top-0 bottom-0 left-0 w-24 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-left"
        aria-hidden
      />

      {/* Fade overlay - Right */}
      <div
        className="absolute top-0 bottom-0 right-0 w-24 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-right"
        aria-hidden
      />

      {/* Decorative dark red accent lines */}
      <div
        className="absolute top-12 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(139, 0, 0, 0.4) 30%, rgba(220, 20, 60, 0.6) 50%, rgba(139, 0, 0, 0.4) 70%, transparent 100%)',
        }}
        data-ui="accent-line-top"
        aria-hidden
      />

      <div
        className="absolute bottom-12 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(139, 0, 0, 0.4) 30%, rgba(220, 20, 60, 0.6) 50%, rgba(139, 0, 0, 0.4) 70%, transparent 100%)',
        }}
        data-ui="accent-line-bottom"
        aria-hidden
      />

      {/* Content Container */}
      <div className="relative max-w-7xl mx-auto px-6 lg:px-12" data-ui="content-wrapper">
        
        <style>{`
          @media not all and (min-width: 1280px) {
            .max-xl-w-500 {
              width: 360px !important;
              max-width: 360px !important;
            }
          }
        `}</style>
        
        {/* Layout with diagonal positioning */}
        <div className="relative" style={{ minHeight: '1110px' }} data-ui="diagonal-layout">
          
          {/* First Text - Top Left diagonal */}
          <AnimatedItem direction="up" delay={0} dataUi="animated-text-competition">
            <div
              className="absolute top-4 sm:top-6 md:top-8 left-2 sm:left-4 md:left-8 lg:left-16 transform -rotate-2 z-10"
              style={accentStyle}
              data-ui="text-competition-wrapper"
            >
              <h2
                className="text-xl xs:text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl max-xl:text-6xl leading-tight"
                style={{ fontSize: '3rem', lineHeight: '3.5rem' }}
                data-ui="heading-competition"
              >
                Una competición<br />
                <span className="text-white" data-ui="text-line-made">hecha para</span><br />
                <span className="text-white" data-ui="text-line-athletes">los atletas</span>
              </h2>
            </div>
          </AnimatedItem>

          {/* First Athlete Image - Right side, angled, larger with masked edges */}
          <AnimatedItem direction="right" delay={150} dataUi="animated-image-1">
            <div
              className="absolute top-10 lg:top-12 right-2 sm:right-4 md:right-6 lg:right-12 transform rotate-3 hover:rotate-0 transition-transform duration-500"
              data-ui="athlete-image-wrapper-1"
            >
              <div className="relative w-auto xl:w-[340px] max-w-[340px]" data-ui="image-container-1">
                {/* Image container with 4-sided fade mask */}
                <div
                  className="relative overflow-hidden rounded-lg shadow-2xl"
                  data-ui="image-mask-1"
                  style={{
                    maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                    maskSize: '100% 100%',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                  }}
                >
                  {/* Red accent border glow behind image */}
                  <div
                    className="absolute -inset-2 bg-gradient-to-br from-dark-red/40 via-red-accent/20 to-dark-red/30 rounded-lg blur-md"
                    data-ui="image-glow-1"
                    aria-hidden
                  />
                  <img
                    src={athlete1Src}
                    alt="Atleta competiendo en powerlifting"
                    className="w-full h-auto object-cover"
                    data-ui="image-1"
                    style={{
                      filter: 'contrast(1.05) saturate(0.9)',
                    }}
                    loading="lazy"
                    decoding="async"
                  />
                  {/* Additional edge fade overlays for top, bottom, left, right */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    data-ui="image-edge-fade-1"
                    style={{
                      background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
                    }}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </AnimatedItem>

          {/* Second Text - Bottom right diagonal - No animation wrapper to avoid positioning issues */}
          <div
            className="absolute bottom-4 sm:bottom-8 md:bottom-12 right-4 md:right-8 transform rotate-1 z-10"
            style={textStyle}
            data-ui="text-effort-wrapper"
          >
            <h2
              className="text-xl xs:text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl max-xl:text-6xl leading-tight text-center"
              style={{ fontSize: '3rem', lineHeight: '3.5rem' }}
              data-ui="heading-effort"
            >
              El dia en el que<br />
              <span style={{ color: '#DC143C' }} data-ui="text-line-effort">todo el esfuerzo</span><br />
              <span data-ui="text-line-fruits">da sus frutos</span>
            </h2>
          </div>

          {/* Second Athlete Image - Left side, angled opposite, larger with masked edges */}
          <AnimatedItem direction="left" delay={200} dataUi="animated-image-2">
            <div
              className="absolute bottom-12 md:bottom-16 left-2 sm:left-4 md:left-6 transform -rotate-2 hover:rotate-0 transition-transform duration-500"
              data-ui="athlete-image-wrapper-2"
            >
              <div className="relative w-auto xl:w-[340px] max-w-[340px]" data-ui="image-container-2">
                {/* Image container with 4-sided fade mask */}
                <div
                  className="relative overflow-hidden rounded-lg shadow-2xl"
                  data-ui="image-mask-2"
                  style={{
                    maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                    maskSize: '100% 100%',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                  }}
                >
                  {/* Red accent border glow behind image */}
                  <div
                    className="absolute -inset-2 bg-gradient-to-bl from-dark-red/40 via-red-accent/20 to-dark-red/30 rounded-lg blur-md"
                    data-ui="image-glow-2"
                    aria-hidden
                  />
                  <img
                    src={athlete2Src}
                    alt="Atleta mostrando el trofeo del GR Cup"
                    className="w-full h-auto object-cover"
                    data-ui="image-2"
                    style={{
                      filter: 'contrast(1.05) saturate(0.9)',
                    }}
                    loading="lazy"
                    decoding="async"
                  />
                  {/* Additional edge fade overlays for top, bottom, left, right */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    data-ui="image-edge-fade-2"
                    style={{
                      background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
                    }}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </AnimatedItem>

          {/* Decorative corner accents */}
          <div
            className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-dark-red/30 rounded-tl-lg"
            data-ui="corner-accent-tl"
            aria-hidden
          />
          <div
            className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-dark-red/30 rounded-tr-lg"
            data-ui="corner-accent-tr"
            aria-hidden
          />
          <div
            className="absolute bottom-0 left-0 w-16 h-16 border-l-2 border-b-2 border-dark-red/30 rounded-bl-lg"
            data-ui="corner-accent-bl"
            aria-hidden
          />
          <div
            className="absolute bottom-0 right-0 w-16 h-16 border-r-2 border-b-2 border-dark-red/30 rounded-br-lg"
            data-ui="corner-accent-br"
            aria-hidden
          />

        </div>

        {/* Subtle decorative background elements */}
        <div
          className="absolute top-1/4 right-1/4 w-96 h-96 bg-dark-red/5 rounded-full blur-3xl pointer-events-none"
          data-ui="bg-glow-right"
          aria-hidden
        />
        <div
          className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-red-accent/3 rounded-full blur-3xl pointer-events-none"
          data-ui="bg-glow-left"
          aria-hidden
        />

      </div>

    </section>
  );
};

export default AthletesSection;
