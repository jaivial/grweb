import { useCallback, useMemo, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAtomValue } from 'jotai';
import { currentCompeticionAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { RoleSlug } from '../../../types/api';
import { BackofficeLayout } from '../BackofficeLayout';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeftIcon } from '../../../components/ui/Icon';
import toast from 'react-hot-toast';

const ROLES: { value: RoleSlug; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'registrador', label: 'Registrador' },
  { value: 'admin', label: 'Admin' },
];

interface FormState {
  nombre: string;
  email: string;
  password: string;
  role: RoleSlug;
}

interface FormErrors {
  nombre?: string;
  email?: string;
  password?: string;
  role?: string;
}

export function NewMemberPage(): JSX.Element {
  const params = useParams<{ competicionSlug: string }>();
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const [, setLocation] = useLocation();

  const initialRole = useMemo((): RoleSlug => {
    const roleParam = new URLSearchParams(window.location.search).get('role');
    if (roleParam && ROLES.some(r => r.value === roleParam)) {
      return roleParam as RoleSlug;
    }
    return 'staff';
  }, []);

  const [form, setForm] = useState<FormState>({
    nombre: '',
    email: '',
    password: '',
    role: initialRole,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((data: FormState): FormErrors => {
    const errs: FormErrors = {};

    if (!data.nombre.trim()) {
      errs.nombre = 'El nombre es obligatorio';
    } else if (data.nombre.length < 2) {
      errs.nombre = 'El nombre debe tener al menos 2 caracteres';
    }

    if (!data.email.trim()) {
      errs.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errs.email = 'El formato del email no es válido';
    }

    if (!data.password) {
      errs.password = 'La contraseña es obligatoria';
    } else if (data.password.length < 8) {
      errs.password = 'La contraseña debe tener al menos 8 caracteres';
    }

    return errs;
  }, []);

  const handleChange = useCallback((field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!currentCompeticion?.id) {
      toast.error('No se ha seleccionado una competición');
      return;
    }

    setSubmitting(true);
    const result = await api.createCompetitionUser(currentCompeticion.id, {
      email: form.email,
      password: form.password,
      nombre: form.nombre,
      role: form.role,
    });
    setSubmitting(false);

    if (result.success && result.data) {
      toast.success('Miembro creado correctamente');
      setLocation(`/backoffice/${params.competicionSlug}/users/members/${result.data.id}`);
    } else {
      toast.error(result.message || 'Error al crear el miembro');
    }
  }, [form, currentCompeticion?.id, params.competicionSlug, validate, setLocation]);

  const breadcrumbs = useMemo(() => [
    { label: 'Miembros', href: `/backoffice/${params.competicionSlug}/users` },
    { label: 'Nuevo miembro' },
  ], [params.competicionSlug]);

  return (
    <BackofficeLayout breadcrumbs={breadcrumbs} title="Nuevo miembro">
      <div data-ui="new-member-page" className="max-w-2xl mx-auto">
        <div className="bg-dark-card rounded-xl border border-white/5 overflow-hidden">
          <div className="p-6">
            <h2 data-ui="form-title" className="text-lg font-semibold text-white mb-6">
              Datos del nuevo miembro
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div data-ui="field-nombre">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nombre completo
                </label>
                <Input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => handleChange('nombre', e.target.value)}
                  placeholder="Juan García"
                  className="w-full"
                  error={errors.nombre}
                  disabled={submitting}
                />
                {errors.nombre && (
                  <p data-ui="error-nombre" className="mt-1 text-xs text-red-400">{errors.nombre}</p>
                )}
              </div>

              <div data-ui="field-email">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="juan@ejemplo.com"
                  className="w-full"
                  error={errors.email}
                  disabled={submitting}
                />
                {errors.email && (
                  <p data-ui="error-email" className="mt-1 text-xs text-red-400">{errors.email}</p>
                )}
              </div>

              <div data-ui="field-password">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contraseña
                </label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full"
                  error={errors.password}
                  disabled={submitting}
                />
                {errors.password && (
                  <p data-ui="error-password" className="mt-1 text-xs text-red-400">{errors.password}</p>
                )}
              </div>

              <div data-ui="field-role">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Rol
                </label>
                <select
                  data-ui="role-select"
                  value={form.role}
                  onChange={(e) => handleChange('role', e.target.value)}
                  disabled={submitting}
                  className="w-full px-4 py-2.5 rounded-lg bg-dark-base border border-white/10
                    text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-accent
                    disabled:opacity-50"
                >
                  {ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                {errors.role && (
                  <p data-ui="error-role" className="mt-1 text-xs text-red-400">{errors.role}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation(`/backoffice/${params.competicionSlug}/users`)}
                  disabled={submitting}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={submitting}
                  className="flex-1"
                >
                  Crear miembro
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </BackofficeLayout>
  );
}