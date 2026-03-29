import { FC, useRef, useEffect, useState, useMemo } from 'react';
import { AutoRotatingImageSlider, SliderImage } from '../../../components/AutoRotatingImageSlider';

export interface OrganizationEquipmentSectionProps {
  className?: string;
}

// Reuse scroll visibility hook pattern from existing sections
function useScrollVisibility(options: {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  enterDuration?: number;
  threshold?: number;
  rootMargin?: string;
}) {
  const {
    direction = 'up',
    distance = 60,
    enterDuration = 700,
    threshold = 0.15,
    rootMargin = '-80px',
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [animationStyle, setAnimationStyle] = useState<React.CSSProperties>(() => ({
    opacity: 0,
    transform: getTransform(direction, distance),
  }));

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);

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
  }, [direction, distance, enterDuration, threshold, rootMargin, prefersReducedMotion]);

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

// Image data for Organization slider
const organizationImages: SliderImage[] = [
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/ChatGPT%20Image%2023%20mar%202026%2C%2000_48_30.png',
    alt: 'AEP jueces y cargadores expertos con material profesional de powerlifting',
    caption: 'AEP jueces y cargadores expertos, con material profesional de powerlifting y acceso para el público',
  },
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/ChatGPT%20Image%2023%20mar%202026%2C%2000_51_23.png',
    alt: 'Equipamiento profesional de powerlifting',
    caption: 'AEP jueces y cargadores expertos, con material profesional de powerlifting y acceso para el público',
  },
];

// Image data for Trainers & Athletes slider
const trainersAthletesImages: SliderImage[] = [
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/ChatGPT%20Image%2022%20mar%202026%2C%2023_48_28.png',
    alt: 'Organización hecha para favorecer el trabajo de los entrenadores y sus atletas',
    caption: 'Organización hecha para favorecer el trabajo de los entrenadores y sus atletas',
  },
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/Screenshot%20From%202026-03-29%2021-42-28.png',
    alt: 'Relación entre entrenadores y atletas',
    caption: 'Organización hecha para favorecer el trabajo de los entrenadores y sus atletas',
  },
];

/**
 * OrganizationEquipmentSection Component
 * 
 * Features:
 * - Dark theme with black background and dark red accents
 * - Two automatic rotating image sliders
 * - Scroll-triggered animations
 * - Fade edge overlays matching existing sections
 * - Contrail One font for headings
 * - Decorative accent elements
 */
export const OrganizationEquipmentSection: FC<OrganizationEquipmentSectionProps> = ({ className = '' }) => {
  // Common text styles matching existing sections
  const titleStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: 'rgba(255, 255, 255, 0.85)',
    textTransform: 'uppercase',
  };

  const accentStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: '#DC143C',
    textTransform: 'uppercase',
    textShadow: '0 0 30px rgba(220, 20, 60, 0.6), 0 0 60px rgba(139, 0, 0, 0.4)',
  };

  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{
        minHeight: 'auto',
        background: '#0a0a0a',
        paddingTop: '60px',
        paddingBottom: '80px',
      }}
      data-section="organization-equipment"
      data-ui="organization-equipment-section"
    >
      {/* Fade overlays - Top */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-top"
        aria-hidden
      />

      {/* Fade overlays - Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-bottom"
        aria-hidden
      />

      {/* Fade overlays - Left */}
      <div
        className="absolute top-0 bottom-0 left-0 w-16 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-left"
        aria-hidden
      />

      {/* Fade overlays - Right */}
      <div
        className="absolute top-0 bottom-0 right-0 w-16 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-overlay-right"
        aria-hidden
      />

      {/* Decorative accent lines */}
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
      <div className="relative z-20 max-w-6xl mx-auto px-6 lg:px-12" data-ui="section-content">
        
        {/* Section Title */}
        <AnimatedItem direction="up" delay={0} dataUi="animated-title">
          <div className="text-center mb-12" data-ui="title-container">
            <h2
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl"
              data-ui="section-title"
              style={titleStyle}
            >
              <span style={accentStyle} data-ui="title-accent">Organización</span>{' '}
              <span data-ui="title-text">y Equipamiento</span>
            </h2>
            <div
              className="mt-4 mx-auto w-24 h-px"
              data-ui="title-underline"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)',
              }}
            />
          </div>
        </AnimatedItem>

        {/* Sliders Container */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16"
          data-ui="sliders-grid"
        >
          {/* Organization Slider */}
          <AnimatedItem direction="left" delay={100} dataUi="animated-slider-organization">
            <div
              className="flex flex-col items-center"
              data-ui="slider-organization-wrapper"
            >
              <div className="w-full max-w-md sm:max-w-lg" data-ui="slider-organization-container">
                <AutoRotatingImageSlider
                  images={organizationImages}
                  autoRotateInterval={4000}
                  pauseOnHover={true}
                  showDots={true}
                  showCaptions={true}
                  height={320}
                  dataUi="slider-organization"
                />
              </div>
              <h3
                className="mt-6 text-lg sm:text-xl md:text-2xl text-center"
                data-ui="slider-organization-label"
                style={subtitleStyle}
              >
                Profesionalidad AEP
              </h3>
            </div>
          </AnimatedItem>

          {/* Trainers & Athletes Slider */}
          <AnimatedItem direction="right" delay={200} dataUi="animated-slider-trainers">
            <div
              className="flex flex-col items-center"
              data-ui="slider-trainers-wrapper"
            >
              <div className="w-full max-w-md sm:max-w-lg" data-ui="slider-trainers-container">
                <AutoRotatingImageSlider
                  images={trainersAthletesImages}
                  autoRotateInterval={4000}
                  pauseOnHover={true}
                  showDots={true}
                  showCaptions={true}
                  height={320}
                  dataUi="slider-trainers"
                />
              </div>
              <h3
                className="mt-6 text-lg sm:text-xl md:text-2xl text-center"
                data-ui="slider-trainers-label"
                style={subtitleStyle}
              >
                Entrenadores y Atletas
              </h3>
            </div>
          </AnimatedItem>
        </div>

        {/* Additional description text */}
        <AnimatedItem direction="up" delay={300} dataUi="animated-description">
          <div
            className="text-center mt-12 max-w-3xl mx-auto"
            data-ui="description-container"
          >
            <p
              className="text-base sm:text-lg md:text-xl leading-relaxed"
              data-ui="description-text"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                letterSpacing: '0.02em',
                color: 'rgba(255, 255, 255, 0.8)',
                textTransform: 'uppercase',
              }}
            >
              Una competición diseñada para ofrecer la mejor experiencia tanto para{' '}
              <span style={{ color: '#DC143C' }} data-ui="description-highlight-athletes">atletas</span>{' '}
              como para{' '}
              <span style={{ color: '#DC143C' }} data-ui="description-highlight-trainers">entrenadores</span>,
              con jueces certificados y equipamiento de primera categoría.
            </p>
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

      {/* Background glow effects */}
      <div
        className="absolute top-1/4 left-1/4 w-80 h-80 bg-dark-red/5 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-left"
        aria-hidden
      />
      <div
        className="absolute top-1/4 right-1/4 w-80 h-80 bg-red-accent/4 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-right"
        aria-hidden
      />
    </section>
  );
};

export default OrganizationEquipmentSection;
