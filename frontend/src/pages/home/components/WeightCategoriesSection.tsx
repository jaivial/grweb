import { FC } from 'react';

export interface WeightCategoriesSectionProps {
  className?: string;
}

/**
 * WeightCategoriesSection Component
 * 
 * Features:
 * - Minimal design with weight categories for men and women
 * - Background image styled like AthletesSection (radial mask, red glow, edge fades)
 * - End fade effects on left and right sides
 * - Inside lines only (no margin borders)
 * - Ghost glassmorphism button with shimmer outline
 */

// Weight categories data - split into 5 columns each
const MEN_CATEGORIES = [
  ['-53kg', '-59kg'],
  ['-66kg', '-74kg'],
  ['-83kg', '-93kg'],
  ['-105kg', '-120kg'],
  ['+120kg'],
];

const WOMEN_CATEGORIES = [
  ['-43kg', '-47kg'],
  ['-52kg', '-57kg'],
  ['-63kg', '-69kg'],
  ['-76kg', '-84kg'],
  ['+84kg'],
];

const TARGET_URL = 'https://www.powerhispania.net/Documentos/Marcas_Minimas_AEP-1.pdf';

/**
 * Shimmer Button Component - Ghost glassmorphism with animated shimmer outline
 */
const ShimmerButton: FC = () => {
  return (
    <a
      href={TARGET_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative inline-flex items-center gap-3 px-8 py-4"
      data-ui="button-shimmer"
      aria-label="Ver marcas mínimas - Abre en nueva ventana"
    >
      {/* Glassmorphism background */}
      <div
        className="absolute inset-0 rounded-lg backdrop-blur-md"
        data-ui="button-glass-background"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        aria-hidden
      />

      {/* Shimmer outline effect */}
      <div
        className="absolute inset-0 rounded-lg overflow-hidden"
        data-ui="button-shimmer-outline"
        aria-hidden
      >
        {/* Shimmer line animation */}
        <div
          className="absolute top-0 left-0 w-full h-px shimmer-line"
          data-ui="button-shimmer-line"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.8) 50%, transparent 100%)',
            animation: 'shimmerMove 3s ease-in-out infinite',
          }}
        />
        {/* Top border with gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          data-ui="button-border-top"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 20%, rgba(220, 20, 60, 0.8) 50%, rgba(220, 20, 60, 0.6) 80%, transparent 100%)',
          }}
        />
        {/* Bottom border with gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          data-ui="button-border-bottom"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.4) 20%, rgba(220, 20, 60, 0.6) 50%, rgba(220, 20, 60, 0.4) 80%, transparent 100%)',
          }}
        />
        {/* Left border */}
        <div
          className="absolute top-0 bottom-0 left-0 w-px"
          data-ui="button-border-left"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(220, 20, 60, 0.5) 50%, transparent 100%)',
          }}
        />
        {/* Right border */}
        <div
          className="absolute top-0 bottom-0 right-0 w-px"
          data-ui="button-border-right"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(220, 20, 60, 0.5) 50%, transparent 100%)',
          }}
        />
      </div>

      {/* Button content */}
      <div className="relative z-10 flex items-center" data-ui="button-content">
        <span
          className="text-lg md:text-xl"
          data-ui="button-text"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: 'rgba(255, 255, 255, 0.9)',
            letterSpacing: '0.05em',
          }}
        >
          Ver marcas
        </span>
      </div>

      {/* Arrow icon */}
      <div
        className="relative z-10 ml-2 transition-transform duration-300 group-hover:translate-x-1"
        data-ui="button-arrow"
        aria-hidden
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-ui="button-arrow-icon"
          style={{ color: 'rgba(220, 20, 60, 0.8)' }}
        >
          <line x1="5" y1="12" x2="19" y2="12" data-ui="arrow-line" />
          <polyline points="12 5 19 12 12 19" data-ui="arrow-polyline" />
        </svg>
      </div>

      {/* Shimmer animation styles */}
      <style>{`
        @keyframes shimmerMove {
          0%, 100% {
            transform: translateX(-100%);
            opacity: 0;
          }
          50% {
            transform: translateX(100%);
            opacity: 1;
          }
        }
        .shimmer-line {
          animation: shimmerMove 3s ease-in-out infinite;
        }
      `}</style>
    </a>
  );
};

/**
 * Background Image - Styled exactly like AthletesSection images
 */
