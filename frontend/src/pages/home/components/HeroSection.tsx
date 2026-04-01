import { FC, useMemo, useEffect, useState, useRef } from 'react';
import { useScrollProgress } from '@hooks/useScrollProgress';
import { useFramePreloader } from '@hooks/useFramePreloader';
import { calculateAnimationState } from '@utils/heroAnimationState';
import { FrameAnimator } from '@components/animations/FrameAnimator';
import { SmokeOverlay, SmokeState } from '@components/effects/SmokeOverlay';
import { CloudsEnter } from '@components/effects/CloudsEnter';
import { HeroTextSequence } from '@components/animations/HeroTextSequence';

export const HeroSection: FC = () => {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const smokeStateRef = useRef<SmokeState>({ opacity: 1, offset: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const { frames, isLoading: framesLoading, loadProgress } = useFramePreloader({
    frameSource: {
      source: 'cdn',
      startFrame: 783,
      endFrame: 1,
      order: 'desc',
    },
    batchSize: 20,
    batchDelay: 50,
  });

  // Sync loading state
  useEffect(() => {
    setIsLoading(framesLoading);
  }, [framesLoading]);

  // Prevent scrolling while loading
  useEffect(() => {
    if (isLoading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isLoading]);

  const { progress: scrollProgress } = useScrollProgress({
    totalVh: 500,
    smooth: true,
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
      style={{ height: '600vh' }}
      data-section="hero"
      data-component="HeroSection"
    >
      <div
        className={viewportClassName}
        style={{ opacity: hasBeenVisible ? 1 : 0, display: hasBeenVisible ? 'block' : 'none' }}
        data-component="HeroViewport"
      >
        <div className="relative z-0" data-component="FrameWrapper">
          <div className="relative w-screen h-auto overflow-hidden">
            <FrameAnimator
              frames={frames}
              progress={animationState.frameProgress}
              isAnimating={animationState.frameAnimationActive}
              staticPauseStart={1}
            />
            {/* Radial gradient mask on canvas */}
            <div
              className="absolute inset-0 pointer-events-none"
              data-ui="canvas-radial-mask"
              style={{
                maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
                maskSize: '100% 100%',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
              }}
              aria-hidden
            />
            {/* Additional edge fade overlay for 4-sided margin fade effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              data-ui="canvas-edge-fade"
              style={{
                background: 'linear-gradient(to right, rgba(0, 0, 0, 0.9) 0%, transparent 15%, transparent 85%, rgba(0, 0, 0, 0.9) 100%), linear-gradient(to bottom, rgba(0, 0, 0, 0.9) 0%, transparent 15%, transparent 85%, rgba(0, 0, 0, 0.9) 100%)',
              }}
              aria-hidden
            />
          </div>
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

        {isLoading && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-dark-base"
            data-component="LoadingOverlay"
          >
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <img
                  src="/trophyicon.png"
                  alt="Loading"
                  className="w-full h-full object-contain animate-pulse"
                />
              </div>
              <div className="w-64 h-2 bg-dark-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-black to-red-800 transition-all duration-300"
                  style={{ width: (loadProgress * 100) + '%' }}
                />
              </div>
              <p className="text-gray-400 text-sm mt-2">
                {Math.round(loadProgress * 100)}%
              </p>
            </div>
          </div>
        )}

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
            <div>Frames Loaded: {frames.length}</div>
          </div>
        )}
      </div>
    </div>
  );
};
