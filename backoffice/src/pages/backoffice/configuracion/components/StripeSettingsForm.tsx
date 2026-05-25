import { useState, useCallback, useEffect } from 'react';
import type { JSX } from 'react';
import { Input } from '../../../../components/ui/Input/Input';
import { Button } from '../../../../components/ui/Button/Button';
import type { StripeConfigData } from '../../../../stores/stripeConfigStore';

interface StripeSettingsFormProps {
  initialData: StripeConfigData;
  onSave: (data: {
    secretKey?: string | null;
    publishableKey?: string | null;
    webhookSecret?: string | null;
    activo?: boolean;
  }) => Promise<boolean>;
  onToggleActive: (active: boolean) => Promise<boolean>;
  isSaving: boolean;
}

export function StripeSettingsForm({ initialData, onSave, onToggleActive, isSaving }: StripeSettingsFormProps): JSX.Element {
  const [secretKey, setSecretKey] = useState('');
  const [publishableKey, setPublishableKey] = useState(initialData.publishableKey ?? '');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [activo, setActivo] = useState(initialData.activo ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSecretKey('');
    setPublishableKey(initialData.publishableKey ?? '');
    setWebhookSecret('');
    setActivo(initialData.activo ?? false);
  }, [initialData]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!secretKey.trim() && !initialData.hasSecretKey) {
      newErrors.secretKey = 'La clave secreta es obligatoria';
    }
    if (!publishableKey.trim()) {
      newErrors.publishableKey = 'La clave publicable es obligatoria';
    }
    if (!webhookSecret.trim() && !initialData.hasWebhookSecret) {
      newErrors.webhookSecret = 'El secreto del webhook es obligatorio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [secretKey, publishableKey, webhookSecret, initialData.hasSecretKey, initialData.hasWebhookSecret]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data: Record<string, unknown> = { activo };

    if (secretKey.trim()) {
      data.secretKey = secretKey.trim();
    }
    if (publishableKey.trim()) {
      data.publishableKey = publishableKey.trim();
    }
    if (webhookSecret.trim()) {
      data.webhookSecret = webhookSecret.trim();
    }

    const saved = await onSave(data);
    if (saved) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }, [secretKey, publishableKey, webhookSecret, activo, validate, onSave]);

  const handleToggleActive = useCallback(async () => {
    const next = !activo;
    setActivo(next);
    const saved = await onToggleActive(next);
    if (!saved) {
      setActivo(!next);
    }
  }, [activo, onToggleActive]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-ui="stripe-settings-form">
      <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl" data-ui="stripe-active-section">
        <div className="flex items-center justify-between gap-4" data-ui="stripe-active-row">
          <div data-ui="stripe-active-copy">
            <h3 className="text-sm font-semibold text-white" data-ui="stripe-active-title">
              Activar Stripe
            </h3>
            <p className="text-xs text-white/50 mt-1" data-ui="stripe-active-description">
              Controla si esta competición puede usar pagos online con Stripe.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={isSaving}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${activo ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
            data-ui="stripe-active-toggle"
            role="switch"
            aria-checked={activo}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${activo ? 'translate-x-7' : 'translate-x-1'}`}
              data-ui="stripe-active-knob"
            />
          </button>
        </div>
        <div className="mt-3" data-ui="stripe-active-status">
          <span className={`inline-flex px-2.5 py-1 text-xs rounded-full ${activo ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-300'}`} data-ui="stripe-active-badge">
            {activo ? 'Stripe activo' : 'Stripe desactivado'}
          </span>
        </div>
      </div>

      {activo && (
      <>
      <div className="space-y-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl" data-ui="stripe-keys-section">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2" data-ui="stripe-keys-title">
          <svg className="w-4 h-4 text-red-accent" viewBox="0 0 24 24" fill="currentColor" data-ui="stripe-keys-icon">
            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.304l-.917 5.675C5.15 22.71 8.054 24 11.641 24c2.608 0 4.742-.634 6.269-1.869 1.688-1.37 2.527-3.377 2.527-5.841 0-4.13-2.537-5.841-6.461-7.14z"/>
          </svg>
          Claves de API de Stripe
        </h3>

        <Input
          type="password"
          label="Clave Secreta (Secret Key)"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder={initialData.hasSecretKey ? 'Clave existente guardada — dejar vacío para mantener' : 'sk_live_...'}
          hint={initialData.hasSecretKey ? 'Dejar vacío para mantener la clave actual' : 'Comienza con sk_test_ o sk_live_'}
          error={errors.secretKey}
          autoComplete="new-password"
          data-ui="stripe-secret-key-input"
          className="py-1"
        />

        <Input
          type="text"
          label="Clave Publicable (Publishable Key)"
          value={publishableKey}
          onChange={(e) => setPublishableKey(e.target.value)}
          placeholder="pk_live_..."
          hint="Comienza con pk_test_ o pk_live_. Esta clave es visible en el frontend."
          error={errors.publishableKey}
          autoComplete="off"
          data-ui="stripe-publishable-key-input"
          className="py-1"
        />

        <Input
          type="password"
          label="Secreto de Webhook (Webhook Secret)"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={initialData.hasWebhookSecret ? 'Secreto existente guardado — dejar vacío para mantener' : 'whsec_...'}
          hint={initialData.hasWebhookSecret ? 'Dejar vacío para mantener el secreto actual' : 'Obtenlo del dashboard de Stripe en Developers > Webhooks'}
          error={errors.webhookSecret}
          autoComplete="new-password"
          data-ui="stripe-webhook-secret-input"
          className="py-1"
        />
      </div>

      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400/80 text-xs" data-ui="stripe-info-banner">
        Las claves sensibles nunca salen del servidor. Si ya existen, déjalas vacías para mantenerlas.
      </div>
      </>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm" data-ui="stripe-success-message">
          Configuración de Stripe guardada correctamente
        </div>
      )}

      <div className="flex justify-end gap-3" data-ui="stripe-form-actions">
        <Button
          type="submit"
          disabled={isSaving || !activo}
          className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0 shadow-lg shadow-red-accent/20"
        >
          {isSaving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>
    </form>
  );
}
