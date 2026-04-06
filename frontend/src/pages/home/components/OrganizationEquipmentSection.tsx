import { FC, useRef, useEffect, useState, useMemo } from 'react';

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
  style?: React.CSSProperties;
}> = ({ children, direction, delay = 0, className = '', dataUi = 'animated-item', style }) => {
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
        ...style,
      }}
      data-ui={dataUi}
    >
      {children}
    </div>
  );
};

// Image data for Organization
const organizationImages = [
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/ChatGPT%20Image%2023%20mar%202026%2C%2000_48_30.png',
    alt: 'AEP jueces y cargadores expertos con material profesional de powerlifting',
    caption: 'Jueces y cargadores certificados AEP con equipamiento profesional de élite',
  },
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/ChatGPT%20Image%2023%20mar%202026%2C%2000_51_23.png',
    alt: 'Equipamiento profesional de powerlifting',
    caption: 'Plataforma y rack de competición con acceso para todo el público',
  },
];

// Image data for Trainers & Athletes
const trainersAthletesImages = [
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/ChatGPT%20Image%2022%20mar%202026%2C%2023_48_28.png',
    alt: 'Organización hecha para favorecer el trabajo de los entrenadores y sus atletas',
    caption: 'Estructura pensada para que cada entrenador pueda seguir de cerca a sus atletas',
  },
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/organization/Screenshot%20From%202026-03-29%2021-42-28.png',
    alt: 'Relación entre entrenadores y atletas',
    caption: 'Sesiones de carga donde la relación entrenador-atleta es fundamental',
  },
];

