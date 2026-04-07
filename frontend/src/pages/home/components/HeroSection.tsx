import { FC, useMemo, useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useScrollProgress } from '@hooks/useScrollProgress';
import { useFramePreloader } from '@hooks/useFramePreloader';
import { calculateAnimationState } from '@utils/heroAnimationState';
import { FrameAnimator } from '@components/animations/FrameAnimator';
import type { SmokeState } from '@components/effects/SmokeOverlay';
import { HeroTextSequence } from '@components/animations/HeroTextSequence';

// Lazy load Three.js effects — they are heavy and delay initial render
const SmokeOverlay = lazy(() => import('@components/effects/SmokeOverlay').then(m => ({ default: m.SmokeOverlay as FC<{ smokeStateRef: React.RefObject<SmokeState>; className?: string }> })));
const CloudsEnter = lazy(() => import('@components/effects/CloudsEnter').then(m => ({ default: m.CloudsEnter as FC<{ progress: number; className?: string }> })));

export const HeroSection: FC = () => {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const smokeStateRef = useRef<SmokeState>({ opacity: 1, offset: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // DNS prefetch + preconnect for BunnyCDN to reduce cold start latency
  useEffect(() => {
    // Preconnect for early TCP/TLS handshake
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://storage.bunnycdn.com';
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    // Also preconnect to the CDN domain
    const preconnectCdn = document.createElement('link');
    preconnectCdn.rel = 'preconnect';
    preconnectCdn.href = 'https://jaimedigitalstudio.b-cdn.net';
    preconnectCdn.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectCdn);

    // DNS prefetch for additional DNS resolution speed
    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = 'https://storage.bunnycdn.com';
    document.head.appendChild(dnsPrefetch);

    const dnsPrefetchCdn = document.createElement('link');
    dnsPrefetchCdn.rel = 'dns-prefetch';
    dnsPrefetchCdn.href = 'https://jaimedigitalstudio.b-cdn.net';
    document.head.appendChild(dnsPrefetchCdn);

    return () => {
      document.head.removeChild(preconnect);
      document.head.removeChild(preconnectCdn);
      document.head.removeChild(dnsPrefetch);
      document.head.removeChild(dnsPrefetchCdn);
    };
  }, []);

  // Preload first few critical frames for immediate display
  useEffect(() => {
    // Use public CDN URL (pull zone), not storage URL (requires auth)
    const criticalFrames = [
      'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0001.webp',
      'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0002.webp',
      'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0003.webp',
      'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0004.webp',
      'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0005.webp',
    ];

    criticalFrames.forEach((url) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }, []);

  const { frames, isLoading: framesLoading, loadProgress } = useFramePreloader({
    frameSource: {
      source: 'cdn',
      startFrame: 1,
      endFrame: 313,
      order: 'asc',
      digits: 4,
    },
    priorityBatchSize: 5,
    backgroundBatchSize: 32,
    backgroundBatchDelay: 0,
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
      style={{ height: '400vh' }}
      data-section="hero"
      data-component="HeroSection"
    >
      <div
        className={viewportClassName}
        style={{ opacity: hasBeenVisible ? 1 : 0, display: hasBeenVisible ? 'block' : 'none' }}
        data-component="HeroViewport"
      >
        <div className="relative z-0 flex items-center justify-center h-full" data-component="FrameWrapper">
          <FrameAnimator
            frames={frames}
            progress={animationState.frameProgress}
            isAnimating={animationState.frameAnimationActive}
            staticPauseStart={1}
            maxWidth={640}
            className="h-full"
            maskStyle={{
              maskImage: 'radial-gradient(80% 51%, black 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(80% 51%, black 40%, transparent 100%)',
              maskSize: '100% 69%',
              WebkitMaskSize: '100% 69%',
            }}
            edgeFadeOverlay={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 55%, transparent 65%, #0a0a0a 100%)',
              maxWidth: '640px',
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
