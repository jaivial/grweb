import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { Input } from '../../../../components/ui/Input/Input';
import { Button } from '../../../../components/ui/Button/Button';
import type { StripeConfigData } from '../../../../stores/stripeConfigStore';

interface StripeSettingsFormProps {
  initialData: StripeConfigData;
  onSave: (data: StripeConfigData) => Promise<boolean>;
  isSaving: boolean;
}

export function StripeSettingsForm({ initialData, onSave, isSaving }: StripeSettingsFormProps): JSX.Element {
  const [secretKey, setSecretKey] = useState(initialData.secretKey ?? '');
  const [publishableKey, setPublishableKey] = useState(initialData.publishableKey ?? '');
  const [webhookSecret, setWebhookSecret] = useState(initialData.webhookSecret ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!secretKey.trim()) {
      newErrors.secretKey = 'La clave secreta es obligatoria';
    }
    if (!publishableKey.trim()) {
      newErrors.publishableKey = 'La clave publicable es obligatoria';
    }
    if (!webhookSecret.trim()) {
      newErrors.webhookSecret = 'El secreto del webhook es obligatorio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [secretKey, publishableKey, webhookSecret]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data: StripeConfigData = {
      secretKey: secretKey.trim(),
      publishableKey: publishableKey.trim(),
      webhookSecret: webhookSecret.trim(),
    };

    const saved = await onSave(data);
    if (saved) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }, [secretKey, publishableKey, webhookSecret, validate, onSave]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-ui="stripe-settings-form">
      {/* Stripe Icon + Title */}
      <div className="space-y-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl" data-ui="stripe-keys-section">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-red-accent" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.304l-.917 5.675C5.15 22.71 8.054 24 11.641 24c2.608 0 4.742-.634 6.269-1.869 1.688-1.37 2.527-3.377 2.527-5.841 0-4.13-2.537-5.841-6.461-7.14z"/>
          </svg>
          Claves de API de Stripe
        </h3>

        <Input
          type="password"
          label="Clave Secreta (Secret Key)"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder="sk_live_..."
          hint="Comienza con sk_test_ o sk_live_"
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
          placeholder="whsec_..."
          hint="Obtenlo del dashboard de Stripe en Developers > Webhooks"
          error={errors.webhookSecret}
          autoComplete="new-password"
          data-ui="stripe-webhook-secret-input"
          className="py-1"
        />
      </div>

      {/* Info Banner */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400/80 text-xs" data-ui="stripe-info-banner">
        Las credenciales se almacenan de forma segura en la base de datos. Si no se configuran aquí, el sistema usará las variables de entorno como alternativa.
      </div>

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm" data-ui="stripe-success-message">
          Configuración de Stripe guardada correctamente
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3" data-ui="stripe-form-actions">
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
