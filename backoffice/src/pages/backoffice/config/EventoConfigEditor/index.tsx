import { useEffect } from 'react';
import type { JSX } from 'react';
import { useAtomValue } from 'jotai';
import { currentCompeticionIdAtom, isCurrentFerAtom } from '../../../../stores/auth.atoms';
import { usePermissions } from '../../../../hooks/usePermissions';
import { Spinner } from '../../../../components/ui/Spinner';
import { useEventoConfig } from './hooks';
import { EventoPriceFields, EventoCapacityFields, EventoPaymentFields, EventoCouponFields } from './components';
import { Save } from 'lucide-react';

export function EventoConfigEditor(): JSX.Element {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const isFer = useAtomValue(isCurrentFerAtom);
  const { canManageConfig } = usePermissions();
  const { form, loading, saving, loadConfig, updateField, closeInscripciones, reopenInscripciones, saveConfig } = useEventoConfig(competicionId ?? 0);

  useEffect(() => {
    if (competicionId) {
      loadConfig();
    }
  }, [competicionId, loadConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" data-ui="evento-config-loading">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!competicionId) {
    return (
      <div className="text-center py-12" data-ui="evento-config-no-competicion">
        <p className="text-gray-400" data-ui="evento-config-no-competicion-text">
          Selecciona una competición para editar su configuración
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-ui="evento-config-editor">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-ui="evento-config-grid">
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-4 sm:p-6" data-ui="evento-card-pricing">
          <h3 className="text-lg font-semibold text-white mb-5" data-ui="evento-card-pricing-title">
            Precios
          </h3>
          <EventoPriceFields
            form={form}
            disabled={!canManageConfig}
            onUpdate={updateField}
            isFer={isFer}
          />
        </div>

        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-4 sm:p-6" data-ui="evento-card-capacity">
          <h3 className="text-lg font-semibold text-white mb-5" data-ui="evento-card-capacity-title">
            Capacidad
          </h3>
          <EventoCapacityFields
            form={form}
            disabled={!canManageConfig}
            onUpdate={updateField}
            onCloseInscripciones={closeInscripciones}
            onReopenInscripciones={reopenInscripciones}
            isFer={isFer}
          />
        </div>
      </div>

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-4 sm:p-6" data-ui="evento-card-payment">
        <h3 className="text-lg font-semibold text-white mb-5" data-ui="evento-card-payment-title">
          Métodos de pago
        </h3>
        <EventoPaymentFields
          form={form}
          disabled={!canManageConfig}
          onUpdate={updateField}
        />
      </div>

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-4 sm:p-6" data-ui="evento-card-coupons">
        <h3 className="text-lg font-semibold text-white mb-5" data-ui="evento-card-coupons-title">
          Cupones
        </h3>
        <EventoCouponFields
          form={form}
          disabled={!canManageConfig}
          onUpdate={updateField}
        />
      </div>

      {canManageConfig && (
        <div className="flex justify-end" data-ui="evento-config-actions">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            data-ui="evento-config-save-btn"
          >
            {saving ? (
              <>
                <Spinner size="sm" color="white" />
                Guardando...
              </>
            ) : (
              <>
                <Save size={16} />
                Guardar Configuración
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default EventoConfigEditor;
