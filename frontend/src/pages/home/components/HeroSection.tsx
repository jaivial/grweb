import { FC, useMemo, useEffect, useState, useRef, lazy } from 'react';
import { useScrollProgress } from '@hooks/useScrollProgress';
import { calculateAnimationState } from '@utils/heroAnimationState';
import { VideoFrameAnimator } from '@components/animations/VideoFrameAnimator';
import type { SmokeState } from '@components/effects/SmokeOverlay';
import { HeroTextSequence } from '@components/animations/HeroTextSequence';

// Lazy load Three.js effects — they are heavy and delay initial render
const SmokeOverlay = lazy(() => import('@components/effects/SmokeOverlay').then(m => ({ default: m.SmokeOverlay as FC<{ smokeStateRef: React.RefObject<SmokeState>; className?: string }> })));
const CloudsEnter = lazy(() => import('@components/effects/CloudsEnter').then(m => ({ default: m.CloudsEnter as FC<{ progress: number; className?: string }> })));

export const HeroSection: FC = () => {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const smokeStateRef = useRef<SmokeState>({ opacity: 1, offset: 0 });

  const { progress: scrollProgress } = useScrollProgress({
    totalVh: 500,
    smooth: false,
    smoothFactor: 0.15,
    sectionSelector: '#hero-container',
  });

  const animationState = useMemo(() => {
    const state = calculateAnimationState(scrollProgress);
    smokeStateRef.current = { opacity: state.smokeOpacity, offset: state.smokeOffset };
    return state;
  }, [scrollProgress]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.intersectionRatio > 0.02);
        setHasBeenVisible(entry.intersectionRatio > 0.02);
      },
      {
        threshold: Array.from({ length: 100 }, (_, i) => i / 100),
      }
    );

    const heroElement = document.getElementById('hero-container');
    if (heroElement) {
      observer.observe(heroElement);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('heroVisibilityChange', {
      detail: { isVisible }
    }));
  }, [isVisible]);

  const containerClassName = 'relative';
  const viewportClassName = 'sticky top-0 h-screen overflow-hidden transition-opacity duration-500';

  return (
    <div
      id="hero-container"
      className={containerClassName}
      style={{ height: '400vh' }}
      data-section="hero"
      data-component="HeroSection"
    >
      <div
        className={viewportClassName}
        style={{ opacity: hasBeenVisible ? 1 : 0, display: hasBeenVisible ? 'block' : 'none' }}
        data-component="HeroViewport"
      >
        <div className="relative z-0" data-component="FrameWrapper">
          <VideoFrameAnimator
            progress={animationState.frameProgress}
            isAnimating={animationState.frameAnimationActive}
            maxWidth={540}
            aspectRatio={9 / 16}
            edgeFadeOverlay={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 55%, transparent 65%, #0a0a0a 100%)',
              maxWidth: '540px',
              margin: '0 auto',
            }}
          />
        </div>

        <SmokeOverlay
          smokeStateRef={smokeStateRef}
          className="z-10"
        />

        <CloudsEnter
          progress={animationState.cloudsEnterProgress}
          className="z-15"
        />

        {/* Fade cover at bottom-right */}
        <div
          className="absolute bottom-0 right-0 w-full h-32 pointer-events-none z-30"
          style={{
            background: 'linear-gradient(to top, rgba(10,10,10,1) 0%, rgba(10,10,10,0.8) 40%, transparent 100%)',
          }}
          data-component="BottomRightFadeCover"
        />

        <HeroTextSequence
          scrollProgress={scrollProgress}
          className="z-20"
        />

        {/* Fade out effect at bottom of hero section */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none z-25"
          style={{
            height: '300px',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(10, 10, 10, 1) 100%)',
          }}
          data-component="HeroFadeOut"
        />

        {import.meta.env.DEV && (
          <div
            className="absolute bottom-4 left-4 z-50 bg-black/80 text-white p-4 rounded-lg text-xs font-mono"
            data-component="DebugPanel"
          >
            <div>Progress: {(scrollProgress * 100).toFixed(1)}%</div>
            <div>Phase: {animationState.currentPhase}</div>
            <div>Text Opacity: {animationState.textOpacity.toFixed(2)}</div>
            <div>Smoke Opacity: {animationState.smokeOpacity.toFixed(2)}</div>
            <div>Smoke Offset: {animationState.smokeOffset.toFixed(2)}</div>
            <div>Frame Active: {animationState.frameAnimationActive.toString()}</div>
            <div>Frame Progress: {(animationState.frameProgress * 100).toFixed(1)}%</div>
            <div>Clouds Enter: {(animationState.cloudsEnterProgress * 100).toFixed(1)}%</div>
            <div>Animation: video (trophy_hero.mp4)</div>
          </div>
        )}
      </div>
    </div>
  );
};