// Individual animated image component
const AnimatedImage: FC<{
  src: string;
  alt: string;
  caption?: string;
  direction: 'left' | 'right';
  delay?: number;
  dataUi: string;
  className?: string;
}> = ({ src, alt, caption, direction, delay = 0, dataUi, className = '' }) => {
  const { ref, animationStyle } = useScrollVisibility({
    direction,
    distance: 50,
    enterDuration: 700,
  });

  return (
    <figure
      ref={ref}
      className={`w-full max-w-[410px] mx-auto ${className}`}
      style={{ ...animationStyle, transitionDelay: `${delay}ms` }}
      data-ui={dataUi}
    >
      <div className="relative overflow-hidden rounded-lg" data-ui={`image-container-${dataUi}`}>
        <div
          className="relative overflow-hidden rounded-lg"
          data-ui={`image-mask-${dataUi}`}
          style={{
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, black 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, black 100%)',
            maskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        >
          <img
            src={src}
            alt={alt}
            className="w-full h-auto block"
            loading="lazy"
          />
          {/* Edge fade overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            data-ui={`image-edge-fade-${dataUi}`}
            style={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
            }}
            aria-hidden
          />
        </div>
      </div>
      {caption && (
        <figcaption
          className="mt-3 text-sm sm:text-base md:text-lg text-center px-2"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            letterSpacing: '0.02em',
            color: 'rgba(255, 255, 255, 0.75)',
            textTransform: 'uppercase',
          }}
          data-ui={`${dataUi}-caption`}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

/**
 * OrganizationEquipmentSection Component
 *
 * Features:
 * - Dark theme with black background and dark red accents
 * - Images displayed with native aspect ratios
 * - Side-by-side layout on desktop (>640px)
 * - Interleaved text/image column on mobile (<=640px)
 * - Independent scroll-triggered animations per element
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

        {/* Desktop: Side-by-side image pairs | Mobile: Interleaved text/image */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-8 lg:gap-16"
          data-ui="images-grid"
        >
          {/* Organization Column */}
          <div
            className="flex flex-col"
            data-ui="organization-column"
          >
            {/* First organization image */}
            <AnimatedImage
              src={organizationImages[0].src}
              alt={organizationImages[0].alt}
              caption={organizationImages[0].caption}
              direction="right"
              delay={0}
              dataUi="org-image-0"
              className="mb-8 sm:mb-0"
            />

            {/* Second organization image */}
            <AnimatedImage
              src={organizationImages[1].src}
              alt={organizationImages[1].alt}
              caption={organizationImages[1].caption}
              direction="right"
              delay={150}
              dataUi="org-image-1"
            />

            {/* Organization label */}
            <AnimatedItem direction="up" delay={100} dataUi="animated-label-organization">
              <h3
                className="mt-8 text-lg sm:text-xl md:text-2xl text-center lg:text-left"
                data-ui="label-organization"
                style={subtitleStyle}
              >
                Profesionalidad AEP
              </h3>
            </AnimatedItem>
          </div>

          {/* Trainers & Athletes Column */}
          <div
            className="flex flex-col"
            data-ui="trainers-column"
          >
            {/* First trainers image */}
            <AnimatedImage
              src={trainersAthletesImages[0].src}
              alt={trainersAthletesImages[0].alt}
              caption={trainersAthletesImages[0].caption}
              direction="left"
              delay={0}
              dataUi="trainers-image-0"
              className="mb-8 sm:mb-0"
            />

            {/* Second trainers image */}
            <AnimatedImage
              src={trainersAthletesImages[1].src}
              alt={trainersAthletesImages[1].alt}
              caption={trainersAthletesImages[1].caption}
              direction="left"
              delay={150}
              dataUi="trainers-image-1"
            />

            {/* Trainers label */}
            <AnimatedItem direction="up" delay={100} dataUi="animated-label-trainers">
              <h3
                className="mt-8 text-lg sm:text-xl md:text-2xl text-center lg:text-left"
                data-ui="label-trainers"
                style={subtitleStyle}
              >
                Entrenadores y Atletas
              </h3>
            </AnimatedItem>
          </div>
        </div>

        {/* Additional description text */}
        <AnimatedItem direction="up" delay={300} dataUi="animated-description" style={{ paddingBottom: '1rem' }}>
          <div
            className="text-center mt-12 max-w-3xl mx-auto"
            data-ui="description-container"
          >
            <p
              className="text-base sm:text-lg md:text-xl leading-relaxed mb-6"
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

        {/* Organizadores y Afiliaciones */}
        <AnimatedItem direction="up" delay={0} dataUi="animated-organizers">
          <div
            className="mt-16 max-w-4xl mx-auto"
            data-ui="organizers-container"
          >
            <h3
              className="text-xl sm:text-2xl md:text-3xl text-center mb-8"
              data-ui="organizers-title"
              style={titleStyle}
            >
              <span style={accentStyle} data-ui="organizers-title-accent">Organizadores</span>{' '}
              <span data-ui="organizers-title-text">y Afiliaciones</span>
            </h3>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-center"
              data-ui="organizers-grid"
            >
              <div data-ui="organizer-aep">
                <img
                  src="https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/compressedAEP.webp"
                  alt="AEP - Asociación Española de Powerlifting"
                  className="w-56 h-auto mx-auto mb-4 object-cover rounded-xl"
                  loading="lazy"
                  data-ui="organizer-aep-image"
                />
                <h4
                  className="text-base sm:text-lg md:text-xl mb-2"
                  data-ui="organizer-aep-name"
                  style={subtitleStyle}
                >
                  AEP
                </h4>
                <p
                  className="text-sm sm:text-base md:text-lg leading-relaxed"
                  data-ui="organizer-aep-desc"
                  style={{
                    fontFamily: '"Contrail One", sans-serif',
                    letterSpacing: '0.02em',
                    color: 'rgba(255, 255, 255, 0.7)',
                    textTransform: 'uppercase',
                  }}
                >
                  Afiliada a la Asociación Española de Powerlifting. Jueces oficiales garantizan el cumplimiento de las reglas en cada intento.
                </p>
              </div>

              <div data-ui="organizer-nicogr">
                <img
                  src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/f7efa2c624614a66b35f6ab01980e09e.webp"
                  alt="Nico GR - Organizador"
                  className="w-56 h-auto mx-auto mb-4 object-cover rounded-xl"
                  loading="lazy"
                  data-ui="organizer-nicogr-image"
                />
                <h4
                  className="text-base sm:text-lg md:text-xl mb-2"
                  data-ui="organizer-nicogr-name"
                  style={subtitleStyle}
                >
                  GRStrength
                </h4>
                <p
                  className="text-sm sm:text-base md:text-lg leading-relaxed"
                  data-ui="organizer-nicogr-desc"
                  style={{
                    fontFamily: '"Contrail One", sans-serif',
                    letterSpacing: '0.02em',
                    color: 'rgba(255, 255, 255, 0.7)',
                    textTransform: 'uppercase',
                  }}
                >
                  Organizado por el club GRStrength, reúne a la comunidad de powerlifting en un evento de alto nivel competitivo.
                </p>
              </div>
            </div>
          </div>
        </AnimatedItem>

        {/* Equipamiento — Marcas SBD y A7 */}
        <AnimatedItem direction="up" delay={150} dataUi="animated-equipment">
          <div
            className="mt-12 max-w-4xl mx-auto"
            data-ui="equipment-container"
          >
            <h3
              className="text-xl sm:text-2xl md:text-3xl text-center mb-8"
              data-ui="equipment-title"
              style={titleStyle}
            >
              <span style={accentStyle} data-ui="equipment-title-accent">Equipamiento</span>{' '}
              <span data-ui="equipment-title-text">de Competición</span>
            </h3>

            <p
              className="text-center text-sm sm:text-base md:text-lg leading-relaxed mb-6"
              data-ui="equipment-description"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                letterSpacing: '0.02em',
                color: 'rgba(255, 255, 255, 0.7)',
                textTransform: 'uppercase',
              }}
            >
              Equipamiento profesional de SBD y A7, marcas líderes en powerlifting con homologación internacional.
            </p>

            <div
              className="flex justify-center gap-12 flex-wrap"
              data-ui="equipment-brands"
            >
              <div data-ui="brand-sbd">
                <h4
                  className="text-base sm:text-lg text-center"
                  data-ui="brand-sbd-name"
                  style={subtitleStyle}
                >
                  SBD
                </h4>
              </div>
              <div data-ui="brand-a7">
                <h4
                  className="text-base sm:text-lg text-center"
                  data-ui="brand-a7-name"
                  style={subtitleStyle}
                >
                  A7
                </h4>
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
