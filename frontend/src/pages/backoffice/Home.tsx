import type { JSX } from 'react';
import { BackofficeLayout } from '../../layouts/BackofficeLayout';
import { CardGrid, SectionCard } from '../../components/ui';

export function BackofficeHome(): JSX.Element {
  return (
    <BackofficeLayout>
      <div className="p-4 lg:p-8" data-ui="backoffice-home">
        {/* Header */}
        <div className="mb-8" data-ui="home-header">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
            Panel de Administración
          </h1>
          <p className="text-gray-400">
            Gestiona las inscripciones, sorteos y horarios del GR Cup
          </p>
        </div>

        {/* Section Cards */}
        <CardGrid columns={3}>
          <SectionCard
            title="Inscripciones"
            description="Gestiona los atletas registrados, añade nuevas inscripciones y filtra por categoría"
            href="/backoffice/inscripciones"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <SectionCard
            title="Sorteo"
            description="Realiza el sorteo de ganadores entre los participantes registrados"
            href="/backoffice/sorteo"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <SectionCard
            title="Horarios"
            description="Configura los horarios de las categorías por día de competición"
            href="/backoffice/horarios"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        </CardGrid>

        {/* Quick Stats Section */}
        <div className="mt-12 p-6 bg-dark-surface rounded-2xl border border-dark-border" data-ui="quick-stats">
          <h2 className="text-lg font-semibold text-white mb-4">Información Rápida</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-ui="stats-grid">
            <div className="flex items-center gap-4" data-ui="stat-item">
              <div className="w-12 h-12 rounded-xl bg-red-accent/10 flex items-center justify-center text-red-accent">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Fecha del Evento</p>
                <p className="text-white font-medium">Por definir</p>
              </div>
            </div>
            <div className="flex items-center gap-4" data-ui="stat-item">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Ubicación</p>
                <p className="text-white font-medium">Por definir</p>
              </div>
            </div>
            <div className="flex items-center gap-4" data-ui="stat-item">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Estado</p>
                <p className="text-white font-medium">Preparando</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BackofficeLayout>
  );
}

export default BackofficeHome;
