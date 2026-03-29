import type { JSX } from 'react';
import { Link } from 'wouter';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';

export function Sorteo(): JSX.Element {
  return (
    <BackofficeLayout>
      <div className="p-4 lg:p-8" data-ui="sorteo-page">
        {/* Header */}
        <div className="mb-6" data-ui="page-header">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Sorteo</h1>
          <p className="text-gray-400">Gestión de sorteos y selección de ganadores</p>
        </div>

        {/* Placeholder */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-12 text-center" data-ui="coming-soon">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-hover flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Próximamente</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            La sección de sorteos está siendo desarrollada. Podrás realizar sorteos aleatorios entre los participantes inscritos.
          </p>
          <Link href="/backoffice">
            <a className="inline-flex items-center gap-2 px-4 py-2 bg-red-accent hover:bg-red-accent/90 text-white rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver al inicio
            </a>
          </Link>
        </div>
      </div>
    </BackofficeLayout>
  );
}

export default Sorteo;
