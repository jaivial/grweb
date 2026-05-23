import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { atom, useAtomValue, useAtom } from 'jotai';
import { currentCompeticionAtom, userRoleAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { RoleSlug } from '../../../types/api';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Icon } from '../../../components/ui/Icon';
import { CustomSelector } from '../../../components/ui/CustomSelector/CustomSelector';
import { getRoleSelectOptionsForAdmin } from './UsersPage.constants';
import { resolveBackofficeUsersBasePath } from './UsersPage.helpers';
import toast from 'react-hot-toast';

const newMemberAtoms = {
  form: atom<{
    nombre: string;
    email: string;
    password: string;
    role: RoleSlug;
  }>({
    nombre: '',
    email: '',
    password: '',
    role: 'staff',
  }),
  errors: atom<{
    nombre?: string;
    email?: string;
    password?: string;
    role?: string;
  }>({}),
  submittingAtom: atom<boolean>(false),
};

export function NewMemberPage(): JSX.Element {
  const params = useParams<{ competicionSlug?: string }>();
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const currentUserRole = useAtomValue(userRoleAtom);
  const [currentLocation, setLocation] = useLocation();
  const search = useSearch();
  const [form, setForm] = useAtom(newMemberAtoms.form);
  const [errors, setErrors] = useAtom(newMemberAtoms.errors);
  const [submitting, setSubmitting] = useAtom(newMemberAtoms.submittingAtom);

  const roleOptions = useMemo(() => getRoleSelectOptionsForAdmin(currentUserRole as RoleSlug), [currentUserRole]);

  // Derive queryRole from reactive search string (useSearch returns location.search with leading ?)
  const queryRole = useMemo((): string | null => {
    const searchParams = new URLSearchParams(search);
    return searchParams.get('role');
  }, [search]);

  const initialRole = useMemo((): RoleSlug => {
    if (queryRole && roleOptions.some(r => r.value === queryRole)) {
      return queryRole as RoleSlug;
    }
    return roleOptions[0]?.value ?? 'staff';
  }, [queryRole, roleOptions]);

  // Route-aware base path for navigation
  const usersBasePath = useMemo(
    () => resolveBackofficeUsersBasePath(currentLocation, params.competicionSlug),
    [currentLocation, params.competicionSlug],
  );

  // Reset form/errors/submitting when route/search/user-role context changes
  const routeKey = useMemo(
    () => `${currentLocation}-${search}-${currentUserRole}`,
    [currentLocation, search, currentUserRole],
  );

  useEffect(() => {
    setForm({
      nombre: '',
      email: '',
      password: '',
      role: initialRole,
    });
    setErrors({});
    setSubmitting(false);
  }, [routeKey, initialRole, setForm, setErrors, setSubmitting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setErrors({});
      setSubmitting(false);
    };
  }, [setErrors, setSubmitting]);

  const validate = useCallback((data: { nombre: string; email: string; password: string }): { nombre?: string; email?: string; password?: string } => {
    const errs: { nombre?: string; email?: string; password?: string } = {};

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

  const handleChange = useCallback((field: 'nombre' | 'email' | 'password' | 'role', value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors, setForm, setErrors]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roleOptions.some(r => r.value === form.role)) {
      toast.error('El rol seleccionado no es válido');
      return;
    }

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
      setLocation(`${usersBasePath}/members/${result.data.id}`);
    } else {
      toast.error(result.message || 'Error al crear el miembro');
    }
  }, [form, currentCompeticion?.id, usersBasePath, validate, setLocation, setSubmitting, roleOptions]);

  const cancelPath = useMemo(() => usersBasePath, [usersBasePath]);

  return (
    <BackofficeLayout>
      <div data-ui="new-member-page" className="max-w-2xl mx-auto">
        <div className="bg-dark-card rounded-xl border border-white/5 overflow-hidden" data-ui="new-member-card">
          <div className="p-6" data-ui="new-member-card-body">
            <h2 data-ui="form-title" className="text-lg font-semibold text-white mb-6">
              Datos del nuevo miembro
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6" data-ui="new-member-form">
              <div data-ui="field-nombre">
                <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="label-nombre">
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
                  data-ui="input-nombre"
                />
                {errors.nombre && (
                  <p data-ui="error-nombre" className="mt-1 text-xs text-red-400">{errors.nombre}</p>
                )}
              </div>

              <div data-ui="field-email">
                <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="label-email">
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
                  data-ui="input-email"
                />
                {errors.email && (
                  <p data-ui="error-email" className="mt-1 text-xs text-red-400">{errors.email}</p>
                )}
              </div>

              <div data-ui="field-password">
                <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="label-password">
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
                  data-ui="input-password"
                />
                {errors.password && (
                  <p data-ui="error-password" className="mt-1 text-xs text-red-400">{errors.password}</p>
                )}
              </div>

              <div data-ui="field-role">
                <CustomSelector
                  label="Rol"
                  options={roleOptions}
                  value={form.role}
                  onChange={(value) => value && handleChange('role', value as string)}
                  disabled={submitting}
                  data-ui="selector-role"
                />
                {errors.role && (
                  <p data-ui="error-role" className="mt-1 text-xs text-red-400">{errors.role}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4" data-ui="form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation(cancelPath)}
                  disabled={submitting}
                  className="flex-1"
                  data-ui="btn-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={submitting}
                  className="flex-1"
                  data-ui="btn-submit"
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

export default NewMemberPage;