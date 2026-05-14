import { useEffect, useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { useAtomValue } from 'jotai';
import { BackofficeLayout } from '../../layouts/BackofficeLayout';
import { CardGrid, SectionCard } from '../../components/ui';
import { KpiCard } from '../../components/ui/KpiCard/KpiCard';
import { api } from '../../utils/api';
import { useSignalR } from '../../hooks/useSignalR';
import { participantCount } from '../../stores/participants';
import { currentCompeticionAtom, isCurrentFerAtom } from '../../stores/auth.atoms';
import { Settings, Users, Calendar, QrCode, ClipboardList, Gavel } from 'lucide-react';

interface Statistics {
  totalParticipants: number;
  totalTickets: number;
  totalRevenue: number;
}

export function BackofficeHome(): JSX.Element {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const isFer = useAtomValue(isCurrentFerAtom);

  useSignalR();

  const slug = currentCompeticion?.slug ?? '';
  const buildPath = (subPath: string) => slug ? `/backoffice/${slug}/${subPath}` : `/backoffice/${subPath}`;

  const qrReaderHref = useMemo(() => buildPath('qr-reader'), [slug]);

  const fetchStatistics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getStatistics();
      setStats(data);
      setError(null);
    } catch {
      setError('Error al cargar estadisticas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  // Refresh when SignalR updates participant count
  useEffect(() => {
    if (stats && participantCount.value !== stats.totalParticipants) {
      fetchStatistics();
    }
  }, [participantCount.value, stats, fetchStatistics]);

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="backoffice-home">
        {/* Header */}
        <div className="mb-6 xs:mb-8" data-ui="home-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2" data-ui="home-title">
            Panel de Administracion
          </h1>
          <p className="text-sm xs:text-base text-gray-400" data-ui="home-subtitle">
            Gestiona las {isFer ? 'inscripciones y horarios' : 'inscripciones, sorteos y horarios'} de {currentCompeticion?.nombre ?? 'la competicion'}
          </p>
        </div>

        {/* Live KPIs */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm2:grid-cols-2 md:grid-cols-3 gap-3 xs:gap-4 mb-6 xs:mb-8" data-ui="kpi-row">
          <KpiCard
            label="Participantes"
            value={participantCount.value || stats?.totalParticipants || 0}
            color="default"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Tickets Vendidos"
            value={stats?.totalTickets ?? 0}
            color="success"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            }
          />
          <KpiCard
            label="Recaudacion"
            value={stats ? `${stats.totalRevenue.toFixed(2)} EUR` : '0.00 EUR'}
            color="warning"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Section Cards */}
        <CardGrid columns={isFer ? 3 : 4}>
          <SectionCard
            title="Inscripciones"
            description="Gestiona los atletas registrados y filtra por categoria"
            href={buildPath('inscripciones')}
            icon={<ClipboardList className="w-5 h-5 xs:w-6 xs:h-6 text-red-accent" />}
          />
          {!isFer && (<>
          <SectionCard
            title="Participantes"
            description="Administra las entradas del sorteo y exporta datos en CSV"
            href={buildPath('participantes')}
            icon={<Users className="w-5 h-5 xs:w-6 xs:h-6 text-blue-400" />}
          />
          <SectionCard
            title="Sorteo"
            description="Realiza el sorteo de ganadores entre los participantes"
            href={buildPath('sorteo')}
            icon={<Gavel className="w-5 h-5 xs:w-6 xs:h-6 text-purple-400" />}
          />
          </>)}
          <SectionCard
            title="Horarios"
            description="Configura los horarios de las categorias por dia"
            href={buildPath('horarios')}
            icon={<Calendar className="w-5 h-5 xs:w-6 xs:h-6 text-blue-400" />}
          />
          <SectionCard
            title="Configuración General"
            description="Configura el sistema de email para envíos automáticos"
            href={buildPath('configuracion')}
            icon={<Settings className="w-5 h-5 xs:w-6 xs:h-6 text-gray-400" />}
          />
          <SectionCard
            title="Lector QR"
            description="Escanea el código QR del atleta para verificar inscripción y pago"
            href={qrReaderHref}
            icon={<QrCode className="w-5 h-5 xs:w-6 xs:h-6 text-green-400" />}
          />
          <SectionCard
            title="Mesa de Jueces"
            description="Vista en vivo de intentos y pesos de cada atleta"
            href={buildPath('judge-table')}
            icon={<Users className="w-5 h-5 xs:w-6 xs:h-6 text-orange-400" />}
          />
        </CardGrid>

        {/* Quick Actions */}
        <div className="mt-6 xs:mt-8 flex flex-wrap gap-2 xs:gap-3" data-ui="quick-actions">
          <button
            onClick={async () => {
              try { await api.exportCsv(); } catch { /* noop */ }
            }}
            className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
            data-ui="export-csv-btn"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden xs:inline">Exportar CSV</span>
            <span className="xs:hidden">CSV</span>
          </button>
          <button
            onClick={fetchStatistics}
            className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
            data-ui="refresh-btn"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>

        {/* Info Cards */}
        <div className="mt-6 xs:mt-8 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 gap-4 xs:gap-6" data-ui="info-cards">
          <div className="p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="info-how">
            <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2" data-ui="info-how-title">
              <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-how-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Como funciona
            </h3>
            <div className="space-y-2 text-gray-400 text-sm" data-ui="info-how-list">
              <p data-ui="info-how-price">Cada ticket cuesta <span className="text-white font-semibold" data-ui="info-how-price-value">0.50 EUR</span></p>
              <p data-ui="info-how-multiple">Los participantes pueden comprar multiples tickets</p>
              <p data-ui="info-how-winner">El ganador se selecciona aleatoriamente (ponderado por tickets)</p>
              <p data-ui="info-how-realtime">Actualizaciones en tiempo real via SignalR</p>
            </div>
          </div>
          <div className="p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="info-security">
            <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2" data-ui="info-security-title">
              <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-security-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Seguridad
            </h3>
            <div className="space-y-2 text-gray-400 text-sm" data-ui="info-security-list">
              <p data-ui="info-security-jwt">Todas las rutas admin estan protegidas por JWT</p>
              <p data-ui="info-security-sessions">Las sesiones expiran despues de 24 horas</p>
              <p data-ui="info-security-audit">Todos los sorteos quedan registrados con timestamps</p>
              <p data-ui="info-security-creds">Cambiar credenciales por defecto en produccion</p>
            </div>
          </div>
        </div>
      </div>
    </BackofficeLayout>
  );
}

export default BackofficeHome;
