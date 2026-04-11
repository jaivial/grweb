import { useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { Input } from '../../../../components/ui/Input/Input';
import { CustomSelector } from '../../../../components/ui/CustomSelector/CustomSelector';
import { Button } from '../../../../components/ui/Button/Button';
import type { EmailConfigData } from '../hooks/useEmailConfig';

const PROVIDER_OPTIONS = [
  { value: 0, label: 'SMTP' },
  { value: 1, label: 'Gmail' },
];

const PORT_OPTIONS = [
  { value: 25, label: '25' },
  { value: 465, label: '465' },
  { value: 587, label: '587' },
  { value: 2525, label: '2525' },
];

interface EmailSettingsFormProps {
  initialData: EmailConfigData;
  onSave: (data: EmailConfigData) => Promise<boolean>;
  isSaving: boolean;
}

export function EmailSettingsForm({ initialData, onSave, isSaving }: EmailSettingsFormProps): JSX.Element {
  const [mainProvider, setMainProvider] = useState<number>(initialData.mainProvider ?? 0);
  const [gmailAddress, setGmailAddress] = useState(initialData.gmailAddress ?? '');
  const [gmailAppPassword, setGmailAppPassword] = useState(initialData.gmailAppPassword ?? '');
  const [smtpUsername, setSmtpUsername] = useState(initialData.smtpUsername ?? '');
  const [smtpPassword, setSmtpPassword] = useState(initialData.smtpPassword ?? '');
  const [smtpEmailAddress, setSmtpEmailAddress] = useState(initialData.smtpEmailAddress ?? '');
  const [smtpHost, setSmtpHost] = useState(initialData.smtpHost ?? 'smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState<number>(initialData.smtpPort || 587);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (mainProvider === 1) {
      // Gmail
      if (!gmailAddress.trim()) {
        newErrors.gmailAddress = 'La dirección de Gmail es obligatoria';
      } else if (!gmailAddress.includes('@gmail.com') && !gmailAddress.includes('@googlemail.com')) {
        newErrors.gmailAddress = 'Debe ser una cuenta de Gmail válida';
      }
      if (!gmailAppPassword.trim()) {
        newErrors.gmailAppPassword = 'La contraseña de aplicación es obligatoria';
      }
    } else {
      // SMTP
      if (!smtpUsername.trim()) {
        newErrors.smtpUsername = 'El usuario SMTP es obligatorio';
      }
      if (!smtpPassword.trim()) {
        newErrors.smtpPassword = 'La contraseña SMTP es obligatoria';
      }
      if (!smtpEmailAddress.trim()) {
        newErrors.smtpEmailAddress = 'El email SMTP es obligatorio';
      }
      if (!smtpHost.trim()) {
        newErrors.smtpHost = 'El host SMTP es obligatorio';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [mainProvider, gmailAddress, gmailAppPassword, smtpUsername, smtpPassword, smtpEmailAddress, smtpHost]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data: EmailConfigData = {
      mainProvider,
      gmailAddress: mainProvider === 1 ? gmailAddress.trim() : null,
      gmailAppPassword: mainProvider === 1 ? gmailAppPassword.trim() : null,
      smtpUsername: mainProvider === 0 ? smtpUsername.trim() : null,
      smtpPassword: mainProvider === 0 ? smtpPassword.trim() : null,
      smtpEmailAddress: mainProvider === 0 ? smtpEmailAddress.trim() : null,
      smtpHost: mainProvider === 0 ? smtpHost.trim() : null,
      smtpPort: mainProvider === 0 ? smtpPort : 0,
    };

    const saved = await onSave(data);
    if (saved) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }, [mainProvider, gmailAddress, gmailAppPassword, smtpUsername, smtpPassword, smtpEmailAddress, smtpHost, smtpPort, validate, onSave]);

  const selectedPortOption = useMemo(() => {
    return PORT_OPTIONS.find(p => p.value === smtpPort) || null;
  }, [smtpPort]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-ui="email-settings-form">
      {/* Provider Selector */}
      <div data-ui="provider-section">
        <CustomSelector
          label="Proveedor de email"
          options={PROVIDER_OPTIONS}
          value={mainProvider}
          onChange={(v) => setMainProvider(v ?? 0)}
          placeholder="Seleccionar proveedor"
          allowClear={false}
        />
        <p className="mt-2 text-xs text-gray-500">
          {mainProvider === 1
            ? 'Usa tu cuenta de Gmail con una contraseña de aplicación'
            : 'Usa cualquier servidor SMTP personalizado'}
        </p>
      </div>

      {/* Gmail Fields */}
      {mainProvider === 1 && (
        <div className="space-y-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl" data-ui="gmail-fields">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2" data-ui="gmail-config-title">
            <svg className="w-4 h-4 text-red-accent" viewBox="0 0 24 24" fill="currentColor" data-ui="gmail-config-icon">
              <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
            </svg>
            Configuración Gmail
          </h3>
          <Input
            type="email"
            label="Dirección de Gmail"
            value={gmailAddress}
            onChange={(e) => setGmailAddress(e.target.value)}
            placeholder="tu@gmail.com"
            error={errors.gmailAddress}
            autoComplete="username"
            data-ui="gmail-address-input"
            className="py-1"
          />
          <Input
            type="password"
            label="Contraseña de aplicación"
            value={gmailAppPassword}
            onChange={(e) => setGmailAppPassword(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
            hint="Genera una contraseña de aplicación en tu cuenta de Google"
            error={errors.gmailAppPassword}
            autoComplete="new-password"
            data-ui="gmail-password-input"
            className="py-1"
          />
        </div>
      )}

      {/* SMTP Fields */}
      {mainProvider === 0 && (
        <div className="space-y-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl" data-ui="smtp-fields">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2" data-ui="smtp-config-title">
            <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="smtp-config-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/>
            </svg>
            Configuración SMTP
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="text"
              label="Usuario SMTP"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              placeholder="usuario@ejemplo.com"
              error={errors.smtpUsername}
              autoComplete="username"
              data-ui="smtp-username-input"
              className="py-1"
            />
            <Input
              type="password"
              label="Contraseña SMTP"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder="********"
              error={errors.smtpPassword}
              autoComplete="new-password"
              data-ui="smtp-password-input"
              className="py-1"
            />
          </div>
          <Input
            type="email"
            label="Dirección de email"
            value={smtpEmailAddress}
            onChange={(e) => setSmtpEmailAddress(e.target.value)}
            placeholder="noreply@ejemplo.com"
            error={errors.smtpEmailAddress}
            autoComplete="email"
            data-ui="smtp-email-input"
            className="py-1"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="text"
              label="Host SMTP"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.ejemplo.com"
              error={errors.smtpHost}
              autoComplete="off"
              data-ui="smtp-host-input"
              className="py-1"
            />
            <div data-ui="smtp-port-selector">
              <CustomSelector
                label="Puerto"
                options={PORT_OPTIONS}
                value={selectedPortOption?.value ?? null}
                onChange={(v) => setSmtpPort(v ?? 587)}
                placeholder="587"
                allowClear={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm" data-ui="success-message">
          Configuración guardada correctamente
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3" data-ui="form-actions">
        <Button
          type="submit"
          disabled={isSaving}
          className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0 shadow-lg shadow-red-accent/20"
        >
          {isSaving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>
    </form>
  );
}
