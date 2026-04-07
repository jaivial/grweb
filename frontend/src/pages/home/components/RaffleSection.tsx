import { FC, useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useFramePreloader } from '@hooks/useFramePreloader';
import { BELT_FRAMES_CONFIG } from '@utils/frameSources';
import { FrameAnimator } from '@components/animations/FrameAnimator';

export const RaffleSection: FC = () => {
  const [, navigate] = useLocation();
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  const {
    frames,
    isLoading,
    loadProgress,
    totalFrames,
    getFrame,
    preloadAround,
  } = useFramePreloader({
    frameSource: BELT_FRAMES_CONFIG,
    priorityBatchSize: 10,
    maxFramesInMemory: 100,
  });

  // Simple scroll tracking for the section
  useEffect(() => {
    let targetProgress = 0;
    let currentProgress = 0;

    const updateProgress = () => {
      const element = document.getElementById('raffle-container');
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const sectionHeight = rect.height;

      // Calculate scroll progress through the 600vh section
      const scrollStart = -windowHeight; // Start when section enters viewport
      const scrollEnd = sectionHeight - windowHeight;
      const currentScroll = -rect.top;

      if (scrollEnd <= 0) {
        targetProgress = 0;
      } else {
        targetProgress = Math.max(0, Math.min(1, currentScroll / scrollEnd));
      }
    };

    const animate = () => {
      currentProgress += (targetProgress - currentProgress) * 0.12;
      setScrollProgress(currentProgress);
      rafRef.current = requestAnimationFrame(animate);
    };

    const handleScroll = () => {
      updateProgress();
    };

    // Initial update
    updateProgress();
    window.addEventListener('scroll', handleScroll, { passive: true });
    rafRef.current = requestAnimationFrame(animate);

    // Intersection observer for visibility
    const observer = new IntersectionObserver(
      ([entry]) => {
        setHasBeenVisible(entry.intersectionRatio > 0.02);
      },
      { threshold: [0, 0.02, 0.5, 1] }
    );

    const element = document.getElementById('raffle-container');
    if (element) {
      observer.observe(element);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, []);

  // Preload frames around current progress
  useEffect(() => {
    if (hasBeenVisible && preloadAround && totalFrames > 0) {
      const centerIndex = Math.floor(scrollProgress * (totalFrames - 1));
      preloadAround(centerIndex);
    }
  }, [scrollProgress, hasBeenVisible, preloadAround, totalFrames]);

  // Text visibility calculations
  const text1Opacity = (() => {
    const fadeInStart = 0.10;
    const fadeInEnd = 0.12;
    const fadeOutStart = 0.40;
    const fadeOutEnd = 0.50;
    if (scrollProgress < fadeInStart) return 0;
    if (scrollProgress < fadeInEnd) return (scrollProgress - fadeInStart) / (fadeInEnd - fadeInStart);
    if (scrollProgress < fadeOutStart) return 1;
    if (scrollProgress < fadeOutEnd) return 1 - (scrollProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart);
    return 0;
  })();

  const text2Opacity = (() => {
    const fadeInStart = 0.45;
    const fadeInEnd = 0.48;
    const fadeOutStart = 0.95;
    const fadeOutEnd = 0.98;
    if (scrollProgress < fadeInStart) return 0;
    if (scrollProgress < fadeInEnd) return (scrollProgress - fadeInStart) / (fadeInEnd - fadeInStart);
    if (scrollProgress < fadeOutStart) return 1;
    if (scrollProgress < fadeOutEnd) return 1 - (scrollProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart);
    return 0;
  })();

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
        {/* Title */}
        <div className="absolute top-[9rem] left-0 right-0 z-30 max-w-[640px] mx-auto">
          <h1
            className="text-center text-5xl md:text-6xl lg:text-7xl font-bold uppercase tracking-wider"
            style={{
              fontFamily: '"Contrail One", sans-serif',
              color: '#b91c1c',
            }}
          >
            SORTEO
          </h1>
          <div className="relative mt-4 mx-8 md:mx-16 lg:mx-32">
            <div
              className="h-px"
              style={{
                background: 'linear-gradient(to right, transparent, #dc2626 20%, #dc2626 80%, transparent)',
              }}
            />
          </div>
        </div>

        {/* Frame Animation */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pb-32">
          <FrameAnimator
            frames={frames}
            progress={scrollProgress}
            isAnimating={hasBeenVisible}
            staticPauseStart={1}
            maxWidth={540}
            aspectRatio={16 / 9}
            getFrame={getFrame}
            preloadAround={preloadAround}
            totalFrames={totalFrames}
            edgeFadeOverlay={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
              maxWidth: '540px',
              margin: '0 auto',
            }}
          />
        </div>

        {/* Text Overlays */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-32 md:pb-40 z-20">
          <div
            className="w-full flex justify-center translate-y-[20px] lg:translate-y-[100px] max-w-[320px] lg:max-w-[540px] mx-auto text-center"
            style={{ opacity: text1Opacity, pointerEvents: text1Opacity > 0.5 ? 'auto' : 'none' }}
          >
            <h2
              className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white text-center px-4 max-w-4xl"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
                transform: `translateY(${(1 - text1Opacity) * 50}px)`,
              }}
            >
              Entra en el sorteo de un cinturon SBD
            </h2>
          </div>

          <div
            className="w-full flex justify-center mt-4"
            style={{ opacity: text2Opacity, pointerEvents: text2Opacity > 0.5 ? 'auto' : 'none' }}
          >
            <h2
              className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-white text-center max-w-[420px] lg:max-w-[540px] px-4"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
                transform: `translateY(${(1 - text2Opacity) * 30}px)`,
              }}
            >
              Participa tantas veces como quieras para tener mas oportunidades de ganar
            </h2>
          </div>

          <div className="mt-8">
            <button
              onClick={() => navigate('/raffle')}
              className="min-h-[56px] px-8 py-4 text-xl font-semibold text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: 'rgba(139, 0, 0, 0.8)',
                backdropFilter: 'blur(20px)',
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

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-dark-base">
            <div className="text-center">
              <div className="w-64 h-2 bg-dark-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-accent to-dark-red"
                  style={{ width: (loadProgress * 100) + '%', transition: 'width 0.3s ease-out' }}
                />
              </div>
              <p className="text-gray-400 text-sm mt-2">{Math.round(loadProgress * 100)}%</p>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        {import.meta.env.DEV && (
          <div className="absolute bottom-4 left-4 z-50 bg-black/80 text-white p-4 rounded-lg text-xs font-mono">
            <div>Progress: {(scrollProgress * 100).toFixed(1)}%</div>
            <div>Text1: {text1Opacity.toFixed(2)}</div>
            <div>Text2: {text2Opacity.toFixed(2)}</div>
            <div>Frames: {frames.length}/{totalFrames}</div>
            <div>Frame: {Math.floor(scrollProgress * Math.max(1, totalFrames - 1)) + 1}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RaffleSection;
