import { FC, useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useAtom } from 'jotai';
import { useCdnImage } from '@hooks/useCdnImage';
import { HangingMedals, type HangingMedalSpec } from '@components/medals';
import { hoveredPrizeMovementAtom } from '../atoms/prizes';
import {
  AbsoluteWinnerCard,
  HANGING_LAYOUTS,
  MEDAL_ASSETS,
  MEDAL_PHYSICS,
  PRIZES_COPY,
  PRIZE_MOVEMENTS,
  PrizeHeading,
  WeightClassPrizes,
  type MovementId,
} from './prizes';

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

const AngledImage: FC<{ src: string; alt: string; rotation: 'left' | 'center' | 'right'; dataUi: string; highlighted?: boolean; accent?: boolean; tag: string; name: string }> = ({ src, alt, rotation, dataUi, highlighted = false, accent = false, tag, name }) => {
  const rotationClass = rotation === 'center' ? '' : rotation === 'left' ? 'sm:-rotate-6' : 'sm:rotate-6';
  const resolvedSrc = useCdnImage(src);
  const hoverClass = 'scale-[1.03] shadow-[0_0_32px_rgba(220,20,60,0.35)]';
  // Figma: the centre card has a permanent red outline + glow.
  const accentClass = accent ? 'shadow-[0_0_32px_rgba(196,43,62,0.35)] ring-1 ring-[#c42b3e]/80' : '';

  return (
    <div className={`relative ${rotationClass} transition-transform duration-500 group`} data-ui={`image-wrapper-${dataUi}`} data-highlighted={highlighted || undefined}>
      <div className={`relative overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-300 ease-out group-hover:scale-[1.03] group-hover:shadow-[0_0_32px_rgba(220,20,60,0.35)] ${accentClass} ${highlighted ? hoverClass : ''}`} data-ui={`image-container-${dataUi}`}>
        <img src={resolvedSrc} alt={alt} className="block h-auto w-full object-cover" data-ui={dataUi} style={{ filter: 'contrast(1.05) saturate(0.9)' }} loading="eager" decoding="async" />
        <div className="pointer-events-none absolute inset-0" data-ui={`image-shade-${dataUi}`} style={{ background: 'linear-gradient(to bottom, rgba(20,17,18,0) 0%, rgba(20,17,18,0) 55%, rgba(20,17,18,0.92) 100%)' }} aria-hidden />
        <div className="absolute inset-x-5 bottom-5 flex flex-col items-start gap-2" data-ui={`image-caption-${dataUi}`}>
          <span className="rounded-full bg-[#c42b3e] px-2.5 py-1 text-xs uppercase leading-[1.2] tracking-[0.04em] text-white" data-ui={`image-tag-${dataUi}`}>{tag}</span>
          <h3 className="font-contrail text-[30px] uppercase leading-[1.2] tracking-[0.05em] text-white" style={{ textShadow: '0 0 20px rgba(0,0,0,0.8)' }} data-ui={`image-name-${dataUi}`}>{name}</h3>
        </div>
      </div>
    </div>
  );
};

