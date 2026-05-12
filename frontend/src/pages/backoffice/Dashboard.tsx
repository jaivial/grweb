import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { 
  Users, 
  CheckCircle, 
  Clock, 
  DollarSign,
  TrendingUp,
  ArrowRight,
  Download,
  UserPlus,
  Ticket
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAtomValue } from 'jotai';
import { currentCompeticionIdAtom } from '../../stores/auth.atoms';
import { useInscripciones } from '../../hooks/useInscripciones';
import { Spinner } from '../../components/ui/Spinner';
import { FinancialOverview } from './dashboard/components/FinancialOverview';
import clsx from 'clsx';

export function BackofficeDashboard() {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const { stats, loadStats, isLoading } = useInscripciones(competicionId || 0);
  const [recentInscripciones, setRecentInscripciones] = useState<any[]>([]);

  useEffect(() => {
    if (competicionId) {
      loadStats();
    }
  }, [competicionId, loadStats]);

  const kpis = [
    {
      label: 'Total Inscritos',
      value: stats?.total ?? 0,
      icon: Users,
      color: 'blue',
      change: '+12%',
      changePositive: true,
    },
    {
      label: 'Pagados',
      value: stats?.pagados ?? 0,
      icon: CheckCircle,
      color: 'green',
      subtitle: `${stats?.pendientes ?? 0} pendientes`,
    },
    {
      label: 'Upsells',
      value: stats?.upsells ?? 0,
      icon: TrendingUp,
      color: 'purple',
      subtitle: `+${((stats?.upsells ?? 0) * 60).toFixed(0)}€ extra`,
    },
    {
      label: 'Revenue',
      value: `€${(stats?.revenue ?? 0).toFixed(0)}`,
      icon: DollarSign,
      color: 'yellow',
    },
  ];

  if (isLoading) {
    return (
      <AdminLayout title="Dashboard">
        <div
          className="flex items-center justify-center h-64"
          data-ui="dashboard-loading"
        >
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Dashboard" 
      subtitle="Resumen de la competición"
      actions={
        <div className="flex gap-3" data-ui="dashboard-actions">
          <Link href="/backoffice/inscripciones">
            <Button variant="secondary" size="sm">
              <Download size={16} className="mr-2" />
              Exportar CSV
            </Button>
          </Link>
          <Link href="/backoffice/inscripciones">
            <Button size="sm">
              <UserPlus size={16} className="mr-2" />
              Nueva Inscripción
            </Button>
          </Link>
        </div>
      }
    >
      {/* KPI Cards */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        data-ui="dashboard-kpi-grid"
      >
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card 
              key={index} 
              className="p-6 hover:border-gray-600 transition-colors cursor-pointer"
              onClick={() => {/* Navigate to relevant page */}}
            >
              <div
                className="flex items-start justify-between"
                data-ui={`dashboard-kpi-card-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div data-ui={`dashboard-kpi-text-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <p
                    className="text-sm text-gray-400 mb-1"
                    data-ui={`dashboard-kpi-label-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {kpi.label}
                  </p>
                  <p
                    className="text-3xl font-bold text-white"
                    data-ui={`dashboard-kpi-value-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {kpi.value}
                  </p>
                  {kpi.change && (
                    <p
                      className={clsx(
                        'text-sm mt-1',
                        kpi.changePositive ? 'text-green-400' : 'text-red-400'
                      )}
                      data-ui={`dashboard-kpi-change-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {kpi.change}
                    </p>
                  )}
                  {kpi.subtitle && (
                    <p
                      className="text-sm text-gray-400 mt-1"
                      data-ui={`dashboard-kpi-subtitle-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {kpi.subtitle}
                    </p>
                  )}
                </div>
                <div
                  className={clsx(
                    'p-3 rounded-lg',
                    kpi.color === 'blue' && 'bg-blue-500/20 text-blue-400',
                    kpi.color === 'green' && 'bg-green-500/20 text-green-400',
                    kpi.color === 'purple' && 'bg-purple-500/20 text-purple-400',
                    kpi.color === 'yellow' && 'bg-yellow-500/20 text-yellow-400',
                  )}
                  data-ui={`dashboard-kpi-icon-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon size={24} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Financial Overview Section */}
      <div className="mb-8" data-ui="dashboard-financial-section">
        <FinancialOverview stats={stats} competicionId={competicionId || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-ui="dashboard-bottom-grid">
        {/* Stats by Experience */}
        <Card className="p-6">
          <h3
            className="text-lg font-semibold text-white mb-4"
            data-ui="dashboard-experience-title"
          >
            Inscritos por Experiencia
          </h3>
          <div className="space-y-4" data-ui="dashboard-experience-list">
            {stats?.porExperiencia && Object.entries(stats.porExperiencia).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-4"
                data-ui={`dashboard-experience-row-${key}`}
              >
                <div
                  className="w-32 text-sm text-gray-400 capitalize"
                  data-ui={`dashboard-experience-label-${key}`}
                >
                  {key}
                </div>
                <div
                  className="flex-1 h-8 bg-gray-700 rounded-lg overflow-hidden"
                  data-ui={`dashboard-experience-bar-track-${key}`}
                >
                  <div 
                    className="h-full bg-blue-500 rounded-lg transition-all"
                    style={{ width: `${stats.total > 0 ? (value / stats.total) * 100 : 0}%` }}
                    data-ui={`dashboard-experience-bar-fill-${key}`}
                  />
                </div>
                <div
                  className="w-12 text-right text-white font-medium"
                  data-ui={`dashboard-experience-count-${key}`}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-700" data-ui="dashboard-trainer-stats">
            <div
              className="flex justify-between text-sm"
              data-ui="dashboard-trainer-with"
            >
              <span className="text-gray-400">Con Entrenador</span>
              <span className="text-white font-medium">{stats?.conEntrenador ?? 0}</span>
            </div>
            <div
              className="flex justify-between text-sm mt-2"
              data-ui="dashboard-trainer-without"
            >
              <span className="text-gray-400">Sin Entrenador</span>
              <span className="text-white font-medium">{stats?.sinEntrenador ?? 0}</span>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-6">
          <h3
            className="text-lg font-semibold text-white mb-4"
            data-ui="dashboard-actions-title"
          >
            Acciones Rápidas
          </h3>
          <div className="space-y-3" data-ui="dashboard-actions-list">
            <Link href="/backoffice/inscripciones">
              <div
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                data-ui="dashboard-action-inscripciones"
              >
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-blue-400" />
                  <span className="text-white">Ver Inscripciones</span>
                </div>
                <ArrowRight size={16} className="text-gray-400" />
              </div>
            </Link>
            
            <Link href="/backoffice/rifa">
              <div
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                data-ui="dashboard-action-rifa"
              >
                <div className="flex items-center gap-3">
                  <Ticket size={20} className="text-purple-400" />
                  <span className="text-white">Gestionar Rifa</span>
                </div>
                <ArrowRight size={16} className="text-gray-400" />
              </div>
            </Link>
            
            <Link href="/backoffice/checkin">
              <div
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                data-ui="dashboard-action-checkin"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle size={20} className="text-green-400" />
                  <span className="text-white">Check-in</span>
                </div>
                <ArrowRight size={16} className="text-gray-400" />
              </div>
            </Link>
            
            <Link href="/backoffice/config">
              <div
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                data-ui="dashboard-action-config"
              >
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-yellow-400" />
                  <span className="text-white">Configuración</span>
                </div>
                <ArrowRight size={16} className="text-gray-400" />
              </div>
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6 mt-6">
        <div
          className="flex items-center justify-between mb-4"
          data-ui="dashboard-recent-header"
        >
          <h3
            className="text-lg font-semibold text-white"
            data-ui="dashboard-recent-title"
          >
            Actividad Reciente
          </h3>
          <Link href="/backoffice/inscripciones">
            <Button variant="ghost" size="sm">
              Ver todas
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </Link>
        </div>
        
        {recentInscripciones.length === 0 ? (
          <div
            className="text-center py-8 text-gray-400"
            data-ui="dashboard-recent-empty"
          >
            <Users size={48} className="mx-auto mb-4 opacity-50" />
            <p data-ui="dashboard-recent-empty-text">No hay inscripciones recientes</p>
          </div>
        ) : (
          <div className="space-y-3" data-ui="dashboard-recent-list">
            {recentInscripciones.slice(0, 5).map((inscripcion) => (
              <div 
                key={inscripcion.id}
                className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                data-ui={`dashboard-recent-item-${inscripcion.id}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center"
                    data-ui={`dashboard-recent-avatar-${inscripcion.id}`}
                  >
                    <span className="text-white font-medium">
                      {inscripcion.nombre.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p
                      className="text-white font-medium"
                      data-ui={`dashboard-recent-name-${inscripcion.id}`}
                    >
                      {inscripcion.nombre}
                    </p>
                    <p
                      className="text-sm text-gray-400"
                      data-ui={`dashboard-recent-email-${inscripcion.id}`}
                    >
                      {inscripcion.email}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={clsx(
                      'px-2 py-1 text-xs rounded-full',
                      inscripcion.pagoConfirmado 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    )}
                    data-ui={`dashboard-recent-status-${inscripcion.id}`}
                  >
                    {inscripcion.pagoConfirmado ? 'Pagado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
