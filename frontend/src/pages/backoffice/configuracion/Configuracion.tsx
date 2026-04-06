import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Tabs } from '../../../components/ui';
import { EmailSettingsForm } from './components/EmailSettingsForm';
import { useEmailConfig } from './hooks/useEmailConfig';
import { Settings } from 'lucide-react';

const TABS = [
  { id: 'email', label: 'Configuración de Email' },
];

const DEFAULT_CONFIG = {
  mainProvider: 0,
  gmailAddress: null,
  gmailAppPassword: null,
  smtpUsername: null,
  smtpPassword: null,
  smtpEmailAddress: null,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
};

export function Configuracion(): JSX.Element {
  const [activeTab, setActiveTab] = useState('email');
  const { config, isLoading, error, isSaving, fetchConfig, saveConfig } = useEmailConfig();

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const formData = config ?? DEFAULT_CONFIG;

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="configuracion-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2 flex items-center gap-3">
            <Settings className="w-6 h-6 text-red-accent" />
            Configuración General
          </h1>
          <p className="text-sm xs:text-base text-white/50">
            Gestiona la configuración general del sistema
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-4 xs:mb-6 -mx-3 xs:-mx-4 px-3 xs:px-4 overflow-x-auto scrollbar-hide">
          <Tabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16" data-ui="loading-state">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-accent/10 border border-red-accent/20 rounded-xl text-red-400 text-sm" data-ui="error-state">
            {error}
          </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 xs:p-6" data-ui="form-container">
            <EmailSettingsForm
              initialData={formData}
              onSave={saveConfig}
              isSaving={isSaving}
            />
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}

export default Configuracion;
