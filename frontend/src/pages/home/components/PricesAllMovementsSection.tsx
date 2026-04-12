import { FC, useRef, useEffect, useState, useMemo } from 'react';
import { useCdnImage } from '@hooks/useCdnImage';

export interface PricesAllMovementsSectionProps {
  className?: string;
}

function useScrollVisibility(options: {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  enterDuration?: number;
  threshold?: number;
  rootMargin?: string;
}) {
  const { direction = 'up', distance = 60, enterDuration = 700, threshold = 0.15, rootMargin = '-80px' } = options;
  const ref = useRef<HTMLDivElement>(null);
  const [animationStyle, setAnimationStyle] = useState<React.CSSProperties>(() => ({ opacity: 0, transform: getTransform(direction, distance) }));
  const prefersReducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
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
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasBeenSeen.current) {
        hasBeenSeen.current = true;
        setAnimationStyle(prefersReducedMotion ? { opacity: 1, transform: 'none' } : { opacity: 1, transform: 'none', transitionProperty: 'opacity, transform', transitionDuration: `${enterDuration}ms, ${enterDuration}ms`, transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)' });
      }
    }, { threshold, rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [direction, distance, enterDuration, threshold, rootMargin, prefersReducedMotion]);

  return { ref, animationStyle };
}

const AnimatedItem: FC<{ children: React.ReactNode; direction: 'up' | 'down' | 'left' | 'right'; delay?: number; className?: string; dataUi?: string }> = ({ children, direction, delay = 0, className = '', dataUi = 'animated-item' }) => {
  const { ref, animationStyle } = useScrollVisibility({ direction, distance: 50, enterDuration: 700 });
  return <div ref={ref} className={className} style={{ ...animationStyle, transitionDelay: `${delay}ms` }} data-ui={dataUi}>{children}</div>;
};

