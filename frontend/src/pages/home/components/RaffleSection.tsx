import { FC, useMemo, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useScrollProgress } from '@hooks/useScrollProgress';
import { useFramePreloader } from '@hooks/useFramePreloader';
import { BELT_FRAMES_CONFIG } from '@utils/frameSources';
import { FrameAnimator } from '@components/animations/FrameAnimator';
import { FallbackImage } from '../../../components/ui/FallbackImage';

export const RaffleSection: FC = () => {
  const [, navigate] = useLocation();
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isWide, setIsWide] = useState(window.innerWidth > 600);
  
  const [raffleMethod, setRaffleMethod] = useState<0 | 1>(0);
  const [customProducts, setCustomProducts] = useState<Array<{
    id: number;
    title: string;
    subtitle?: string;
    imageUrl?: string | null;
  }>>([]);

  useEffect(() => {
    const handleResize = () => setIsWide(window.innerWidth > 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchRaffleConfig = async () => {
      try {
        const configRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5006'}/api/raffle/config`);
        const config = await configRes.json();
        const method = config.raffleMethod === 1 ? 1 : 0;
        setRaffleMethod(method);
        
        if (method === 1) {
          const productsRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5006'}/api/raffle/products`);
          const productsData = await productsRes.json();
          setCustomProducts(productsData.products || []);
        }
      } catch (err) {
        console.error('Error fetching raffle config:', err);
      }
    };
    
    fetchRaffleConfig();
  }, []);

  const { frames, isLoading: framesLoading, loadProgress } = useFramePreloader({
    frameSource: BELT_FRAMES_CONFIG,
    priorityBatchSize: 10,
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
    totalVh: isWide ? 250 : 200,
    smooth: true,
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
    const fadeInStart = 0.95;
    const fadeInEnd = 0.98;

    if (scrollProgress < fadeInStart) return 0;
    if (scrollProgress < fadeInEnd) {
      return (scrollProgress - fadeInStart) / (fadeInEnd - fadeInStart);
    }
    return 1;
  }, [scrollProgress]);

  // Calculate frame progress (0 to 1 mapped across the 600vh section)
  const frameProgress = scrollProgress;

  return (
    <>
      {/* Always visible raffle section wrapper */}
      <div data-testid="raffle-section">
      {/* Custom Products Section (shown before animation when method is custom) */}
      {raffleMethod === 1 && customProducts.length > 0 && (
        <div className="py-16 px-4 bg-gray-900/50" data-ui="raffle-custom-products">
          <div className="max-w-6xl mx-auto" data-ui="raffle-custom-products-inner">
            <div className="text-center mb-12" data-ui="raffle-products-header">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="raffle-products-title">
                Productos del Sorteo
              </h2>
              <p className="text-base text-gray-400" data-ui="raffle-products-subtitle">
                Participa para ganar estos increíbles productos
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-ui="raffle-products-grid">
              {customProducts.slice(0, 3).map((product) => (
                <div
                  key={product.id}
                  className="group p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-red-accent/50 transition-all duration-300"
                  data-testid="custom-product-card"
                >
                  <FallbackImage
                    src={product.imageUrl}
                    alt={product.title}
                    className="h-32 mb-3"
                    iconClassName="w-10 h-10"
                  />

                  <h3 className="text-lg font-bold text-white mb-1" data-ui="raffle-product-title">
                    {product.title}
                  </h3>
                  {product.subtitle && (
                    <p className="text-sm text-gray-400 line-clamp-2" data-ui="raffle-product-subtitle">
                      {product.subtitle}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {customProducts.length > 3 && (
              <div className="text-center mt-8" data-ui="raffle-products-more">
                <button
                  onClick={() => navigate('/raffle')}
                  className="px-6 py-3 text-sm font-semibold text-white rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(139, 0, 0, 0.8)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(139, 0, 0, 0.6)',
                  }}
                  data-testid="raffle-view-all-products-btn"
                >
                  Ver todos los productos ({customProducts.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    <div
      id="raffle-container"
      className="relative"
      style={{ height: isWide ? '250dvh' : '200dvh' }}
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
              color: '#b91c1c',
            }}
            data-ui="raffle-heading"
          >
            SORTEO
          </h1>
          {/* Separator line with faded margins */}
          <div className="relative mt-4 mx-8 md:mx-16 lg:mx-32" data-ui="raffle-separator-wrapper">
            <div
              className="h-px"
              style={{
                background: 'linear-gradient(to right, transparent, #dc2626 20%, #dc2626 80%, transparent)',
              }}
              data-ui="raffle-separator-line"
            />
          </div>
        </div>

        {/* Frame Animation */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pb-32" data-component="FrameWrapper">
          <FrameAnimator
            frames={frames}
            progress={frameProgress}
            isAnimating={true}
            staticPauseStart={1}
            maxWidth={540}
            aspectRatio={16 / 9}
            scrollSpeed={1}
            maskStyle={{
              maskImage: 'radial-gradient(80% 51%, black 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(80% 51%, black 40%, transparent 100%)',
              maskSize: '100% 121%',
              WebkitMaskSize: '100% 121%',
              height: 'auto',
            }}
            edgeFadeOverlay={{
              background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
              maxWidth: '540px',
              margin: '0 auto',
            }}
          />
        </div>

        {/* Text Overlay Container */}
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-32 md:pb-40 z-20"
          data-component="RaffleTextOverlay"
        >
          <div
            className="w-full flex justify-center translate-y-[20px] lg:translate-y-[190px] max-w-[320px] lg:max-w-[769px] mx-auto text-center"
            style={{ opacity: text1Opacity, pointerEvents: text1Opacity > 0.5 ? 'auto' : 'none' }}
            data-ui="raffle-text1-wrapper"
          >
            <h2
              className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white text-center px-4 max-w-4xl transition-transform transition-opacity duration-300 ease-out !leading-[1.6]"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
                transform: `translateY(${(1 - text1Opacity) * 50}px)`,
              }}
              data-ui="raffle-text1"
            >
              Entra en el sorteo de un cinturon SBD
            </h2>
          </div>

          <div
            className="w-full flex justify-center mt-4"
            style={{ opacity: text2Opacity, pointerEvents: text2Opacity > 0.5 ? 'auto' : 'none' }}
            data-ui="raffle-text2-wrapper"
          >
            <h2
              className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-white text-center  max-w-[420px] lg:max-w-[540px] px-4 transition-transform transition-opacity duration-300 ease-out"
              style={{
                fontFamily: '"Contrail One", sans-serif',
                textTransform: 'uppercase',
                transform: `translateY(${(1 - text2Opacity) * 30}px)`,
              }}
              data-ui="raffle-text2"
            >
              Participa tantas veces como quieras para tener mas oportunidades de ganar
            </h2>
          </div>

          <div
            className="mt-8"
            style={{ opacity: 1, pointerEvents: 'auto' }}
            data-ui="raffle-button-wrapper"
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
              data-testid="raffle-participate-btn"
            >
              Participa ya
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-dark-base"
            data-component="LoadingOverlay"
          >
            <div className="text-center" data-ui="raffle-loading-content">
              <div className="w-64 h-2 bg-dark-surface rounded-full overflow-hidden" data-ui="raffle-loading-bar">
                <div
                  className="h-full bg-gradient-to-r from-red-accent to-dark-red"
                  style={{ width: (loadProgress * 100) + '%', transition: 'width 0.3s ease-out' }}
                  data-ui="raffle-loading-bar-fill"
                />
              </div>
              <p className="text-gray-400 text-sm mt-2" data-ui="raffle-loading-percent">
                {Math.round(loadProgress * 100)}%
              </p>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        {import.meta.env.DEV && (
          <div
            className="absolute bottom-4 left-4 z-50 bg-black/80 text-white p-4 rounded-lg text-xs font-mono"
            data-component="DebugPanel"
          >
            <div data-ui="debug-progress">Progress: {(scrollProgress * 100).toFixed(1)}%</div>
            <div data-ui="debug-text1-opacity">Text1 Opacity: {text1Opacity.toFixed(2)}</div>
            <div data-ui="debug-text2-opacity">Text2 Opacity: {text2Opacity.toFixed(2)}</div>
            <div data-ui="debug-button-opacity">Button Opacity: {buttonOpacity.toFixed(2)}</div>
            <div data-ui="debug-frames-loaded">Frames Loaded: {frames.length}</div>
            <div data-ui="debug-frame-number">Frame: {Math.floor(scrollProgress * (frames.length - 1)) + 1}/{frames.length}</div>
          </div>
        )}
      </div>
    </div>
    </div>
    </>
  );
};

export default RaffleSection;