export const PricesAllMovementsSection: FC<PricesAllMovementsSectionProps> = ({ className = '' }) => {
  const subtitleStyle: React.CSSProperties = { fontFamily: '"Contrail One", sans-serif', fontWeight: 400, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', textTransform: 'uppercase' };
  const movementLabelStyle: React.CSSProperties = { fontFamily: '"Contrail One", sans-serif', fontWeight: 400, letterSpacing: '0.05em', color: '#8B0000', textTransform: 'uppercase', textShadow: '0 0 20px rgba(139, 0, 0, 0.5)' };
  const sectionRef = useRef<HTMLElement>(null);
  const squatRef = useRef<HTMLDivElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const deadliftRef = useRef<HTMLDivElement>(null);
  const [hoveredMovement, setHoveredMovement] = useAtom(hoveredPrizeMovementAtom);

  // One gold medal per movement, hanging over its column (all equal: no ranking).
  const medals = useMemo<HangingMedalSpec[]>(() => {
    const anchors: Record<MovementId, typeof squatRef> = { squat: squatRef, bench: benchRef, deadlift: deadliftRef };
    return PRIZE_MOVEMENTS.map((movement) => ({ id: movement.id, label: `Oro · ${movement.name}`, phase: movement.phase, assets: MEDAL_ASSETS.gold, anchorRef: anchors[movement.id] }));
  }, []);
  const handleMedalHover = useCallback((id: string | null) => setHoveredMovement(id as MovementId | null), [setHoveredMovement]);

  return (
    <section id="premios" ref={sectionRef} className={`relative isolate scroll-mt-[88px] overflow-hidden pt-[220px] sm:pt-[300px] 3xl:pt-[420px] ${className}`} style={{ minHeight: 'auto', background: '#141112', paddingBottom: '80px' }} data-section="prices-all-movements" data-ui="prices-all-movements-section">
      {/* Figma 199:211/199:212: grain + accent glow (#C42B3E α.20) behind the medals, 640 px at y 120. */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay" data-ui="bg-grain" style={{ maskImage: 'linear-gradient(to bottom, transparent 0, black 180px, black calc(100% - 160px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 180px, black calc(100% - 160px), transparent 100%)', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} aria-hidden />
      <div className="absolute left-1/2 top-[120px] h-[640px] w-[640px] -translate-x-1/2 rounded-full pointer-events-none" data-ui="medals-glow" style={{ background: 'radial-gradient(circle, rgba(196, 43, 62, 0.2) 0%, transparent 100%)' }} aria-hidden />
      <HangingMedals medals={medals} layouts={HANGING_LAYOUTS} physics={MEDAL_PHYSICS} containerRef={sectionRef} onMedalHover={handleMedalHover} />
      {/* Figma 199:238: the ribbons emerge from the dark (180 px, solid to 40 %, 55 % at 72 %). Above the medals (z-30) so the ribbon tops fade out. */}
      <div className="absolute top-0 left-0 right-0 h-[180px] pointer-events-none z-[35]" data-ui="fade-overlay-top" style={{ background: 'linear-gradient(to bottom, #0a0a0a 0%, #141112 40%, rgba(20,17,18,0.55) 72%, rgba(20,17,18,0) 100%)' }} aria-hidden />
      <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-[45]" data-ui="fade-overlay-bottom" style={{ background: 'linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.6) 35%, rgba(10,10,10,0) 100%)' }} aria-hidden />

      <div className="relative max-w-6xl mx-auto px-6 lg:px-12" data-ui="section-content">
        <AnimatedItem direction="up" delay={100} dataUi="animated-title" className="relative z-[40]">
          <div className="mx-auto mb-12 max-w-[880px]" data-ui="title-container">
            <PrizeHeading index="02" eyebrow={PRIZES_COPY.movements.eyebrow} title={PRIZES_COPY.movements.title} titleAccent={PRIZES_COPY.movements.titleAccent} dataUi="section-title" />
          </div>
        </AnimatedItem>

        <AnimatedItem direction="up" delay={200} dataUi="animated-images" className="relative z-20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-6 md:gap-8 lg:gap-12 items-center justify-items-center mb-10" data-ui="images-grid">
            
            {/* Squat Image with Label */}
            <div ref={squatRef} className="flex flex-col items-center" data-ui="image-squat-wrapper">
              <div className="w-full max-w-[280px] sm:max-w-none" data-ui="squat-image-container">
                <AngledImage src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2029%20mar%202026%2C%2021_55_55.png" alt="Atleta realizando sentadilla" rotation="left" dataUi="squat" tag="Premio · 01" name="Sentadilla" highlighted={hoveredMovement === 'squat'} />
              </div>
            </div>

            {/* Bench Image with Label */}
            <div ref={benchRef} className="flex flex-col items-center" data-ui="image-bench-wrapper">
              <div className="w-full max-w-[280px] sm:max-w-none -mt-4 sm:mt-0" data-ui="bench-image-container">
                <AngledImage src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2023%20mar%202026%2C%2000_00_19.png" alt="Atleta realizando press de banca" rotation="center" dataUi="bench" accent tag="Premio · 02" name="Press de banca" highlighted={hoveredMovement === 'bench'} />
              </div>
            </div>

            {/* Deadlift Image with Label */}
            <div ref={deadliftRef} className="flex flex-col items-center" data-ui="image-deadlift-wrapper">
              <div className="w-full max-w-[280px] sm:max-w-none -mt-8 sm:mt-0" data-ui="deadlift-image-container">
                <AngledImage src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_51_04.png" alt="Atleta realizando peso muerto" rotation="right" dataUi="deadlift" tag="Premio · 03" name="Peso muerto" highlighted={hoveredMovement === 'deadlift'} />
              </div>
            </div>

          </div>
        </AnimatedItem>

        <AnimatedItem direction="up" delay={300} dataUi="animated-subtitle" className="relative z-20">
          <div className="text-center mb-8" data-ui="subtitle-container"><p className="text-lg sm:text-xl md:text-2xl" data-ui="subtitle-text" style={subtitleStyle}>Demuestra quien manda en cada movimiento!</p></div>
        </AnimatedItem>

        
      </div>

      <div className="relative z-20 mx-auto w-[calc(100%-40px)] max-w-[1200px]" data-ui="prizes-extra-content">
        <WeightClassPrizes />
        <AbsoluteWinnerCard />
      </div>

      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-dark-red/5 rounded-full blur-3xl pointer-events-none" data-ui="bg-glow-left" aria-hidden />
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-red-accent/4 rounded-full blur-3xl pointer-events-none" data-ui="bg-glow-right" aria-hidden />
    </section>
  );
};

export default PricesAllMovementsSection;
