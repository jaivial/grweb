import { useState, useEffect, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { useAtomValue } from 'jotai';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Tabs } from '../../../components/ui';
import { EmailSettingsForm } from './components/EmailSettingsForm';
import { StripeSettingsForm } from './components/StripeSettingsForm';
import { useEmailConfig } from './hooks/useEmailConfig';
import { useStripeConfig } from './hooks/useStripeConfig';
import { EventoConfigEditor } from '../config/EventoConfigEditor';
import { currentCompeticionIdAtom } from '../../../stores/auth.atoms';
import { isCurrentFerAtom } from '../../../stores/auth.atoms';
import { Settings } from 'lucide-react';

function useTabs() {
  const isFer = useAtomValue(isCurrentFerAtom);
  return useMemo(() => [
    { id: 'email', label: 'Configuración de Email' },
    { id: 'stripe', label: 'Stripe' },
    { id: 'evento', label: isFer ? 'Evento' : 'GRS Peak Program' },
  ], [isFer]);
}

const DEFAULT_EMAIL_CONFIG = {
  mainProvider: 0,
  gmailAddress: null,
  gmailAppPassword: null,
  smtpUsername: null,
  smtpPassword: null,
  smtpEmailAddress: null,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
};

const DEFAULT_STRIPE_CONFIG = {
  hasSecretKey: false,
  publishableKey: null,
  hasWebhookSecret: false,
  activo: false,
};

export function Configuracion(): JSX.Element {
  const [activeTab, setActiveTab] = useState('email');
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const tabs = useTabs();
  const { config: emailConfig, isLoading: emailLoading, error: emailError, isSaving: emailSaving, fetchConfig: fetchEmailConfig, saveConfig: saveEmailConfig } = useEmailConfig(competicionId ?? undefined);
  const { config: stripeConfig, isLoading: stripeLoading, error: stripeError, isSaving: stripeSaving, fetchConfig: fetchStripeConfig, saveConfig: saveStripeConfig, toggleActive: toggleStripeActive } = useStripeConfig(competicionId ?? undefined);

  useEffect(() => {
    fetchEmailConfig();
    fetchStripeConfig();
  }, [fetchEmailConfig, fetchStripeConfig]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const emailFormData = useMemo(() => emailConfig ?? DEFAULT_EMAIL_CONFIG, [emailConfig]);
  const stripeFormData = useMemo(() => stripeConfig ?? DEFAULT_STRIPE_CONFIG, [stripeConfig]);

  const isLoading = activeTab === 'email' ? emailLoading : stripeLoading;
  const error = activeTab === 'email' ? emailError : stripeError;

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="configuracion-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2 flex items-center gap-3" data-ui="config-title">
            <Settings className="w-6 h-6 text-red-accent" />
            Configuración General
          </h1>
          <p className="text-sm xs:text-base text-white/50" data-ui="config-subtitle">
            Gestiona la configuración general del sistema
          </p>
          {competicionId && (
            <div className="mt-2 flex items-center gap-2 text-sm text-white/60" data-ui="competition-context">
              <span className="px-2 py-0.5 bg-red-accent/20 text-red-accent rounded-full text-xs">
                Competicion activa
              </span>
              <span>Configuracion especifica para esta competicion</span>
            </div>
          )}
          {!competicionId && (
            <div className="mt-2 text-sm text-white/60" data-ui="global-context">
              Configuracion global (sin competicion activa)
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 xs:mb-6 -mx-3 xs:-mx-4 px-3 xs:px-4 overflow-x-auto scrollbar-hide" data-ui="config-tabs-wrapper">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        </div>

        {/* Content */}
        {activeTab === 'evento' ? (
          <EventoConfigEditor />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16" data-ui="loading-state">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" data-ui="config-loading-spinner" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-accent/10 border border-red-accent/20 rounded-xl text-red-400 text-sm" data-ui="error-state">
            {error}
          </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 xs:p-6" data-ui="form-container">
            {activeTab === 'email' ? (
              <EmailSettingsForm
                initialData={emailFormData}
                onSave={saveEmailConfig}
                isSaving={emailSaving}
                competicionId={competicionId ?? undefined}
              />
            ) : (
              <StripeSettingsForm
                initialData={stripeFormData}
                onSave={saveStripeConfig}
                onToggleActive={toggleStripeActive}
                isSaving={stripeSaving}
              />
            )}
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}

export default Configuracion;
