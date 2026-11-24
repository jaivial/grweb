import { FC } from 'react';

export interface InscripcionesSectionProps {
  className?: string;
}

const AEP_LISTS = [
  { label: 'Lista de inscritos AEP (1)', url: 'https://docs.google.com/spreadsheets/d/1iwVC8FDMmNe_pCTxgW-yP6PWocuFaeacKvk794VMJKQ/edit' },
  { label: 'Lista de inscritos AEP (2)', url: 'https://docs.google.com/spreadsheets/d/1UjcPxcPgGVD2tUkI1YaIYKARqQh1ENPorGvPDtmxK0A/edit' },
];

const INSCRITOS = 153;

/**
 * InscripcionesSection — inscripciones cerradas (BIZ-160).
 * Las inscripciones se gestionaron en la AEP; se muestran el total y las listas oficiales.
 */
export const InscripcionesSection: FC<InscripcionesSectionProps> = ({ className = '' }) => (
  <div className={`w-full flex flex-col items-center mt-16 pb-16 px-4 ${className}`} data-ui="inscripciones-section">
    <h2
      className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-8 mt-16 text-transparent bg-clip-text bg-gradient-to-r from-red-accent to-dark-red"
      data-ui="inscripciones-heading"
    >
      INSCRIPCIONES CERRADAS
    </h2>
    <p className="text-center text-6xl md:text-7xl font-bold text-white mb-2" data-ui="inscripciones-count">
      {INSCRITOS}
    </p>
    <p className="text-center text-xl md:text-2xl text-gray-200 mb-6" data-ui="inscripciones-count-label">
      atletas inscritos
    </p>
    <p className="text-center text-lg text-gray-300 mb-8 max-w-2xl" data-ui="inscripciones-closed-text">
      Las inscripciones a la II GRStrength Cup están cerradas. Se han realizado a través de la AEP
      (Asociación Española de Powerlifting). Consulta las listas oficiales de inscritos:
    </p>
    <div className="flex flex-col sm:flex-row gap-4" data-ui="inscripciones-aep-lists">
      {AEP_LISTS.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-3 min-h-[48px] text-base font-medium text-white bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl hover:bg-red-accent/80 hover:border-red-accent/50 transition-all duration-300"
          data-ui="inscripciones-aep-list-button"
        >
          {l.label}
        </a>
      ))}
    </div>
  </div>
);