const AngledImage: FC<{ src: string; alt: string; rotation: 'left' | 'center' | 'right'; dataUi: string }> = ({ src, alt, rotation, dataUi }) => {
  const rotationClass = rotation === 'center' ? '' : rotation === 'left' ? 'sm:-rotate-6' : 'sm:rotate-6';
  const resolvedSrc = useCdnImage(src);

  return (
    <div className={`relative ${rotationClass} transition-transform duration-500 group`} data-ui={`image-wrapper-${dataUi}`}>
      <div className="relative overflow-hidden rounded-lg" data-ui={`image-container-${dataUi}`}>

        <div className="relative overflow-hidden rounded-lg" data-ui={`image-mask-${dataUi}`} style={{ maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, black 100%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, black 100%)', maskSize: '100% 100%', maskRepeat: 'no-repeat', maskPosition: 'center' }}>
          <img src={resolvedSrc} alt={alt} className="w-full h-auto object-cover" data-ui={dataUi} style={{ filter: 'contrast(1.05) saturate(0.9)' }} loading="eager" decoding="async" />
          <div className="absolute inset-0 pointer-events-none" data-ui={`image-edge-fade-${dataUi}`} style={{ background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)' }} aria-hidden />
        </div>
      </div>
    </div>
  );
};

export const PricesAllMovementsSection: FC<PricesAllMovementsSectionProps> = ({ className = '' }) => {
  const titleStyle: React.CSSProperties = { fontFamily: '"Contrail One", sans-serif', fontWeight: 400, letterSpacing: '0.02em', color: '#ffffff', textTransform: 'uppercase', textShadow: '0 0 20px rgba(0, 0, 0, 0.8)' };
  const subtitleStyle: React.CSSProperties = { fontFamily: '"Contrail One", sans-serif', fontWeight: 400, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', textTransform: 'uppercase' };
  const movementLabelStyle: React.CSSProperties = { fontFamily: '"Contrail One", sans-serif', fontWeight: 400, letterSpacing: '0.05em', color: '#8B0000', textTransform: 'uppercase', textShadow: '0 0 20px rgba(139, 0, 0, 0.5)' };
  const logoSrc = useCdnImage('https://jaimedigitalstudio.b-cdn.net/grcup/logos/ChatGPT%20Image%2029%20mar%202026%2C%2018_16_29.png');

  return (
    <section className={`relative overflow-hidden ${className}`} style={{ minHeight: 'auto', background: '#0a0a0a', paddingTop: '60px', paddingBottom: '80px' }} data-section="prices-all-movements" data-ui="prices-all-movements-section">
      <div className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10" data-ui="fade-overlay-top" style={{ background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)' }} aria-hidden />
      <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-10" data-ui="fade-overlay-bottom" style={{ background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)' }} aria-hidden />
      <div className="absolute top-0 bottom-0 left-0 w-16 pointer-events-none z-10" data-ui="fade-overlay-left" style={{ background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)' }} aria-hidden />
      <div className="absolute top-0 bottom-0 right-0 w-16 pointer-events-none z-10" data-ui="fade-overlay-right" style={{ background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)' }} aria-hidden />

      <div className="relative z-20 max-w-6xl mx-auto px-6 lg:px-12" data-ui="section-content">
        <AnimatedItem direction="up" delay={0} dataUi="animated-logo">
          <div className="flex justify-center mb-8" data-ui="logo-container"><div className="relative w-32 sm:w-40 md:w-48" data-ui="logo-wrapper"><img src={logoSrc} alt="GR Cup Logo" className="w-full h-auto object-contain" data-ui="logo" loading="eager" decoding="async" /></div></div>
        </AnimatedItem>

        <AnimatedItem direction="up" delay={100} dataUi="animated-title">
          <div className="text-center mb-12" data-ui="title-container">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl" data-ui="section-title" style={titleStyle}>Premio para los mejores en cada movimiento</h2>
            <div className="mt-4 mx-auto w-24 h-px" data-ui="title-underline" style={{ background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)' }} />
          </div>
        </AnimatedItem>

        <AnimatedItem direction="up" delay={200} dataUi="animated-images">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-6 md:gap-8 lg:gap-12 items-center justify-items-center mb-10" data-ui="images-grid">
            
            {/* Squat Image with Label */}
            <div className="flex flex-col items-center" data-ui="image-squat-wrapper">
              <div className="w-full max-w-[280px] sm:max-w-none" data-ui="squat-image-container">
                <AngledImage src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2029%20mar%202026%2C%2021_55_55.png" alt="Atleta realizando sentadilla" rotation="left" dataUi="squat" />
              </div>
              <h3 className="mt-4 text-xl sm:text-2xl md:text-3xl sm:hidden" data-ui="movement-text-squat-mobile" style={movementLabelStyle}>Sentadilla</h3>
            </div>

            {/* Bench Image with Label */}
            <div className="flex flex-col items-center" data-ui="image-bench-wrapper">
              <div className="w-full max-w-[280px] sm:max-w-none -mt-4 sm:mt-0" data-ui="bench-image-container">
                <AngledImage src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2023%20mar%202026%2C%2000_00_19.png" alt="Atleta realizando press de banca" rotation="center" dataUi="bench" />
              </div>
              <h3 className="mt-4 text-xl sm:text-2xl md:text-3xl sm:hidden" data-ui="movement-text-bench-mobile" style={movementLabelStyle}>Press de banca</h3>
            </div>

            {/* Deadlift Image with Label */}
            <div className="flex flex-col items-center" data-ui="image-deadlift-wrapper">
              <div className="w-full max-w-[280px] sm:max-w-none -mt-8 sm:mt-0" data-ui="deadlift-image-container">
                <AngledImage src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_51_04.png" alt="Atleta realizando peso muerto" rotation="right" dataUi="deadlift" />
              </div>
              <h3 className="mt-4 text-xl sm:text-2xl md:text-3xl sm:hidden" data-ui="movement-text-deadlift-mobile" style={movementLabelStyle}>Peso muerto</h3>
            </div>

          </div>
        </AnimatedItem>

        <AnimatedItem direction="up" delay={300} dataUi="animated-subtitle">
          <div className="text-center mb-8" data-ui="subtitle-container"><p className="text-lg sm:text-xl md:text-2xl" data-ui="subtitle-text" style={subtitleStyle}>Demuestra quien manda en cada movimiento!</p></div>
        </AnimatedItem>

        {/* Desktop-only movement labels row */}
        <AnimatedItem direction="up" delay={400} dataUi="animated-movement-labels">
          <div className="hidden sm:grid grid-cols-3 gap-4 md:gap-8 text-center" data-ui="movement-labels-grid">
            <div data-ui="movement-sentadilla"><h3 className="text-xl sm:text-2xl md:text-3xl" data-ui="movement-text-sentadilla" style={movementLabelStyle}>Sentadilla</h3></div>
            <div data-ui="movement-press"><h3 className="text-xl sm:text-2xl md:text-3xl" data-ui="movement-text-press" style={movementLabelStyle}>Press de banca</h3></div>
            <div data-ui="movement-peso"><h3 className="text-xl sm:text-2xl md:text-3xl" data-ui="movement-text-peso" style={movementLabelStyle}>Peso muerto</h3></div>
          </div>
        </AnimatedItem>
      </div>

      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-dark-red/5 rounded-full blur-3xl pointer-events-none" data-ui="bg-glow-left" aria-hidden />
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-red-accent/4 rounded-full blur-3xl pointer-events-none" data-ui="bg-glow-right" aria-hidden />
    </section>
  );
};

export default PricesAllMovementsSection;
