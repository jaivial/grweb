import { FC, useEffect, useState, useCallback } from 'react';
import { api } from '../../../utils/api';

export interface InscripcionesSectionProps {
  className?: string;
}

interface InscripcionConfig {
  active: boolean;
  url: string | null;
}

interface InscripcionPreparada {
  prepared: boolean;
  responsable: boolean;
  aepUrl: string | null;
}

/**
 * InscripcionesSection Component
 *
 * Features:
 * - Fetches inscripcion config and prepared status from public API
 * - If prepared=false OR active=false: Shows Instagram fallback
 * - If prepared=true AND active=true: Shows registration section with button to /inscripcion
 * - If prepared=true AND active=false: Shows AEP URL button
 */
export const InscripcionesSection: FC<InscripcionesSectionProps> = ({ className = '' }) => {
  const [config, setConfig] = useState<InscripcionConfig | null>(null);
  const [preparada, setPreparada] = useState<InscripcionPreparada | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    try {
      const [configData, preparadaData] = await Promise.all([
        api.getPublicInscripcionConfig(),
        api.getPublicInscripcionPreparada(),
      ]);
      setConfig(configData);
      setPreparada({
        prepared: preparadaData.prepared,
        responsable: preparadaData.responsable,
        aepUrl: preparadaData.aepUrl,
      });
    } catch (error) {
      console.error('Error fetching configs:', error);
      // Default to active=true, prepared=true, and GRStrength responsable if fetch fails
      setConfig({ active: true, url: null });
      setPreparada({ prepared: true, responsable: true, aepUrl: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  if (loading) {
    return null;
  }

  // If not prepared OR not active, show Instagram fallback
  const showInstagramFallback = !preparada?.prepared || !config?.active;

  if (showInstagramFallback) {
    return (
      <div
        className={`w-full flex flex-col items-center mt-48 mb-32 ${className}`}
        data-ui="inscripciones-section"
      >
        <h2
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-12 mt-16 text-transparent bg-clip-text bg-gradient-to-r from-red-accent to-dark-red"
          data-ui="inscripciones-heading"
        >
          INSCRIPCIONES
        </h2>
        <svg className="w-16 h-16 text-white opacity-100 mb-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
        <p className="text-center text-lg text-gray-300 mb-6 max-w-xl px-4">
          Las inscripciones a la GRStrength CUP todavía no están abiertas. Síguenos en instagram para mantenerte informado.
        </p>
        <a
          href="https://www.instagram.com/grstrengthclub/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-6 py-3 min-h-[48px] text-base font-medium text-white bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl hover:bg-red-accent/80 hover:border-red-accent/50 hover:scale-[1.2] transition-all duration-300 cursor-pointer"
          data-ui="instagram-fallback-button"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          Síguenos en Instagram
        </a>
      </div>
    );
  }

  // Prepared and active - show normal registration content
  const titleStyle: React.CSSProperties = {
    fontFamily: '"Contrail One", sans-serif',
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: '#ffffff',
    textTransform: 'uppercase',
    textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5)',
  };

  return (
    <div
      className={`w-full flex flex-col items-center mt-16 pb-16 ${className}`}
      data-ui="inscripciones-section"
    >
      {/* Title */}
      <h2
        className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-12 mt-16 text-transparent bg-clip-text bg-gradient-to-r from-red-accent to-dark-red"
        data-ui="inscripciones-heading"
      >
        INSCRIPCIONES
      </h2>
      <h3
        className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl text-center mb-4"
        style={titleStyle}
        data-ui="inscripciones-title"
      >
        ¡Inscríbete ya en II GR Cup!
      </h3>

      {/* Subtitle (only when active=false) */}
      {config?.active === false && (
        <p
          className="text-center text-lg md:text-xl text-gray-300 mb-6 max-w-2xl"
          data-ui="inscripciones-subtitle"
        >
          Haz click en el botón para acceder a la página de la AEP para inscribirte
        </p>
      )}

      {/* CTA Button */}
      {preparada?.responsable === true ? (
        <a
          href="/inscripcion"
          className="inline-flex items-center gap-3 mb-20 px-8 py-4 min-h-[52px] text-lg font-semibold text-white bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl hover:bg-red-accent/80 hover:border-red-accent/50 hover:scale-[1.2] transition-all duration-300 shadow-lg shadow-red-accent/30 hover:shadow-red-accent/50"
          data-ui="inscripciones-button"
        >
          Inscríbete
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      ) : (
        <a
          href={preparada?.aepUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-8 py-4 min-h-[52px] text-lg font-semibold text-white bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl hover:bg-red-accent/80 hover:border-red-accent/50 hover:scale-[1.2] transition-all duration-300 shadow-lg shadow-red-accent/30 hover:shadow-red-accent/50"
          data-ui="inscripciones-button-aep"
        >
          Inscríbete
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </div>
  );
};

export default InscripcionesSection;