const BackgroundImage: FC = () => {
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform rotate-3"
      data-ui="background-image-container"
      aria-hidden
      style={{
        width: 'clamp(300px, 50vw, 600px)',
      }}
    >
      {/* Image container with 4-sided fade mask - same as AthletesSection */}
      <div
        className="relative overflow-hidden rounded-lg"
        data-ui="background-image-wrapper"
        style={{
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)',
          maskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
        }}
      >
        {/* Red accent border glow behind image - same as AthletesSection */}
        <div
          className="absolute -inset-2 bg-gradient-to-br from-dark-red/40 via-red-accent/20 to-dark-red/30 rounded-lg blur-md"
          data-ui="background-image-glow"
          aria-hidden
        />
        <img
          src="https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_47_22.png"
          alt=""
          className="w-full h-auto object-cover"
          data-ui="background-image"
          style={{
            filter: 'contrast(1.05) saturate(0.85) brightness(0.7)',
          }}
          loading="lazy"
          decoding="async"
        />
        {/* Edge fade overlays - same as AthletesSection */}
        <div
          className="absolute inset-0 pointer-events-none"
          data-ui="background-image-edge-fade"
          style={{
            background: 'linear-gradient(to right, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%), linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%)',
          }}
          aria-hidden
        />
      </div>
    </div>
  );
};

/**
 * WeightCategoriesSection Component
 */
