# WeightCategoriesSection Component

## Tasks

[x] Task 1: Create WeightCategoriesSection.tsx component file
[~] Task 2: Update components/index.ts to export the new component
[x] Task 2: Update components/index.ts to export the new component
[x] Task 3: Update Home.tsx to import and place the section
[x] Task 4: Verify build compiles without errors

```tsx
import { FC, useMemo } from 'react';

export interface WeightCategoriesSectionProps {
  className?: string;
}

/**
 * WeightCategoriesSection Component
 * 
 * Features:
 * - Minimal design with weight categories for men and women
 * - End fade effects on left and right sides
 * - Inside lines only (no margin borders)
 * - Ghost glassmorphism button with shimmer outline
 * - Background image with overlay
 * - Scroll-triggered fade animations
 */

// Weight categories data
const MEN_CATEGORIES = ['-53kg', '-59kg', '-66kg', '-74kg', '-83kg', '-93kg', '-105kg', '-120kg', '+120kg'];
const WOMEN_CATEGORIES = ['-43', '-47', '-52', '-57', '-63', '-69', '-76', '-84', '+84'];

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
      data-ui="shimmer-button"
      aria-label="Ver marcas mínimas - Abre en nueva ventana"
    >
      {/* Glassmorphism background */}
      <div
        className="absolute inset-0 rounded-lg backdrop-blur-md"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        aria-hidden
      />

      {/* Shimmer outline effect */}
      <div
        className="absolute inset-0 rounded-lg overflow-hidden"
        aria-hidden
      >
        {/* Shimmer line animation */}
        <div
          className="absolute top-0 left-0 w-full h-px shimmer-line"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.8) 50%, transparent 100%)',
            animation: 'shimmerMove 3s ease-in-out infinite',
          }}
        />
        {/* Top border with gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 20%, rgba(220, 20, 60, 0.8) 50%, rgba(220, 20, 60, 0.6) 80%, transparent 100%)',
          }}
        />
        {/* Bottom border with gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.4) 20%, rgba(220, 20, 60, 0.6) 50%, rgba(220, 20, 60, 0.4) 80%, transparent 100%)',
          }}
        />
        {/* Left border */}
        <div
          className="absolute top-0 bottom-0 left-0 w-px"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(220, 20, 60, 0.5) 50%, transparent 100%)',
          }}
        />
        {/* Right border */}
        <div
          className="absolute top-0 bottom-0 right-0 w-px"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(220, 20, 60, 0.5) 50%, transparent 100%)',
          }}
        />
      </div>

      {/* Button content */}
      <div className="relative z-10 flex flex-col items-center">
        <span
          className="text-sm md:text-base tracking-widest uppercase"
          style={{
            fontFamily: '"Contrail One", sans-serif',
            color: 'rgba(255, 255, 255, 0.7)',
            letterSpacing: '0.15em',
          }}
        >
          Consulta las marcas minimas
        </span>
        <span
          className="text-lg md:text-xl mt-1 transition-all duration-300 group-hover:text-white"
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
          style={{ color: 'rgba(220, 20, 60, 0.8)' }}
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
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
 * WeightCategoriesSection Component
 */
export const WeightCategoriesSection: FC<WeightCategoriesSectionProps> = ({ className = '' }) => {
  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);

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
      {/* Background Image with overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          backgroundImage: `url('https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_47_22.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.15,
        }}
      />

      {/* Dark gradient overlay on background */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background: 'linear-gradient(180deg, rgba(10, 10, 10, 0.9) 0%, rgba(10, 10, 10, 0.7) 50%, rgba(10, 10, 10, 0.95) 100%)',
        }}
      />

      {/* Fade overlay - Left */}
      <div
        className="absolute top-0 bottom-0 left-0 w-32 md:w-48 pointer-events-none z-10"
        aria-hidden
        style={{
          background: 'linear-gradient(to right, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-left"
      />

      {/* Fade overlay - Right */}
      <div
        className="absolute top-0 bottom-0 right-0 w-32 md:w-48 pointer-events-none z-10"
        aria-hidden
        style={{
          background: 'linear-gradient(to left, #0a0a0a 0%, transparent 100%)',
        }}
        data-ui="fade-right"
      />

      {/* Content Container */}
      <div className="relative max-w-6xl mx-auto px-8 md:px-16 lg:px-24">
        
        {/* Section Header */}
        <div
          className="text-center mb-16"
          data-ui="section-header"
          style={{
            opacity: prefersReducedMotion ? 1 : 0,
            transform: prefersReducedMotion ? 'none' : 'translateY(20px)',
            transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          <h2
            className="text-3xl md:text-4xl lg:text-5xl"
            style={headerStyle}
          >
            Categorias de peso
          </h2>
          {/* Subtle underline */}
          <div
            className="mt-4 mx-auto w-24 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(220, 20, 60, 0.6), transparent)',
            }}
          />
        </div>

        {/* Categories Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 lg:gap-24"
          data-ui="categories-grid"
          style={{
            opacity: prefersReducedMotion ? 1 : 0,
            transform: prefersReducedMotion ? 'none' : 'translateY(30px)',
            transition: 'opacity 0.8s ease-out 0.2s, transform 0.8s ease-out 0.2s',
          }}
        >
          {/* Men Categories */}
          <div
            className="relative"
            data-ui="men-categories"
          >
            {/* Inside top line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />
            
            {/* Header */}
            <h3
              className="text-xl md:text-2xl mb-6 pb-3 text-center"
              style={{
                ...headerStyle,
                color: 'rgba(220, 20, 60, 0.9)',
              }}
            >
              Hombres
            </h3>

            {/* Categories list with inside lines */}
            <div className="space-y-0" data-ui="men-list">
              {MEN_CATEGORIES.map((category, index) => (
                <div
                  key={`men-${category}`}
                  className="relative py-3 px-4"
                  style={{
                    borderBottom: index < MEN_CATEGORIES.length - 1 
                      ? '1px solid rgba(255, 255, 255, 0.08)' 
                      : 'none',
                  }}
                >
                  {/* Category text */}
                  <span
                    className="text-lg md:text-xl lg:text-2xl"
                    style={categoryStyle}
                  >
                    {category}
                  </span>
                  
                  {/* Subtle dot accent */}
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full"
                    style={{
                      background: 'rgba(220, 20, 60, 0.5)',
                      boxShadow: '0 0 8px rgba(220, 20, 60, 0.4)',
                    }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>

            {/* Inside bottom line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-px"
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
            {/* Inside top line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />

            {/* Header */}
            <h3
              className="text-xl md:text-2xl mb-6 pb-3 text-center"
              style={{
                ...headerStyle,
                color: 'rgba(220, 20, 60, 0.9)',
              }}
            >
              Mujeres
            </h3>

            {/* Categories list with inside lines */}
            <div className="space-y-0" data-ui="women-list">
              {WOMEN_CATEGORIES.map((category, index) => (
                <div
                  key={`women-${category}`}
                  className="relative py-3 px-4"
                  style={{
                    borderBottom: index < WOMEN_CATEGORIES.length - 1 
                      ? '1px solid rgba(255, 255, 255, 0.08)' 
                      : 'none',
                  }}
                >
                  {/* Category text */}
                  <span
                    className="text-lg md:text-xl lg:text-2xl"
                    style={categoryStyle}
                  >
                    {category}
                  </span>
                  
                  {/* Subtle dot accent */}
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full"
                    style={{
                      background: 'rgba(220, 20, 60, 0.5)',
                      boxShadow: '0 0 8px rgba(220, 20, 60, 0.4)',
                    }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>

            {/* Inside bottom line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.3) 20%, rgba(220, 20, 60, 0.5) 50%, rgba(220, 20, 60, 0.3) 80%, transparent 100%)',
              }}
            />
          </div>
        </div>

        {/* Shimmer Button - Centered below categories */}
        <div
          className="mt-20 flex justify-center"
          data-ui="button-container"
          style={{
            opacity: prefersReducedMotion ? 1 : 0,
            transform: prefersReducedMotion ? 'none' : 'translateY(20px)',
            transition: 'opacity 0.6s ease-out 0.4s, transform 0.6s ease-out 0.4s',
          }}
        >
          <ShimmerButton />
        </div>

      </div>

      {/* Subtle background glow effects */}
      <div
        className="absolute top-1/3 left-1/4 w-96 h-96 bg-red-accent/3 rounded-full blur-3xl pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-dark-red/4 rounded-full blur-3xl pointer-events-none"
        aria-hidden
      />

    </section>
  );
};

export default WeightCategoriesSection;
```

## Changes to other files:

### frontend/src/pages/home/components/index.ts
Add export:
```tsx
export { WeightCategoriesSection } from './WeightCategoriesSection';
```

### frontend/src/pages/home/Home.tsx
Add import and place after AthletesSection:
```tsx
import { WeightCategoriesSection } from './components';
// ... in JSX, after <AthletesSection />
<WeightCategoriesSection />
```
