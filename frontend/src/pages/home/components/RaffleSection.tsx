import { FC, useMemo, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useScrollProgress } from '@hooks/useScrollProgress';
import { VideoFrameAnimator } from '@components/animations/VideoFrameAnimator';

export const RaffleSection: FC = () => {
  const [, navigate] = useLocation();
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const { progress: scrollProgress } = useScrollProgress({
    totalVh: 600,
    smooth: false,
    smoothFactor: 0.15,
    sectionSelector: '#raffle-container',
  });

  // Intersection observer for visibility
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

    const element = document.getElementById('raffle-container');
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  // Text visibility calculations based on scroll progress
  const text1Opacity = useMemo(() => {
    // Fade in at 10%, fade out from 40% to 50%
    const fadeInStart = 0.10;
    const fadeInEnd = 0.12;
    const fadeOutStart = 0.40;
    const fadeOutEnd = 0.50;

    if (scrollProgress < fadeInStart) return 0;
    if (scrollProgress < fadeInEnd) {
      return (scrollProgress - fadeInStart) / (fadeInEnd - fadeInStart);
    }
    if (scrollProgress < fadeOutStart) return 1;
    if (scrollProgress < fadeOutEnd) {
      return 1 - (scrollProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart);
    }
    return 0;
  }, [scrollProgress]);

  const text2Opacity = useMemo(() => {
    // Fade in at 45%, stays until 95%
    const fadeInStart = 0.45;
    const fadeInEnd = 0.48;
    const fadeOutStart = 0.95;
    const fadeOutEnd = 0.98;

    if (scrollProgress < fadeInStart) return 0;
    if (scrollProgress < fadeInEnd) {
      return (scrollProgress - fadeInStart) / (fadeInEnd - fadeInStart);
    }
    if (scrollProgress < fadeOutStart) return 1;
    if (scrollProgress < fadeOutEnd) {
      return 1 - (scrollProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart);
    }
    return 0;
  }, [scrollProgress]);

  const buttonOpacity = useMemo(() => {
    // Appears at 95%
    const fadeInStart = 0.95;
    const fadeInEnd = 0.98;

    if (scrollProgress < fadeInStart) return 0;
    if (scrollProgress < fadeInEnd) {
      return (scrollProgress - fadeInStart) / (fadeInEnd - fadeInStart);
    }
    return 1;
  }, [scrollProgress]);

  // Belt video URL
  const beltVideoUrl = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/belt/belt_hero_60fps_hq.mp4';

  return (
    <div
      id="raffle-container"
      className="relative"
      style={{ height: '600vh' }}
      data-section="raffle"
      data-component="RaffleSection"
    >
      <div
        className="sticky top-0 h-screen overflow-hidden transition-opacity duration-500"
        style={{ opacity: hasBeenVisible ? 1 : 0 }}
        data-component="RaffleViewport"
      >
        {/* Title with separator */}
        <div className="absolute top-[9rem] left-0 right-0 z-30 max-w-[640px] mx-auto" data-component="RaffleTitle">
          <h1
            className="text-center text-5xl md:text-6xl lg:text-7xl font-bold uppercase tracking-wider"
            style={{
              fontFamily: '"Contrail One", sans-serif',
              color: '#b91c1c', // red-700
            }}
          >
            SORTEO
          </h1>
          {/* Separator line with faded margins */}
          <div className="relative mt-4 mx-8 md:mx-16 lg:mx-32">
            <div
              className="h-px"
              style={{
                background: 'linear-gradient(to right, transparent, #dc2626 20%, #dc2626 80%, transparent)',
              }}
            />
          </div>
        </div>

        {/* Frame Animation - with bottom padding and mask */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pb-32" data-component="FrameWrapper">
          <VideoFrameAnimator
            src={beltVideoUrl}
            progress={scrollProgress}
            isAnimating={true}
            maxWidth={540}
            aspectRatio={16 / 9}
            edgeFadeOverlay={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
              maxWidth: '540px',
              margin: '0 auto',
            }}
          />
        </div>

        {/* Text Overlay Container - Bottom section, button moved lower */}
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-32 md:pb-40 z-20"
          data-component="RaffleTextOverlay"
        >
          {/* Text 1: "Entra en el sorteo de un cinturon SBD" */}
          <div
            className="w-full flex justify-center translate-y-[20px] lg:translate-y-[100px] max-w-[320px] lg:max-w-[540px] mx-auto text-center"
            style={{ opacity: text1Opacity, pointerEvents: text1Opacity > 0.5 ? 'auto' : 'none' }}
          >
            <h2
              className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white text-center px-4 max-w-4xl transition-transform transition-opacity duration-300 ease-out !leading-[1.6]"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
                transform: `translateY(${(1 - text1Opacity) * 50}px)`,
              }}
            >
              Entra en el sorteo de un cinturon SBD
            </h2>
          </div>

          {/* Text 2: "Participa tantas veces como quieras..." */}
          <div
            className="w-full flex justify-center mt-4"
            style={{ opacity: text2Opacity, pointerEvents: text2Opacity > 0.5 ? 'auto' : 'none' }}
          >
            <h2
              className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-white text-center  max-w-[420px] lg:max-w-[540px] px-4 transition-transform transition-opacity duration-300 ease-out"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
                transform: `translateY(${(1 - text2Opacity) * 30}px)`,
              }}
            >
              Participa tantas veces como quieras para tener mas oportunidades de ganar
            </h2>
          </div>

          {/* Button: "Participa ya" */}
          <div
            className="mt-8"
            style={{ opacity: 1, pointerEvents: 'auto' }}
          >
            <button
              onClick={() => navigate('/raffle')}
              className="min-h-[56px] px-8 py-4 text-xl font-semibold text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: 'rgba(139, 0, 0, 0.8)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(139, 0, 0, 0.6)',
                boxShadow: '0 8px 32px rgba(139, 0, 0, 0.3)',
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
              }}
            >
              Participa ya
            </button>
          </div>
        </div>

        {/* Debug Panel */}
        {import.meta.env.DEV && (
          <div
            className="absolute bottom-4 left-4 z-50 bg-black/80 text-white p-4 rounded-lg text-xs font-mono"
            data-component="DebugPanel"
          >
            <div>Progress: {(scrollProgress * 100).toFixed(1)}%</div>
            <div>Text1 Opacity: {text1Opacity.toFixed(2)}</div>
            <div>Text2 Opacity: {text2Opacity.toFixed(2)}</div>
            <div>Button Opacity: {buttonOpacity.toFixed(2)}</div>
            <div>Animation: video (belt_hero_60fps_hq.mp4)</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RaffleSection;
