import { useMemo, useEffect, useCallback, useState } from 'react';
import { DollarSign, TrendingUp, Clock, ShoppingBag } from 'lucide-react';
import { Card } from '../../../../components/ui/Card';
import api from '../../../../api/client';
import type { InscripcionStats } from '../../../../types/api';

interface FinancialOverviewProps {
  stats: InscripcionStats | null;
  competicionId: number;
}

interface PricingConfig {
  precioBase: number;
  precioHandler: number;
  precioUpsell: number;
}

export function FinancialOverview({ stats, competicionId }: FinancialOverviewProps) {
  const [pricing, setPricing] = useState<PricingConfig>({
    precioBase: 0,
    precioHandler: 0,
    precioUpsell: 0,
  });

  const loadPricing = useCallback(async () => {
    try {
      const result = await api.getAdminCompeticion(competicionId);
      if (result.success && result.data?.eventoConfig) {
        setPricing({
          precioBase: result.data.eventoConfig.precioBase ?? 0,
          precioHandler: result.data.eventoConfig.precioHandler ?? 0,
          precioUpsell: result.data.eventoConfig.precioUpsell ?? 0,
        });
      }
    } catch (error) {
      console.error('Error loading pricing config:', error);
    }
  }, [competicionId]);

  useEffect(() => {
    if (competicionId) {
      loadPricing();
    }
  }, [competicionId, loadPricing]);

  const confirmedRevenue = useMemo(
    () => stats?.revenue ?? 0,
    [stats?.revenue]
  );

  const pendingRevenue = useMemo(
    () => (stats?.pendientes ?? 0) * pricing.precioBase,
    [stats?.pendientes, pricing.precioBase]
  );

  const handlerRevenue = useMemo(
    () => (stats?.conEntrenador ?? 0) * pricing.precioHandler,
    [stats?.conEntrenador, pricing.precioHandler]
  );

  const upsellRevenue = useMemo(
    () => (stats?.upsells ?? 0) * pricing.precioUpsell,
    [stats?.upsells, pricing.precioUpsell]
  );

  const totalPotentialRevenue = useMemo(
    () => confirmedRevenue + pendingRevenue,
    [confirmedRevenue, pendingRevenue]
  );

  const paidRatio = useMemo(() => {
    const total = stats?.total ?? 0;
    if (total === 0) return 0;
    return ((stats?.pagados ?? 0) / total) * 100;
  }, [stats?.total, stats?.pagados]);

  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  const financialCards = useMemo(() => [
    {
      id: 'confirmed',
      label: 'Ingresos Confirmados',
      value: confirmedRevenue,
      icon: DollarSign,
      bgColor: 'bg-green-500/20',
      textColor: 'text-green-400',
    },
    {
      id: 'pending',
      label: 'Ingresos Pendientes',
      value: pendingRevenue,
      icon: Clock,
      bgColor: 'bg-yellow-500/20',
      textColor: 'text-yellow-400',
    },
    {
      id: 'handler',
      label: 'Ingresos Handler',
      value: handlerRevenue,
      icon: ShoppingBag,
      bgColor: 'bg-blue-500/20',
      textColor: 'text-blue-400',
    },
    {
      id: 'upsell',
      label: 'Ingresos Upsell',
      value: upsellRevenue,
      icon: TrendingUp,
      bgColor: 'bg-purple-500/20',
      textColor: 'text-purple-400',
    },
  ], [confirmedRevenue, pendingRevenue, handlerRevenue, upsellRevenue]);

  return (
    <div data-ui="financial-overview">
      <h3
        className="text-lg font-semibold text-white mb-4"
        data-ui="financial-title"
      >
        Resumen Financiero
      </h3>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        data-ui="financial-cards-grid"
      >
        {financialCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.id} data-ui={`financial-card-${card.id}`}>
              <Card className="p-4">
                <div
                  className="flex items-start justify-between"
                  data-ui={`financial-card-content-${card.id}`}
                >
                  <div data-ui={`financial-card-text-${card.id}`}>
                    <p
                      className="text-sm text-gray-400 mb-1"
                      data-ui={`financial-card-label-${card.id}`}
                    >
                      {card.label}
                    </p>
                    <p
                      className="text-2xl font-bold text-white"
                      data-ui={`financial-card-value-${card.id}`}
                    >
                      {formatCurrency(card.value)}
                    </p>
                  </div>
                  <div
                    className={`p-2.5 rounded-lg ${card.bgColor}`}
                    data-ui={`financial-card-icon-wrap-${card.id}`}
                  >
                    <Icon size={20} className={card.textColor} />
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      <div data-ui="financial-progress-wrapper">
        <Card className="p-5">
          <div
            className="flex items-center justify-between mb-3"
            data-ui="financial-progress-header"
          >
            <div data-ui="financial-progress-label-group">
              <p
                className="text-sm text-gray-400"
                data-ui="financial-progress-label"
              >
                Pagados vs Pendientes
              </p>
              <p
                className="text-lg font-bold text-white"
                data-ui="financial-progress-total"
              >
                {formatCurrency(totalPotentialRevenue)} potencial
              </p>
            </div>
            <div data-ui="financial-progress-ratio-group">
              <p
                className="text-sm text-gray-400"
                data-ui="financial-progress-paid-label"
              >
                Confirmado
              </p>
              <p
                className="text-lg font-bold text-green-400"
                data-ui="financial-progress-paid-value"
              >
                {paidRatio.toFixed(1)}%
              </p>
            </div>
          </div>

          <div
            className="h-4 bg-gray-700 rounded-full overflow-hidden"
            data-ui="financial-progress-bar-track"
          >
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(paidRatio, 100)}%` }}
              data-ui="financial-progress-bar-fill"
            />
          </div>

          <div
            className="flex justify-between mt-2 text-xs text-gray-500"
            data-ui="financial-progress-legend"
          >
            <span data-ui="financial-progress-legend-paid">
              {stats?.pagados ?? 0} pagados
            </span>
            <span data-ui="financial-progress-legend-pending">
              {stats?.pendientes ?? 0} pendientes
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
