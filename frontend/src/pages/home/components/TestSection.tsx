import { FC } from 'react';
import { useCdnImage } from '@hooks/useCdnImage';
import { InscripcionesSection } from './InscripcionesSection';

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
 * - Sponsors & collaborators
 */
interface Sponsor {
  name: string;
  logo: string | null;
}

const SponsorItem: FC<{ sponsor: Sponsor; height: number; textClass: string }> = ({ sponsor, height, textClass }) => {
  const src = useCdnImage(sponsor.logo ?? '');
  return (
    <li className="flex items-center" data-ui="sponsor-item">
      {sponsor.logo ? (
        <img src={src} alt={sponsor.name} title={sponsor.name} style={{ height }} className="w-auto object-contain" loading="lazy" />
      ) : (
        <span
          className={`${textClass} uppercase text-white/90`}
          style={{ fontFamily: '"Contrail One", sans-serif', letterSpacing: '0.04em' }}
        >
          {sponsor.name}
        </span>
      )}
    </li>
  );
};

export const TestSection: FC<TestSectionProps> = ({ className = '' }) => {
  // Patrocinadores y colaboradores oficiales (BIZ-159). Los 4 primeros van en la primera fila, más grandes.
  // logo: null => aún no hay logo oficial en el CDN; se muestra el nombre hasta que se suba.
  const CDN_SPONSORS = 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/';
  const featuredSponsors: Sponsor[] = [
    { name: 'GR Strength Coaching', logo: null },
    { name: 'GR Strength Club', logo: null },
    { name: 'Ayuntamiento de Almussafes', logo: null },
    { name: 'GR Strength Alicante', logo: null },
  ];
  const sponsors: Sponsor[] = [
    { name: 'A7', logo: CDN_SPONSORS + 'ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp' },
    { name: 'Silentworker', logo: null },
    { name: 'AEP', logo: CDN_SPONSORS + 'compressedAEP.webp' },
    { name: 'Eleiko', logo: null },
    { name: 'ER Strength Club', logo: null },
    { name: 'KGXLB', logo: null },
    { name: 'FER Entrenamiento', logo: null },
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
      <div className="max-w-5xl w-full px-6 flex flex-col items-center" data-ui="main-title-content">
        
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
            data-ui="championship-heading"
          >
            <span className="mb-1" data-ui="championship-line-1">CAMPEONATO DE POWERLIFTING</span>
            <span data-ui="championship-line-2">AEP2 REGIONAL DE VALENCIA, MURCIA Y BALEARES</span>
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
            data-ui="event-date-heading"
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
            data-ui="event-location-heading"
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

        {/* Patrocinadores y colaboradores */}
        <div className="w-full mt-24 px-4 flex flex-col items-center gap-12" data-ui="sponsors">
          <ul className="flex flex-wrap justify-center items-center gap-x-14 gap-y-8" data-ui="sponsors-featured">
            {featuredSponsors.map((s) => (
              <SponsorItem key={s.name} sponsor={s} height={96} textClass="text-2xl md:text-3xl" />
            ))}
          </ul>
          <ul className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6" data-ui="sponsors-rest">
            {sponsors.map((s) => (
              <SponsorItem key={s.name} sponsor={s} height={56} textClass="text-lg md:text-xl" />
            ))}
          </ul>
        </div>

        {/* Inscripciones Section */}
        <InscripcionesSection className="mt-16" />

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
