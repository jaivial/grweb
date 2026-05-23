import { useCallback, useMemo, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAtomValue } from 'jotai';
import { hasPermissionAtom, userAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { InscripcionStats } from '../../../types/api';
import { BackofficeLayout } from '../BackofficeLayout';
import { KpiCard } from '../../../components/ui/KpiCard';
import { SectionCard } from '../../../components/ui/SectionCard';
import {
  UsersIcon,
  TicketIcon,
  CurrencyIcon,
  CheckIcon,
  SettingsIcon,
  CalendarIcon,
  BarChartIcon,
  TrophyIcon,
  QRIcon,
} from '../../../components/ui/Icon';

interface DashboardState {
  loading: boolean;
  stats: InscripcionStats | null;
  error: string | null;
}

const PERMISSION_SECTIONS = [
  {
    id: 'users',
    title: 'Miembros',
    description: 'Gestionar miembros y roles',
    icon: UsersIcon,
    permission: 'view_participantes' as const,
    hrefTemplate: '/backoffice/:competicionSlug/users',
  },
  {
    id: 'inscripciones',
    title: 'Inscripciones',
    description: 'Ver y gestionar inscripciones',
    icon: TicketIcon,
    permission: 'view_inscriptos' as const,
    hrefTemplate: '/backoffice/:competicionSlug/inscripciones',
  },
  {
    id: 'horarios',
    title: 'Horarios',
    description: 'Configurar horarios de la competición',
    icon: CalendarIcon,
    permission: 'view_horarios' as const,
    hrefTemplate: '/backoffice/:competicionSlug/horarios',
  },
  {
    id: 'stats',
    title: 'Estadísticas',
    description: 'Ver estadísticas detalladas',
    icon: BarChartIcon,
    permission: 'view_stats' as const,
    hrefTemplate: '/backoffice/:competicionSlug/stats',
  },
  {
    id: 'raffle',
    title: 'Sorteo',
    description: 'Gestionar rifa y premios',
    icon: TrophyIcon,
    permission: 'view_raffle' as const,
    hrefTemplate: '/backoffice/:competicionSlug/raffle',
  },
  {
    id: 'qr',
    title: 'Escanear QR',
    description: 'Escanear códigos QR de participantes',
    icon: QRIcon,
    permission: 'view_qr' as const,
    hrefTemplate: '/backoffice/:competicionSlug/qr',
  },
  {
    id: 'config',
    title: 'Configuración',
    description: 'Ajustes de la competición',
    icon: SettingsIcon,
    permission: 'manage_config' as const,
    hrefTemplate: '/backoffice/:competicionSlug/config',
  },
];

export function DashboardPage(): JSX.Element {
  const [location] = useLocation();
  const currentCompeticionSlug = location.split('/')[2];
  const user = useAtomValue(userAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const currentCompeticion = useMemo(() => {
    if (!user) return null;
    return user.competiciones.find(c => c.slug === currentCompeticionSlug) ?? user.competiciones[0];
  }, [user, currentCompeticionSlug]);

  const [dashboardState, setDashboardState] = useState<DashboardState>({
    loading: true,
    stats: null,
    error: null,
  });

  const loadStats = useCallback(async () => {
    if (!currentCompeticion?.id) return;

    setDashboardState(prev => ({ ...prev, loading: true, error: null }));

    const result = await api.getAdminInscripcionStats(currentCompeticion.id);

    if (result.success && result.data) {
      setDashboardState({
        loading: false,
        stats: result.data,
        error: null,
      });
    } else {
      setDashboardState({
        loading: false,
        stats: null,
        error: result.message || 'Error cargando estadísticas',
      });
    }
  }, [currentCompeticion?.id]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const kpiCards = useMemo(() => {
    if (!dashboardState.stats) return [];

    const { stats } = dashboardState;
    const ticketsRemaining = 100 - stats.pagados;

    return [
      {
        label: 'Total Participantes',
        value: stats.total,
        icon: <UsersIcon size="lg" />,
        color: 'default' as const,
      },
      {
        label: 'Pagados',
        value: stats.pagados,
        icon: <CheckIcon size="lg" />,
        color: 'success' as const,
      },
      {
        label: 'Pendientes',
        value: stats.pendientes,
        icon: <TicketIcon size="lg" />,
        color: 'warning' as const,
      },
      {
        label: 'Revenue',
        value: `${stats.revenue.toLocaleString('es-ES')}€`,
        icon: <CurrencyIcon size="lg" />,
        color: 'default' as const,
      },
      {
        label: 'Check-ins',
        value: stats.checkins,
        icon: <CheckIcon size="lg" />,
        color: 'success' as const,
      },
      {
        label: 'Tickets remaining',
        value: ticketsRemaining > 0 ? ticketsRemaining : 0,
        icon: <TicketIcon size="lg" />,
        color: 'warning' as const,
      },
    ];
  }, [dashboardState.stats]);

  const availableSections = useMemo(() => {
    return PERMISSION_SECTIONS.filter(section => hasPermission(section.permission))
      .map(section => ({
        ...section,
        href: section.hrefTemplate.replace(':competicionSlug', currentCompeticionSlug || ''),
      }));
  }, [hasPermission, currentCompeticionSlug]);

  const breadcrumbs = useMemo(() => [
    { label: 'Dashboard' },
  ], []);

  return (
    <BackofficeLayout breadcrumbs={breadcrumbs} title="Dashboard">
      <div data-ui="dashboard-page" className="max-w-6xl mx-auto space-y-8">
        <div data-ui="dashboard-header">
          <h1 data-ui="welcome-title" className="text-2xl font-bold text-white">
            Bienvenido{currentCompeticion ? ` - ${currentCompeticion.nombre}` : ''}
          </h1>
          <p data-ui="welcome-subtitle" className="text-sm text-gray-400 mt-1">
            Resumen de tu competición
          </p>
        </div>

        <section data-ui="kpi-section" aria-label="Indicadores de rendimiento">
          <h2 data-ui="kpi-section-title" className="text-lg font-semibold text-white mb-4">
            KPIs
          </h2>
          {dashboardState.loading ? (
            <div data-ui="kpi-loading" className="flex flex-wrap -mx-1.5 sm:-mx-2">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="w-1/2 sm:w-1/3 lg:w-1/4 xl:w-1/6 px-1.5 sm:px-2 mb-3">
                  <div data-ui="kpi-skeleton" className="bg-dark-card rounded-2xl p-3 xs:p-4 h-full animate-pulse">
                    <div className="h-3 xs:h-4 bg-white/10 rounded w-3/4 mb-2" />
                    <div className="h-7 xs:h-8 bg-white/10 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : dashboardState.error ? (
            <div data-ui="kpi-error" className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
              <p className="text-red-400 text-sm">{dashboardState.error}</p>
              <button
                data-ui="retry-btn"
                onClick={loadStats}
                className="mt-2 text-sm text-red-400 hover:text-red-300 underline"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div data-ui="kpi-grid" className="flex flex-wrap -mx-1.5 sm:-mx-2">
              {kpiCards.map((kpi, idx) => (
                <div key={idx} className="w-1/2 sm:w-1/3 lg:w-1/4 xl:w-1/6 px-1.5 sm:px-2 mb-3">
                  <KpiCard
                    label={kpi.label}
                    value={kpi.value}
                    icon={kpi.icon}
                    color={kpi.color}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section data-ui="sections-section" aria-label="Secciones disponibles">
          <h2 data-ui="sections-title" className="text-lg font-semibold text-white mb-4">
            Secciones
          </h2>
          <div data-ui="sections-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableSections.map(section => (
              <SectionCard
                key={section.id}
                href={section.href}
                title={section.title}
                description={section.description}
                icon={<section.icon size="lg" />}
              />
            ))}
          </div>
        </section>
      </div>
    </BackofficeLayout>
  );
}

export default DashboardPage;