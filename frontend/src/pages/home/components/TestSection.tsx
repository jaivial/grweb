import { FC } from 'react';
import InfiniteSlider from '@components/InfiniteSlider';

export interface TestSectionProps {
  className?: string;
}

/**
 * TestSection Component - Main Title Section
 * 
 * Features:
 * - GR Cup logo with fade/scale animation
 * - Championship information with staggered text reveal
 * - Horizontal separator lines
 * - Uses Contrail One font (same as Hero text)
 * - Social media logo loop
 */
export const TestSection: FC<TestSectionProps> = ({ className = '' }) => {
  // Social media logo images for the slider
  const socialLogos = [
    { src: '/belt', alt: 'Belt sponsor logo' },
    { src: '/trophy', alt: 'Trophy sponsor logo' },
    { src: '/grcuplogo.png', alt: 'GR Cup logo' },
  ];

  // Text styling matching HeroSection (Contrail One font)
  const titleStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5)',
  };

  return (
    <section
      className={`relative flex flex-col items-center justify-center mb-24 ${className}`}
      style={{
        minHeight: '100vh',
        marginTop: '-400px',
        paddingTop: '400px',
        background: '#0a0a0a',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 300px, black 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 300px, black 100%)',
      }}
      data-section="main-title"
      data-ui="main-title-section"
    >
      <div className="max-w-5xl w-full px-6 flex flex-col items-center">
        
        {/* Logo */}
        <div
          className="mb-12"
          data-ui="main-title-logo"
        >
          <img
            src="/grcuplogo.png"
            alt="GR Cup Logo"
            className="w-64 md:w-80 lg:w-96 h-auto object-contain"
            data-ui="logo-image"
          />
        </div>

        {/* Separator Line 1 */}
        <div
          className="w-full max-w-2xl h-px mb-10"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 50%, transparent 100%)',
          }}
          data-ui="separator-line-1"
        />

        {/* Championship Name - Line 1 */}
        <div
          className="text-center mb-8"
          data-ui="championship-name"
        >
          <h1
            className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl flex flex-col"
            style={titleStyle}
          >
            <span className="mb-1">CAMPEONATO DE POWERLIFTING</span>
            <span>AEP3 REGIONAL DE VALENCIA, MURCIA Y BALEARES</span>
          </h1>
        </div>

        {/* Separator Line 2 */}
        <div
          className="w-full max-w-xl h-px mb-8"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.4) 50%, transparent 100%)',
          }}
          data-ui="separator-line-2"
        />

        {/* Date - Line 2 */}
        <div
          className="text-center mb-8"
          data-ui="event-date"
        >
          <h2
            className="text-xl md:text-2xl lg:text-3xl xl:text-4xl"
            style={titleStyle}
          >
            1-2 Mayo 2026
          </h2>
        </div>

        {/* Separator Line 3 */}
        <div
          className="w-full max-w-lg h-px mb-8"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 50%, transparent 100%)',
          }}
          data-ui="separator-line-3"
        />

        {/* Location - Line 3 */}
        <div
          className="text-center"
          data-ui="event-location"
        >
          <h3
            className="text-lg md:text-xl lg:text-2xl xl:text-3xl"
            style={titleStyle}
          >
            Alumussafes (Valencia)
          </h3>
        </div>

        {/* Separator Line 4 - Bottom */}
        <div
          className="w-full max-w-2xl h-px mt-10"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 50%, transparent 100%)',
          }}
          data-ui="separator-line-4"
        />

        {/* Social Media Logo Slider */}
        <div
          className="w-full mt-24 px-8"
          data-ui="social-logo-slider"
        >
          <InfiniteSlider
            images={socialLogos}
            speed={40}
            direction="left"
            height={48}
            gap={64}
            fadeSize={80}
            fadeColor="#0a0a0a"
            pauseOnHover={true}
            ariaLabel="Sponsor logos"
          />
        </div>

      </div>

      {/* Decorative background elements */}
      <div 
        className="absolute top-1/4 left-1/4 w-64 h-64 bg-red-accent/5 rounded-full blur-3xl pointer-events-none"
        data-ui="decorative-glow-left"
      />
      <div 
        className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-dark-red/5 rounded-full blur-3xl pointer-events-none"
        data-ui="decorative-glow-right"
      />

    </section>
  );
};
