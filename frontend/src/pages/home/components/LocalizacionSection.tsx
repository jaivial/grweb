import { FC, useRef, useEffect, useState, useMemo } from 'react';

export interface LocalizacionSectionProps {
  className?: string;
}

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

const venueImages = [
  {
    src: 'https://jaimedigitalstudio.b-cdn.net/grcup/pabellon/pabellonentrada.webp',
    alt: 'Pabellón Municipal de Almusafes - Vista exterior',
  },
  {
    src: 'https://news.mondoiberica.com.es/wp-content/uploads/2017/01/IMG_20170109_094714-1.jpg',
    alt: 'Interior del Pabellón Municipal de Almusafes',
  },
  {
    src: 'https://i0.wp.com/almussafes.net/wp-content/uploads/2018/12/LaVila08.jpg?resize=740%2C555&ssl=1',
    alt: 'Instalaciones del Pabellón',
  },
  {
    src: 'https://archivos.elperiodic.com/archivos/imagenes/noticias/2021/11/30/pista-central-pavello-almussafes-2.jpg',
    alt: 'Pista central del Pabellón',
  },
];

const mapsUrl = 'https://www.google.com/maps?um=1&ie=UTF-8&fb=1&gl=es&sa=X&geocode=KQOiz5nhsmENMTQBwLnWqakc&daddr=Avda+Laura+Méndez,+s/n,+46440+Almussafes,+Valencia';

const AnimatedImage: FC<{
  src: string;
  alt: string;
  direction: 'left' | 'right';
  delay?: number;
  dataUi: string;
}> = ({ src, alt, direction, delay = 0, dataUi }) => {
  const { ref, animationStyle } = useScrollVisibility({
    direction,
    distance: 50,
    enterDuration: 700,
  });

  return (
    <figure
      ref={ref}
      className="w-full"
      style={{ ...animationStyle, transitionDelay: `${delay}ms` }}
      data-ui={dataUi}
    >
      <div
        className="relative overflow-hidden rounded-lg"
        data-ui={`image-container-${dataUi}`}
      >
        <div
          className="relative overflow-hidden rounded-lg"
          data-ui={`image-mask-${dataUi}`}
          style={{
            maskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, black 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, black 100%)',
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
    </figure>
  );
};

export const LocalizacionSection: FC<LocalizacionSectionProps> = ({ className = '' }) => {
  const titleStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.05em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
  };

  const venueNameStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.03em',
    color: '#DC143C',
    textTransform: 'uppercase',
    textShadow: '0 0 30px rgba(220, 20, 60, 0.6), 0 0 60px rgba(139, 0, 0, 0.4)',
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.03em',
    color: 'rgba(255, 255, 255, 0.9)',
    textTransform: 'uppercase',
  };

  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{
        minHeight: '80vh',
        background: '#0a0a0a',
        paddingTop: '40px',
        paddingBottom: '120px',
      }}
      id="localizacion"
      data-section="localizacion"
      data-ui="localizacion-section"
    >
      {/* Fade overlays */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)' }}
        data-ui="fade-overlay-top"
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)' }}
        data-ui="fade-overlay-bottom"
        aria-hidden
      />
      <div
        className="absolute top-0 bottom-0 left-0 w-16 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)' }}
        data-ui="fade-overlay-left"
        aria-hidden
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-16 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)' }}
        data-ui="fade-overlay-right"
        aria-hidden
      />

      {/* Content Container */}
      <div className="relative z-20 max-w-6xl mx-auto px-6 lg:px-12" data-ui="section-content">

        {/* Section Title */}
        <AnimatedItem direction="up" delay={0} dataUi="animated-title">
          <div className="text-center mb-8" data-ui="title-container">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
              data-ui="section-title"
              style={titleStyle}
            >
              Localización
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

        {/* Venue Name */}
        <AnimatedItem direction="up" delay={100} dataUi="animated-venue-name">
          <div className="text-center mb-16" data-ui="venue-name-container">
            <h3
              className="text-xl sm:text-2xl md:text-3xl lg:text-4xl"
              data-ui="venue-name"
              style={venueNameStyle}
            >
              Pabellón Municipal de Almusafes
            </h3>
          </div>
        </AnimatedItem>

        {/* Image Grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8 mb-20"
          data-ui="images-grid"
        >
          {venueImages.map((image, index) => (
            <AnimatedImage
              key={index}
              src={image.src}
              alt={image.alt}
              direction={index % 2 === 0 ? 'left' : 'right'}
              delay={index * 100}
              dataUi={`venue-image-${index}`}
            />
          ))}
        </div>

        {/* Cómo Llegar Subsection */}
        <AnimatedItem direction="up" delay={200} dataUi="animated-como-llegar">
          <div className="text-center" data-ui="como-llegar-container">
            <h3
              className="text-2xl sm:text-3xl md:text-4xl mb-8"
              data-ui="como-llegar-title"
              style={subtitleStyle}
            >
              Cómo llegar
            </h3>

            {/* Button */}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 text-lg sm:text-xl md:text-2xl rounded-lg transition-all duration-300 hover:scale-105"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                fontWeight: 400,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                background: 'linear-gradient(135deg, rgba(220, 20, 60, 0.9), rgba(139, 0, 0, 0.9))',
                color: '#ffffff',
                boxShadow: '0 0 20px rgba(220, 20, 60, 0.4), 0 4px 15px rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(220, 20, 60, 0.6)',
              }}
              data-ui="maps-button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                data-ui="map-icon"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Abrir en Google Maps
            </a>
          </div>
        </AnimatedItem>
      </div>

      {/* Background glow effects */}
      <div
        className="absolute top-1/3 left-1/4 w-80 h-80 bg-dark-red/5 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-left"
        aria-hidden
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-red-accent/4 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-right"
        aria-hidden
      />
    </section>
  );
};

export default LocalizacionSection;