export const WeightCategoriesSection: FC<WeightCategoriesSectionProps> = ({ className = '' }) => {
  // Text styling matching other sections
  const categoryStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: 'rgba(255, 255, 255, 0.85)',
    textTransform: 'uppercase',
  };

  const headerStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.05em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
  };

  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{
        minHeight: '80vh',
        background: '#0a0a0a',
        paddingTop: '100px',
        paddingBottom: '120px',
      }}
      data-section="weight-categories"
      data-ui="weight-categories-section"
    >
      {/* Background Image - styled like AthletesSection */}
      <BackgroundImage />

      {/* Semi-opacity dark overlay - above image, below fades */}
      <div
        className="absolute inset-0 pointer-events-none"
        data-ui="section-dark-overlay"
        style={{ zIndex: 1, background: 'rgba(10, 10, 10, 0.4)' }}
        aria-hidden
      />

      {/* Fade overlay - Top */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        data-ui="fade-overlay-top"
        style={{ zIndex: 5, background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Fade overlay - Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        data-ui="fade-overlay-bottom"
        style={{ zIndex: 5, background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Fade overlay - Left */}
      <div
        className="absolute top-0 bottom-0 left-0 w-24 md:w-32 pointer-events-none"
        data-ui="fade-overlay-left"
        style={{ zIndex: 5, background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Fade overlay - Right */}
      <div
        className="absolute top-0 bottom-0 right-0 w-24 md:w-32 pointer-events-none"
        data-ui="fade-overlay-right"
        style={{ zIndex: 5, background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)' }}
        aria-hidden
      />

      {/* Content Container - above fades */}
      <div className="relative z-20 max-w-6xl mx-auto px-8 md:px-16 lg:px-24" data-ui="section-content">
        
        {/* Section Header */}
        <div
          className="text-center mb-16"
          data-ui="section-header"
        >
          <h2
            className="text-3xl md:text-4xl lg:text-5xl"
            data-ui="section-title"
            style={headerStyle}
          >
            Categorias de peso
          </h2>
          {/* Subtle underline */}
          <div
            className="mt-4 mx-auto w-24 h-px"
            data-ui="section-underline"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)',
            }}
          />
        </div>

        {/* Categories Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 lg:gap-24"
          data-ui="categories-grid"
        >
          {/* Men Categories */}
          <div
            className="relative"
            data-ui="men-categories"
          >
            {/* Header */}
            <h3
              className="text-lg md:text-xl mb-2 text-center"
              data-ui="men-header"
              style={{
                ...headerStyle,
                color: 'rgba(220, 20, 60, 0.9)',
              }}
            >
              Hombres
            </h3>

            {/* Inside line below header */}
            <div
              className="mb-3 h-px"
              data-ui="men-header-line"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />

            {/* Categories list - 5 columns */}
            <div className="grid grid-cols-5 gap-2 md:gap-3" data-ui="men-list">
              {MEN_CATEGORIES.map((col, colIndex) => (
                <div key={`men-col-${colIndex}`} className="flex flex-col" data-ui={`men-column-${colIndex}`}>
                  {col.map((category, rowIndex) => (
                    <div
                      key={`men-${category}`}
                      className="relative py-2 pl-3 text-left"
                      data-ui={`men-item-${category.replace(/[^a-zA-Z0-9]/g, '')}`}
                      style={{
                        borderBottom: rowIndex < col.length - 1 
                          ? '1px solid rgba(255, 255, 255, 0.06)' 
                          : 'none',
                      }}
                    >
                      {/* Subtle dot accent - on the left side */}
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                        data-ui={`men-dot-${category.replace(/[^a-zA-Z0-9]/g, '')}`}
                        style={{
                          background: 'rgba(220, 20, 60, 0.6)',
                          boxShadow: '0 0 10px rgba(220, 20, 60, 0.5)',
                        }}
                        aria-hidden
                      />
                      
                      {/* Category text */}
                      <span
                        className="text-base md:text-lg lg:text-xl pl-1"
                        data-ui={`men-text-${category.replace(/[^a-zA-Z0-9]/g, '')}`}
                        style={categoryStyle}
                      >
                        {category}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Inside bottom line */}
            <div
              className="mt-3 h-px"
              data-ui="men-bottom-line"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />
          </div>

          {/* Women Categories */}
          <div
            className="relative"
            data-ui="women-categories"
          >
            {/* Header */}
            <h3
              className="text-lg md:text-xl mb-2 text-center"
              data-ui="women-header"
              style={{
                ...headerStyle,
                color: 'rgba(220, 20, 60, 0.9)',
              }}
            >
              Mujeres
            </h3>

            {/* Inside line below header */}
            <div
              className="mb-3 h-px"
              data-ui="women-header-line"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />

            {/* Categories list - 5 columns */}
            <div className="grid grid-cols-5 gap-2 md:gap-3" data-ui="women-list">
              {WOMEN_CATEGORIES.map((col, colIndex) => (
                <div key={`women-col-${colIndex}`} className="flex flex-col" data-ui={`women-column-${colIndex}`}>
                  {col.map((category, rowIndex) => (
                    <div
                      key={`women-${category}`}
                      className="relative py-2 pl-3 text-left"
                      data-ui={`women-item-${category.replace(/[^a-zA-Z0-9]/g, '')}`}
                      style={{
                        borderBottom: rowIndex < col.length - 1 
                          ? '1px solid rgba(255, 255, 255, 0.06)' 
                          : 'none',
                      }}
                    >
                      {/* Subtle dot accent - on the left side */}
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                        data-ui={`women-dot-${category.replace(/[^a-zA-Z0-9]/g, '')}`}
                        style={{
                          background: 'rgba(220, 20, 60, 0.6)',
                          boxShadow: '0 0 10px rgba(220, 20, 60, 0.5)',
                        }}
                        aria-hidden
                      />
                      
                      {/* Category text */}
                      <span
                        className="text-base md:text-lg lg:text-xl pl-1"
                        data-ui={`women-text-${category.replace(/[^a-zA-Z0-9]/g, '')}`}
                        style={categoryStyle}
                      >
                        {category}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Inside bottom line */}
            <div
              className="mt-3 h-px"
              data-ui="women-bottom-line"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />
          </div>
        </div>

        {/* Button Container - Centered below categories */}
        <div
          className="mt-20 flex flex-col items-center gap-2"
          data-ui="button-container"
        >
          {/* Label above the button */}
          <span
            className="text-sm md:text-base tracking-widest uppercase"
            data-ui="button-label-primary"
            style={{
              fontFamily: '"Contrail One", sans-serif',
              color: 'rgba(255, 255, 255, 0.6)',
              letterSpacing: '0.15em',
            }}
          >
            Consulta las marcas minimas
          </span>
          {/* Second line */}
          <span
            className="text-xs md:text-sm tracking-widest uppercase"
            data-ui="button-label-secondary"
            style={{
              fontFamily: '"Contrail One", sans-serif',
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.1em',
            }}
          >
            para clasificar para otras competiciones
          </span>
          {/* Button */}
          <ShimmerButton />
        </div>

      </div>

      {/* Subtle background glow effects */}
      <div
        className="absolute top-1/3 left-1/4 w-96 h-96 bg-red-accent/3 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-left"
        aria-hidden
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-dark-red/4 rounded-full blur-3xl pointer-events-none"
        data-ui="bg-glow-right"
        aria-hidden
      />

    </section>
  );
};

export default WeightCategoriesSection;
